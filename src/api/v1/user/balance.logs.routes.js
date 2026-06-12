// src/api/v1/user/balance.logs.routes.js

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(auth);

/**
 * ======================================================
 * 統一資金記錄接口（根據 mode 參數選擇對應的表）
 * ======================================================
 */

// 獲取資金記錄 - 根據 mode 參數區分測試/真實模式
router.get('/', updateLastActive, async (req, res) => {
    const userId = req.session.userId;
    const { type, page = 1, limit = 20, mode } = req.query;
    
    if (!userId) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }

    try {
        // 獲取用戶當前模式
        let currentUserMode = false;
        if (isProduction) {
            const result = await query('SELECT is_test_mode FROM users WHERE id = $1', [userId]);
            currentUserMode = result?.[0]?.is_test_mode === true;
        } else {
            const db = getDb();
            const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
            currentUserMode = user?.is_test_mode === 1;
        }
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;

        // 根據模式選擇對應的處理函數
        if (queryMode) {
            // 測試模式：使用測試資金記錄
            const result = await handleTestBalanceLogs(userId, type, page, limit);
            res.json({
                ...result,
                meta: {
                    ...result.meta,
                    current_mode: 'test'
                }
            });
        } else {
            // 真實模式：使用真實資金記錄
            const result = await handleRealBalanceLogs(userId, type, page, limit);
            res.json({
                ...result,
                meta: {
                    ...result.meta,
                    current_mode: 'live'
                }
            });
        }
    } catch (error) {
        logger.error('獲取資金記錄失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 獲取資金統計信息 - 根據 mode 參數區分
 * ======================================================
 */

// 獲取資金統計（測試/真實分開）
router.get('/stats', updateLastActive, async (req, res) => {
    const userId = req.session.userId;
    const { mode } = req.query;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }

    try {
        // 獲取用戶信息
        let user = null;
        let realStats = { total_deposit: 0, total_withdraw: 0, deposit_count: 0, withdraw_count: 0, net_change: 0 };
        let testStats = { total_authorized: 0, total_profit: 0, authorize_count: 0, net_change: 0 };
        
        if (isProduction) {
            // PostgreSQL 版本
            const userResult = await query('SELECT is_test_mode, balance, test_balance FROM users WHERE id = $1', [userId]);
            user = userResult?.[0] || null;
            
            const [realResult, testResult] = await Promise.all([
                query(`
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposit,
                        COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) as total_withdraw,
                        COUNT(CASE WHEN type = 'deposit' THEN 1 END) as deposit_count,
                        COUNT(CASE WHEN type = 'withdraw' THEN 1 END) as withdraw_count,
                        COALESCE(SUM(amount), 0) as net_change
                    FROM balance_logs 
                    WHERE user_id = $1
                `, [userId]),
                query(`
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'authorize' THEN ABS(amount) ELSE 0 END), 0) as total_authorized,
                        COALESCE(SUM(CASE WHEN type = 'settle' AND amount > 0 THEN amount ELSE 0 END), 0) as total_profit,
                        COUNT(CASE WHEN type = 'authorize' THEN 1 END) as authorize_count,
                        COALESCE(SUM(amount), 0) as net_change
                    FROM test_balance_logs 
                    WHERE user_id = $1
                `, [userId])
            ]);
            realStats = realResult?.[0] || realStats;
            testStats = testResult?.[0] || testStats;
        } else {
            // SQLite 版本
            const db = getDb();
            user = db.prepare('SELECT is_test_mode, balance, test_balance FROM users WHERE id = ?').get(userId);
            
            realStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposit,
                    COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) as total_withdraw,
                    COUNT(CASE WHEN type = 'deposit' THEN 1 END) as deposit_count,
                    COUNT(CASE WHEN type = 'withdraw' THEN 1 END) as withdraw_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM balance_logs 
                WHERE user_id = ?
            `).get(userId);
            
            testStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'authorize' THEN ABS(amount) ELSE 0 END), 0) as total_authorized,
                    COALESCE(SUM(CASE WHEN type = 'settle' AND amount > 0 THEN amount ELSE 0 END), 0) as total_profit,
                    COUNT(CASE WHEN type = 'authorize' THEN 1 END) as authorize_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM test_balance_logs 
                WHERE user_id = ?
            `).get(userId);
        }
        
        const currentUserMode = user?.is_test_mode === 1 || user?.is_test_mode === true;
        const queryMode = mode !== undefined ? (mode === 'test') : null;

        if (queryMode === true) {
            // 只返回測試模式統計
            res.json({
                success: true,
                data: {
                    test: {
                        current_balance: user?.test_balance || 10000,
                        total_authorized: testStats?.total_authorized || 0,
                        total_profit: testStats?.total_profit || 0,
                        authorize_count: testStats?.authorize_count || 0,
                        net_change: testStats?.net_change || 0
                    }
                },
                meta: { mode: 'test' }
            });
        } else if (queryMode === false) {
            // 只返回真實模式統計
            res.json({
                success: true,
                data: {
                    real: {
                        current_balance: user?.balance || 0,
                        total_deposit: realStats?.total_deposit || 0,
                        total_withdraw: realStats?.total_withdraw || 0,
                        deposit_count: realStats?.deposit_count || 0,
                        withdraw_count: realStats?.withdraw_count || 0,
                        net_change: realStats?.net_change || 0
                    }
                },
                meta: { mode: 'live' }
            });
        } else {
            // 返回所有統計
            res.json({
                success: true,
                data: {
                    real: {
                        current_balance: user?.balance || 0,
                        total_deposit: realStats?.total_deposit || 0,
                        total_withdraw: realStats?.total_withdraw || 0,
                        deposit_count: realStats?.deposit_count || 0,
                        withdraw_count: realStats?.withdraw_count || 0,
                        net_change: realStats?.net_change || 0
                    },
                    test: {
                        current_balance: user?.test_balance || 10000,
                        total_authorized: testStats?.total_authorized || 0,
                        total_profit: testStats?.total_profit || 0,
                        authorize_count: testStats?.authorize_count || 0,
                        net_change: testStats?.net_change || 0
                    }
                },
                meta: { 
                    current_mode: currentUserMode ? 'test' : 'live'
                }
            });
        }

    } catch (error) {
        logger.error('獲取資金統計失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 真實資金記錄接口（向後兼容）
 * ======================================================
 */
router.get('/real', updateLastActive, async (req, res) => {
    const userId = req.session.userId;
    const { type, page = 1, limit = 20 } = req.query;
    
    if (!userId) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }

    try {
        const result = await handleRealBalanceLogs(userId, type, page, limit);
        res.json(result);
    } catch (error) {
        logger.error('獲取真實資金記錄失敗:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 測試資金記錄接口（向後兼容）
 * ======================================================
 */
router.get('/test', updateLastActive, async (req, res) => {
    const userId = req.session.userId;
    const { type, page = 1, limit = 20 } = req.query;
    
    if (!userId) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }

    try {
        const result = await handleTestBalanceLogs(userId, type, page, limit);
        res.json(result);
    } catch (error) {
        logger.error('獲取測試資金記錄失敗:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 輔助函數
 * ======================================================
 */

// 處理真實資金記錄
async function handleRealBalanceLogs(userId, type, page, limit) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    if (isProduction) {
        // PostgreSQL 版本
        let querySql = `
            SELECT 
                id, amount, type, created_at, reason, balance_before, balance_after, admin_id
            FROM balance_logs 
            WHERE user_id = $1
        `;
        const params = [userId];

        if (type === 'deposit') {
            querySql += " AND type = 'deposit'";
        } else if (type === 'withdraw') {
            querySql += " AND type = 'withdraw'";
        } else if (type === 'all') {
            querySql += " AND (type = 'deposit' OR type = 'withdraw')";
        }

        const countResult = await query(
            querySql.replace('SELECT id, amount, type, created_at, reason, balance_before, balance_after, admin_id', 'SELECT COUNT(*) as total'),
            params
        );
        const total = parseInt(countResult?.[0]?.total || 0);

        querySql += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
        params.push(parseInt(limit), offset);
        
        const logs = await query(querySql, params);

        return {
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: { type: 'real' }
        };
    } else {
        // SQLite 版本
        const db = getDb();
        
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='balance_logs'
        `).get();

        if (!tableExists) {
            return {
                success: true,
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                },
                meta: { type: 'real' }
            };
        }

        const columns = db.prepare("PRAGMA table_info(balance_logs)").all();
        const columnNames = columns.map(col => col.name);

        const selectFields = [];
        if (columnNames.includes('id')) selectFields.push('id');
        if (columnNames.includes('amount')) selectFields.push('amount');
        if (columnNames.includes('type')) selectFields.push('type');
        if (columnNames.includes('created_at')) selectFields.push('created_at');
        if (columnNames.includes('reason')) selectFields.push('reason');
        if (columnNames.includes('balance_before')) selectFields.push('balance_before');
        if (columnNames.includes('balance_after')) selectFields.push('balance_after');
        if (columnNames.includes('admin_id')) selectFields.push('admin_id');

        let querySql = `
            SELECT ${selectFields.join(', ')}
            FROM balance_logs 
            WHERE user_id = ?
        `;
        const params = [userId];

        if (type === 'deposit') {
            querySql += " AND type = 'deposit'";
        } else if (type === 'withdraw') {
            querySql += " AND type = 'withdraw'";
        } else if (type === 'all') {
            querySql += " AND (type = 'deposit' OR type = 'withdraw')";
        }

        const countQuery = querySql.replace(
            `SELECT ${selectFields.join(', ')}`, 
            'SELECT COUNT(*) as total'
        );
        const countResult = db.prepare(countQuery).get(...params);
        const total = countResult?.total || 0;

        querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const logs = db.prepare(querySql).all(...params);

        return {
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: { type: 'real' }
        };
    }
}

// 處理測試資金記錄
async function handleTestBalanceLogs(userId, type, page, limit) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    if (isProduction) {
        // PostgreSQL 版本
        let querySql = `
            SELECT 
                id, amount, type, created_at, description, balance_before, balance_after, match_id
            FROM test_balance_logs 
            WHERE user_id = $1
        `;
        const params = [userId];

        if (type === 'deposit') {
            querySql += " AND type = 'deposit'";
        } else if (type === 'withdraw') {
            querySql += " AND type = 'withdraw'";
        } else if (type === 'authorize') {
            querySql += " AND type = 'authorize'";
        } else if (type === 'settle') {
            querySql += " AND type = 'settle'";
        } else if (type === 'bonus') {
            querySql += " AND type = 'bonus'";
        } else if (type === 'all') {
            querySql += " AND (type = 'deposit' OR type = 'withdraw' OR type = 'authorize' OR type = 'settle' OR type = 'bonus')";
        }

        const countResult = await query(
            querySql.replace('SELECT id, amount, type, created_at, description, balance_before, balance_after, match_id', 'SELECT COUNT(*) as total'),
            params
        );
        const total = parseInt(countResult?.[0]?.total || 0);

        querySql += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
        params.push(parseInt(limit), offset);
        
        const logs = await query(querySql, params);

        return {
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: { type: 'test' }
        };
    } else {
        // SQLite 版本
        const db = getDb();
        
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='test_balance_logs'
        `).get();

        if (!tableExists) {
            return {
                success: true,
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                },
                meta: { type: 'test' }
            };
        }

        const columns = db.prepare("PRAGMA table_info(test_balance_logs)").all();
        const columnNames = columns.map(col => col.name);

        const selectFields = [];
        if (columnNames.includes('id')) selectFields.push('id');
        if (columnNames.includes('amount')) selectFields.push('amount');
        if (columnNames.includes('type')) selectFields.push('type');
        if (columnNames.includes('created_at')) selectFields.push('created_at');
        if (columnNames.includes('description')) selectFields.push('description');
        if (columnNames.includes('balance_before')) selectFields.push('balance_before');
        if (columnNames.includes('balance_after')) selectFields.push('balance_after');
        if (columnNames.includes('match_id')) selectFields.push('match_id');

        let querySql = `
            SELECT ${selectFields.join(', ')}
            FROM test_balance_logs 
            WHERE user_id = ?
        `;
        const params = [userId];

        if (type === 'deposit') {
            querySql += " AND type = 'deposit'";
        } else if (type === 'withdraw') {
            querySql += " AND type = 'withdraw'";
        } else if (type === 'authorize') {
            querySql += " AND type = 'authorize'";
        } else if (type === 'settle') {
            querySql += " AND type = 'settle'";
        } else if (type === 'bonus') {
            querySql += " AND type = 'bonus'";
        } else if (type === 'all') {
            querySql += " AND (type = 'deposit' OR type = 'withdraw' OR type = 'authorize' OR type = 'settle' OR type = 'bonus')";
        }

        const countQuery = querySql.replace(
            `SELECT ${selectFields.join(', ')}`, 
            'SELECT COUNT(*) as total'
        );
        const countResult = db.prepare(countQuery).get(...params);
        const total = countResult?.total || 0;

        querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const logs = db.prepare(querySql).all(...params);

        return {
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: { type: 'test' }
        };
    }
}

export default router;
