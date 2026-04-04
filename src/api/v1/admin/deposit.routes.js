/**
 * deposit.routes.js - 充值管理路由
 * 修復：正确解析 balance_logs 表中的 reason 字段
 * 支持提取 Network、TxID、Screenshot 等信息
 */

import express from 'express';
const router = express.Router();

import { getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

// 获取待确认充值列表
router.get('/pending', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    try {
        const db = getDb();
        const deposits = db.prepare(`
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
            WHERE b.type = 'deposit'
              AND b.reason LIKE '%(pending)%'
            ORDER BY b.created_at ASC
        `).all();

        const formattedDeposits = deposits.map(d => {
            const reason = d.reason || '';
            
            // 提取网络
            const networkMatch = reason.match(/网络:\s*([^,]+)/);
            // 提取交易哈希
            const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
            // 提取截图
            const screenshotMatch = reason.match(/截图:\s*([^\s,)]+)/);
            
            let network = networkMatch ? networkMatch[1].trim() : '';
            let txHash = txMatch ? txMatch[1].trim() : '';
            let screenshot = screenshotMatch ? screenshotMatch[1].trim() : '';
            
            if (screenshot && !screenshot.startsWith('/')) {
                screenshot = '/uploads/screenshots/' + screenshot;
            }
            
            return {
                id: d.id,
                user_id: d.user_id,
                username: d.username,
                uid: d.uid,
                amount: d.amount,
                network,
                tx_hash: txHash,
                screenshot,
                status: 'pending',
                user_balance: d.user_balance,
                created_at: d.created_at
            };
        });

        res.json({ success: true, data: formattedDeposits });
    } catch (err) {
        logger.error('获取充值列表失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取所有充值记录
router.get('/all', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    try {
        const db = getDb();
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
            WHERE b.type = 'deposit'
        `;
        
        // 根据状态筛选
        if (status && status !== 'all') {
            if (status === 'pending') {
                query += ` AND b.reason LIKE '%(pending)%'`;
            } else if (status === 'completed') {
                query += ` AND b.reason LIKE '%completed%'`;
            } else if (status === 'rejected') {
                query += ` AND b.reason LIKE '%rejected%'`;
            }
        }
        
        query += ` ORDER BY b.created_at DESC`;
        
        const deposits = db.prepare(query).all();
        
        const formattedDeposits = deposits.map(d => {
            const reason = d.reason || '';
            
            // 提取网络
            const networkMatch = reason.match(/网络:\s*([^,]+)/);
            // 提取交易哈希
            const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
            // 提取截图
            const screenshotMatch = reason.match(/截图:\s*([^\s,)]+)/);
            
            let network = networkMatch ? networkMatch[1].trim() : '';
            let txHash = txMatch ? txMatch[1].trim() : '';
            let screenshot = screenshotMatch ? screenshotMatch[1].trim() : '';
            
            if (screenshot && !screenshot.startsWith('/')) {
                screenshot = '/uploads/screenshots/' + screenshot;
            }
            
            // 确定状态
            let recordStatus = 'pending';
            if (reason.includes('completed')) recordStatus = 'completed';
            else if (reason.includes('rejected')) recordStatus = 'rejected';
            else if (reason.includes('(pending)')) recordStatus = 'pending';
            
            return {
                id: d.id,
                user_id: d.user_id,
                username: d.username,
                uid: d.uid,
                amount: d.amount,
                network,
                tx_hash: txHash,
                screenshot,
                status: recordStatus,
                user_balance: d.user_balance,
                created_at: d.created_at
            };
        });
        
        res.json({ success: true, data: formattedDeposits });
    } catch (err) {
        logger.error('获取充值记录失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取充值详情
// 获取充值详情
router.get('/detail/:id', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    try {
        const db = getDb();
        const deposit = db.prepare(`
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
            WHERE b.id = ? AND b.type = 'deposit'
        `).get(req.params.id);
        
        if (!deposit) {
            return res.status(404).json({ success: false, message: '充值记录不存在' });
        }
        
        const reason = deposit.reason || '';
        
        console.log('解析充值记录 ID:', req.params.id);
        console.log('原始 reason:', reason);
        
        // 提取网络 - 中文格式
        const networkMatch = reason.match(/网络:\s*([^,]+)/);
        // 提取交易哈希
        const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
        // 提取截图 - 中文格式
        const screenshotMatch = reason.match(/截图:\s*([^\s,)]+)/);
        
        let network = networkMatch ? networkMatch[1].trim() : '';
        let txHash = txMatch ? txMatch[1].trim() : '';
        let screenshot = screenshotMatch ? screenshotMatch[1].trim() : '';
        
        // 确保截图路径完整
        if (screenshot && !screenshot.startsWith('/')) {
            screenshot = '/uploads/screenshots/' + screenshot;
        }
        
        // 确定状态
        let status = 'pending';
        if (reason.includes('completed')) status = 'completed';
        else if (reason.includes('rejected')) status = 'rejected';
        else if (reason.includes('(pending)')) status = 'pending';
        
        console.log('解析结果:', { network, txHash, screenshot, status });
        
        const formattedDeposit = {
            id: deposit.id,
            user_id: deposit.user_id,
            username: deposit.username,
            uid: deposit.uid,
            amount: deposit.amount,
            network,
            tx_hash: txHash,
            screenshot,
            status,
            admin_note: '',
            user_balance: deposit.user_balance,
            balance_before: deposit.balance_before,
            balance_after: deposit.balance_after,
            created_at: deposit.created_at
        };
        
        res.json({ success: true, data: formattedDeposit });
    } catch (err) {
        logger.error('获取充值详情失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 确认充值
router.post('/:id/confirm', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    const { admin_note = '', actual_amount } = req.body;
    const adminId = req.admin.id;
    const adminName = req.admin.name;
    
    try {
        const db = getDb();
        
        // 获取充值记录
        const deposit = db.prepare(`
            SELECT * FROM balance_logs 
            WHERE id = ? AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
        `).get(req.params.id);
        
        if (!deposit) {
            throw new Error('充值记录不存在或已处理');
        }
        
        // 获取用户
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(deposit.user_id);
        if (!user) {
            throw new Error('用户不存在');
        }
        
        // 确定增加金额：优先使用实际到账金额，否则使用申请金额
        const addAmount = actual_amount && parseFloat(actual_amount) > 0 ? parseFloat(actual_amount) : deposit.amount;
        
        // 增加用户余额
        const newBalance = user.balance + addAmount;
        db.prepare(`
            UPDATE users 
            SET balance = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newBalance, deposit.user_id);
        
        // 更新原记录的 reason，标记为已完成
        const newReason = deposit.reason + 
            ` | completed at ${new Date().toISOString()} | 管理员: ${adminName} | 实际到账: ${addAmount} USDT | 管理员备注: ${admin_note}`;
        
        db.prepare(`
            UPDATE balance_logs 
            SET reason = ?
            WHERE id = ?
        `).run(newReason, req.params.id);
        
        // 创建一条余额变动记录（增加余额的记录）
        db.prepare(`
            INSERT INTO balance_logs (
                user_id, amount, balance_before, balance_after, type, reason, admin_id, created_at
            ) VALUES (?, ?, ?, ?, 'deposit_success', ?, ?, CURRENT_TIMESTAMP)
        `).run(
            deposit.user_id,
            addAmount,
            user.balance,
            newBalance,
            `充值成功: ${addAmount} USDT, 由管理员 ${adminName} 确认, 原申请: ${deposit.amount} USDT, 备注: ${admin_note}`,
            adminId
        );
        
        // 同时更新 deposit_requests 表（如果存在）
        try {
            db.prepare(`
                UPDATE deposit_requests 
                SET status = 'completed', 
                    processed_at = CURRENT_TIMESTAMP,
                    processed_by = ?,
                    actual_amount = ?
                WHERE txid = ? AND status = 'pending'
            `).run(adminId, addAmount, deposit.txid);
        } catch (e) {
            // 如果表不存在或字段不存在，忽略
            console.log('更新 deposit_requests 表失败:', e.message);
        }
        
        // 记录操作日志
        await logAdminAction(req, 'deposit_confirm', {
            deposit_id: req.params.id,
            amount: addAmount,
            user_id: deposit.user_id
        }, 'deposit', req.params.id);
        
        res.json({ 
            success: true, 
            message: '充值已确认',
            data: {
                depositId: req.params.id,
                amount: addAmount,
                userId: deposit.user_id
            }
        });
        
    } catch (err) {
        logger.error('确认充值失败:', err);
        res.status(500).json({ success: false, message: err.message || '服务器错误' });
    }
});

// 驳回充值
router.post('/:id/reject', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    const { admin_note, reject_reason } = req.body;
    const adminId = req.admin.id;
    const adminName = req.admin.name;
    
    const rejectReason = reject_reason || admin_note;
    if (!rejectReason) {
        return res.status(400).json({ success: false, message: '请输入驳回原因' });
    }
    
    try {
        const db = getDb();
        
        // 获取充值记录
        const deposit = db.prepare(`
            SELECT * FROM balance_logs 
            WHERE id = ? AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
        `).get(req.params.id);
        
        if (!deposit) {
            throw new Error('充值记录不存在或已处理');
        }
        
        // 更新原记录的 reason，标记为已驳回
        const newReason = deposit.reason + 
            ` | rejected at ${new Date().toISOString()} | 管理员: ${adminName} | 驳回原因: ${rejectReason}`;
        
        db.prepare(`
            UPDATE balance_logs 
            SET reason = ?
            WHERE id = ?
        `).run(newReason, req.params.id);
        
        // 同时更新 deposit_requests 表（如果存在）
        try {
            db.prepare(`
                UPDATE deposit_requests 
                SET status = 'rejected', 
                    processed_at = CURRENT_TIMESTAMP,
                    processed_by = ?,
                    admin_notes = ?
                WHERE txid = ? AND status = 'pending'
            `).run(adminId, rejectReason, deposit.txid);
        } catch (e) {
            // 如果表不存在或字段不存在，忽略
            console.log('更新 deposit_requests 表失败:', e.message);
        }
        
        // 记录操作日志
        await logAdminAction(req, 'deposit_reject', {
            deposit_id: req.params.id,
            amount: deposit.amount,
            user_id: deposit.user_id,
            reason: rejectReason
        }, 'deposit', req.params.id);
        
        res.json({ 
            success: true, 
            message: '充值已驳回',
            data: {
                depositId: req.params.id,
                amount: deposit.amount,
                userId: deposit.user_id
            }
        });
        
    } catch (err) {
        logger.error('驳回充值失败:', err);
        res.status(500).json({ success: false, message: err.message || '服务器错误' });
    }
});

// 获取充值统计
router.get('/stats', adminAuth, hasRole(['finance_admin', 'super_admin']), (req, res) => {
    try {
        const db = getDb();
        
        const stats = db.prepare(`
            SELECT 
                COUNT(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN 1 END) as pending_count,
                COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN 1 END) as completed_count,
                COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%rejected%' THEN 1 END) as rejected_count,
                SUM(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN amount ELSE 0 END) as pending_amount,
                SUM(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN amount ELSE 0 END) as completed_amount
            FROM balance_logs 
            WHERE type = 'deposit'
        `).get();
        
        res.json({ 
            success: true, 
            data: {
                pending_count: stats.pending_count || 0,
                completed_count: stats.completed_count || 0,
                rejected_count: stats.rejected_count || 0,
                pending_amount: stats.pending_amount || 0,
                completed_amount: stats.completed_amount || 0
            }
        });
    } catch (err) {
        logger.error('获取充值统计失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

export default router;