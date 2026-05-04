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
 * 获取网络手续费配置
 * ======================================================
 */
function getNetworkConfig(db, network) {
    try {
        const config = db.prepare(`
            SELECT fee, min_amount, max_amount, is_active 
            FROM withdraw_config 
            WHERE network = ? AND is_active = 1
        `).get(network);
        
        if (config) {
            return {
                fee: config.fee,
                min_amount: config.min_amount,
                max_amount: config.max_amount
            };
        }
    } catch (error) {
        console.error('获取网络配置失败:', error);
    }
    
    // 默认配置
    return { fee: 1.00, min_amount: 10.00, max_amount: null };
}

/**
 * ======================================================
 * 真實提現（需要審核）- 包含手续费
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

    // 获取网络手续费配置
    const networkConfig = getNetworkConfig(db, network);
    const fee = networkConfig.fee;
    const minAmount = networkConfig.min_amount;
    const netAmount = amount - fee;

    console.log('手續費:', fee);
    console.log('到賬金額:', netAmount);

    // 验证最小提现金额
    if (amount < minAmount) {
        return res.status(400).json({ 
            success: false, 
            error: 'MINIMUM_AMOUNT',
            message: `Minimum withdrawal amount is ${minAmount} USDT`,
            min_amount: minAmount
        });
    }

    // 验证到账金额是否有效
    if (netAmount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'AMOUNT_TOO_SMALL',
            message: `After deducting ${fee} USDT fee, the net amount is too small`,
            fee: fee
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
                required: amount,
                fee: fee,
                net_amount: netAmount
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
            // 創建 withdraw_requests 表（包含手续费字段）
            db.prepare(`
                CREATE TABLE withdraw_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    fee DECIMAL(10,2) DEFAULT 1.00,
                    net_amount DECIMAL(10,2),
                    address TEXT NOT NULL,
                    network TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    tx_hash TEXT,
                    reject_reason TEXT,
                    admin_note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by INTEGER,
                    reviewed_at DATETIME,
                    remark TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `).run();
            
            // 創建索引
            db.prepare(`CREATE INDEX idx_withdraw_user ON withdraw_requests(user_id)`).run();
            db.prepare(`CREATE INDEX idx_withdraw_status ON withdraw_requests(status)`).run();
            db.prepare(`CREATE INDEX idx_withdraw_created ON withdraw_requests(created_at)`).run();
            
            console.log('✅ withdraw_requests 表已自動創建');
        }

        // 寫入 withdraw_requests 表（包含手续费信息）
        const result = db.prepare(`
            INSERT INTO withdraw_requests (
                user_id, amount, fee, net_amount, address, network, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).run(userId, amount, fee, netAmount, address, network);

        // 記錄到 balance_logs
        const reason = `提現申請: ${amount} USDT, 手續費: ${fee} USDT, 到賬: ${netAmount} USDT, 網絡: ${network}, 地址: ${address}, 狀態: pending`;
        
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

        logger.info(`用戶 ${userId} (${user.username}) 提交真實提現申請: ${amount} USDT, 手續費 ${fee} USDT, 到賬 ${netAmount} USDT, 地址: ${address} (${network})`);

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
                { fee: fee, net_amount: netAmount }
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
                amount: amount,
                fee: fee,
                net_amount: netAmount,
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
            error: 'INTERNAL_ERROR',
            message: error.message 
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

    // 获取测试模式的手续费配置（测试模式也扣手续费）
    const networkConfig = getNetworkConfig(db, network);
    const fee = networkConfig.fee;
    const minAmount = networkConfig.min_amount;
    const netAmount = amount - fee;

    if (amount < minAmount) {
        return res.status(400).json({ 
            success: false, 
            error: 'MINIMUM_AMOUNT',
            message: `Minimum withdrawal amount is ${minAmount} tUSDT`
        });
    }

    if (netAmount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'AMOUNT_TOO_SMALL',
            message: `After deducting ${fee} USDT fee, the net amount is too small`
        });
    }

    // 開始事務
    db.exec('BEGIN TRANSACTION');

    try {
        // 檢查用戶模式和測試資金
        const user = db.prepare('SELECT id, test_balance, is_test_mode, username, email, uid FROM users WHERE id = ?').get(userId);
        
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

        // 扣除測試資金（扣除申请金额）
        const newBalance = user.test_balance - amount;
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(newBalance, userId);

        // 記錄到 test_balance_logs（包含手续费信息）
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
            `Test withdrawal: ${amount} tUSDT, fee: ${fee} tUSDT, net: ${netAmount} tUSDT to ${address} (${network})`
        );

        // 提交事務
        db.exec('COMMIT');

        // 生成模擬交易哈希
        const mockTxHash = '0x' + Array.from({length: 64}, () => 
            Math.floor(Math.random() * 16).toString(16)).join('');

        logger.info(`用戶 ${userId} 提交測試提現: ${amount} tUSDT (fee: ${fee}, net: ${netAmount}) 到 ${address} (${network})`);

        res.json({
            success: true,
            message: 'Test withdrawal completed successfully',
            data: {
                amount: amount,
                fee: fee,
                net_amount: netAmount,
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
 * 獲取提現歷史（包含手续费信息）
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

        // 真实模式下查询提现记录（包含手续费字段）
        let withdrawals = [];
        
        if (!isTestMode) {
            withdrawals = db.prepare(`
                SELECT 
                    id,
                    amount,
                    fee,
                    net_amount,
                    address,
                    network,
                    status,
                    created_at,
                    tx_hash,
                    reject_reason,
                    admin_note,
                    reviewed_at
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
 * 獲取提現統計（包含手续费统计）
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
        let liveStats = { 
            total_count: 0, 
            total_amount: 0, 
            total_fee: 0,
            total_net_amount: 0,
            pending_count: 0, 
            completed_count: 0,
            rejected_count: 0
        };
        
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
                        COALESCE(SUM(fee), 0) as total_fee,
                        COALESCE(SUM(net_amount), 0) as total_net_amount,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                        COUNT(CASE WHEN status = 'approved' THEN 1 END) as completed_count,
                        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
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
                    fee: liveStats?.total_fee || 0,
                    net_amount: liveStats?.total_net_amount || 0,
                    pending: liveStats?.pending_count || 0,
                    completed: liveStats?.completed_count || 0,
                    rejected: liveStats?.rejected_count || 0
                },
                test: {
                    count: 0,
                    amount: 0,
                    fee: 0,
                    net_amount: 0
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