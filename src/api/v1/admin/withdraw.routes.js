// withdraw.routes.js - 提现管理路由
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';
import telegramService from '../../../services/telegram.service.js';

const router = express.Router();

// 获取待审核提现列表
router.get('/pending', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    const db = getDb();
    
    try {
        const withdrawals = db.prepare(`
            SELECT 
                b.id,
                b.user_id,
                b.amount,
                b.balance_before,
                b.balance_after,
                b.type,
                b.reason,
                b.created_at,
                u.username,
                u.uid,
                u.balance as user_balance
            FROM balance_logs b
            JOIN users u ON b.user_id = u.id
            WHERE b.type = 'withdraw' 
              AND b.reason LIKE '%pending%'
            ORDER BY b.created_at ASC
        `).all();
        
        const formattedWithdrawals = withdrawals.map(w => {
            const reason = w.reason || '';
            const network = reason.match(/网络: ([^,]+)/)?.[1] || '';
            const address = reason.match(/地址: ([^\s]+)/)?.[1] || '';
            
            return {
                id: w.id,
                user_id: w.user_id,
                username: w.username,
                uid: w.uid,
                amount: w.amount,
                network,
                address,
                status: 'pending',
                user_balance: w.user_balance,
                created_at: w.created_at
            };
        });
        
        res.json({ success: true, data: formattedWithdrawals });
    } catch (err) {
        logger.error('获取提现列表失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取提现详情
router.get('/detail/:id', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    const db = getDb();
    
    try {
        const withdrawal = db.prepare(`
            SELECT 
                b.id,
                b.user_id,
                b.amount,
                b.balance_before,
                b.balance_after,
                b.type,
                b.reason,
                b.created_at,
                u.username,
                u.uid,
                u.balance as user_balance
            FROM balance_logs b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = ? AND b.type = 'withdraw'
        `).get(req.params.id);
        
        if (!withdrawal) {
            return res.status(404).json({ success: false, message: '提现记录不存在' });
        }
        
        const reason = withdrawal.reason || '';
        const network = reason.match(/网络: ([^,]+)/)?.[1] || '';
        const address = reason.match(/地址: ([^\s]+)/)?.[1] || '';
        const status = reason.includes('approved') ? 'approved' : 
                      reason.includes('completed') ? 'completed' : 
                      reason.includes('rejected') ? 'rejected' : 'pending';
        
        const formattedWithdrawal = {
            id: withdrawal.id,
            user_id: withdrawal.user_id,
            username: withdrawal.username,
            uid: withdrawal.uid,
            amount: withdrawal.amount,
            network,
            address,
            status,
            user_balance: withdrawal.user_balance,
            created_at: withdrawal.created_at
        };
        
        res.json({ success: true, data: formattedWithdrawal });
    } catch (err) {
        logger.error('获取提现详情失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 审核提现 - 通过
router.post('/:id/approve', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    const db = getDb();
    const { tx_hash, admin_note } = req.body;
    const adminId = req.admin.id;
    const adminName = req.admin.name;
    
    if (!tx_hash) {
        return res.status(400).json({ success: false, message: '请输入交易哈希' });
    }
    
    try {
        let withdrawalData = null;
        let address = '';
        let network = '';
        
        const transaction = db.transaction(() => {
            // 获取提现记录
            const withdrawal = db.prepare(`
                SELECT * FROM balance_logs 
                WHERE id = ? AND type = 'withdraw' AND reason NOT LIKE '%approved%' AND reason NOT LIKE '%rejected%'
            `).get(req.params.id);
            
            if (!withdrawal) {
                throw new Error('提现记录不存在或已处理');
            }
            
            // 解析地址和网络
            const reason = withdrawal.reason || '';
            network = reason.match(/网络: ([^,]+)/)?.[1] || '';
            address = reason.match(/地址: ([^\s]+)/)?.[1] || '';
            
            // 获取用户当前余额
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(withdrawal.user_id);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            // 更新原记录的 reason，标记为已通过
            const newReason = withdrawal.reason + 
                ` | approved at ${new Date().toISOString()} | 管理员: ${adminName} | TxID: ${tx_hash} | 备注: ${admin_note || ''}`;
            
            db.prepare(`
                UPDATE balance_logs 
                SET reason = ?
                WHERE id = ?
            `).run(newReason, req.params.id);
            
            // 记录审核通过的日志
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, type, reason, admin_id, created_at
                ) VALUES (?, ?, ?, ?, 'withdraw_approved', ?, ?, CURRENT_TIMESTAMP)
            `).run(
                withdrawal.user_id,
                0,
                user.balance,
                user.balance,
                `提现审核通过: ${Math.abs(withdrawal.amount)} USDT, TxID: ${tx_hash}, 由管理员 ${adminName} 确认`,
                adminId
            );
            
            withdrawalData = withdrawal;
            return { withdrawal, user };
        })();
        
        await logAdminAction(req, 'withdraw_approve', {
            withdraw_id: req.params.id,
            amount: Math.abs(transaction.withdrawal.amount),
            user_id: transaction.withdrawal.user_id,
            tx_hash
        }, 'withdraw', req.params.id);
        
        // 发送 Telegram 通知
        try {
            const userInfo = db.prepare('SELECT username, email, uid FROM users WHERE id = ?').get(transaction.withdrawal.user_id);
            
            await telegramService.notifyWithdrawCompleted(
                { 
                    username: userInfo?.username || 'User', 
                    email: userInfo?.email || '', 
                    uid: userInfo?.uid || transaction.withdrawal.user_id, 
                    id: transaction.withdrawal.user_id 
                },
                Math.abs(transaction.withdrawal.amount),
                address,
                network,
                tx_hash,
                adminName
            );
            console.log('Telegram notification sent for withdraw approval');
        } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
        }
        
        res.json({ 
            success: true, 
            message: '提现已通过',
            data: {
                withdrawId: req.params.id,
                amount: Math.abs(transaction.withdrawal.amount),
                userId: transaction.withdrawal.user_id
            }
        });
    } catch (err) {
        logger.error('审核提现失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 审核提现 - 拒绝（恢复用户余额）
router.post('/:id/reject', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    const db = getDb();
    const { admin_note } = req.body;
    const adminId = req.admin.id;
    const adminName = req.admin.name;
    
    if (!admin_note) {
        return res.status(400).json({ success: false, message: '请输入拒绝原因' });
    }
    
    try {
        let withdrawalData = null;
        
        const transaction = db.transaction(() => {
            // 获取提现记录
            const withdrawal = db.prepare(`
                SELECT * FROM balance_logs 
                WHERE id = ? AND type = 'withdraw' AND reason NOT LIKE '%approved%' AND reason NOT LIKE '%rejected%'
            `).get(req.params.id);
            
            if (!withdrawal) {
                throw new Error('提现记录不存在或已处理');
            }
            
            // 获取用户当前余额
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(withdrawal.user_id);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            console.log('=== 驳回提现 ===');
            console.log('提现记录ID:', req.params.id);
            console.log('实际扣除金额:', Math.abs(withdrawal.amount));
            console.log('用户当前余额:', user.balance);
            
            // 计算恢复后的余额
            const newBalance = user.balance + Math.abs(withdrawal.amount);
            console.log('恢复后余额:', newBalance);
            
            // 恢复用户余额
            db.prepare(`
                UPDATE users 
                SET balance = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(newBalance, withdrawal.user_id);
            
            // 更新原记录的 reason，标记为已驳回
            const newReason = withdrawal.reason + 
                ` | rejected at ${new Date().toISOString()} | 管理员: ${adminName} | 驳回原因: ${admin_note}`;
            
            db.prepare(`
                UPDATE balance_logs 
                SET reason = ?
                WHERE id = ?
            `).run(newReason, req.params.id);
            
            // 记录余额恢复日志
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, type, reason, admin_id, created_at
                ) VALUES (?, ?, ?, ?, 'withdraw_reject', ?, ?, CURRENT_TIMESTAMP)
            `).run(
                withdrawal.user_id,
                Math.abs(withdrawal.amount),
                user.balance,
                newBalance,
                `提现申请已驳回，余额已恢复: ${Math.abs(withdrawal.amount)} USDT, 驳回原因: ${admin_note}`,
                adminId
            );
            
            withdrawalData = withdrawal;
            return { withdrawal, user, newBalance };
        })();
        
        await logAdminAction(req, 'withdraw_reject', {
            withdraw_id: req.params.id,
            amount: Math.abs(transaction.withdrawal.amount),
            user_id: transaction.withdrawal.user_id,
            reason: admin_note
        }, 'withdraw', req.params.id);
        
        logger.info(`提现驳回 - 用户 ${transaction.withdrawal.user_id} 余额已恢复: +${Math.abs(transaction.withdrawal.amount)} USDT`);
        
        // 发送 Telegram 通知
        try {
            const userInfo = db.prepare('SELECT username, email, uid FROM users WHERE id = ?').get(transaction.withdrawal.user_id);
            
            await telegramService.notifyWithdrawRejected(
                { 
                    username: userInfo?.username || 'User', 
                    email: userInfo?.email || '', 
                    uid: userInfo?.uid || transaction.withdrawal.user_id, 
                    id: transaction.withdrawal.user_id 
                },
                Math.abs(transaction.withdrawal.amount),
                admin_note,
                adminName
            );
            console.log('Telegram notification sent for withdraw rejection');
        } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
        }
        
        res.json({ 
            success: true, 
            message: '提现已拒绝，余额已恢复',
            data: {
                withdrawId: req.params.id,
                amount: Math.abs(transaction.withdrawal.amount),
                userId: transaction.withdrawal.user_id,
                new_balance: transaction.newBalance
            }
        });
    } catch (err) {
        logger.error('拒绝提现失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 获取提现统计
router.get('/stats', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    const db = getDb();
    
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(CASE WHEN type = 'withdraw' AND reason LIKE '%pending%' THEN 1 END) as pending_count,
                COUNT(CASE WHEN type = 'withdraw' AND reason LIKE '%approved%' THEN 1 END) as approved_count,
                COUNT(CASE WHEN type = 'withdraw' AND reason LIKE '%rejected%' THEN 1 END) as rejected_count,
                COUNT(CASE WHEN type = 'withdraw' AND reason LIKE '%completed%' THEN 1 END) as completed_count,
                SUM(CASE WHEN type = 'withdraw' AND reason LIKE '%pending%' THEN amount ELSE 0 END) as pending_amount,
                SUM(CASE WHEN type = 'withdraw' AND reason LIKE '%approved%' THEN amount ELSE 0 END) as approved_amount
            FROM balance_logs 
            WHERE type = 'withdraw'
        `).get();
        
        res.json({ 
            success: true, 
            data: {
                pending_count: stats.pending_count || 0,
                approved_count: stats.approved_count || 0,
                rejected_count: stats.rejected_count || 0,
                completed_count: stats.completed_count || 0,
                pending_amount: stats.pending_amount || 0,
                approved_amount: stats.approved_amount || 0
            }
        });
    } catch (err) {
        logger.error('获取提现统计失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取所有提现记录（按状态筛选）
router.get('/all', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    const db = getDb();
    
    try {
        const { status } = req.query;
        
        let query = `
            SELECT 
                b.id,
                b.user_id,
                b.amount,
                b.balance_before,
                b.balance_after,
                b.type,
                b.reason,
                b.created_at,
                u.username,
                u.uid,
                u.balance as user_balance
            FROM balance_logs b
            JOIN users u ON b.user_id = u.id
            WHERE b.type = 'withdraw'
        `;
        
        if (status && status !== 'all') {
            if (status === 'pending') {
                query += ` AND b.reason LIKE '%pending%'`;
            } else if (status === 'approved') {
                query += ` AND b.reason LIKE '%approved%'`;
            } else if (status === 'rejected') {
                query += ` AND b.reason LIKE '%rejected%'`;
            } else if (status === 'completed') {
                query += ` AND b.reason LIKE '%completed%'`;
            }
        }
        
        query += ` ORDER BY b.created_at DESC`;
        
        const withdrawals = db.prepare(query).all();
        
        const formattedWithdrawals = withdrawals.map(w => {
            const reason = w.reason || '';
            const network = reason.match(/网络: ([^,]+)/)?.[1] || '';
            const address = reason.match(/地址: ([^\s]+)/)?.[1] || '';
            const status = reason.includes('approved') ? 'approved' : 
                          reason.includes('completed') ? 'completed' : 
                          reason.includes('rejected') ? 'rejected' : 'pending';
            
            return {
                id: w.id,
                user_id: w.user_id,
                username: w.username,
                uid: w.uid,
                amount: w.amount,
                network,
                address,
                status,
                user_balance: w.user_balance,
                created_at: w.created_at
            };
        });
        
        res.json({ success: true, data: formattedWithdrawals });
    } catch (err) {
        logger.error('获取提现记录失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

export default router;