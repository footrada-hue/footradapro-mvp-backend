import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要用户认证
router.use(auth);

// ==================== 获取当前用户的有效通知（未读）====================
router.get('/', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const db = getDb();
    const now = new Date().toISOString();
    
    try {
        // 🔧 修复：移除 LIMIT 1，返回所有未读通知
        const notifications = db.prepare(`
            SELECT n.* 
            FROM notifications n
            WHERE n.is_active = 1 
              AND (n.target_users = 'all' OR n.user_id = ?)
              AND (n.start_at IS NULL OR n.start_at <= ?)
              AND (n.end_at IS NULL OR n.end_at >= ?)
              AND n.id NOT IN (
                  SELECT notification_id 
                  FROM notification_reads 
                  WHERE user_id = ?
              )
            ORDER BY n.created_at DESC
        `).all(userId, now, now, userId);
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error('获取通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记通知为已读（支持批量）====================
router.post('/:id/read', updateLastActive, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    const db = getDb();
    
    try {
        // 🔧 修复：防止重复插入
        const existing = db.prepare(`
            SELECT * FROM notification_reads 
            WHERE notification_id = ? AND user_id = ?
        `).get(id, userId);
        
        if (!existing) {
            db.prepare(`
                INSERT INTO notification_reads (notification_id, user_id)
                VALUES (?, ?)
            `).run(id, userId);
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('标记已读失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量标记通知为已读 ====================
router.post('/batch-read', updateLastActive, (req, res) => {
    const { notificationIds } = req.body;
    const userId = req.session.userId;
    const db = getDb();
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: '无效的通知ID列表' });
    }
    
    try {
        // 使用事务批量插入
        const insertMany = db.transaction((ids) => {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
                VALUES (?, ?)
            `);
            
            for (const notificationId of ids) {
                stmt.run(notificationId, userId);
            }
        });
        
        insertMany(notificationIds);
        
        res.json({ success: true, message: `已标记 ${notificationIds.length} 条通知为已读` });
    } catch (error) {
        logger.error('批量标记已读失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取通知历史（带分页）====================
router.get('/history', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const { page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        // 获取总数
        const total = db.prepare(`
            SELECT COUNT(*) as count
            FROM notifications n
            WHERE n.target_users = 'all' OR n.user_id = ?
        `).get(userId);
        
        // 获取分页数据
        const notifications = db.prepare(`
            SELECT n.*, nr.read_at
            FROM notifications n
            LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE n.target_users = 'all' OR n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT ? OFFSET ?
        `).all(userId, userId, parseInt(limit), offset);
        
        res.json({ 
            success: true, 
            data: notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        logger.error('获取通知历史失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取未读通知数量 ====================
router.get('/unread-count', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const db = getDb();
    const now = new Date().toISOString();
    
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count
            FROM notifications n
            WHERE n.is_active = 1 
              AND (n.target_users = 'all' OR n.user_id = ?)
              AND (n.start_at IS NULL OR n.start_at <= ?)
              AND (n.end_at IS NULL OR n.end_at >= ?)
              AND n.id NOT IN (
                  SELECT notification_id 
                  FROM notification_reads 
                  WHERE user_id = ?
              )
        `).get(userId, now, now, userId);
        
        res.json({ success: true, data: { unreadCount: result.count } });
    } catch (error) {
        logger.error('获取未读数量失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记所有通知为已读 ====================
router.post('/read-all', updateLastActive, (req, res) => {
    const userId = req.session.userId;
    const db = getDb();
    const now = new Date().toISOString();
    
    try {
        // 获取所有未读通知ID
        const unreadNotifications = db.prepare(`
            SELECT n.id
            FROM notifications n
            WHERE n.is_active = 1 
              AND (n.target_users = 'all' OR n.user_id = ?)
              AND (n.start_at IS NULL OR n.start_at <= ?)
              AND (n.end_at IS NULL OR n.end_at >= ?)
              AND n.id NOT IN (
                  SELECT notification_id 
                  FROM notification_reads 
                  WHERE user_id = ?
              )
        `).all(userId, now, now, userId);
        
        if (unreadNotifications.length === 0) {
            return res.json({ success: true, message: '没有未读通知', data: { markedCount: 0 } });
        }
        
        // 批量插入已读记录
        const insertMany = db.transaction((ids) => {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
                VALUES (?, ?)
            `);
            
            for (const notification of ids) {
                stmt.run(notification.id, userId);
            }
        });
        
        insertMany(unreadNotifications);
        
        res.json({ 
            success: true, 
            message: `已标记 ${unreadNotifications.length} 条通知为已读`,
            data: { markedCount: unreadNotifications.length }
        });
    } catch (error) {
        logger.error('标记全部已读失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;