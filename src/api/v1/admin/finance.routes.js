import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// 所有路由需要管理员认证
router.use(adminAuth);

// ==================== 获取财务统计数据 ====================
router.get('/stats', hasPermission('finance.view'), async (req, res) => {
    try {
        console.log('=== 开始获取财务统计 ===');
        
        let totalBalance = 0;
        let todayDeposit = 0;
        let todayWithdraw = 0;
        let totalRevenue = 0;
        
        if (isProduction) {
            // PostgreSQL 版本
            try {
                const result = await query('SELECT COALESCE(SUM(balance), 0) as total FROM users');
                totalBalance = parseFloat(result[0]?.total || 0);
                console.log('✅ 总余额查询成功:', totalBalance);
            } catch (err) {
                console.error('❌ 总余额查询失败:', err.message);
            }
            
            try {
                const result = await query(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM balance_logs 
                    WHERE type = 'deposit' 
                    AND DATE(created_at) = CURRENT_DATE
                `);
                todayDeposit = Math.abs(parseFloat(result[0]?.total || 0));
                console.log('✅ 今日充值查询成功:', todayDeposit);
            } catch (err) {
                console.error('❌ 今日充值查询失败:', err.message);
            }
            
            try {
                const result = await query(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM balance_logs 
                    WHERE type = 'withdraw' 
                    AND DATE(created_at) = CURRENT_DATE
                `);
                todayWithdraw = Math.abs(parseFloat(result[0]?.total || 0));
                console.log('✅ 今日提现查询成功:', todayWithdraw);
            } catch (err) {
                console.error('❌ 今日提现查询失败:', err.message);
            }
            
            try {
                const result = await query(`
                    SELECT COALESCE(SUM(commission), 0) as total 
                    FROM authorizations 
                    WHERE status = 'settled'
                `);
                totalRevenue = parseFloat(result[0]?.total || 0);
                console.log('✅ 平台收入查询成功:', totalRevenue);
            } catch (err) {
                console.error('❌ 平台收入查询失败:', err.message);
            }
        } else {
            // SQLite 版本
            const db = getDb();
            
            try {
                const result = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM users').get();
                totalBalance = result.total || 0;
                console.log('✅ 总余额查询成功:', totalBalance);
            } catch (err) {
                console.error('❌ 总余额查询失败:', err.message);
            }
            
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
            
            try {
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
router.get('/records', hasPermission('finance.view'), async (req, res) => {
    try {
        console.log('=== 开始获取财务记录 ===');
        
        let records = [];
        
        if (isProduction) {
            // PostgreSQL 版本
            try {
                const result = await query(`
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
                `);
                records = result || [];
                console.log(`✅ 获取到 ${records.length} 条记录`);
            } catch (err) {
                console.error('联表查询失败:', err.message);
                try {
                    const result = await query(`
                        SELECT * FROM balance_logs 
                        ORDER BY created_at DESC 
                        LIMIT 1000
                    `);
                    records = result || [];
                    console.log(`✅ 简单查询获取到 ${records.length} 条记录`);
                } catch (err2) {
                    console.error('简单查询也失败:', err2.message);
                    records = [];
                }
            }
        } else {
            // SQLite 版本
            const db = getDb();
            
            const tableCheck = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='balance_logs'
            `).get();
            
            if (!tableCheck) {
                console.log('balance_logs 表不存在，返回空数组');
                return res.json({ success: true, data: [] });
            }
            
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
        }
        
        res.json({ success: true, data: records });
    } catch (error) {
        console.error('❌ 获取财务记录失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有用户列表（用于调整余额时选择）====================
router.get('/users', hasPermission('finance.view'), async (req, res) => {
    try {
        let users = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT id, uid, username, balance
                FROM users
                ORDER BY id DESC
                LIMIT 100
            `);
            users = result || [];
        } else {
            const db = getDb();
            users = db.prepare(`
                SELECT id, uid, username, balance
                FROM users
                ORDER BY id DESC
                LIMIT 100
            `).all();
        }
        
        res.json({ success: true, data: users });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个用户余额明细 ====================
router.get('/users/:userId', hasPermission('finance.view'), async (req, res) => {
    const { userId } = req.params;
    
    try {
        let user = null;
        
        if (isProduction) {
            const result = await query('SELECT id, uid, username, balance FROM users WHERE id = $1', [userId]);
            user = result?.[0];
        } else {
            const db = getDb();
            user = db.prepare('SELECT id, uid, username, balance FROM users WHERE id = ?').get(userId);
        }
        
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
router.post('/users/:userId/add', hasPermission('finance.adjust'), async (req, res) => {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_AMOUNT' });
    }
    
    try {
        let user = null;
        
        if (isProduction) {
            const result = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            user = result?.[0];
        } else {
            const db = getDb();
            user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        }
        
        if (!user) throw new Error('USER_NOT_FOUND');
        
        const balanceBefore = user.balance;
        const balanceAfter = balanceBefore + parseFloat(amount);
        
        if (isProduction) {
            await query('UPDATE users SET balance = $1 WHERE id = $2', [balanceAfter, userId]);
            await query(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id, created_at
                ) VALUES ($1, $2, $3, $4, 'admin_add', $5, $6, NOW())
            `, [userId, parseFloat(amount), balanceBefore, balanceAfter, reason || '管理员增加', adminId]);
        } else {
            const db = getDb();
            db.transaction(() => {
                db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
                db.prepare(`
                    INSERT INTO balance_logs (
                        user_id, amount, balance_before, balance_after, 
                        type, reason, admin_id, created_at
                    ) VALUES (?, ?, ?, ?, 'admin_add', ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, parseFloat(amount), balanceBefore, balanceAfter, reason || '管理员增加', adminId);
            })();
        }
        
        logger.info(`管理员 ${adminId} 增加用户 ${userId} 余额 ${amount} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: balanceAfter,
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
router.post('/users/:userId/deduct', hasPermission('finance.adjust'), async (req, res) => {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_AMOUNT' });
    }
    
    try {
        let user = null;
        
        if (isProduction) {
            const result = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            user = result?.[0];
        } else {
            const db = getDb();
            user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        }
        
        if (!user) throw new Error('USER_NOT_FOUND');
        
        if (user.balance < parseFloat(amount)) {
            throw new Error('INSUFFICIENT_BALANCE');
        }
        
        const balanceBefore = user.balance;
        const balanceAfter = balanceBefore - parseFloat(amount);
        
        if (isProduction) {
            await query('UPDATE users SET balance = $1 WHERE id = $2', [balanceAfter, userId]);
            await query(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id, created_at
                ) VALUES ($1, $2, $3, $4, 'admin_deduct', $5, $6, NOW())
            `, [userId, -parseFloat(amount), balanceBefore, balanceAfter, reason || '管理员扣除', adminId]);
        } else {
            const db = getDb();
            db.transaction(() => {
                db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
                db.prepare(`
                    INSERT INTO balance_logs (
                        user_id, amount, balance_before, balance_after, 
                        type, reason, admin_id, created_at
                    ) VALUES (?, ?, ?, ?, 'admin_deduct', ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, -parseFloat(amount), balanceBefore, balanceAfter, reason || '管理员扣除', adminId);
            })();
        }
        
        logger.info(`管理员 ${adminId} 扣除用户 ${userId} 余额 ${amount} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: balanceAfter,
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
router.post('/users/:userId/set', hasPermission('finance.adjust'), async (req, res) => {
    const { userId } = req.params;
    const { balance, reason } = req.body;
    const adminId = req.session?.adminId;
    
    if (balance === undefined || balance < 0) {
        return res.status(400).json({ success: false, error: 'INVALID_BALANCE' });
    }
    
    try {
        let user = null;
        
        if (isProduction) {
            const result = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            user = result?.[0];
        } else {
            const db = getDb();
            user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        }
        
        if (!user) throw new Error('USER_NOT_FOUND');
        
        const balanceBefore = user.balance;
        const balanceAfter = parseFloat(balance);
        const amount = balanceAfter - balanceBefore;
        
        if (isProduction) {
            await query('UPDATE users SET balance = $1 WHERE id = $2', [balanceAfter, userId]);
            await query(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, 
                    type, reason, admin_id, created_at
                ) VALUES ($1, $2, $3, $4, 'admin_set', $5, $6, NOW())
            `, [userId, amount, balanceBefore, balanceAfter, reason || '管理员设置', adminId]);
        } else {
            const db = getDb();
            db.transaction(() => {
                db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
                db.prepare(`
                    INSERT INTO balance_logs (
                        user_id, amount, balance_before, balance_after, 
                        type, reason, admin_id, created_at
                    ) VALUES (?, ?, ?, ?, 'admin_set', ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, amount, balanceBefore, balanceAfter, reason || '管理员设置', adminId);
            })();
        }
        
        logger.info(`管理员 ${adminId} 设置用户 ${userId} 余额为 ${balance} USDT`);
        
        res.json({
            success: true,
            data: {
                new_balance: balanceAfter,
                changed: amount
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