/**
 * FOOTRADAPRO MVP - Authentication Middleware
 * @description 用户认证中间件（基于session）
 */

import logger from '../utils/logger.js';
import database from '../database/connection.js';

/**
 * 用户认证中间件
 * 检查用户是否已登录（session中有userId）
 * 並附帶用戶的測試模式狀態
 */
export const auth = (req, res, next) => {
    try {
        // 检查session中是否有用户ID
        if (!req.session || !req.session.userId) {
            logger.debug('Auth failed: No session or userId', { 
                path: req.path,
                ip: req.ip 
            });
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Please log in to access this resource'
            });
        }

        // 從數據庫獲取用戶的測試模式狀態（異步處理，不阻塞）
        setImmediate(() => {
            try {
                const db = database.get();
                const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(req.session.userId);
                if (user) {
                    req.session.isTestMode = user.is_test_mode === 1;
                }
            } catch (err) {
                logger.error('Failed to fetch user test mode:', err);
            }
        });

        // 將用戶信息附加到req對象，方便後續使用
        req.user = {
            id: req.session.userId,
            uid: req.session.uid,
            role: req.session.role,
            isTestMode: req.session.isTestMode ?? true // 默認為測試模式
        };

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
 * 检查用户是否已登录且角色为admin
 */
export const adminAuth = (req, res, next) => {
    try {
        // 先检查登录状态
        if (!req.session || !req.session.userId) {
            logger.warn('Admin auth failed: Not logged in', { 
                path: req.path,
                ip: req.ip 
            });
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Please log in as admin'
            });
        }

        // 检查角色是否为admin
        if (req.session.role !== 'admin') {
            logger.warn('Admin auth failed: Insufficient permissions', {
                userId: req.session.userId,
                role: req.session.role,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'Admin access required'
            });
        }

        // 將用戶信息附加到req對象
        req.user = {
            id: req.session.userId,
            uid: req.session.uid,
            role: req.session.role,
            isTestMode: req.session.isTestMode ?? true
        };

        next();
    } catch (err) {
        logger.error('Admin auth middleware error:', err);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Authentication failed due to server error'
        });
    }
};

/**
 * 可选认证中间件
 * 如果有登录信息则附加到req，没有也不报错
 */
export const optionalAuth = (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            req.user = {
                id: req.session.userId,
                uid: req.session.uid,
                role: req.session.role,
                isTestMode: req.session.isTestMode ?? true
            };
        }
        next();
    } catch (err) {
        // 出错时也不阻断，只是不加用户信息
        logger.error('Optional auth error:', err);
        next();
    }
};

/**
 * ======================================================
 * 測試模式專用中間件
 * ======================================================
 */

/**
 * 檢查用戶是否為測試模式
 * 直接从数据库获取，确保准确性
 * 如果不是測試模式，返回403
 */
export const requireTestMode = (req, res, next) => {
    try {
        const userId = req.session?.userId;
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
 * 檢查用戶是否為真實模式
 * 直接从数据库获取，确保准确性
 * 如果不是真實模式，返回403
 */
export const requireLiveMode = (req, res, next) => {
    try {
        const userId = req.session?.userId;
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
 * 根據模式過濾數據的中間件
 * 在查詢數據庫時自動添加 is_test 條件
 */
export const filterByMode = (req, res, next) => {
    try {
        const userId = req.session?.userId;
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
        
        // 將模式信息附加到 req 上，供後續路由使用
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
 * 記錄模式切換的日誌
 * 用於 mode.routes.js 中調用
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
        
        // 更新 session 中的模式
        if (req.session) {
            req.session.isTestMode = toMode;
        }
        
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
 * 獲取用戶當前模式
 */
export const getUserMode = (userId) => {
    try {
        const db = database.get();
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        return user ? user.is_test_mode === 1 : true;
    } catch (err) {
        logger.error('Failed to get user mode:', err);
        return true; // 默認測試模式
    }
};

// 導出所有中間件
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