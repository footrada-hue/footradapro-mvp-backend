// src/api/v1/user/withdraw.user.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth, requireLiveMode } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';
import telegramService from '../../../services/telegram.service.js';

const router = express.Router();
router.use(auth);

/**
 * ======================================================
 * 真實提現（需要審核）
 * ======================================================
 */

// 用戶提交真實提現請求（待審核）- 僅限真實模式
router.post('/submit', requireLiveMode, async (req, res) => {
    const { amount, address, network } = req.body;
    const userId = req.session.userId;
    const db = getDb();

    console.log('=== 用戶真實提現請求 ===');
    console.log('用戶ID:', userId);
    console.log('金額:', amount);
    console.log('地址:', address);
    console.log('網絡:', network);

    // 基本驗證
    if (!amount || !address || !network) {
        return res.status(400).json({ 
            success: false, 
            error: 'MISSING_FIELDS' 
        });
    }

    if (amount < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'MINIMUM_AMOUNT',
            message: 'Minimum withdrawal amount is 10 USDT'
        });
    }

    // 開始事務
    db.exec('BEGIN TRANSACTION');

    try {
        // 檢查用戶餘額（增加 username, email, uid 字段）
        const user = db.prepare('SELECT id, balance, is_test_mode, username, email, uid FROM users WHERE id = ?').get(userId);
        
        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        // 再次確認不是測試模式
        if (user.is_test_mode) {
            db.exec('ROLLBACK');
            return res.status(403).json({
                success: false,
                error: 'TEST_MODE_ONLY',
                message: 'Please switch to Live mode for real withdrawals'
            });
        }

        if (user.balance < amount) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'INSUFFICIENT_BALANCE',
                current_balance: user.balance,
                required: amount
            });
        }

        // 扣除餘額
        const newBalance = user.balance - amount;
        db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, userId);

        // 檢查 withdraw_requests 表是否存在，如果不存在則創建
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='withdraw_requests'
        `).get();

        if (!tableExists) {
            // 創建 withdraw_requests 表
            db.prepare(`
                CREATE TABLE withdraw_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    address TEXT NOT NULL,
                    network TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by INTEGER,
                    reviewed_at DATETIME,
                    tx_hash TEXT,
                    remark TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `).run();
            
            // 創建索引
            db.prepare(`CREATE INDEX idx_withdraw_user ON withdraw_requests(user_id)`).run();
            db.prepare(`CREATE INDEX idx_withdraw_status ON withdraw_requests(status)`).run();
            
            console.log('✅ withdraw_requests 表已自動創建');
        }

        // 寫入 withdraw_requests 表（待審核）
        const result = db.prepare(`
            INSERT INTO withdraw_requests (
                user_id, amount, address, network, status, created_at
            ) VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).run(userId, amount, address, network);

        // 記錄到 balance_logs
        const reason = `提現申請: ${amount} USDT, 網絡: ${network}, 地址: ${address}, 狀態: pending`;
        
        db.prepare(`
            INSERT INTO balance_logs (
                user_id, amount, balance_before, balance_after, 
                type, reason, created_at
            ) VALUES (?, ?, ?, ?, 'withdraw', ?, datetime('now'))
        `).run(
            userId,
            -amount,
            user.balance,
            newBalance,
            reason
        );

        // 提交事務
        db.exec('COMMIT');

        logger.info(`用戶 ${userId} 提交真實提現申請: ${amount} USDT 到 ${address} (${network})`);

        // 发送 Telegram 通知
        try {
            await telegramService.notifyWithdrawRequest(
                { 
                    username: user.username || 'User', 
                    email: user.email || '', 
                    uid: user.uid || userId, 
                    id: userId 
                },
                amount,
                address,
                network,
                null
            );
            console.log('Telegram notification sent for withdraw request');
        } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
        }

        res.json({
            success: true,
            message: 'Withdrawal request submitted, pending review',
            data: {
                id: result.lastInsertRowid,
                amount,
                address,
                network,
                status: 'pending',
                mode: 'live'
            }
        });

    } catch (error) {
        db.exec('ROLLBACK');
        console.error('提現失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

/**
 * ======================================================
 * 測試提現（模擬，無需審核）- 仅限测试模式
 * ======================================================
 */

// 用戶提交測試提現請求（模擬）- 僅限測試模式
router.post('/test/submit', (req, res) => {
    const { amount, address, network } = req.body;
    const userId = req.session.userId;
    const db = getDb();

    console.log('=== 用戶測試提現請求 (模擬) ===');
    console.log('用戶ID:', userId);
    console.log('金額:', amount);
    console.log('地址:', address);
    console.log('網絡:', network);

    // 基本驗證
    if (!amount || !address || !network) {
        return res.status(400).json({ 
            success: false, 
            error: 'MISSING_FIELDS' 
        });
    }

    if (amount < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'MINIMUM_AMOUNT',
            message: 'Minimum withdrawal amount is 10 tUSDT'
        });
    }

    // 開始事務
    db.exec('BEGIN TRANSACTION');

    try {
        // 檢查用戶模式和測試資金
        const user = db.prepare('SELECT id, test_balance, is_test_mode FROM users WHERE id = ?').get(userId);
        
        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        // 如果不是測試模式，返回錯誤
        if (!user.is_test_mode) {
            db.exec('ROLLBACK');
            return res.status(403).json({
                success: false,
                error: 'LIVE_MODE_ONLY',
                message: 'Test withdrawals are only available in Test mode'
            });
        }

        if (user.test_balance < amount) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'INSUFFICIENT_TEST_BALANCE',
                current_balance: user.test_balance,
                required: amount
            });
        }

        // 扣除測試資金
        const newBalance = user.test_balance - amount;
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(newBalance, userId);

        // 記錄到 test_balance_logs
        db.prepare(`
            INSERT INTO test_balance_logs (
                user_id, amount, balance_before, balance_after, 
                type, description, created_at
            ) VALUES (?, ?, ?, ?, 'withdraw', ?, datetime('now'))
        `).run(
            userId,
            -amount,
            user.test_balance,
            newBalance,
            `Test withdrawal: ${amount} tUSDT to ${address} (${network})`
        );

        // 提交事務
        db.exec('COMMIT');

        // 生成模擬交易哈希
        const mockTxHash = '0x' + Array.from({length: 64}, () => 
            Math.floor(Math.random() * 16).toString(16)).join('');

        logger.info(`用戶 ${userId} 提交測試提現: ${amount} tUSDT 到 ${address} (${network})`);

        res.json({
            success: true,
            message: 'Test withdrawal completed successfully',
            data: {
                amount,
                address,
                network,
                status: 'completed',
                mode: 'test',
                tx_hash: mockTxHash,
                new_balance: newBalance
            }
        });

    } catch (error) {
        db.exec('ROLLBACK');
        console.error('測試提現失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

/**
 * ======================================================
 * 獲取提現歷史（仅真实模式有记录）
 * ======================================================
 */

// 用戶獲取自己的提現歷史
router.get('/history', (req, res) => {
    const userId = req.session.userId;
    const { limit = 20 } = req.query;
    const db = getDb();

    try {
        // 獲取用戶模式
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const isTestMode = user?.is_test_mode === 1;

        // 檢查 withdraw_requests 表是否存在
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='withdraw_requests'
        `).get();

        if (!tableExists) {
            return res.json({
                success: true,
                data: {
                    list: [],
                    mode: isTestMode ? 'test' : 'live'
                }
            });
        }

        // 真实模式下查询提现记录，测试模式返回空列表
        let withdrawals = [];
        
        if (!isTestMode) {
            withdrawals = db.prepare(`
                SELECT 
                    id,
                    amount,
                    address,
                    network,
                    status,
                    created_at,
                    tx_hash
                FROM withdraw_requests 
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `).all(userId, parseInt(limit));
        }

        res.json({
            success: true,
            data: {
                list: withdrawals,
                mode: isTestMode ? 'test' : 'live',
                total: withdrawals.length
            }
        });

    } catch (error) {
        console.error('獲取提現歷史失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

/**
 * ======================================================
 * 獲取提現統計
 * ======================================================
 */

// 獲取提現統計信息
router.get('/stats', (req, res) => {
    const userId = req.session.userId;
    const db = getDb();

    try {
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const isTestMode = user?.is_test_mode === 1;

        // 真实模式提现统计
        let liveStats = { total_count: 0, total_amount: 0, pending_count: 0, completed_count: 0 };
        
        if (!isTestMode) {
            const tableExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='withdraw_requests'
            `).get();
            
            if (tableExists) {
                liveStats = db.prepare(`
                    SELECT 
                        COUNT(*) as total_count,
                        COALESCE(SUM(amount), 0) as total_amount,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
                    FROM withdraw_requests 
                    WHERE user_id = ?
                `).get(userId);
            }
        }

        res.json({
            success: true,
            data: {
                live: {
                    count: liveStats?.total_count || 0,
                    amount: liveStats?.total_amount || 0,
                    pending: liveStats?.pending_count || 0,
                    completed: liveStats?.completed_count || 0
                },
                test: {
                    count: 0,
                    amount: 0
                },
                current_mode: isTestMode ? 'test' : 'live'
            }
        });

    } catch (error) {
        console.error('獲取提現統計失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

export default router;