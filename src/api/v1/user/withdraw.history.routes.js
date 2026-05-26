// src/api/v1/user/withdraw.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

// 提現提交
router.post('/submit', (req, res) => {
    const { amount, address, network } = req.body;
    const userId = req.session.userId;
    const db = getDb();

    console.log('=== 提現請求 ===');
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
        // 檢查用戶餘額
        const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId);
        
        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        if (user.balance < amount) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'INSUFFICIENT_BALANCE' 
            });
        }

        // 扣款
        const newBalance = user.balance - amount;
        db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, userId);

        // 寫入提現記錄
        const result = db.prepare(`
            INSERT INTO withdraw_requests (user_id, amount, address, network, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(userId, amount, address, network);

        // 提交事務
        db.exec('COMMIT');

        logger.info(`用戶 ${userId} 提交提現請求: ${amount} USDT 到 ${address}`);

        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: {
                id: result.lastInsertRowid,
                amount,
                address,
                network,
                status: 'pending'
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

export default router;