/**
 * FOOTRADAPRO - Authorize Routes
 * @description 用户授权提交接口 - PostgreSQL 生产版本
 */

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { auth, filterByMode } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(auth);
router.use(filterByMode);

// ==================== 提交授权 ====================
router.post('/submit', async (req, res) => {
    const { matchId, amount } = req.body;
    const userId = req.session.userId;

    console.log('=== Authorize Request ===', { matchId, amount, userId });

    if (!matchId || !amount || amount < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PARAMETERS' 
        });
    }

    try {
        // 1. 获取比赛信息
        let match = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT * FROM matches 
                WHERE (match_id = $1 OR id = $1::INTEGER) AND is_active = 1
            `, [matchId]);
            match = result?.[0] || null;
        } else {
            const db = getDb();
            match = db.prepare(`
                SELECT * FROM matches 
                WHERE (match_id = ? OR id = ?) AND is_active = 1
            `).get(matchId, matchId);
        }

        if (!match) {
            return res.status(404).json({ 
                success: false, 
                error: 'MATCH_NOT_FOUND' 
            });
        }

        // 2. 检查比赛是否可授权
        const now = new Date();
        const matchTime = new Date(match.match_time);
        
        if (now >= matchTime) {
            return res.status(400).json({ 
                success: false, 
                error: 'MATCH_STARTED',
                message: '比賽已開始，無法授權'
            });
        }

        if (match.status !== 'upcoming' && match.status !== 'pending') {
            return res.status(400).json({ 
                success: false, 
                error: 'MATCH_NOT_AVAILABLE' 
            });
        }

        // 3. 获取用户信息
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id, 
                    balance, 
                    test_balance, 
                    is_test_mode 
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT 
                    id, 
                    balance, 
                    test_balance, 
                    is_test_mode 
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        // 根据模式选择要检查的余额
        const isTestMode = user.is_test_mode === 1 || user.is_test_mode === true;
        const currentBalance = isTestMode ? (user.test_balance || 10000) : user.balance;

        if (currentBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'INSUFFICIENT_BALANCE',
                mode: isTestMode ? 'test' : 'live',
                current_balance: currentBalance,
                required: amount
            });
        }

        // 4. 检查授权限额
        if (match.min_authorization && amount < match.min_authorization) {
            return res.status(400).json({ 
                success: false, 
                error: 'BELOW_MINIMUM',
                min: match.min_authorization
            });
        }

        if (match.match_limit && amount > match.match_limit) {
            return res.status(400).json({ 
                success: false, 
                error: 'EXCEEDS_LIMIT',
                max: match.match_limit
            });
        }

        // 5. 创建授权记录
        const authUid = 'AUTH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const executionRate = match.execution_rate || 30;
        const deployedAmount = amount * executionRate / 100;
        const reservedAmount = amount - deployedAmount;
        const nowIso = new Date().toISOString();

        const oldBalance = isTestMode ? (user.test_balance || 10000) : user.balance;
        const newBalance = oldBalance - amount;

        if (isProduction) {
            // PostgreSQL 事务
            await query('BEGIN');
            
            try {
                // 插入授权记录
                await query(`
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, 
                        executed_amount, deployed_amount, reserved_amount,
                        is_test, status, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
                `, [authUid, userId, match.match_id, amount, deployedAmount, deployedAmount, reservedAmount, isTestMode, nowIso]);

                // 更新用户余额
                if (isTestMode) {
                    await query(`UPDATE users SET test_balance = $1 WHERE id = $2`, [newBalance, userId]);
                } else {
                    await query(`UPDATE users SET balance = $1 WHERE id = $2`, [newBalance, userId]);
                }

                await query('COMMIT');
                
                logger.info(`User ${userId} authorized ${amount} ${isTestMode ? 'tUSDT' : 'USDT'} for match ${match.match_id} (${isTestMode ? 'TEST' : 'LIVE'} mode)`);

                res.json({ 
                    success: true, 
                    data: { 
                        authId: authUid,
                        amount,
                        mode: isTestMode ? 'test' : 'live',
                        is_test_mode: isTestMode,
                        execution_rate: executionRate,
                        deployed_amount: deployedAmount,
                        reserved_amount: reservedAmount,
                        match_id: match.match_id,
                        match_name: `${match.home_team} vs ${match.away_team}`,
                        new_balance: newBalance
                    }
                });
            } catch (err) {
                await query('ROLLBACK');
                throw err;
            }
        } else {
            // SQLite 版本
            const db = getDb();
            db.exec('BEGIN TRANSACTION');
            
            try {
                const authColumns = db.prepare("PRAGMA table_info(authorizations)").all().map(col => col.name);
                const hasIsTest = authColumns.includes('is_test');
                
                if (hasIsTest) {
                    db.prepare(`
                        INSERT INTO authorizations (
                            auth_id, user_id, match_id, amount, 
                            executed_amount, deployed_amount, reserved_amount,
                            is_test, status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                    `).run(authUid, userId, match.match_id, amount, deployedAmount, deployedAmount, reservedAmount, isTestMode ? 1 : 0);
                } else {
                    db.prepare(`
                        INSERT INTO authorizations (
                            auth_id, user_id, match_id, amount, 
                            executed_amount, deployed_amount, reserved_amount,
                            status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                    `).run(authUid, userId, match.match_id, amount, deployedAmount, deployedAmount, reservedAmount);
                }

                if (isTestMode) {
                    db.prepare(`UPDATE users SET test_balance = ? WHERE id = ?`).run(newBalance, userId);
                } else {
                    db.prepare(`UPDATE users SET balance = ? WHERE id = ?`).run(newBalance, userId);
                }

                db.exec('COMMIT');
                
                logger.info(`User ${userId} authorized ${amount} ${isTestMode ? 'tUSDT' : 'USDT'} for match ${match.match_id} (${isTestMode ? 'TEST' : 'LIVE'} mode)`);

                res.json({ 
                    success: true, 
                    data: { 
                        authId: authUid,
                        amount,
                        mode: isTestMode ? 'test' : 'live',
                        is_test_mode: isTestMode,
                        execution_rate: executionRate,
                        deployed_amount: deployedAmount,
                        reserved_amount: reservedAmount,
                        match_id: match.match_id,
                        match_name: `${match.home_team} vs ${match.away_team}`,
                        new_balance: newBalance
                    }
                });
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        }

    } catch (error) {
        logger.error('Authorize error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR'
        });
    }
});

// ==================== 检查比赛是否可授权 ====================
router.get('/check/:matchId', async (req, res) => {
    const { matchId } = req.params;
    const userId = req.session.userId;

    try {
        let match = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    match_id,
                    home_team,
                    away_team,
                    match_time,
                    status,
                    is_active,
                    execution_rate,
                    min_authorization,
                    match_limit
                FROM matches 
                WHERE (match_id = $1 OR id = $1::INTEGER) AND is_active = 1
            `, [matchId]);
            match = result?.[0] || null;
        } else {
            const db = getDb();
            match = db.prepare(`
                SELECT 
                    match_id,
                    home_team,
                    away_team,
                    match_time,
                    status,
                    is_active,
                    execution_rate,
                    min_authorization,
                    match_limit
                FROM matches 
                WHERE (match_id = ? OR id = ?) AND is_active = 1
            `).get(matchId, matchId);
        }

        if (!match) {
            return res.json({
                success: false,
                available: false,
                reason: 'MATCH_NOT_FOUND'
            });
        }

        const now = new Date();
        const matchTime = new Date(match.match_time);
        const isAvailable = (match.status === 'upcoming' || match.status === 'pending') && now < matchTime;

        // 获取用户模式
        let isTestMode = false;
        if (isProduction) {
            const result = await query('SELECT is_test_mode FROM users WHERE id = $1', [userId]);
            isTestMode = result?.[0]?.is_test_mode === true;
        } else {
            const db = getDb();
            const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
            isTestMode = user?.is_test_mode === 1;
        }

        res.json({
            success: true,
            available: isAvailable,
            mode: isTestMode ? 'test' : 'live',
            match: {
                id: match.match_id,
                home_team: match.home_team,
                away_team: match.away_team,
                match_time: match.match_time,
                execution_rate: match.execution_rate,
                min_authorization: match.min_authorization,
                match_limit: match.match_limit
            },
            reason: isAvailable ? null : (now >= matchTime ? 'MATCH_STARTED' : 'MATCH_NOT_AVAILABLE')
        });

    } catch (error) {
        logger.error('Check authorization error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ==================== 获取用户授权列表 ====================
router.get('/list', async (req, res) => {
    const userId = req.session.userId;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        // 获取用户模式
        let isTestMode = false;
        if (isProduction) {
            const result = await query('SELECT is_test_mode FROM users WHERE id = $1', [userId]);
            isTestMode = result?.[0]?.is_test_mode === true;
        } else {
            const db = getDb();
            const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
            isTestMode = user?.is_test_mode === 1;
        }

        // 构建状态过滤条件
        let statusCondition = '';
        if (status === 'pending') {
            statusCondition = "AND a.status IN ('pending', 'upcoming')";
        } else if (status === 'settled') {
            statusCondition = "AND a.status IN ('won', 'lost', 'settled')";
        }

        let authorizations = [];
        let total = 0;

        if (isProduction) {
            const result = await query(`
                SELECT 
                    a.id,
                    a.auth_id,
                    a.amount,
                    a.profit,
                    a.status,
                    a.created_at,
                    a.is_test,
                    m.home_team,
                    m.away_team,
                    m.home_logo,
                    m.away_logo,
                    m.league,
                    m.match_time,
                    m.home_score,
                    m.away_score
                FROM authorizations a
                LEFT JOIN matches m ON a.match_id = m.match_id
                WHERE a.user_id = $1 AND a.is_test = $2 ${statusCondition}
                ORDER BY a.created_at DESC
                LIMIT $3 OFFSET $4
            `, [userId, isTestMode, parseInt(limit), parseInt(offset)]);
            authorizations = result || [];

            const countResult = await query(`
                SELECT COUNT(*) as count FROM authorizations 
                WHERE user_id = $1 AND is_test = $2 ${statusCondition.replace(/AND/g, 'AND')}
            `, [userId, isTestMode]);
            total = parseInt(countResult?.[0]?.count || 0);
        } else {
            const db = getDb();
            const isTestValue = isTestMode ? 1 : 0;
            
            authorizations = db.prepare(`
                SELECT 
                    a.id,
                    a.auth_id,
                    a.amount,
                    a.profit,
                    a.status,
                    a.created_at,
                    a.is_test,
                    m.home_team,
                    m.away_team,
                    m.home_logo,
                    m.away_logo,
                    m.league,
                    m.match_time,
                    m.home_score,
                    m.away_score
                FROM authorizations a
                LEFT JOIN matches m ON a.match_id = m.match_id
                WHERE a.user_id = ? AND a.is_test = ? ${statusCondition}
                ORDER BY a.created_at DESC
                LIMIT ? OFFSET ?
            `).all(userId, isTestValue, parseInt(limit), parseInt(offset));

            const totalResult = db.prepare(`
                SELECT COUNT(*) as count FROM authorizations 
                WHERE user_id = ? AND is_test = ? ${statusCondition.replace(/AND/g, 'AND')}
            `).get(userId, isTestValue);
            total = totalResult?.count || 0;
        }

        logger.info(`用戶 ${userId} 獲取 ${authorizations.length} 條授權記錄 [${isTestMode ? '測試' : '真實'}]${status ? `, 狀態:${status}` : ''}`);

        res.json({
            success: true,
            data: authorizations,
            meta: {
                mode: isTestMode ? 'test' : 'live',
                total: total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        logger.error('Fetch authorizations list error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ==================== 获取单次授权详情 ====================
router.get('/:authId', async (req, res) => {
    const { authId } = req.params;
    const userId = req.session.userId;

    try {
        let auth = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    a.*,
                    m.home_team,
                    m.away_team,
                    m.home_logo,
                    m.away_logo,
                    m.league,
                    m.match_time,
                    m.execution_rate as match_execution_rate
                FROM authorizations a
                LEFT JOIN matches m ON a.match_id = m.match_id
                WHERE a.auth_id = $1 AND a.user_id = $2
            `, [authId, userId]);
            auth = result?.[0] || null;
        } else {
            const db = getDb();
            auth = db.prepare(`
                SELECT 
                    a.*,
                    m.home_team,
                    m.away_team,
                    m.home_logo,
                    m.away_logo,
                    m.league,
                    m.match_time,
                    m.execution_rate as match_execution_rate
                FROM authorizations a
                LEFT JOIN matches m ON a.match_id = m.match_id
                WHERE a.auth_id = ? AND a.user_id = ?
            `).get(authId, userId);
        }

        if (!auth) {
            return res.status(404).json({ 
                success: false, 
                error: 'NOT_FOUND' 
            });
        }

        res.json({ 
            success: true, 
            data: {
                ...auth,
                mode: auth.is_test ? 'test' : 'live'
            }
        });
    } catch (error) {
        logger.error('Fetch authorization error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

export default router;