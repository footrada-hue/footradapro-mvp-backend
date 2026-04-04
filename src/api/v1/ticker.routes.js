import express from 'express';
import { getDb } from '../../database/connection.js';
import { updateLastActive } from '../../middlewares/updateActivity.middleware.js';

const router = express.Router();

// ==================== 工具函数 ====================

// 生成随机 UID（用于匿名用户，看起来更真实）
function generateRandomUID() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let uid = '';
    for (let i = 0; i < 8; i++) {
        uid += chars[Math.floor(Math.random() * chars.length)];
    }
    return uid;
}

// 格式化金额
function formatAmount(amount) {
    if (!amount && amount !== 0) return '0';
    return Number(amount).toLocaleString('en-US');
}

// ==================== 新增：获取格式化的消息列表 ====================
// 这个接口返回已经格式化好的消息，前端直接显示
router.get('/messages', (req, res) => {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 30;
    
    try {
        // 从 ticker_messages 表获取消息
        const messages = db.prepare(`
            SELECT 
                id,
                type,
                message,
                created_at
            FROM ticker_messages 
            ORDER BY created_at DESC
            LIMIT ?
        `).all(limit);
        
        // 如果消息表为空，返回默认的欢迎消息
        if (messages.length === 0) {
            return res.json({
                success: true,
                data: [
                    { id: 1, type: 'system', message: '🎉 Welcome to FOOTRADA', created_at: new Date().toISOString() },
                    { id: 2, type: 'system', message: '⚡ AI-powered football trading platform', created_at: new Date().toISOString() },
                    { id: 3, type: 'system', message: '💰 Start trading with AI recommendations', created_at: new Date().toISOString() }
                ]
            });
        }
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('获取消息失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 原有接口：获取最近动态（保持兼容）====================
router.get('/recent', (req, res) => {
    const db = getDb();
    
    try {
        const messages = db.prepare(`
            SELECT 
                t.*,
                u.username as user_name
            FROM ticker_messages t
            LEFT JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
            LIMIT 50
        `).all();

        const formatted = messages.map(msg => ({
            ...msg,
            display_name: msg.username ? 
                msg.username.substring(0, 3) + '***' + msg.username.substring(msg.username.length - 3) : 
                generateRandomUID()
        }));

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('获取动态失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 修改：统计数据（从授权表获取真实数据）====================
router.get('/stats', (req, res) => {
    const db = getDb();
    
    try {
        // 今日交易额（从授权表获取真实数据）
        const todayVolume = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM authorizations 
            WHERE date(created_at) = date('now')
        `).get();

        // 总授权量
        const totalVolume = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM authorizations 
            WHERE status = 'settled'
        `).get();

        res.json({
            success: true,
            data: {
                today_volume: todayVolume.total,
                total_volume: totalVolume.total
            }
        });
    } catch (error) {
        console.error('获取统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;