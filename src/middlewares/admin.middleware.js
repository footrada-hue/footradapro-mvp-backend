/**
 * FOOTRADAPRO MVP - 管理员认证中间件
 * @description 检查管理员登录状态、账号状态、权限验证
 */

import { getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * 基础管理员认证中间件
 * 检查是否已登录且是管理员
 */
export const adminAuth = (req, res, next) => {
    try {
        // 检查session中是否有adminId
        if (!req.session || !req.session.adminId) {
            logger.warn('Admin auth failed: No admin session', { 
                path: req.path,
                ip: req.ip 
            });
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '请先登录'
            });
        }

        // 将管理员信息附加到req对象
        req.admin = {
            id: req.session.adminId,
            username: req.session.adminName,
            role: req.session.adminRole
        };

        next();
    } catch (err) {
        logger.error('Admin auth middleware error:', err);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: '认证服务错误'
        });
    }
};

/**
 * 增强版管理员认证中间件（带数据库验证）
 * 检查管理员是否被禁用、锁定等实时状态
 */
export const adminAuthEnhanced = (req, res, next) => {
    try {
        // 1. 检查session
        if (!req.session || !req.session.adminId) {
            logger.warn('Admin auth failed: No admin session');
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '请先登录'
            });
        }

        const db = getDb();
        
        // 2. 从数据库获取最新管理员信息
        const admin = db.prepare(`
            SELECT id, username, name, role, is_active, is_locked 
            FROM admins 
            WHERE id = ?
        `).get(req.session.adminId);

        if (!admin) {
            // 管理员不存在，销毁session
            req.session.destroy();
            logger.warn(`Admin not found in DB, session destroyed: ${req.session.adminId}`);
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '账号不存在'
            });
        }

        // 3. 检查账号是否启用
        if (!admin.is_active) {
            logger.warn(`Admin account disabled: ${admin.username}`);
            return res.status(403).json({
                success: false,
                error: 'ACCOUNT_DISABLED',
                message: '账号已被禁用'
            });
        }

        // 4. 检查账号是否锁定
        if (admin.is_locked) {
            logger.warn(`Admin account locked: ${admin.username}`);
            return res.status(403).json({
                success: false,
                error: 'ACCOUNT_LOCKED',
                message: '账号已被锁定'
            });
        }

        // 5. 更新session中的信息（确保与数据库同步）
        req.session.adminName = admin.name;
        req.session.adminRole = admin.role;
        
        // 6. 将完整信息附加到req对象
        req.admin = {
            id: admin.id,
            username: admin.username,
            name: admin.name,
            role: admin.role
        };

        next();
    } catch (err) {
        logger.error('Admin auth enhanced error:', err);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: '认证服务错误'
        });
    }
};

/**
 * 管理员角色验证中间件
 * @param {string|string[]} allowedRoles - 允许的角色列表
 */
export const hasRole = (allowedRoles) => {
    return (req, res, next) => {
        try {
            // 先确保已通过adminAuth中间件
            if (!req.admin) {
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: '请先登录'
                });
            }

            const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
            
            // 超级管理员拥有所有权限
            if (req.admin.role === 'super_admin') {
                return next();
            }

            if (!roles.includes(req.admin.role)) {
                logger.warn(`Role permission denied: admin=${req.admin.username}, role=${req.admin.role}, required=${roles.join(',')}`);
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: '角色权限不足'
                });
            }

            next();
        } catch (err) {
            logger.error('Role check error:', err);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR'
            });
        }
    };
};

/**
 * 记录管理员操作日志
 * @param {Object} req - Express请求对象
 * @param {string} action - 操作类型
 * @param {Object} details - 操作详情
 * @param {string} targetType - 目标类型
 * @param {number} targetId - 目标ID
 */
export const logAdminAction = async (req, action, details = {}, targetType = null, targetId = null) => {
    try {
        if (!req.admin && !req.session?.adminId) {
            return;
        }

        const db = getDb();
        const adminId = req.admin?.id || req.session?.adminId;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        db.prepare(`
            INSERT INTO admin_logs (
                admin_id, action, target_type, target_id, details, ip, user_agent, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            adminId,
            action,
            targetType,
            targetId,
            JSON.stringify(details),
            ip,
            userAgent,
            'success'
        );
    } catch (err) {
        logger.error('Failed to log admin action:', err);
    }
};

/**
 * 组合中间件：基础认证 + 增强验证
 */
export const adminAuthComplete = [
    adminAuth,
    adminAuthEnhanced
];

/**
 * 导出所有中间件
 */
export default {
    adminAuth,
    adminAuthEnhanced,
    hasRole,
    logAdminAction,
    adminAuthComplete
};