// /src/middlewares/permission.middleware.js
import { getPermissionsByRole } from '../config/permissions.js';
import { getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * 权限验证中间件
 * @param {string} permission - 需要的权限
 */
export const hasPermission = (permission) => {
    return (req, res, next) => {
        try {
            console.log('=== hasPermission 中间件 ===');
            console.log('请求路径:', req.path);
            console.log('需要的权限:', permission);
            console.log('session 内容:', req.session);
            console.log('adminId:', req.session?.adminId);
            console.log('adminRole:', req.session?.adminRole);
            
            // 检查是否已登录
            if (!req.session || !req.session.adminId) {
                console.log('❌ 未登录');
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: '请先登录'
                });
            }

            // 获取管理员角色
            const role = req.session.adminRole;
            console.log('当前角色:', role);
            
            // 超级管理员拥有所有权限
            if (role === 'super_admin') {
                console.log('✅ 超级管理员，放行');
                return next();
            }

            // 获取该角色的权限列表
            const permissions = getPermissionsByRole(role);
            console.log('角色权限列表:', permissions);
            
            // 检查是否有指定权限
            if (!permissions.includes(permission)) {
                console.log('❌ 权限不足');
                logger.warn(`权限不足: adminId=${req.session.adminId}, role=${role}, permission=${permission}`);
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: '没有操作权限'
                });
            }

            console.log('✅ 权限验证通过');
            next();
        } catch (err) {
            console.error('权限验证错误:', err);
            logger.error('权限验证错误:', err);
            res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR'
            });
        }
    };
};

/**
 * 记录管理员操作日志
 */
export const logAdminAction = async (req, action, details = {}, targetType = null, targetId = null) => {
    try {
        if (!req.session?.adminId) {
            return;
        }

        const db = getDb();
        const adminId = req.session.adminId;
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
        logger.error('记录操作日志失败:', err);
    }
};