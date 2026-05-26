import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要管理员认证
router.use(adminAuth);

// ==================== 获取财务统计数据 ====================
router.get('/stats', hasPermission('finance.view'), (req, res) => {
    const db = getDb();
    
    try {
        console.log('=== 开始获取财务统计 ===');
        
        // 获取所有用户总余额
        let totalBalance = 0;
        try {
            const result = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM users').get();
            totalBalance = result.total || 0;
            console.log('✅ 总余额查询成功:', totalBalance);
        } catch (err) {
            console.error('❌ 总余额查询失败:', err.message);
        }
        
        // 获取今日充值总额
        let todayDeposit = 0;
        try {
            const result = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM balance_logs 
                WHERE type = 'deposit' 
                AND date(created_at) = date('now')
            `).get();
            todayDeposit = Math.abs(result.total || 0);
            console.log('✅ 今日充值查询成功:', todayDeposit);
        } catch (err) {
            console.error('❌ 今日充值查询失败:', err.message);
        }
        
        // 获取今日提现总额
        let todayWithdraw = 0;
        try {
            const result = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM balance_logs 
                WHERE type = 'withdraw' 
                AND date(created_at) = date('now')
            `).get();
            todayWithdraw = Math.abs(result.total || 0);
            console.log('✅ 今日提现查询成功:', todayWithdraw);
        } catch (err) {
            console.error('❌ 今日提现查询失败:', err.message);
        }
        
        // 获取平台总收入（佣金）
        let totalRevenue = 0;
        try {
            // 先检查 authorizations 表是否存在
            const tableCheck = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='authorizations'
            `).get();
            
            if (tableCheck) {
                const result = db.prepare(`
                    SELECT COALESCE(SUM(commission), 0) as total 
                    FROM authorizations 
                    WHERE status = 'settled'
                `).get();
                totalRevenue = result.total || 0;
                console.log('✅ 平台收入查询成功:', totalRevenue);
            } else {
                console.log('ℹ️ authorizations 表不存在，平台收入设为0');
            }
        } catch (err) {
            console.error('❌ 平台收入查询失败:', err.message);
        }
        
        const responseData = {
            totalBalance,
            todayDeposit,
            todayWithdraw,
            totalRevenue
        };
        
        console.log('✅ 返回数据:', responseData);
        
        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('❌ 获取财务统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有财务记录 ====================
router.get('/records', hasPermission('finance.view'), (req, res) => {
    const db = getDb();
    
    try {
        console.log('=== 开始获取财务记录 ===');
        
        // 先检查 balance_logs 表是否存在
        const tableCheck = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='balance_logs'
        `).get();
        
        if (!tableCheck) {
            console.log('balance_logs 表不存在，返回空数组');
            return res.json({ success: true, data: [] });
        }
        
        let records = [];
        try {
            records = db.prepare(`
                SELECT 
                    bl.id,
                    bl.user_id,
                    bl.amount,
                    bl.balance_before,
                    bl.balance_after,
                    bl.type,
                    bl.reason,
                    bl.admin_id,
                    bl.created_at,
                    COALESCE(u.username, '未知用户') as username,
                    COALESCE(a.username, '系统') as admin_name
                FROM balance_logs bl
                LEFT JOIN users u ON bl.user_id = u.id
                LEFT JOIN admins a ON bl.admin_id = a.id
                ORDER BY bl.created_at DESC
                LIMIT 1000
            `).all();
            console.log(`✅ 获取到 ${records.length} 条记录`);
        } catch (err) {
            console.error('联表查询失败:', err.message);
            // 如果联表查询失败，尝试简单查询
            try {
                records = db.prepare(`
                    SELECT * FROM balance_logs 
                    ORDER BY created_at DESC 
                    LIMIT 1000
                `).all();
                console.log(`✅ 简单查询获取到 ${records.length} 条记录`);
            } catch (err2) {
                console.error('简单查询也失败:', err2.message);
                records = [];
            }
        }
        
        res.json({ success: true, data: records });
    } catch (error) {
        console.error('❌ 获取财务记录失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有用户列表（用于调整余额时选择）====================
router.get('/users', hasPermission('finance.view'), (req, res) => {
    const db = getDb();
    
    try {
        const users = db.prepare(`
            SELECT id, uid, username, balance
            FROM users
            ORDER BY id DESC
            LIMIT 100
        `).all();
        
        res.json({ success: true, data: users });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个用户余额明细 ====================
router.get('/users/:userId', hasPermission('finance.view'), (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, uid, username, balance FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        res.json({ success: true, data: { user } });
    } catch (error) {
        logger.error('获取用户明细失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 手动增加用户余额 ====================
router.post('/users/:userId/add', hasPermission('finance.adjust'), (req, res) => {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_AMOUNT' });
    }
    
    const db = getDb();
    
    try {
        const result = db.transaction(() => {
            // 获取当前余额
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
            if (!user) throw new Error('USER_NOT_FOUND');
            
            const balanceBefore = user.balance;
            const balanceAfter = balanceBefore + parseFloat(amount);
            
            // 更新用户余额
            db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
            
            // 记录日志
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userId, parseFloat(amount), balanceBefore, balanceAfter, 'admin_add', reason || '管理员增加', adminId);
            
            return { balanceBefore, balanceAfter };
        })();
        
        logger.info(`管理员 ${adminId} 增加用户 ${userId} 余额 ${amount} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: result.balanceAfter,
                added: amount
            }
        });
    } catch (error) {
        logger.error('增加余额失败:', error);
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 手动扣除用户余额 ====================
router.post('/users/:userId/deduct', hasPermission('finance.adjust'), (req, res) => {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_AMOUNT' });
    }
    
    const db = getDb();
    
    try {
        const result = db.transaction(() => {
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
            if (!user) throw new Error('USER_NOT_FOUND');
            
            if (user.balance < parseFloat(amount)) {
                throw new Error('INSUFFICIENT_BALANCE');
            }
            
            const balanceBefore = user.balance;
            const balanceAfter = balanceBefore - parseFloat(amount);
            
            db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
            
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userId, -parseFloat(amount), balanceBefore, balanceAfter, 'admin_deduct', reason || '管理员扣除', adminId);
            
            return { balanceBefore, balanceAfter };
        })();
        
        logger.info(`管理员 ${adminId} 扣除用户 ${userId} 余额 ${amount} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: result.balanceAfter,
                deducted: amount
            }
        });
    } catch (error) {
        logger.error('扣除余额失败:', error);
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        if (error.message === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE' });
        }
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 设置用户余额（直接覆盖）====================
router.post('/users/:userId/set', hasPermission('finance.adjust'), (req, res) => {
    const { userId } = req.params;
    const { balance, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (balance === undefined || balance < 0) {
        return res.status(400).json({ success: false, error: 'INVALID_BALANCE' });
    }
    
    const db = getDb();
    
    try {
        const result = db.transaction(() => {
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
            if (!user) throw new Error('USER_NOT_FOUND');
            
            const balanceBefore = user.balance;
            const balanceAfter = parseFloat(balance);
            const amount = balanceAfter - balanceBefore;
            
            db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
            
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userId, amount, balanceBefore, balanceAfter, 'admin_set', reason || '管理员设置', adminId);
            
            return { balanceBefore, balanceAfter, amount };
        })();
        
        logger.info(`管理员 ${adminId} 设置用户 ${userId} 余额为 ${balance} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: result.balanceAfter,
                changed: result.amount
            }
        });
    } catch (error) {
        logger.error('设置余额失败:', error);
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;