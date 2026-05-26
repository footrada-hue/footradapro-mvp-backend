import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';

const router = express.Router();

// 获取体验金状态
router.get('/bonus-status', auth, (req, res) => {
    console.log('=== GET /user/bonus-status called ===');
    
    const db = getDb();
    const userId = req.session.userId;
    
    try {
        const user = db.prepare('SELECT has_claimed_bonus, bonus_expires_at FROM users WHERE id = ?').get(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, error: '用户不存在' });
        }
        
        res.json({
            success: true,
            has_bonus: user.has_claimed_bonus === 1,
            expires_at: user.bonus_expires_at
        });
        
    } catch (error) {
        console.error('获取体验金状态失败:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

export default router;
