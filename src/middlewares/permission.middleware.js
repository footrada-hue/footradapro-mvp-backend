/**
 * FOOTRADAPRO - Permission Middleware
 * @description 权限验证中间件
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import { query, getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 检查用户是否有指定权限
 * @param {string} permission - 权限标识
 * @returns {Function} Express 中间件
 */
export const hasPermission = (permission) => {
    return async (req, res, next) => {
        try {
            // 获取管理员信息
            const adminId = req.session?.adminId || req.admin?.id;
            
            if (!adminId) {
                logger.warn('权限验证失败: 未找到管理员ID');
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: '请先登录'
                });
            }
            
            // 获取管理员角色
            let admin = null;
            
            if (isProduction) {
                const result = await query(
                    'SELECT role FROM admins WHERE id = $1',
                    [adminId]
                );
                admin = result?.[0];
            } else {
                const db = getDb();
                admin = db.prepare('SELECT role FROM admins WHERE id = ?').get(adminId);
            }
            
            if (!admin) {
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: '管理员不存在'
                });
            }
            
            // 超级管理员拥有所有权限
            if (admin.role === 'super_admin') {
                logger.debug(`超级管理员 ${adminId} 拥有所有权限`);
                return next();
            }
            
            // TODO: 根据角色检查具体权限
            // 目前简化处理，非超级管理员返回权限不足
            logger.warn(`权限不足: adminId=${adminId}, role=${admin.role}, required=${permission}`);
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: '权限不足'
            });
            
        } catch (error) {
            logger.error('权限验证错误:', error);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: '权限验证失败'
            });
        }
    };
};

/**
 * 记录管理员操作日志
 * @param {Object} req - Express 请求对象
 * @param {string} action - 操作类型
 * @param {Object} details - 操作详情
 * @param {string} targetType - 目标类型
 * @param {string|number} targetId - 目标ID
 */
export const logAdminAction = async (req, action, details = {}, targetType = null, targetId = null) => {
    try {
        const adminId = req.session?.adminId || req.admin?.id;
        
        if (!adminId) {
            logger.debug('无法记录操作日志: 未找到管理员ID');
            return;
        }
        
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || '';
        
        if (isProduction) {
            // PostgreSQL 版本
            await query(`
                INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, ip, user_agent, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `, [adminId, action, targetType, targetId, JSON.stringify(details), ip, userAgent]);
        } else {
            // SQLite 版本
            const db = getDb();
            
            // 检查 admin_logs 表是否存在
            const tableCheck = db.prepare(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='admin_logs'
            `).get();
            
            if (!tableCheck) {
                // 创建表
                db.exec(`
                    CREATE TABLE IF NOT EXISTS admin_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        admin_id INTEGER NOT NULL,
                        action TEXT NOT NULL,
                        target_type TEXT,
                        target_id TEXT,
                        details TEXT,
                        ip TEXT,
                        user_agent TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            }
            
            db.prepare(`
                INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, ip, user_agent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(adminId, action, targetType, targetId, JSON.stringify(details), ip, userAgent);
        }
        
        logger.debug(`操作日志已记录: ${action} by admin ${adminId}`);
        
    } catch (error) {
        // 日志记录失败不应影响主流程
        logger.error('记录操作日志失败:', error.message);
    }
};

/**
 * 检查角色
 * @param {string|string[]} roles - 允许的角色列表
 * @returns {Function} Express 中间件
 */
export const hasRole = (roles) => {
    return async (req, res, next) => {
        try {
            const adminId = req.session?.adminId || req.admin?.id;
            
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: '请先登录'
                });
            }
            
            let adminRole = req.session?.adminRole || req.admin?.role;
            
            if (!adminRole) {
                // 从数据库获取角色
                if (isProduction) {
                    const result = await query('SELECT role FROM admins WHERE id = $1', [adminId]);
                    adminRole = result?.[0]?.role;
                } else {
                    const db = getDb();
                    const admin = db.prepare('SELECT role FROM admins WHERE id = ?').get(adminId);
                    adminRole = admin?.role;
                }
            }
            
            const allowedRoles = Array.isArray(roles) ? roles : [roles];
            
            // 超级管理员拥有所有权限
            if (adminRole === 'super_admin') {
                return next();
            }
            
            if (!allowedRoles.includes(adminRole)) {
                logger.warn(`角色权限不足: adminId=${adminId}, role=${adminRole}, required=${allowedRoles.join(',')}`);
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: '角色权限不足'
                });
            }
            
            next();
            
        } catch (error) {
            logger.error('角色验证错误:', error);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: '角色验证失败'
            });
        }
    };
};

export default {
    hasPermission,
    logAdminAction,
    hasRole
};