import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(auth);

// VIP等级配置
const VIP_CONFIG = [
    { level: 0, min: 0, share: '10%', commission: '50%' },
    { level: 1, min: 500, share: '25%', commission: '40%' },
    { level: 2, min: 2000, share: '40%', commission: '30%' },
    { level: 3, min: 10000, share: '60%', commission: '20%' },
    { level: 4, min: 50000, share: '80%', commission: '15%' }
];

// 获取用户VIP信息
router.get('/info', (req, res) => {
    const userId = req.session.userId;
    const db = getDb();
    
    try {
        // 获取用户当前VIP等级
        const user = db.prepare('SELECT vip_level FROM users WHERE id = ?').get(userId);
        
        // 计算用户累计交易额
        const stats = db.prepare(`
            SELECT COALESCE(SUM(user_amount), 0) as total
            FROM authorizations
            WHERE user_id = ? AND status = 'settled'
        `).get(userId);
        
        const currentLevel = user.vip_level || 0;
        const currentAmount = stats.total;
        
        res.json({
            success: true,
            data: {
                current_level: currentLevel,
                current_amount: currentAmount,
                config: VIP_CONFIG
            }
        });
    } catch (error) {
        console.error('获取VIP信息失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;