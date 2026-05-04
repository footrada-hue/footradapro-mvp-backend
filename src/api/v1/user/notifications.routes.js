import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import { getIO } from '../../../socket/index.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

// ==================== 获取当前用户的有效通知（未读）- 用于右上角下拉 ====================
router.get('/', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const notifications = db.prepare(`
            SELECT id, type, title, content, data, is_read, read_at, created_at
            FROM user_notifications
            WHERE user_id = ? AND is_read = 0
            ORDER BY created_at DESC
            LIMIT 50
        `).all(userId);
        
        // 解析 data 字段
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = JSON.parse(n.data);
                } catch (e) {
                    n.data = null;
                }
            }
        });
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error('获取通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取用户通知列表（带分页）- 用于通知中心页面 ====================
router.get('/list', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { page = 1, limit = 20, unread_only = false } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();
    
    try {
        let query = `
            SELECT id, type, title, content, data, is_read, read_at, created_at
            FROM user_notifications
            WHERE user_id = ?
        `;
        const params = [userId];
        
        if (unread_only === 'true') {
            query += ' AND is_read = 0';
        }
        
        // 获取总数
        let countQuery = `
            SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?
        `;
        const countParams = [userId];
        if (unread_only === 'true') {
            countQuery += ' AND is_read = 0';
        }
        const total = db.prepare(countQuery).get(...countParams);
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const notifications = db.prepare(query).all(...params);
        
        // 解析 data 字段
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = JSON.parse(n.data);
                } catch (e) {
                    n.data = null;
                }
            }
        });
        
        // 获取未读数量
        const unreadCount = db.prepare(`
            SELECT COUNT(*) as count FROM user_notifications 
            WHERE user_id = ? AND is_read = 0
        `).get(userId);
        
        res.json({
            success: true,
            data: notifications,
            unread_count: unreadCount?.count || 0,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total?.count || 0,
                pages: Math.ceil((total?.count || 0) / limit)
            }
        });
    } catch (error) {
        logger.error('获取通知列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取未读通知数量 ====================
router.get('/unread-count', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count FROM user_notifications 
            WHERE user_id = ? AND is_read = 0
        `).get(userId);
        
        res.json({ success: true, data: { unreadCount: result?.count || 0 } });
    } catch (error) {
        logger.error('获取未读数量失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记单个通知为已读 ====================
router.put('/read/:id', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { id } = req.params;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            UPDATE user_notifications 
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND is_read = 0
        `).run(id, userId);
        
        res.json({ success: true, marked: result.changes > 0 });
    } catch (error) {
        logger.error('标记通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== POST 方式标记单个通知为已读（兼容右上角组件）====================
router.post('/:id/read', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { id } = req.params;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            UPDATE user_notifications 
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND is_read = 0
        `).run(id, userId);
        
        res.json({ success: true, marked: result.changes > 0 });
    } catch (error) {
        logger.error('标记通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量标记通知为已读 ====================
router.post('/batch-read', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { notificationIds } = req.body;
    const db = getDb();
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: '无效的通知ID列表' });
    }
    
    try {
        const placeholders = notificationIds.map(() => '?').join(',');
        const result = db.prepare(`
            UPDATE user_notifications 
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders}) AND user_id = ? AND is_read = 0
        `).run(...notificationIds, userId);
        
        res.json({ success: true, markedCount: result.changes });
    } catch (error) {
        logger.error('批量标记已读失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记所有通知为已读 ====================
router.put('/read-all', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            UPDATE user_notifications 
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND is_read = 0
        `).run(userId);
        
        res.json({ success: true, markedCount: result.changes });
    } catch (error) {
        logger.error('标记全部通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== POST 方式标记所有通知为已读（兼容右上角组件）====================
router.post('/read-all', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            UPDATE user_notifications 
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND is_read = 0
        `).run(userId);
        
        res.json({ success: true, markedCount: result.changes });
    } catch (error) {
        logger.error('标记全部通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取通知历史（带分页）- 兼容旧API ====================
router.get('/history', updateLastActive, (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        const total = db.prepare(`
            SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?
        `).get(userId);
        
        const notifications = db.prepare(`
            SELECT id, type, title, content, data, is_read, read_at, created_at
            FROM user_notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(userId, parseInt(limit), offset);
        
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = JSON.parse(n.data);
                } catch (e) {
                    n.data = null;
                }
            }
        });
        
        res.json({ 
            success: true, 
            data: notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total?.count || 0,
                pages: Math.ceil((total?.count || 0) / limit)
            }
        });
    } catch (error) {
        logger.error('获取通知历史失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 创建通知（供其他模块调用）====================
export function createNotification(userId, type, title, content, data = null) {
    const db = getDb();
    try {
        db.prepare(`
            INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(userId, type, title, content, data ? JSON.stringify(data) : null);
        
        // 通过 WebSocket 推送实时通知
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('new-notification', {
                    type, title, content, data,
                    created_at: new Date().toISOString()
                });
                console.log(`📧 WebSocket 推送通知给用户 ${userId}: ${title}`);
            } else {
                console.log(`⚠️ WebSocket 未初始化，通知已保存但未推送: ${title}`);
            }
        } catch (wsErr) {
            console.error('❌ WebSocket 推送失败:', wsErr.message);
        }
        
        return true;
    } catch (error) {
        console.error('❌ 创建通知失败:', error);
        return false;
    }
}

// ==================== 批量创建通知（全局通知）====================
export function createGlobalNotification(type, title, content, data = null) {
    const db = getDb();
    try {
        // 获取所有活跃用户
        const users = db.prepare('SELECT id FROM users WHERE status = "active"').all();
        
        const insertStmt = db.prepare(`
            INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        const transaction = db.transaction((userList) => {
            for (const user of userList) {
                insertStmt.run(user.id, type, title, content, data ? JSON.stringify(data) : null);
            }
        });
        
        transaction(users);
        
        console.log(`📢 全局通知已发送: ${title}, 目标用户数: ${users.length}`);
        
        // WebSocket 推送（可选）
        try {
            const io = getIO();
            if (io) {
                io.emit('global-notification', {
                    type, title, content, data,
                    created_at: new Date().toISOString()
                });
            }
        } catch (wsErr) {
            console.error('WebSocket 推送失败:', wsErr.message);
        }
        
        return { success: true, count: users.length };
    } catch (error) {
        console.error('❌ 创建全局通知失败:', error);
        return { success: false, count: 0 };
    }
}
// ==================== 获取单条通知详情 ====================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const notification = db.prepare(`
            SELECT id, user_id, type, title, content, data, is_read, read_at, created_at
            FROM user_notifications
            WHERE id = ? AND user_id = ?
        `).get(id, userId);
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        // 解析 data 字段
        if (notification.data) {
            try {
                notification.data = JSON.parse(notification.data);
            } catch (e) {
                notification.data = null;
            }
        }
        
        res.json({ success: true, data: notification });
    } catch (error) {
        console.error('获取通知详情失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 删除单条通知 ====================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            DELETE FROM user_notifications
            WHERE id = ? AND user_id = ?
        `).run(id, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true, message: '通知已删除' });
    } catch (error) {
        console.error('删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});
export { router as default };