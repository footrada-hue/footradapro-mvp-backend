import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission, logAdminAction } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// 所有路由都需要管理员登录
router.use(adminAuth);

// ==================== 获取所有用户列表 ====================
router.get('/', hasPermission('users.view'), (req, res) => {
    const db = getDb();
    
    try {
        const users = db.prepare(`
            SELECT 
                id, uid, username, balance, vip_level, status,
                is_new_user, has_claimed_bonus, completed_steps,
                is_test_mode, is_mode_locked, account_status, first_deposit_at,
                created_at, last_login_at, last_active_at
            FROM users 
            ORDER BY id DESC
        `).all();
        
        logAdminAction(req, 'view_users', { count: users.length });
        
        res.json({ success: true, data: users });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});
// ==================== 获取最近注册用户（用于仪表盘）====================
/**
 * GET /api/v1/admin/users/recent
 * 功能：获取最近注册的用户列表，用于仪表盘显示
 * 权限：users.view
 * 参数：limit (可选，默认5)
 */
router.get('/recent', hasPermission('users.view'), (req, res) => {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 5, 50); // 最大50条
    
    try {
        const users = db.prepare(`
            SELECT 
                id,
                uid,
                username,
                balance,
                vip_level,
                status,
                is_test_mode,
                created_at
            FROM users 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
        
        // 格式化返回数据
        const formattedUsers = users.map(user => ({
            id: user.id,
            uid: user.uid,
            username: user.username,
            balance: user.balance || 0,
            vip_level: user.vip_level || 0,
            status: user.status || 'active',
            is_test_mode: user.is_test_mode === 1,
            created_at: user.created_at
        }));
        
        res.json({
            success: true,
            data: formattedUsers,
            total: formattedUsers.length
        });
        
    } catch (error) {
        logger.error('获取最近用户失败:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch recent users'
        });
    }
});
// ==================== 获取单个用户详情 ====================
router.get('/:userId', hasPermission('users.detail'), (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        const user = db.prepare(`
            SELECT 
                id, uid, username, balance, vip_level, status,
                is_new_user, has_claimed_bonus, completed_steps,
                is_test_mode, is_mode_locked, account_status, first_deposit_at,
                bonus_claimed_at, created_at, updated_at,
                last_login_at, last_active_at,
                password
            FROM users 
            WHERE id = ?
        `).get(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        // 檢查支付密碼是否設置
        let hasPayPassword = false;
        try {
            const payResult = db.prepare('SELECT paypassword FROM users WHERE id = ?').get(userId);
            hasPayPassword = payResult && payResult.paypassword && payResult.paypassword !== '';
        } catch (err) {
            hasPayPassword = false;
        }
        
        const authorizations = db.prepare(`
            SELECT * FROM authorizations 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 20
        `).all(userId);
        
        let balanceLogs = [];
        try {
            balanceLogs = db.prepare(`
                SELECT * FROM balance_logs 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 50
            `).all(userId);
        } catch (err) {
            logger.debug('balance_logs表可能不存在', err.message);
        }
        
        logAdminAction(req, 'view_user_detail', { 
            userId: user.id, 
            username: user.username 
        }, 'user', userId);
        
        res.json({
            success: true,
            data: {
                user: {
                    ...user,
                    password: user.password ? '********' : null,
                    has_paypassword: hasPayPassword
                },
                authorizations,
                balanceLogs
            }
        });
    } catch (error) {
        logger.error('获取用户详情失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 切换用户模式（测试/主网）====================
router.post('/:userId/toggle-mode', hasPermission('users.toggle_mode'), (req, res) => {
    const { userId } = req.params;
    const { mode } = req.body;
    
    const db = getDb();
    
    try {
        const user = db.prepare(`
            SELECT id, uid, username, is_test_mode, account_status, is_mode_locked 
            FROM users WHERE uid = ? OR id = ?
        `).get(userId, userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }
        
        if (mode !== 'test' && mode !== 'live') {
            return res.status(400).json({
                success: false,
                error: 'INVALID_MODE',
                message: 'Mode must be "test" or "live"'
            });
        }
        
        const isTestMode = mode === 'test' ? 1 : 0;
        const accountStatus = mode === 'test' ? 'test' : 'live';
        const newLockStatus = mode === 'live' ? 1 : 0;
        
        const result = db.prepare(`
            UPDATE users 
            SET is_test_mode = ?,
                account_status = ?,
                is_mode_locked = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(isTestMode, accountStatus, newLockStatus, user.id);
        
        if (result.changes === 0) {
            return res.status(400).json({
                success: false,
                error: 'NO_CHANGES',
                message: 'User mode already set to ' + mode
            });
        }
        
        logAdminAction(req, 'toggle_user_mode', { 
            userId: user.uid,
            username: user.username,
            oldMode: user.is_test_mode === 1 ? 'test' : 'live',
            newMode: mode,
            autoLocked: mode === 'live'
        }, 'user', user.id);
        
        const message = mode === 'live' 
            ? `用户已切换到主网模式并锁定，无法再切回测试模式` 
            : `用户已切换到测试模式并解锁，可自由切换`;
        
        res.json({ 
            success: true, 
            message: message,
            data: {
                uid: user.uid,
                mode: mode,
                is_mode_locked: newLockStatus === 1
            }
        });
        
    } catch (error) {
        logger.error('切换用户模式失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 手动锁定/解锁用户模式 ====================
router.post('/:userId/toggle-mode-lock', hasPermission('users.toggle_mode'), (req, res) => {
    const { userId } = req.params;
    const { locked } = req.body;
    
    if (locked === undefined) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_REQUEST',
            message: 'locked parameter is required' 
        });
    }
    
    const db = getDb();
    
    try {
        const user = db.prepare(`
            SELECT id, uid, username, is_mode_locked, is_test_mode 
            FROM users WHERE uid = ? OR id = ?
        `).get(userId, userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }
        
        const newLockStatus = locked ? 1 : 0;
        
        db.prepare(`
            UPDATE users 
            SET is_mode_locked = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newLockStatus, user.id);
        
        logAdminAction(req, 'toggle_mode_lock', { 
            userId: user.uid,
            username: user.username,
            oldLocked: user.is_mode_locked === 1,
            newLocked: locked
        }, 'user', user.id);
        
        const actionText = locked ? '锁定' : '解锁';
        
        res.json({ 
            success: true, 
            message: `用户模式已${actionText}`,
            data: {
                uid: user.uid,
                is_mode_locked: locked
            }
        });
        
    } catch (error) {
        logger.error('切换用户模式锁定状态失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 获取测试模式用户列表 ====================
router.get('/test-mode/list', hasPermission('users.view'), (req, res) => {
    const db = getDb();
    
    try {
        const users = db.prepare(`
            SELECT 
                id, uid, username, balance, created_at,
                has_claimed_bonus, completed_steps, first_deposit_at,
                is_mode_locked
            FROM users 
            WHERE is_test_mode = 1
            ORDER BY created_at DESC
        `).all();
        
        res.json({
            success: true,
            data: users,
            count: users.length
        });
        
    } catch (error) {
        logger.error('获取测试模式用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量切换测试用户到主网 ====================
router.post('/bulk/switch-to-live', hasPermission('users.bulk_toggle'), (req, res) => {
    const { userIds } = req.body;
    const db = getDb();
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_REQUEST',
            message: 'Please provide an array of user IDs'
        });
    }
    
    try {
        const placeholders = userIds.map(() => '?').join(',');
        
        const result = db.prepare(`
            UPDATE users 
            SET is_test_mode = 0,
                account_status = 'live',
                is_mode_locked = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders}) AND is_test_mode = 1
        `).run(...userIds);
        
        logAdminAction(req, 'bulk_switch_to_live', { 
            count: result.changes,
            userIds: userIds
        });
        
        res.json({
            success: true,
            message: `成功将 ${result.changes} 个用户切换到主网模式并锁定`,
            updated: result.changes
        });
        
    } catch (error) {
        logger.error('批量切换用户模式失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 编辑用户信息 ====================
router.put('/:userId', hasPermission('users.edit'), (req, res) => {
    const { userId } = req.params;
    const { vip_level, status, notes } = req.body;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        let updates = [];
        let values = [];
        
        if (vip_level !== undefined) {
            updates.push('vip_level = ?');
            values.push(vip_level);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'NO_FIELDS_TO_UPDATE' });
        }
        
        values.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        
        logAdminAction(req, 'edit_user', { 
            userId, 
            username: user.username,
            updates: req.body 
        }, 'user', userId);
        
        res.json({ success: true });
    } catch (error) {
        logger.error('编辑用户失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 启用/禁用用户 ====================
router.post('/:userId/toggle', hasPermission('users.toggle'), (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, username, status FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        const newStatus = user.status === 'active' ? 'disabled' : 'active';
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(newStatus, userId);
        
        logAdminAction(req, 'toggle_user', { 
            userId, 
            username: user.username,
            oldStatus: user.status,
            newStatus 
        }, 'user', userId);
        
        res.json({ success: true, status: newStatus });
    } catch (error) {
        logger.error('切换用户状态失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 重置用户登录密码 ====================
router.post('/:userId/reset-password', hasPermission('users.edit'), async (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        const generateRandomPassword = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
            let password = '';
            for (let i = 0; i < 10; i++) {
                password += chars[Math.floor(Math.random() * chars.length)];
            }
            return password;
        };
        
        const newPassword = generateRandomPassword();
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hashedPassword, userId);
        
        logAdminAction(req, 'reset_user_password', {
            userId: user.id,
            username: user.username
        }, 'user', userId);
        
        res.json({
            success: true,
            message: '密码已重置',
            data: {
                new_password: newPassword,
                username: user.username
            }
        });
        
    } catch (error) {
        logger.error('重置用户密码失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message });
    }
});

// ==================== 重置用户支付密码 ====================
router.post('/:userId/reset-paypassword', hasPermission('users.edit'), async (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        const generateRandomPayPassword = () => {
            return Math.floor(100000 + Math.random() * 900000).toString();
        };
        
        const newPayPassword = generateRandomPayPassword();
        const saltRounds = 10;
        const hashedPayPassword = await bcrypt.hash(newPayPassword, saltRounds);
        
        try {
            db.prepare('UPDATE users SET paypassword = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(hashedPayPassword, userId);
        } catch (err) {
            if (err.message.includes('no such column')) {
                db.exec('ALTER TABLE users ADD COLUMN paypassword TEXT');
                db.prepare('UPDATE users SET paypassword = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(hashedPayPassword, userId);
            } else {
                throw err;
            }
        }
        
        logAdminAction(req, 'reset_user_paypassword', {
            userId: user.id,
            username: user.username
        }, 'user', userId);
        
        res.json({
            success: true,
            message: '支付密码已重置',
            data: {
                new_paypassword: newPayPassword,
                username: user.username
            }
        });
        
    } catch (error) {
        logger.error('重置用户支付密码失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message });
    }
});

// ==================== 获取用户授权记录（按模式区分）====================
router.get('/:userId/authorizations', hasPermission('users.detail'), (req, res) => {
    const { userId } = req.params;
    const { mode, limit = 50 } = req.query;
    const db = getDb();
    
    try {
        const user = db.prepare('SELECT id, username, is_test_mode FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        let query = `
            SELECT 
                a.id,
                a.auth_id,
                a.match_id,
                a.amount,
                a.status,
                a.created_at,
                a.settled_at,
                a.profit,
                a.user_profit,
                a.platform_fee,
                a.profit_rate,
                m.home_team,
                m.away_team,
                m.league,
                m.match_time
            FROM authorizations a
            LEFT JOIN matches m ON a.match_id = m.match_id
            WHERE a.user_id = ?
        `;
        
        const params = [userId];
        
        if (mode === 'test') {
            query += ` AND a.is_test = 1`;
        } else if (mode === 'live') {
            query += ` AND (a.is_test = 0 OR a.is_test IS NULL)`;
        }
        
        query += ` ORDER BY a.created_at DESC LIMIT ?`;
        params.push(parseInt(limit) || 50);
        
        const authorizations = db.prepare(query).all(...params);
        
        const formattedAuths = authorizations.map(auth => ({
            id: auth.id,
            auth_id: auth.auth_id,
            match_name: auth.home_team && auth.away_team ? `${auth.home_team} vs ${auth.away_team}` : auth.match_id,
            league: auth.league,
            amount: auth.amount,
            status: auth.status,
            status_text: auth.status === 'pending' ? '進行中' : auth.status === 'settled' ? '已結算' : '已過期',
            created_at: auth.created_at,
            settled_at: auth.settled_at,
            profit: auth.profit || 0,
            profit_rate: auth.profit_rate || 0,
            is_profitable: (auth.profit || 0) > 0
        }));
        
        res.json({
            success: true,
            data: {
                user_id: userId,
                username: user.username,
                mode: mode === 'test' ? '测试模式' : '真实模式',
                authorizations: formattedAuths,
                total: formattedAuths.length
            }
        });
        
    } catch (error) {
        logger.error('获取用户授权记录失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message });
    }
});

// ==================== 检查用户是否设置了支付密码 ====================
router.get('/:userId/has-paypassword', hasPermission('users.detail'), (req, res) => {
    const { userId } = req.params;
    const db = getDb();
    
    try {
        let hasPayPassword = false;
        
        try {
            const result = db.prepare('SELECT paypassword FROM users WHERE id = ?').get(userId);
            hasPayPassword = result && result.paypassword && result.paypassword !== '';
        } catch (err) {
            hasPayPassword = false;
        }
        
        res.json({
            success: true,
            data: {
                has_paypassword: hasPayPassword
            }
        });
        
    } catch (error) {
        logger.error('检查支付密码失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;