/**
 * deposit.routes.js - 充值管理路由
 * 支持测试/真实双余额模式
 * @version 3.0.0 - 支持 PostgreSQL 和 SQLite
 */

import express from 'express';
const router = express.Router();

import { query, getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

// 获取待确认充值列表
router.get('/pending', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    try {
        let deposits;
        
        if (isProduction) {
            // PostgreSQL 版本
            const result = await query(`
                SELECT
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
                    b.created_at,
                    u.username,
                    u.uid,
                    u.balance as user_balance
                FROM balance_logs b
                JOIN users u ON b.user_id = u.id
                WHERE b.type = 'deposit'
                  AND b.reason LIKE '%(pending)%'
                ORDER BY b.created_at ASC
            `);
            deposits = result || [];
        } else {
            // SQLite 版本
            const db = getDb();
            deposits = db.prepare(`
                SELECT
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
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
        }

        const formattedDeposits = deposits.map(d => {
            const reason = d.reason || '';
            
            const networkMatch = reason.match(/网络:\s*([^,]+)/);
            const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
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
                mode: d.mode || 'real',
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
router.get('/all', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    try {
        const { status } = req.query;
        let deposits;
        
        if (isProduction) {
            let sql = `
                SELECT 
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
                    b.created_at,
                    u.username,
                    u.uid,
                    u.balance as user_balance
                FROM balance_logs b
                JOIN users u ON b.user_id = u.id
                WHERE b.type = 'deposit'
            `;
            
            if (status && status !== 'all') {
                if (status === 'pending') {
                    sql += ` AND b.reason LIKE '%(pending)%'`;
                } else if (status === 'completed') {
                    sql += ` AND b.reason LIKE '%completed%'`;
                } else if (status === 'rejected') {
                    sql += ` AND b.reason LIKE '%rejected%'`;
                }
            }
            
            sql += ` ORDER BY b.created_at DESC`;
            
            const result = await query(sql);
            deposits = result || [];
        } else {
            const db = getDb();
            let sql = `
                SELECT 
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
                    b.created_at,
                    u.username,
                    u.uid,
                    u.balance as user_balance
                FROM balance_logs b
                JOIN users u ON b.user_id = u.id
                WHERE b.type = 'deposit'
            `;
            
            if (status && status !== 'all') {
                if (status === 'pending') {
                    sql += ` AND b.reason LIKE '%(pending)%'`;
                } else if (status === 'completed') {
                    sql += ` AND b.reason LIKE '%completed%'`;
                } else if (status === 'rejected') {
                    sql += ` AND b.reason LIKE '%rejected%'`;
                }
            }
            
            sql += ` ORDER BY b.created_at DESC`;
            
            deposits = db.prepare(sql).all();
        }
        
        const formattedDeposits = deposits.map(d => {
            const reason = d.reason || '';
            
            const networkMatch = reason.match(/网络:\s*([^,]+)/);
            const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
            const screenshotMatch = reason.match(/截图:\s*([^\s,)]+)/);
            
            let network = networkMatch ? networkMatch[1].trim() : '';
            let txHash = txMatch ? txMatch[1].trim() : '';
            let screenshot = screenshotMatch ? screenshotMatch[1].trim() : '';
            
            if (screenshot && !screenshot.startsWith('/')) {
                screenshot = '/uploads/screenshots/' + screenshot;
            }
            
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
                mode: d.mode || 'real',
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
router.get('/detail/:id', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    try {
        let deposit;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
                    b.created_at,
                    u.username,
                    u.uid,
                    u.balance as user_balance
                FROM balance_logs b
                JOIN users u ON b.user_id = u.id
                WHERE b.id = $1 AND b.type = 'deposit'
            `, [req.params.id]);
            deposit = result?.[0];
        } else {
            const db = getDb();
            deposit = db.prepare(`
                SELECT 
                    b.id,
                    b.user_id,
                    b.amount,
                    b.balance_before,
                    b.balance_after,
                    b.type,
                    b.reason,
                    b.mode,
                    b.created_at,
                    u.username,
                    u.uid,
                    u.balance as user_balance
                FROM balance_logs b
                JOIN users u ON b.user_id = u.id
                WHERE b.id = ? AND b.type = 'deposit'
            `).get(req.params.id);
        }
        
        if (!deposit) {
            return res.status(404).json({ success: false, message: '充值记录不存在' });
        }
        
        const reason = deposit.reason || '';
        
        const networkMatch = reason.match(/网络:\s*([^,]+)/);
        const txMatch = reason.match(/TxID:\s*([^,\s)]+)/);
        const screenshotMatch = reason.match(/截图:\s*([^\s,)]+)/);
        
        let network = networkMatch ? networkMatch[1].trim() : '';
        let txHash = txMatch ? txMatch[1].trim() : '';
        let screenshot = screenshotMatch ? screenshotMatch[1].trim() : '';
        
        if (screenshot && !screenshot.startsWith('/')) {
            screenshot = '/uploads/screenshots/' + screenshot;
        }
        
        let status = 'pending';
        if (reason.includes('completed')) status = 'completed';
        else if (reason.includes('rejected')) status = 'rejected';
        else if (reason.includes('(pending)')) status = 'pending';
        
        const formattedDeposit = {
            id: deposit.id,
            user_id: deposit.user_id,
            username: deposit.username,
            uid: deposit.uid,
            amount: deposit.amount,
            network,
            tx_hash: txHash,
            screenshot,
            mode: deposit.mode || 'real',
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

// 确认充值（支持双余额模式）
router.post('/:id/confirm', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    const { admin_note = '', actual_amount } = req.body;
    const adminId = req.admin.id;
    const adminName = req.admin.name;
    
    try {
        let deposit;
        
        if (isProduction) {
            const result = await query(`
                SELECT * FROM balance_logs 
                WHERE id = $1 AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
            `, [req.params.id]);
            deposit = result?.[0];
        } else {
            const db = getDb();
            deposit = db.prepare(`
                SELECT * FROM balance_logs 
                WHERE id = ? AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
            `).get(req.params.id);
        }
        
        if (!deposit) {
            throw new Error('充值记录不存在或已处理');
        }
        
        // 根据模式选择要更新的余额字段
        const mode = deposit.mode || 'real';
        const balanceField = mode === 'test' ? 'test_balance' : 'real_balance';
        
        let user;
        if (isProduction) {
            const userResult = await query(`SELECT * FROM users WHERE id = $1`, [deposit.user_id]);
            user = userResult?.[0];
        } else {
            const db = getDb();
            user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(deposit.user_id);
        }
        
        if (!user) {
            throw new Error('用户不存在');
        }
        
        const addAmount = actual_amount && parseFloat(actual_amount) > 0 ? parseFloat(actual_amount) : deposit.amount;
        const currentBalance = user[balanceField] || 0;
        const newBalance = currentBalance + addAmount;
        
        if (isProduction) {
            await query(`
                UPDATE users 
                SET ${balanceField} = $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [newBalance, deposit.user_id]);
            
            const newReason = deposit.reason + 
                ` | completed at ${new Date().toISOString()} | 管理员: ${adminName} | 实际到账: ${addAmount} USDT | 模式: ${mode} | 管理员备注: ${admin_note}`;
            
            await query(`
                UPDATE balance_logs 
                SET reason = $1
                WHERE id = $2
            `, [newReason, req.params.id]);
            
            await query(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, type, reason, admin_id, mode, created_at
                ) VALUES ($1, $2, $3, $4, 'deposit_success', $5, $6, $7, NOW())
            `, [
                deposit.user_id,
                addAmount,
                currentBalance,
                newBalance,
                `充值成功: ${addAmount} USDT, 由管理员 ${adminName} 确认, 原申请: ${deposit.amount} USDT, 模式: ${mode}, 备注: ${admin_note}`,
                adminId,
                mode
            ]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE users 
                SET ${balanceField} = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(newBalance, deposit.user_id);
            
            const newReason = deposit.reason + 
                ` | completed at ${new Date().toISOString()} | 管理员: ${adminName} | 实际到账: ${addAmount} USDT | 模式: ${mode} | 管理员备注: ${admin_note}`;
            
            db.prepare(`
                UPDATE balance_logs 
                SET reason = ?
                WHERE id = ?
            `).run(newReason, req.params.id);
            
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, type, reason, admin_id, mode, created_at
                ) VALUES (?, ?, ?, ?, 'deposit_success', ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                deposit.user_id,
                addAmount,
                currentBalance,
                newBalance,
                `充值成功: ${addAmount} USDT, 由管理员 ${adminName} 确认, 原申请: ${deposit.amount} USDT, 模式: ${mode}, 备注: ${admin_note}`,
                adminId,
                mode
            );
        }
        
        // 更新 deposit_requests 表（如果存在）
        try {
            if (isProduction) {
                await query(`
                    UPDATE deposit_requests 
                    SET status = 'completed', 
                        processed_at = NOW(),
                        processed_by = $1,
                        actual_amount = $2
                    WHERE txid = $3 AND status = 'pending'
                `, [adminId, addAmount, deposit.txid]);
            } else {
                const db = getDb();
                db.prepare(`
                    UPDATE deposit_requests 
                    SET status = 'completed', 
                        processed_at = CURRENT_TIMESTAMP,
                        processed_by = ?,
                        actual_amount = ?
                    WHERE txid = ? AND status = 'pending'
                `).run(adminId, addAmount, deposit.txid);
            }
        } catch (e) {
            console.log('更新 deposit_requests 表失败:', e.message);
        }
        
        await logAdminAction(req, 'deposit_confirm', {
            deposit_id: req.params.id,
            amount: addAmount,
            user_id: deposit.user_id,
            mode: mode
        }, 'deposit', req.params.id);
        
        res.json({ 
            success: true, 
            message: '充值已确认',
            data: {
                depositId: req.params.id,
                amount: addAmount,
                userId: deposit.user_id,
                mode: mode
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
        let deposit;
        
        if (isProduction) {
            const result = await query(`
                SELECT * FROM balance_logs 
                WHERE id = $1 AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
            `, [req.params.id]);
            deposit = result?.[0];
        } else {
            const db = getDb();
            deposit = db.prepare(`
                SELECT * FROM balance_logs 
                WHERE id = ? AND type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%'
            `).get(req.params.id);
        }
        
        if (!deposit) {
            throw new Error('充值记录不存在或已处理');
        }
        
        const mode = deposit.mode || 'real';
        
        if (isProduction) {
            const newReason = deposit.reason + 
                ` | rejected at ${new Date().toISOString()} | 管理员: ${adminName} | 模式: ${mode} | 驳回原因: ${rejectReason}`;
            
            await query(`
                UPDATE balance_logs 
                SET reason = $1
                WHERE id = $2
            `, [newReason, req.params.id]);
        } else {
            const db = getDb();
            const newReason = deposit.reason + 
                ` | rejected at ${new Date().toISOString()} | 管理员: ${adminName} | 模式: ${mode} | 驳回原因: ${rejectReason}`;
            
            db.prepare(`
                UPDATE balance_logs 
                SET reason = ?
                WHERE id = ?
            `).run(newReason, req.params.id);
        }
        
        try {
            if (isProduction) {
                await query(`
                    UPDATE deposit_requests 
                    SET status = 'rejected', 
                        processed_at = NOW(),
                        processed_by = $1,
                        admin_notes = $2
                    WHERE txid = $3 AND status = 'pending'
                `, [adminId, rejectReason, deposit.txid]);
            } else {
                const db = getDb();
                db.prepare(`
                    UPDATE deposit_requests 
                    SET status = 'rejected', 
                        processed_at = CURRENT_TIMESTAMP,
                        processed_by = ?,
                        admin_notes = ?
                    WHERE txid = ? AND status = 'pending'
                `).run(adminId, rejectReason, deposit.txid);
            }
        } catch (e) {
            console.log('更新 deposit_requests 表失败:', e.message);
        }
        
        await logAdminAction(req, 'deposit_reject', {
            deposit_id: req.params.id,
            amount: deposit.amount,
            user_id: deposit.user_id,
            reason: rejectReason,
            mode: mode
        }, 'deposit', req.params.id);
        
        res.json({ 
            success: true, 
            message: '充值已驳回',
            data: {
                depositId: req.params.id,
                amount: deposit.amount,
                userId: deposit.user_id,
                mode: mode
            }
        });
        
    } catch (err) {
        logger.error('驳回充值失败:', err);
        res.status(500).json({ success: false, message: err.message || '服务器错误' });
    }
});

// 获取充值统计
router.get('/stats', adminAuth, hasRole(['finance_admin', 'super_admin']), async (req, res) => {
    try {
        let stats;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN 1 END) as completed_count,
                    COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%rejected%' THEN 1 END) as rejected_count,
                    COALESCE(SUM(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN amount ELSE 0 END), 0) as pending_amount,
                    COALESCE(SUM(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN amount ELSE 0 END), 0) as completed_amount
                FROM balance_logs 
                WHERE type = 'deposit'
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
                SELECT 
                    COUNT(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN 1 END) as completed_count,
                    COUNT(CASE WHEN type = 'deposit' AND reason LIKE '%rejected%' THEN 1 END) as rejected_count,
                    COALESCE(SUM(CASE WHEN type = 'deposit' AND reason NOT LIKE '%completed%' AND reason NOT LIKE '%rejected%' THEN amount ELSE 0 END), 0) as pending_amount,
                    COALESCE(SUM(CASE WHEN type = 'deposit' AND reason LIKE '%completed%' THEN amount ELSE 0 END), 0) as completed_amount
                FROM balance_logs 
                WHERE type = 'deposit'
            `).get();
        }
        
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