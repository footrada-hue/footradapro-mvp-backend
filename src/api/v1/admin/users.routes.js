import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission, logAdminAction } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由都需要管理员登录
router.use(adminAuth);

// ==================== 获取所有用户列表 ====================
// 需要 users.view 权限
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

// ==================== 获取单个用户详情 ====================
// 需要 users.detail 权限
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
                last_login_at, last_active_at
            FROM users 
            WHERE id = ?
        `).get(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
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
                user,
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
// 重要：切换到主网时自动锁定模式，用户无法再切回测试
// 切换到测试时自动解锁，用户可自由切换
router.post('/:userId/toggle-mode', hasPermission('users.toggle_mode'), (req, res) => {
    const { userId } = req.params;
    const { mode } = req.body; // 'test' 或 'live'
    
    console.log(`=== 管理员切换用户模式: ${userId} -> ${mode} ===`);
    
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
        
        // 核心逻辑：切换到主网时自动锁定模式，切换到测试时解锁
        // 这样用户一旦切换到主网，就不能再切回测试模式
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
        
        console.log(`✅ 用户模式切换成功: ${user.uid} -> ${mode}${mode === 'live' ? ' (已自动锁定)' : ' (已解锁)'}`);
        
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
// 用于管理员手动控制用户是否可切换模式
router.post('/:userId/toggle-mode-lock', hasPermission('users.toggle_mode'), (req, res) => {
    const { userId } = req.params;
    const { locked } = req.body; // true 锁定, false 解锁
    
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
        console.log(`${locked ? '🔒 手动锁定' : '🔓 手动解锁'}用户模式: ${user.uid}`);
        
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
        
        // 批量切换到主网，并自动锁定模式
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

export default router;