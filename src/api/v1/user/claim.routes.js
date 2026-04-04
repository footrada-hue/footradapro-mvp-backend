import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';

const router = express.Router();

// 领取体验金接口
router.post('/claim-bonus', auth, (req, res) => {
    console.log('=== 领取体验金接口被调用 ===');
    
    const db = getDb();
    const userId = req.session.userId;
    
    try {
        // 检查用户是否已完成3步引导
        const user = db.prepare('SELECT completed_steps, has_claimed_bonus, balance FROM users WHERE id = ?').get(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, error: '用户不存在' });
        }
        
        // 临时注释掉步骤检查，让体验金可以直接领取
        // if (user.completed_steps < 3) {
        //     return res.status(400).json({ 
        //         success: false, 
        //         error: '请先完成3步引导' 
        //     });
        // }
        
        if (user.has_claimed_bonus) {
            return res.status(400).json({ 
                success: false, 
                error: '体验金已领取' 
            });
        }
        
        // 计算过期时间（24小时后）
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        // 发放100 USDT体验金
        db.prepare(
            'UPDATE users SET balance = balance + 100, has_claimed_bonus = 1, bonus_claimed_at = CURRENT_TIMESTAMP, bonus_expires_at = ? WHERE id = ?'
        ).run(expiresAt, userId);
        
        // 获取新余额
        const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        
        res.json({
            success: true,
            balance: updated.balance,
            expires_at: expiresAt,
            message: '100 USDT 体验金已到账，24小时内有效'
        });
        
    } catch (error) {
        console.error('领取体验金错误:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
