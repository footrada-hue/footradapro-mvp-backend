/**
 * 更新用户最后活动时间中间件
 * 功能：在每次 API 请求时异步更新用户的最后活动时间
 * 用于统计活跃用户、会话管理等
 */

import { getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * 更新用户最后活动时间中间件
 * 支持从 req.user.id 或 req.session.userId 获取用户ID
 * 
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express 下一个中间件函数
 */
export const updateLastActive = (req, res, next) => {
    // 尝试从多种来源获取用户ID
    // 优先级：req.user.id（JWT认证） > req.session.userId（Session认证）
    const userId = req.user?.id || req.session?.userId;
    
    if (userId) {
        const db = getDb();
        
        // 使用 setImmediate 异步执行，不阻塞请求响应
        setImmediate(() => {
            try {
                // SQLite 日期时间函数使用单引号包裹字符串参数
                // datetime('now', 'localtime') 获取当前本地时间
                const stmt = db.prepare(`
                    UPDATE users 
                    SET last_active_at = datetime('now', 'localtime') 
                    WHERE id = ?
                `);
                
                const result = stmt.run(userId);
                
                if (result.changes > 0) {
                    logger.debug(`用户 ${userId} 活动时间已更新`);
                }
            } catch (err) {
                // 记录错误但不中断请求，避免影响用户体验
                logger.error(`更新用户 ${userId} 最后活动时间失败:`, {
                    error: err.message,
                    userId,
                    url: req.url,
                    method: req.method
                });
            }
        });
    }
    
    // 继续处理下一个中间件
    next();
};

/**
 * 批量更新用户最后活动时间（用于特殊场景）
 * @param {Array<number>} userIds - 用户ID数组
 */
export const batchUpdateLastActive = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    const db = getDb();
    const now = new Date().toISOString();
    
    try {
        const placeholders = userIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            UPDATE users 
            SET last_active_at = ? 
            WHERE id IN (${placeholders})
        `);
        
        const result = stmt.run(now, ...userIds);
        
        logger.info(`批量更新 ${result.changes} 个用户的活动时间`);
        return result.changes;
    } catch (err) {
        logger.error('批量更新用户活动时间失败:', err);
        throw err;
    }
};

/**
 * 获取用户最后活动时间（用于监控）
 * @param {number} userId - 用户ID
 * @returns {string|null} 最后活动时间
 */
export const getUserLastActive = (userId) => {
    if (!userId) return null;
    
    const db = getDb();
    
    try {
        const result = db.prepare(`
            SELECT last_active_at FROM users WHERE id = ?
        `).get(userId);
        
        return result?.last_active_at || null;
    } catch (err) {
        logger.error(`获取用户 ${userId} 最后活动时间失败:`, err);
        return null;
    }
};

/**
 * 获取活跃用户统计（最近N分钟）
 * @param {number} minutes - 最近N分钟
 * @returns {number} 活跃用户数
 */
export const getActiveUserCount = (minutes = 30) => {
    const db = getDb();
    
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE last_active_at >= datetime('now', '-' || ? || ' minutes')
        `).get(minutes);
        
        return result?.count || 0;
    } catch (err) {
        logger.error('获取活跃用户统计失败:', err);
        return 0;
    }
};

// 导出默认对象，方便统一导入
export default {
    updateLastActive,
    batchUpdateLastActive,
    getUserLastActive,
    getActiveUserCount
};