// src/api/v1/user/mode.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';

const router = express.Router();
router.use(auth);

// 获取用户模式
router.get('/', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const db = getDb();

    try {
        const user = db.prepare('SELECT is_test_mode, account_status FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: {
                is_test_mode: user.is_test_mode === 1,
                account_status: user.account_status
            }
        });

    } catch (error) {
        console.error('Failed to get user mode:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR'
        });
    }
});

// 获取用户模式状态（包括锁定状态）- 新增
router.get('/status', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const db = getDb();

    try {
        const user = db.prepare('SELECT is_test_mode, account_status, is_mode_locked FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND'
            });
        }

        // account_status 为 'live' 表示管理员已锁定模式
        const modeLocked = user.account_status === 'live' || user.is_mode_locked === 1;

        res.json({
            success: true,
            data: {
                is_test_mode: user.is_test_mode === 1,
                account_status: user.account_status,
                mode_locked: modeLocked,
                can_switch: !modeLocked
            }
        });

    } catch (error) {
        console.error('Failed to get mode status:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR'
        });
    }
});

// 切换模式
router.post('/toggle', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const { is_test_mode } = req.body;
    const db = getDb();

    if (typeof is_test_mode !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'INVALID_PARAMETERS'
        });
    }

    try {
        const currentUser = db.prepare('SELECT is_test_mode, account_status FROM users WHERE id = ?').get(userId);
        
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND'
            });
        }

        // 如果 account_status 是 'live'，禁止切换（被管理员锁定）
        if (currentUser.account_status === 'live') {
            return res.status(403).json({
                success: false,
                error: 'MODE_LOCKED',
                message: 'Your mode is locked by administrator. Please contact support.'
            });
        }

        if (currentUser.is_test_mode === (is_test_mode ? 1 : 0)) {
            return res.json({
                success: true,
                data: { is_test_mode }
            });
        }

        // 用户切换时只更新 is_test_mode，不改变 account_status
        db.prepare('UPDATE users SET is_test_mode = ? WHERE id = ?').run(is_test_mode ? 1 : 0, userId);

        res.json({
            success: true,
            data: { is_test_mode }
        });

    } catch (error) {
        console.error('Failed to toggle user mode:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR'
        });
    }
});

export default router;