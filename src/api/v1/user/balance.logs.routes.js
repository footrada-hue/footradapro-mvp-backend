// src/api/v1/user/balance.logs.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
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
    const db = getDb();

    try {
        // 獲取用戶當前模式
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;

        // 根據模式選擇對應的處理函數
        if (queryMode) {
            // 測試模式：使用測試資金記錄
            const result = await handleTestBalanceLogs(userId, type, page, limit, db);
            res.json({
                ...result,
                meta: {
                    ...result.meta,
                    current_mode: 'test'
                }
            });
        } else {
            // 真實模式：使用真實資金記錄
            const result = await handleRealBalanceLogs(userId, type, page, limit, db);
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
router.get('/stats', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const { mode } = req.query;
    const db = getDb();

    try {
        // 獲取用戶當前模式
        const user = db.prepare('SELECT is_test_mode, balance, test_balance FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則返回所有統計
        const queryMode = mode !== undefined ? (mode === 'test') : null;

        if (queryMode === true) {
            // 只返回測試模式統計
            const testStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'authorize' THEN ABS(amount) ELSE 0 END), 0) as total_authorized,
                    COALESCE(SUM(CASE WHEN type = 'settle' AND amount > 0 THEN amount ELSE 0 END), 0) as total_profit,
                    COUNT(CASE WHEN type = 'authorize' THEN 1 END) as authorize_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM test_balance_logs 
                WHERE user_id = ?
            `).get(userId);

            res.json({
                success: true,
                data: {
                    test: {
                        current_balance: user?.test_balance || 10000,
                        total_authorized: testStats?.total_authorized || 0,
                        total_profit: testStats?.total_profit || 0,
                        authorize_count: testStats?.authorize_count || 0,
                        reset_count: testStats?.reset_count || 0,
                        net_change: testStats?.net_change || 0
                    }
                },
                meta: { mode: 'test' }
            });

        } else if (queryMode === false) {
            // 只返回真實模式統計
            const realStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_deposit,
                    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_withdraw,
                    COUNT(CASE WHEN amount > 0 THEN 1 END) as deposit_count,
                    COUNT(CASE WHEN amount < 0 THEN 1 END) as withdraw_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM balance_logs 
                WHERE user_id = ?
            `).get(userId);

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
            // 返回所有統計（向後兼容）
            const realStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_deposit,
                    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_withdraw,
                    COUNT(CASE WHEN amount > 0 THEN 1 END) as deposit_count,
                    COUNT(CASE WHEN amount < 0 THEN 1 END) as withdraw_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM balance_logs 
                WHERE user_id = ?
            `).get(userId);

            const testStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'authorize' THEN ABS(amount) ELSE 0 END), 0) as total_authorized,
                    COALESCE(SUM(CASE WHEN type = 'settle' AND amount > 0 THEN amount ELSE 0 END), 0) as total_profit,
                    COUNT(CASE WHEN type = 'authorize' THEN 1 END) as authorize_count,
                    COALESCE(SUM(amount), 0) as net_change
                FROM test_balance_logs 
                WHERE user_id = ?
            `).get(userId);

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
                        reset_count: testStats?.reset_count || 0,
                        net_change: testStats?.net_change || 0
                    }
                },
                meta: { 
                    current_mode: user?.is_test_mode ? 'test' : 'live'
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
router.get('/real', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const { type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();

    try {
        // 先檢查 balance_logs 表是否存在
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='balance_logs'
        `).get();

        if (!tableExists) {
            return res.json({
                success: true,
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                },
                meta: { type: 'real' }
            });
        }

        // 獲取表結構，動態構建查詢
        const columns = db.prepare("PRAGMA table_info(balance_logs)").all();
        const columnNames = columns.map(col => col.name);

        // 構建 SELECT 字段（確保包含 type 和 reason 字段）
        const selectFields = [];
        if (columnNames.includes('id')) selectFields.push('id');
        if (columnNames.includes('amount')) selectFields.push('amount');
        if (columnNames.includes('type')) selectFields.push('type');
        if (columnNames.includes('created_at')) selectFields.push('created_at');
        if (columnNames.includes('reason')) selectFields.push('reason');
        if (columnNames.includes('balance_before')) selectFields.push('balance_before');
        if (columnNames.includes('balance_after')) selectFields.push('balance_after');
        if (columnNames.includes('admin_id')) selectFields.push('admin_id');

        let query = `
            SELECT ${selectFields.join(', ')}
            FROM balance_logs 
            WHERE user_id = ?
        `;
        const params = [userId];

        // 根據類型過濾
        if (type === 'deposit') {
            query += ' AND amount > 0';
        } else if (type === 'withdraw') {
            query += ' AND amount < 0';
        } else if (type === 'authorize') {
            query += " AND type = 'authorization'";
        } else if (type === 'settle') {
            query += " AND type = 'settlement'";
        } else if (type === 'all') {
            query += ' AND (amount > 0 OR amount < 0)';
        }

        // 獲取總數
        const countQuery = query.replace(
            `SELECT ${selectFields.join(', ')}`, 
            'SELECT COUNT(*) as total'
        );
        const countResult = db.prepare(countQuery).get(...params);
        const total = countResult?.total || 0;

        // 獲取分頁數據
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const logs = db.prepare(query).all(...params);

        logger.info(`用戶 ${userId} 獲取 ${logs.length} 條真實資金記錄`);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: {
                type: 'real',
                mode: 'live'
            }
        });
    } catch (error) {
        logger.error('獲取真實資金記錄失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 測試資金記錄接口（向後兼容）
 * ======================================================
 */
router.get('/test', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const { type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();

    try {
        // 先檢查 test_balance_logs 表是否存在
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='test_balance_logs'
        `).get();

        if (!tableExists) {
            return res.json({
                success: true,
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                },
                meta: { type: 'test' }
            });
        }

        // 獲取表結構
        const columns = db.prepare("PRAGMA table_info(test_balance_logs)").all();
        const columnNames = columns.map(col => col.name);

        // 構建 SELECT 字段
        const selectFields = [];
        if (columnNames.includes('id')) selectFields.push('id');
        if (columnNames.includes('amount')) selectFields.push('amount');
        if (columnNames.includes('type')) selectFields.push('type');
        if (columnNames.includes('created_at')) selectFields.push('created_at');
        if (columnNames.includes('description')) selectFields.push('description');
        if (columnNames.includes('balance_before')) selectFields.push('balance_before');
        if (columnNames.includes('balance_after')) selectFields.push('balance_after');
        if (columnNames.includes('match_id')) selectFields.push('match_id');

        let query = `
            SELECT ${selectFields.join(', ')}
            FROM test_balance_logs 
            WHERE user_id = ?
        `;
        const params = [userId];

        // 根據類型過濾
        if (type === 'authorize') {
            query += " AND type = 'authorize'";
        } else if (type === 'settle') {
            query += " AND type = 'settle'";
        } else if (type === 'bonus') {
            query += " AND type = 'bonus'";
        }

        // 獲取總數
        const countQuery = query.replace(
            `SELECT ${selectFields.join(', ')}`, 
            'SELECT COUNT(*) as total'
        );
        const countResult = db.prepare(countQuery).get(...params);
        const total = countResult?.total || 0;

        // 獲取分頁數據
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const logs = db.prepare(query).all(...params);

        logger.info(`用戶 ${userId} 獲取 ${logs.length} 條測試資金記錄`);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: {
                type: 'test',
                mode: 'test'
            }
        });
    } catch (error) {
        logger.error('獲取測試資金記錄失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 輔助函數
 * ======================================================
 */

// 處理真實資金記錄
async function handleRealBalanceLogs(userId, type, page, limit, db) {
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 檢查表是否存在
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

    // 獲取表結構
    const columns = db.prepare("PRAGMA table_info(balance_logs)").all();
    const columnNames = columns.map(col => col.name);

    // 構建 SELECT 字段（確保包含 type 和 reason 字段）
    const selectFields = [];
    if (columnNames.includes('id')) selectFields.push('id');
    if (columnNames.includes('amount')) selectFields.push('amount');
    if (columnNames.includes('type')) selectFields.push('type');
    if (columnNames.includes('created_at')) selectFields.push('created_at');
    if (columnNames.includes('reason')) selectFields.push('reason');
    if (columnNames.includes('balance_before')) selectFields.push('balance_before');
    if (columnNames.includes('balance_after')) selectFields.push('balance_after');
    if (columnNames.includes('admin_id')) selectFields.push('admin_id');

    let query = `
        SELECT ${selectFields.join(', ')}
        FROM balance_logs 
        WHERE user_id = ?
    `;
    const params = [userId];

    // 根據類型過濾
    if (type === 'deposit') {
        query += ' AND amount > 0';
    } else if (type === 'withdraw') {
        query += ' AND amount < 0';
    } else if (type === 'authorize') {
        query += " AND type = 'authorization'";
    } else if (type === 'settle') {
        query += " AND type = 'settlement'";
    }

    // 獲取總數
    const countQuery = query.replace(
        `SELECT ${selectFields.join(', ')}`, 
        'SELECT COUNT(*) as total'
    );
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult?.total || 0;

    // 獲取分頁數據
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    const logs = db.prepare(query).all(...params);

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

// 處理測試資金記錄
async function handleTestBalanceLogs(userId, type, page, limit, db) {
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 檢查表是否存在
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

    // 獲取表結構
    const columns = db.prepare("PRAGMA table_info(test_balance_logs)").all();
    const columnNames = columns.map(col => col.name);

    // 構建 SELECT 字段
    const selectFields = [];
    if (columnNames.includes('id')) selectFields.push('id');
    if (columnNames.includes('amount')) selectFields.push('amount');
    if (columnNames.includes('type')) selectFields.push('type');
    if (columnNames.includes('created_at')) selectFields.push('created_at');
    if (columnNames.includes('description')) selectFields.push('description');
    if (columnNames.includes('balance_before')) selectFields.push('balance_before');
    if (columnNames.includes('balance_after')) selectFields.push('balance_after');
    if (columnNames.includes('match_id')) selectFields.push('match_id');

    let query = `
        SELECT ${selectFields.join(', ')}
        FROM test_balance_logs 
        WHERE user_id = ?
    `;
    const params = [userId];

    // 根據類型過濾
    if (type === 'authorize') {
        query += " AND type = 'authorize'";
    } else if (type === 'settle') {
        query += " AND type = 'settle'";
    } else if (type === 'bonus') {
        query += " AND type = 'bonus'";
    }

    // 獲取總數
    const countQuery = query.replace(
        `SELECT ${selectFields.join(', ')}`, 
        'SELECT COUNT(*) as total'
    );
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult?.total || 0;

    // 獲取分頁數據
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    const logs = db.prepare(query).all(...params);

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

export default router;