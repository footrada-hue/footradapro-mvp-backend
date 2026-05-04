// src/api/v1/admin/withdraw.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(adminAuth);

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
    return { fee: 1.00, min_amount: 10.00, max_amount: null };
}

/**
 * ======================================================
 * 获取提现统计（包含手续费统计）
 * ======================================================
 */
router.get('/stats', (req, res) => {
    const db = getDb();
    
    try {
        // 检查表是否存在
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='withdraw_requests'
        `).get();
        
        if (!tableExists) {
            return res.json({
                success: true,
                data: {
                    pending_count: 0,
                    approved_count: 0,
                    rejected_count: 0,
                    pending_amount: 0,
                    pending_fee: 0,
                    total_fee_collected: 0,
                    total_withdrawn: 0
                }
            });
        }
        
        const stats = db.prepare(`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN fee ELSE 0 END), 0) as pending_fee,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN fee ELSE 0 END), 0) as total_fee_collected,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN net_amount ELSE 0 END), 0) as total_withdrawn
            FROM withdraw_requests
        `).get();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('获取提现统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 获取所有提现记录（包含手续费信息）
 * ======================================================
 */
router.get('/all', (req, res) => {
    const db = getDb();
    const { limit = 100, offset = 0, status = null } = req.query;
    
    try {
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='withdraw_requests'
        `).get();
        
        if (!tableExists) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        let query = `
            SELECT 
                w.*,
                u.username,
                u.uid,
                u.email,
                u.balance as user_balance
            FROM withdraw_requests w
            LEFT JOIN users u ON w.user_id = u.id
        `;
        
        const params = [];
        
        if (status && status !== 'all') {
            query += ` WHERE w.status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY w.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const withdrawals = db.prepare(query).all(...params);
        
        res.json({
            success: true,
            data: withdrawals
        });
    } catch (error) {
        console.error('获取提现列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 获取单个提现详情
 * ======================================================
 */
router.get('/detail/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        const withdrawal = db.prepare(`
            SELECT 
                w.*,
                u.username,
                u.uid,
                u.email,
                u.balance as user_balance
            FROM withdraw_requests w
            LEFT JOIN users u ON w.user_id = u.id
            WHERE w.id = ?
        `).get(id);
        
        if (!withdrawal) {
            return res.status(404).json({ 
                success: false, 
                error: 'NOT_FOUND',
                message: '提现记录不存在'
            });
        }
        
        res.json({
            success: true,
            data: withdrawal
        });
    } catch (error) {
        console.error('获取提现详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 审核通过提现
 * ======================================================
 */
router.post('/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { tx_hash, admin_note } = req.body;
    const adminId = req.session.userId;
    const db = getDb();
    
    // 验证交易哈希
    if (!tx_hash || tx_hash.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'TX_HASH_REQUIRED',
            message: '请输入交易哈希'
        });
    }
    
    try {
        // 获取提现申请信息
        const withdraw = db.prepare(`
            SELECT * FROM withdraw_requests WHERE id = ?
        `).get(id);
        
        if (!withdraw) {
            return res.status(404).json({ 
                success: false, 
                error: 'NOT_FOUND',
                message: '提现记录不存在'
            });
        }
        
        if (withdraw.status !== 'pending') {
            return res.status(400).json({ 
                success: false, 
                error: 'ALREADY_PROCESSED',
                message: `该提现申请已${withdraw.status === 'approved' ? '通过' : '拒绝'}，无法重复处理`
            });
        }
        
        // 获取管理员信息
        const admin = db.prepare('SELECT username FROM users WHERE id = ?').get(adminId);
        
        // 开始事务
        db.exec('BEGIN TRANSACTION');
        
        try {
            // 更新提现状态为已通过
            db.prepare(`
                UPDATE withdraw_requests 
                SET status = 'approved', 
                    tx_hash = ?, 
                    admin_note = COALESCE(?, admin_note),
                    reviewed_by = ?, 
                    reviewed_at = datetime('now')
                WHERE id = ?
            `).run(tx_hash.trim(), admin_note, adminId, id);
            
            // 记录审核日志
            const logExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='withdraw_audit_logs'
            `).get();
            
            if (logExists) {
                db.prepare(`
                    INSERT INTO withdraw_audit_logs (
                        withdraw_id, admin_id, action, old_status, new_status, 
                        tx_hash, admin_note, created_at
                    ) VALUES (?, ?, 'approve', 'pending', 'approved', ?, ?, datetime('now'))
                `).run(id, adminId, tx_hash, admin_note);
            }
            
            db.exec('COMMIT');
            
            logger.info(`管理员 ${admin?.username || adminId} 通过了提现申请 ${id}，金额: ${withdraw.amount} USDT，手续费: ${withdraw.fee || 1} USDT，到账: ${withdraw.net_amount || (withdraw.amount - 1)} USDT，TxHash: ${tx_hash}`);
            
            res.json({
                success: true,
                message: '提现申请已通过',
                data: {
                    id: withdraw.id,
                    status: 'approved',
                    tx_hash: tx_hash,
                    amount: withdraw.amount,
                    fee: withdraw.fee || 1,
                    net_amount: withdraw.net_amount || (withdraw.amount - 1)
                }
            });
            
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
        
    } catch (error) {
        console.error('审核通过失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 拒绝提现（退还余额）
 * ======================================================
 */
router.post('/:id/reject', async (req, res) => {
    const { id } = req.params;
    const { admin_note, reject_reason } = req.body;
    const adminId = req.session.userId;
    const db = getDb();
    
    // 验证拒绝原因
    const reason = reject_reason || admin_note;
    if (!reason || reason.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'REJECT_REASON_REQUIRED',
            message: '请输入拒绝原因'
        });
    }
    
    try {
        // 获取提现申请信息
        const withdraw = db.prepare(`
            SELECT * FROM withdraw_requests WHERE id = ?
        `).get(id);
        
        if (!withdraw) {
            return res.status(404).json({ 
                success: false, 
                error: 'NOT_FOUND',
                message: '提现记录不存在'
            });
        }
        
        if (withdraw.status !== 'pending') {
            return res.status(400).json({ 
                success: false, 
                error: 'ALREADY_PROCESSED',
                message: `该提现申请已${withdraw.status === 'approved' ? '通过' : '拒绝'}，无法重复处理`
            });
        }
        
        // 获取管理员和用户信息
        const admin = db.prepare('SELECT username FROM users WHERE id = ?').get(adminId);
        const user = db.prepare('SELECT id, balance, username FROM users WHERE id = ?').get(withdraw.user_id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND',
                message: '用户不存在'
            });
        }
        
        // 开始事务
        db.exec('BEGIN TRANSACTION');
        
        try {
            // 退还用户余额
            const newBalance = user.balance + withdraw.amount;
            db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, withdraw.user_id);
            
            // 更新提现状态为已拒绝
            db.prepare(`
                UPDATE withdraw_requests 
                SET status = 'rejected', 
                    reject_reason = ?,
                    admin_note = COALESCE(?, admin_note),
                    reviewed_by = ?, 
                    reviewed_at = datetime('now')
                WHERE id = ?
            `).run(reason.trim(), admin_note, adminId, id);
            
            // 记录余额日志（退款）
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, created_at
                ) VALUES (?, ?, ?, ?, 'refund', ?, datetime('now'))
            `).run(
                withdraw.user_id,
                withdraw.amount,
                user.balance,
                newBalance,
                `提现拒绝，退款 ${withdraw.amount} USDT。原因: ${reason}`
            );
            
            // 记录审核日志
            const logExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='withdraw_audit_logs'
            `).get();
            
            if (logExists) {
                db.prepare(`
                    INSERT INTO withdraw_audit_logs (
                        withdraw_id, admin_id, action, old_status, new_status, 
                        reject_reason, admin_note, created_at
                    ) VALUES (?, ?, 'reject', 'pending', 'rejected', ?, ?, datetime('now'))
                `).run(id, adminId, reason, admin_note);
            }
            
            db.exec('COMMIT');
            
            logger.info(`管理员 ${admin?.username || adminId} 拒绝了提现申请 ${id}，已退款 ${withdraw.amount} USDT 给用户 ${user.username}，原因: ${reason}`);
            
            res.json({
                success: true,
                message: '提现申请已拒绝，余额已退还',
                data: {
                    id: withdraw.id,
                    status: 'rejected',
                    amount: withdraw.amount,
                    fee: withdraw.fee || 1,
                    refund_amount: withdraw.amount,
                    reject_reason: reason
                }
            });
            
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
        
    } catch (error) {
        console.error('审核拒绝失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 批量审核通过
 * ======================================================
 */
router.post('/batch/approve', async (req, res) => {
    const { ids, tx_hash, admin_note } = req.body;
    const adminId = req.session.userId;
    const db = getDb();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_IDS',
            message: '请选择要审核的提现记录'
        });
    }
    
    if (!tx_hash || tx_hash.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'TX_HASH_REQUIRED',
            message: '请输入交易哈希'
        });
    }
    
    const results = {
        success: [],
        failed: []
    };
    
    db.exec('BEGIN TRANSACTION');
    
    try {
        for (const id of ids) {
            try {
                const withdraw = db.prepare(`SELECT * FROM withdraw_requests WHERE id = ? AND status = 'pending'`).get(id);
                
                if (withdraw) {
                    db.prepare(`
                        UPDATE withdraw_requests 
                        SET status = 'approved', 
                            tx_hash = ?, 
                            admin_note = COALESCE(?, admin_note),
                            reviewed_by = ?, 
                            reviewed_at = datetime('now')
                        WHERE id = ?
                    `).run(tx_hash.trim(), admin_note, adminId, id);
                    
                    results.success.push(id);
                } else {
                    results.failed.push({ id, reason: '记录不存在或状态不是待审核' });
                }
            } catch (err) {
                results.failed.push({ id, reason: err.message });
            }
        }
        
        db.exec('COMMIT');
        
        logger.info(`管理员 ${adminId} 批量通过了 ${results.success.length} 个提现申请`);
        
        res.json({
            success: true,
            message: `成功通过 ${results.success.length} 个提现申请，失败 ${results.failed.length} 个`,
            data: results
        });
        
    } catch (error) {
        db.exec('ROLLBACK');
        console.error('批量审核失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

/**
 * ======================================================
 * 获取手续费配置列表
 * ======================================================
 */
router.get('/config', (req, res) => {
    const db = getDb();
    
    try {
        const configs = db.prepare(`
            SELECT * FROM withdraw_config ORDER BY network
        `).all();
        
        res.json({
            success: true,
            data: configs
        });
    } catch (error) {
        console.error('获取手续费配置失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ======================================================
 * 更新手续费配置
 * ======================================================
 */
router.put('/config/:network', async (req, res) => {
    const { network } = req.params;
    const { fee, min_amount, max_amount, is_active } = req.body;
    const adminId = req.session.userId;
    const db = getDb();
    
    if (!fee && min_amount === undefined && max_amount === undefined && is_active === undefined) {
        return res.status(400).json({ 
            success: false, 
            error: 'NO_FIELDS_TO_UPDATE',
            message: '请提供要更新的字段'
        });
    }
    
    try {
        const updates = [];
        const params = [];
        
        if (fee !== undefined) {
            updates.push('fee = ?');
            params.push(fee);
        }
        if (min_amount !== undefined) {
            updates.push('min_amount = ?');
            params.push(min_amount);
        }
        if (max_amount !== undefined) {
            updates.push('max_amount = ?');
            params.push(max_amount);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        
        updates.push('updated_at = datetime("now")');
        params.push(network);
        
        const result = db.prepare(`
            UPDATE withdraw_config 
            SET ${updates.join(', ')} 
            WHERE network = ?
        `).run(...params);
        
        if (result.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'NOT_FOUND',
                message: '网络配置不存在'
            });
        }
        
        logger.info(`管理员 ${adminId} 更新了 ${network} 的手续费配置`);
        
        res.json({
            success: true,
            message: '手续费配置已更新',
            data: { network, fee, min_amount, max_amount, is_active }
        });
        
    } catch (error) {
        console.error('更新手续费配置失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

export default router;