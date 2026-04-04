import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

/**
 * 获取用户当前余额
 * GET /api/v1/user/balance
 * 
 * 根据用户当前模式返回对应的余额：
 * - 测试模式：返回 test_balance（测试tUSDT）
 * - 真实模式：返回 balance（真实USDT）
 * 
 * @returns { success: boolean, data: { balance: number, test_balance: number, real_balance: number, mode: string, is_test_mode: boolean } }
 */
router.get('/', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'User not authenticated'
        });
    }

    const db = getDb();

    try {
        // 查询用户余额和模式
        const user = db.prepare(`
            SELECT balance, test_balance, is_test_mode 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            logger.warn(`Balance fetch failed: User not found - ID: ${userId}`);
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User does not exist'
            });
        }

        const isTestMode = user.is_test_mode === 1;
        
        // 根据当前模式返回对应的余额
        const currentBalance = isTestMode 
            ? (user.test_balance || 10000)  // 测试模式：返回测试余额，默认10000
            : (user.balance || 0);           // 真实模式：返回真实余额，默认0

        logger.debug(`Balance fetched - User: ${userId}, Mode: ${isTestMode ? 'test' : 'live'}, Balance: ${currentBalance}`);

        res.json({
            success: true,
            data: {
                balance: currentBalance,
                test_balance: user.test_balance || 10000,
                real_balance: user.balance || 0,
                mode: isTestMode ? 'test' : 'live',
                is_test_mode: isTestMode
            }
        });

    } catch (error) {
        logger.error('获取用户余额失败:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch balance'
        });
    }
});

/**
 * 获取用户双余额（用于后台或调试）
 * GET /api/v1/user/balance/all
 * 
 * 返回真实余额和测试余额，供管理员或调试使用
 */
router.get('/all', updateLastActive, (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED'
        });
    }

    const db = getDb();

    try {
        const user = db.prepare(`
            SELECT balance, test_balance, is_test_mode 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: {
                real_balance: user.balance || 0,
                test_balance: user.test_balance || 10000,
                current_mode: user.is_test_mode === 1 ? 'test' : 'live',
                is_test_mode: user.is_test_mode === 1
            }
        });

    } catch (error) {
        logger.error('获取双余额失败:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR'
        });
    }
});

export default router;