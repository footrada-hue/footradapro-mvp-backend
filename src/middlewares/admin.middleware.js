/**
 * FOOTRADAPRO MVP - 管理员认证中间件
 * @description 检查管理员登录状态、账号状态、权限验证
 * 支持 Session 和 Cookie Token 两种认证方式
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import { query, getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 基础管理员认证中间件
 * 支持 Session 和 Cookie Token 两种方式
 */
export const adminAuth = async (req, res, next) => {
    let adminId = null;
    
    // 1. 优先检查 Session
    if (req.session && req.session.adminId) {
        adminId = req.session.adminId;
    }
    
    // 2. 回退：检查 Cookie Token
    if (!adminId && req.cookies && req.cookies.admin_token) {
        try {
            const token = req.cookies.admin_token;
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const parts = decoded.split(':');
            adminId = parts[0];
        } catch (error) {
            logger.debug('Token decode error:', error.message);
        }
    }
    
    if (!adminId) {
        logger.warn('Admin auth failed: No session and no token', { 
            path: req.path,
            ip: req.ip 
        });
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: '请先登录'
        });
    }
    
    try {
        let admin = null;
        
        if (isProduction) {
            // PostgreSQL 版本
            const result = await query(
                `SELECT id, username, role FROM admins WHERE id = $1`,
                [adminId]
            );
            admin = result?.[0];
        } else {
            // SQLite 版本
            const db = getDb();
            admin = db.prepare(`
                SELECT id, username, role FROM admins WHERE id = ?
            `).get(adminId);
        }
        
        if (!admin) {
            logger.warn(`Admin not found: ${adminId}`);
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '账号不存在'
            });
        }
        
        // 同步设置 Session
        if (req.session) {
            req.session.adminId = admin.id;
            req.session.adminName = admin.username;
            req.session.adminRole = admin.role;
        }
        
        // 将管理员信息附加到 req 对象
        req.admin = {
            id: admin.id,
            username: admin.username,
            name: admin.username,
            role: admin.role
        };
        
        logger.debug(`Admin authenticated: ${admin.username}`);
        next();
        
    } catch (error) {
        logger.error('Admin auth token verification error:', error);
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: '认证失败，请重新登录'
        });
    }
};

/**
 * 增强版管理员认证中间件（带数据库验证）
 */
export const adminAuthEnhanced = async (req, res, next) => {
    try {
        // 检查是否有 admin 信息
        if (!req.admin && (!req.session || !req.session.adminId)) {
            logger.warn('Admin auth enhanced failed: No admin session');
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '请先登录'
            });
        }

        const adminId = req.admin?.id || req.session?.adminId;
        let admin = null;
        
        if (isProduction) {
            const result = await query(
                `SELECT id, username, role FROM admins WHERE id = $1`,
                [adminId]
            );
            admin = result?.[0];
        } else {
            const db = getDb();
            admin = db.prepare(`
                SELECT id, username, role FROM admins WHERE id = ?
            `).get(adminId);
        }

        if (!admin) {
            if (req.session) {
                req.session.destroy();
            }
            logger.warn(`Admin not found in DB, session destroyed: ${adminId}`);
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: '账号不存在'
            });
        }

        // 更新 session 中的信息
        if (req.session) {
            req.session.adminName = admin.username;
            req.session.adminRole = admin.role;
        }
        
        req.admin = {
            id: admin.id,
            username: admin.username,
            name: admin.username,
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
 */
export const logAdminAction = async (req, action, details = {}, targetType = null, targetId = null) => {
    try {
        if (!req.admin && !req.session?.adminId) {
            return;
        }

        const adminId = req.admin?.id || req.session?.adminId;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        if (isProduction) {
            await query(`
                INSERT INTO admin_logs (
                    admin_id, action, target_type, target_id, details, ip, user_agent, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [adminId, action, targetType, targetId, JSON.stringify(details), ip, userAgent, 'success']);
        } else {
            const db = getDb();
            db.prepare(`
                INSERT INTO admin_logs (
                    admin_id, action, target_type, target_id, details, ip, user_agent, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(adminId, action, targetType, targetId, JSON.stringify(details), ip, userAgent, 'success');
        }
    } catch (err) {
        logger.error('Failed to log admin action:', err);
    }
};

/**
 * 组合中间件：基础认证 + 增强验证
 */
export const adminAuthComplete = [adminAuth, adminAuthEnhanced];

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