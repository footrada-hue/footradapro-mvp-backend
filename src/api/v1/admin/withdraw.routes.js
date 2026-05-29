// src/api/v1/admin/withdraw.routes.js
import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(adminAuth);

/**
 * ======================================================
 * 获取提现统计（完整版）
 * ======================================================
 */
router.get('/stats', async (req, res) => {
    try {
        let stats = {};
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN fee ELSE 0 END), 0) as pending_fee,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN fee ELSE 0 END), 0) as total_fee_collected,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN net_amount ELSE 0 END), 0) as total_withdrawn
                FROM withdraw_requests
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
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
        }
        
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
 * 获取所有提现记录（完整版）
 * ======================================================
 */
router.get('/all', async (req, res) => {
    const { limit = 100, offset = 0, status = null } = req.query;
    
    try {
        let withdrawals = [];
        
        if (isProduction) {
            let queryStr = `
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
                queryStr += ` WHERE w.status = $1`;
                params.push(status);
                queryStr += ` ORDER BY w.created_at DESC LIMIT $2 OFFSET $3`;
                params.push(parseInt(limit), parseInt(offset));
            } else {
                queryStr += ` ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`;
                params.push(parseInt(limit), parseInt(offset));
            }
            
            withdrawals = await query(queryStr, params);
        } else {
            const db = getDb();
            let queryStr = `
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
                queryStr += ` WHERE w.status = ?`;
                params.push(status);
            }
            
            queryStr += ` ORDER BY w.created_at DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            
            withdrawals = db.prepare(queryStr).all(...params);
        }
        
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
router.get('/detail/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let withdrawal = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    w.*,
                    u.username,
                    u.uid,
                    u.email,
                    u.balance as user_balance
                FROM withdraw_requests w
                LEFT JOIN users u ON w.user_id = u.id
                WHERE w.id = $1
            `, [id]);
            withdrawal = result?.[0];
        } else {
            const db = getDb();
            withdrawal = db.prepare(`
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
        }
        
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
    
    if (!tx_hash || tx_hash.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'TX_HASH_REQUIRED',
            message: '请输入交易哈希'
        });
    }
    
    try {
        let withdraw = null;
        
        if (isProduction) {
            const result = await query('SELECT * FROM withdraw_requests WHERE id = $1', [id]);
            withdraw = result?.[0];
        } else {
            const db = getDb();
            withdraw = db.prepare('SELECT * FROM withdraw_requests WHERE id = ?').get(id);
        }
        
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
        
        if (isProduction) {
            await query(`
                UPDATE withdraw_requests 
                SET status = 'approved', 
                    tx_hash = $1, 
                    admin_note = COALESCE($2, admin_note),
                    reviewed_by = $3, 
                    reviewed_at = NOW()
                WHERE id = $4
            `, [tx_hash.trim(), admin_note, adminId, id]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE withdraw_requests 
                SET status = 'approved', 
                    tx_hash = ?, 
                    admin_note = COALESCE(?, admin_note),
                    reviewed_by = ?, 
                    reviewed_at = datetime('now')
                WHERE id = ?
            `).run(tx_hash.trim(), admin_note, adminId, id);
        }
        
        logger.info(`管理员 ${adminId} 通过了提现申请 ${id}`);
        
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
 * 拒绝提现
 * ======================================================
 */
router.post('/:id/reject', async (req, res) => {
    const { id } = req.params;
    const { admin_note, reject_reason } = req.body;
    const adminId = req.session.userId;
    
    const reason = reject_reason || admin_note;
    if (!reason || reason.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'REJECT_REASON_REQUIRED',
            message: '请输入拒绝原因'
        });
    }
    
    try {
        let withdraw = null;
        
        if (isProduction) {
            const result = await query('SELECT * FROM withdraw_requests WHERE id = $1', [id]);
            withdraw = result?.[0];
        } else {
            const db = getDb();
            withdraw = db.prepare('SELECT * FROM withdraw_requests WHERE id = ?').get(id);
        }
        
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
        
        if (isProduction) {
            await query(`
                UPDATE withdraw_requests 
                SET status = 'rejected', 
                    reject_reason = $1,
                    admin_note = COALESCE($2, admin_note),
                    reviewed_by = $3, 
                    reviewed_at = NOW()
                WHERE id = $4
            `, [reason.trim(), admin_note, adminId, id]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE withdraw_requests 
                SET status = 'rejected', 
                    reject_reason = ?,
                    admin_note = COALESCE(?, admin_note),
                    reviewed_by = ?, 
                    reviewed_at = datetime('now')
                WHERE id = ?
            `).run(reason.trim(), admin_note, adminId, id);
        }
        
        logger.info(`管理员 ${adminId} 拒绝了提现申请 ${id}`);
        
        res.json({
            success: true,
            message: '提现申请已拒绝',
            data: {
                id: withdraw.id,
                status: 'rejected',
                amount: withdraw.amount,
                fee: withdraw.fee || 1,
                reject_reason: reason
            }
        });
        
    } catch (error) {
        console.error('审核拒绝失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

export default router;