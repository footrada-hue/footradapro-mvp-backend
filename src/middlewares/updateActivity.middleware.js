/**
 * 更新用户最后活动时间中间件
 * 功能：在每次 API 请求时异步更新用户的最后活动时间
 * 用于统计活跃用户、会话管理等
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import { query, getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

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
    const userId = req.user?.id || req.session?.userId;
    
    if (userId) {
        // 使用 setImmediate 异步执行，不阻塞请求响应
        setImmediate(async () => {
            try {
                if (isProduction) {
                    // PostgreSQL 版本
                    await query(`
                        UPDATE users 
                        SET last_active_at = NOW() 
                        WHERE id = $1
                    `, [userId]);
                } else {
                    // SQLite 版本
                    const db = getDb();
                    const stmt = db.prepare(`
                        UPDATE users 
                        SET last_active_at = datetime('now', 'localtime') 
                        WHERE id = ?
                    `);
                    stmt.run(userId);
                }
                logger.debug(`用户 ${userId} 活动时间已更新`);
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
    
    const now = new Date().toISOString();
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const placeholders = userIds.map((_, i) => `$${i + 2}`).join(',');
            const result = await query(`
                UPDATE users 
                SET last_active_at = $1 
                WHERE id IN (${placeholders})
            `, [now, ...userIds]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const placeholders = userIds.map(() => '?').join(',');
            const stmt = db.prepare(`
                UPDATE users 
                SET last_active_at = ? 
                WHERE id IN (${placeholders})
            `);
            const result = stmt.run(now, ...userIds);
            changes = result.changes;
        }
        
        logger.info(`批量更新 ${changes} 个用户的活动时间`);
        return changes;
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
export const getUserLastActive = async (userId) => {
    if (!userId) return null;
    
    try {
        if (isProduction) {
            const result = await query('SELECT last_active_at FROM users WHERE id = $1', [userId]);
            return result?.[0]?.last_active_at || null;
        } else {
            const db = getDb();
            const result = db.prepare('SELECT last_active_at FROM users WHERE id = ?').get(userId);
            return result?.last_active_at || null;
        }
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
export const getActiveUserCount = async (minutes = 30) => {
    try {
        if (isProduction) {
            const result = await query(`
                SELECT COUNT(*) as count 
                FROM users 
                WHERE last_active_at >= NOW() - INTERVAL '$1 minutes'
            `, [minutes]);
            return parseInt(result?.[0]?.count || 0);
        } else {
            const db = getDb();
            const result = db.prepare(`
                SELECT COUNT(*) as count 
                FROM users 
                WHERE last_active_at >= datetime('now', '-' || ? || ' minutes')
            `).get(minutes);
            return result?.count || 0;
        }
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