import express from 'express';
import { auth } from '../../../middlewares/auth.middleware.js';
import telegramService from '../../../services/telegram.service.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

/**
 * POST /api/v1/user/deposit/notify
 * 用户发起充值意向，发送 Telegram 通知
 */
router.post('/notify', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, username, uid, email } = req.body;
        
        if (!amount || amount < 10) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        // 获取用户完整信息
        const userInfo = {
            username: username || req.user.username || 'User',
            email: email || req.user.email || '',
            uid: uid || req.user.uid || userId
        };
        
        // 发送 Telegram 通知
        const message = `
💰 #充值意向

👤 用户: ${userInfo.username}
📧 邮箱: ${userInfo.email || '未设置'}
🆔 UID: ${userInfo.uid}
💵 金额: ${amount} USDT
⏰ 时间: ${new Date().toLocaleString()}
📌 状态: 等待用户转账

🔗 处理链接: /admin/deposits.html
        `;
        
        await telegramService.sendToAdmins(message);
        
        logger.info(`[Deposit] User ${userId} initiated deposit of ${amount} USDT, Telegram notification sent`);
        
        res.json({ success: true, message: 'Notification sent' });
        
    } catch (error) {
        logger.error('[Deposit] Notify error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;