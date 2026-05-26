/**
 * FOOTRADAPRO - Authorize Routes
 * @description 用户授权提交接口 - 生产版本
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth, filterByMode } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);
router.use(filterByMode);

// ==================== 提交授权 ====================
router.post('/submit', async (req, res) => {
    const { matchId, amount } = req.body;
    const userId = req.session.userId;

    // 生產環境只保留必要日誌
    console.log('=== Authorize Request ===', { matchId, amount, userId });

    if (!matchId || !amount || amount < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PARAMETERS' 
        });
    }

    const db = getDb();

    try {
        db.exec('BEGIN TRANSACTION');

        // 1. 獲取比賽信息
        const match = db.prepare(`
            SELECT * FROM matches 
            WHERE (match_id = ? OR id = ?) AND is_active = 1
        `).get(matchId, matchId);

        if (!match) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'MATCH_NOT_FOUND' 
            });
        }

        // 2. 檢查比賽是否可授權
        const now = new Date();
        const matchTime = new Date(match.match_time);
        
        if (now >= matchTime) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'MATCH_STARTED',
                message: '比賽已開始，無法授權'
            });
        }

        if (match.status !== 'upcoming' && match.status !== 'pending') {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'MATCH_NOT_AVAILABLE' 
            });
        }

        // 3. 檢查用戶餘額（根據模式區分）
        const user = db.prepare(`
            SELECT 
                id, 
                balance, 
                test_balance, 
                is_test_mode 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        // 根據模式選擇要檢查的餘額
        const isTestMode = user.is_test_mode === 1;
        const currentBalance = isTestMode ? (user.test_balance || 10000) : user.balance;

        if (currentBalance < amount) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'INSUFFICIENT_BALANCE',
                mode: isTestMode ? 'test' : 'live',
                current_balance: currentBalance,
                required: amount
            });
        }

        // 4. 檢查授權限額
        if (match.min_authorization && amount < match.min_authorization) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'BELOW_MINIMUM',
                min: match.min_authorization
            });
        }

        if (match.match_limit && amount > match.match_limit) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'EXCEEDS_LIMIT',
                max: match.match_limit
            });
        }

        // 5. 創建授權記錄 - 生產版本
        const authUid = 'AUTH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const executionRate = match.execution_rate || 30;
        const deployedAmount = amount * executionRate / 100;
        const reservedAmount = amount - deployedAmount;

        // 檢查表結構
        const authColumns = db.prepare("PRAGMA table_info(authorizations)").all().map(col => col.name);
        
        let insertAuthSql, insertAuthParams;

        // 根據模式決定是否添加 is_test 字段
        const hasIsTest = authColumns.includes('is_test');
        
        if (hasIsTest) {
            if (authColumns.includes('deployed_amount') && authColumns.includes('reserved_amount')) {
                insertAuthSql = `
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, 
                        executed_amount, deployed_amount, reserved_amount,
                        is_test, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                `;
                insertAuthParams = [
                    authUid, 
                    userId, 
                    match.match_id,
                    amount, 
                    deployedAmount, 
                    deployedAmount, 
                    reservedAmount,
                    isTestMode ? 1 : 0
                ];
            } else {
                insertAuthSql = `
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, 
                        executed_amount, is_test, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                `;
                insertAuthParams = [
                    authUid, 
                    userId, 
                    match.match_id, 
                    amount, 
                    deployedAmount,
                    isTestMode ? 1 : 0
                ];
            }
        } else {
            // 向後兼容（沒有 is_test 字段）
            if (authColumns.includes('deployed_amount') && authColumns.includes('reserved_amount')) {
                insertAuthSql = `
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, 
                        executed_amount, deployed_amount, reserved_amount,
                        status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                `;
                insertAuthParams = [
                    authUid, 
                    userId, 
                    match.match_id, 
                    amount, 
                    deployedAmount, 
                    deployedAmount, 
                    reservedAmount
                ];
            } else {
                insertAuthSql = `
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, 
                        executed_amount, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
                `;
                insertAuthParams = [authUid, userId, match.match_id, amount, deployedAmount];
            }
        }

        db.prepare(insertAuthSql).run(...insertAuthParams);

// 6. 根據模式扣除相應的餘額
const oldBalance = isTestMode ? (user.test_balance || 10000) : user.balance;
const newBalance = oldBalance - amount;

if (isTestMode) {
    // 測試模式：扣測試資金
    db.prepare(`UPDATE users SET test_balance = ? WHERE id = ?`).run(newBalance, userId);
    
    // ✅ 增強版：記錄測試資金變動（帶錯誤處理）
    try {
        db.prepare(`
            INSERT INTO test_balance_logs (
                user_id, amount, balance_before, balance_after, 
                type, reference_id, match_id, description, created_at
            ) VALUES (?, ?, ?, ?, 'authorize', ?, ?, ?, datetime('now', 'utc'))
        `).run(
            userId, 
            -amount, 
            oldBalance, 
            newBalance,
            null,
            match.match_id,
            `Authorization for match: ${match.home_team} vs ${match.away_team}`
        );
    } catch (logErr) {
        console.error('❌ 写入 test_balance_logs 失败:', logErr);
        // 不影响主流程，但记录错误以便排查
    }
} else {
    // 真實模式：扣真實資金
    db.prepare(`UPDATE users SET balance = ? WHERE id = ?`).run(newBalance, userId);
    
    // ✅ 增強版：記錄真實資金變動（帶錯誤處理）
    try {
        const balanceLogColumns = db.prepare("PRAGMA table_info(balance_logs)").all().map(col => col.name);
        const reason = `Authorization for match: ${match.home_team} vs ${match.away_team}`;
        
        if (balanceLogColumns.includes('balance_before') && balanceLogColumns.includes('balance_after')) {
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, created_at
                ) VALUES (?, ?, ?, ?, 'authorization', ?, datetime('now', 'utc'))
            `).run(userId, -amount, oldBalance, newBalance, reason);
        } else {
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, type, reason, created_at
                ) VALUES (?, ?, 'authorization', ?, datetime('now', 'utc'))
            `).run(userId, -amount, reason);
        }
    } catch (logErr) {
        console.error('❌ 写入 balance_logs 失败:', logErr);
    }
}

        // 7. 記錄餘額變動（僅真實模式需要）
        if (!isTestMode) {
            const balanceLogColumns = db.prepare("PRAGMA table_info(balance_logs)").all().map(col => col.name);
            
            let insertLogSql, insertLogParams;
            const reason = `Authorization for match: ${match.home_team} vs ${match.away_team}`;

            if (balanceLogColumns.includes('balance_before') && balanceLogColumns.includes('balance_after')) {
                insertLogSql = `
                    INSERT INTO balance_logs (
                        user_id, amount, balance_before, balance_after, 
                        type, reason, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
                `;
                insertLogParams = [userId, -amount, oldBalance, newBalance, 'authorization', reason];
            } else {
                insertLogSql = `
                    INSERT INTO balance_logs (
                        user_id, amount, type, reason, created_at
                    ) VALUES (?, ?, ?, ?, datetime('now', 'utc'))
                `;
                insertLogParams = [userId, -amount, 'authorization', reason];
            }

            db.prepare(insertLogSql).run(...insertLogParams);
        }

        db.exec('COMMIT');

        // 生產日誌
        logger.info(
            `User ${userId} authorized ${amount} ${isTestMode ? 'tUSDT' : 'USDT'} ` +
            `for match ${match.match_id} (${isTestMode ? 'TEST' : 'LIVE'} mode)`
        );

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

    } catch (error) {
        db.exec('ROLLBACK');
        logger.error('Authorize error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR'
        });
    }
});

// ==================== 檢查比賽是否可授權 ====================
router.get('/check/:matchId', (req, res) => {
    const { matchId } = req.params;
    const db = getDb();

    try {
        const match = db.prepare(`
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

        // 獲取用戶模式
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(req.session.userId);
        const isTestMode = user?.is_test_mode === 1;

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

// ==================== 獲取用戶授權列表（按模式 + 狀態過濾）====================
router.get('/list', (req, res) => {
    const userId = req.session.userId;
    const db = getDb();
    const { page = 1, limit = 20, status } = req.query; // status: 'pending', 'settled', 或 undefined
    const offset = (page - 1) * limit;

    try {
        // 獲取用戶模式
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const isTestMode = user?.is_test_mode === 1;
        const isTestValue = isTestMode ? 1 : 0;

        // 根據 status 參數添加過濾條件
        let statusCondition = '';
        if (status === 'pending') {
            statusCondition = "AND a.status IN ('pending', 'upcoming')";
        } else if (status === 'settled') {
            statusCondition = "AND a.status IN ('won', 'lost', 'settled')";
        }

        // 根據模式過濾授權記錄
const authorizations = db.prepare(`
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
    m.home_logo,     -- 👈 添加这行
    m.away_logo,     -- 👈 添加这行
    m.league,
    m.match_time,
    m.home_score,
    m.away_score
FROM authorizations a
LEFT JOIN matches m ON a.match_id = m.match_id
WHERE a.user_id = ? AND a.is_test = ? ${statusCondition}
ORDER BY a.created_at DESC
LIMIT ? OFFSET ?
`).all(userId, isTestValue, limit, offset);

        // 獲取總數（也要加 status 條件）
        let countQuery = 'SELECT COUNT(*) as count FROM authorizations WHERE user_id = ? AND is_test = ?';
        const countParams = [userId, isTestValue];
        
        if (status === 'pending') {
            countQuery += " AND status IN ('pending', 'upcoming')";
        } else if (status === 'settled') {
            countQuery += " AND status IN ('won', 'lost', 'settled')";
        }
        
        const total = db.prepare(countQuery).get(...countParams);

        logger.info(`用戶 ${userId} 獲取 ${authorizations.length} 條授權記錄 [${isTestMode ? '測試' : '真實'}]${status ? `, 狀態:${status}` : ''}`);

        res.json({
            success: true,
            data: authorizations,
            meta: {
                mode: isTestMode ? 'test' : 'live',
                total: total.count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total.count / limit)
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

// ==================== 獲取單次授權詳情 ====================
// ==================== 獲取單次授權詳情 ====================
router.get('/:authId', (req, res) => {
    const { authId } = req.params;
    const userId = req.session.userId;
    const db = getDb();

    try {
        const auth = db.prepare(`
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