import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import database from '../database/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';

/**
 * 用户认证中间件（基于 JWT）
 * 检查用户是否已登录（Cookie 中的 footradapro_token）
 */
export const auth = (req, res, next) => {
    try {
        // 从 Cookie 获取 JWT token
        const token = req.cookies.footradapro_token;
        
        if (!token) {
            logger.debug('Auth failed: No token', { 
                path: req.path,
                ip: req.ip 
            });
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Please log in to access this resource'
            });
        }

        // 验证 JWT
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            logger.debug('Auth failed: Invalid token', { 
                path: req.path,
                error: err.message
            });
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Invalid or expired token'
            });
        }

        // 将用户信息附加到 req 对象
        req.user = decoded;
        req.session = req.session || {};
        req.session.userId = decoded.id;
        req.session.uid = decoded.uid;
        req.session.role = decoded.role;

        next();
    } catch (err) {
        logger.error('Auth middleware error:', err);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Authentication failed due to server error'
        });
    }
};

/**
 * 管理员认证中间件
 */
export const adminAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user.role !== 'admin') {
            logger.warn('Admin auth failed: Insufficient permissions', {
                userId: req.user.id,
                role: req.user.role,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'Admin access required'
            });
        }
        next();
    });
};

/**
 * 可选认证中间件
 */
export const optionalAuth = (req, res, next) => {
    const token = req.cookies.footradapro_token;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (err) {
            // token 无效，忽略
        }
    }
    next();
};

/**
 * 检查用户是否为测试模式
 */
export const requireTestMode = (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Please log in'
            });
        }
        
        const db = database.get();
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const isTestMode = user ? user.is_test_mode === 1 : true;
        
        if (!isTestMode) {
            logger.warn('Test mode required but user is in live mode', {
                userId,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'TEST_MODE_REQUIRED',
                message: 'This action is only available in Test Mode'
            });
        }
        next();
    } catch (err) {
        logger.error('Require test mode error:', err);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to verify user mode'
        });
    }
};

/**
 * 检查用户是否为真实模式
 */
export const requireLiveMode = (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Please log in'
            });
        }
        
        const db = database.get();
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const isTestMode = user ? user.is_test_mode === 1 : true;
        
        if (isTestMode) {
            logger.warn('Live mode required but user is in test mode', {
                userId,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'LIVE_MODE_REQUIRED',
                message: 'This action is only available in Live Mode'
            });
        }
        next();
    } catch (err) {
        logger.error('Require live mode error:', err);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to verify user mode'
        });
    }
};

/**
 * 根据模式过滤数据的中间件
 */
export const filterByMode = (req, res, next) => {
    try {
        const userId = req.user?.id;
        let isTestMode = true;
        
        if (userId) {
            try {
                const db = database.get();
                const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
                isTestMode = user ? user.is_test_mode === 1 : true;
            } catch (err) {
                logger.error('Failed to fetch user mode in filterByMode:', err);
            }
        }
        
        req.mode = {
            isTest: isTestMode,
            isLive: !isTestMode,
            filter: isTestMode ? 'is_test = 1' : 'is_test = 0'
        };
        
        next();
    } catch (err) {
        logger.error('Filter by mode error:', err);
        req.mode = { isTest: true, isLive: false, filter: 'is_test = 1' };
        next();
    }
};

/**
 * 记录模式切换的日志
 */
export const logModeSwitch = async (userId, fromMode, toMode, req) => {
    try {
        const db = database.get();
        const ip = req.ip || req.connection?.remoteAddress || '';
        const userAgent = req.get('User-Agent') || '';
        
        db.prepare(`
            INSERT INTO mode_switch_logs (user_id, from_mode, to_mode, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?)
        `).run(userId, fromMode ? 1 : 0, toMode ? 1 : 0, ip, userAgent);
        
        logger.info(`👤 User ${userId} switched to ${toMode ? 'TEST' : 'LIVE'} mode`, {
            fromMode,
            toMode,
            ip
        });
        
    } catch (err) {
        logger.error('Failed to log mode switch:', err);
    }
};

/**
 * 获取用户当前模式
 */
export const getUserMode = (userId) => {
    try {
        const db = database.get();
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        return user ? user.is_test_mode === 1 : true;
    } catch (err) {
        logger.error('Failed to get user mode:', err);
        return true;
    }
};

export default {
    auth,
    adminAuth,
    optionalAuth,
    requireTestMode,
    requireLiveMode,
    filterByMode,
    logModeSwitch,
    getUserMode
};