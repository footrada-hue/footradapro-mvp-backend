import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要管理员认证
router.use(adminAuth);
router.use(hasRole(['super_admin', 'finance_admin']));

// ==================== 获取通知统计 ====================
router.get('/stats', (req, res) => {
    const db = getDb();
    
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM user_notifications').get();
        const unreadTotal = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = 0').get();
        const readRate = db.prepare(`
            SELECT ROUND(CAST(SUM(is_read) AS REAL) / COUNT(*) * 100, 1) as rate 
            FROM user_notifications
        `).get();
        const onlineUsers = db.prepare(`
            SELECT COUNT(DISTINCT u.id) as count FROM users u
            WHERE u.last_active_at IS NOT NULL 
              AND u.last_active_at >= datetime('now', '-5 minutes')
              AND u.status = 'active'
        `).get().count;
        
        res.json({
            success: true,
            data: {
                total: total?.count || 0,
                unreadTotal: unreadTotal?.count || 0,
                avgReadRate: readRate?.rate || 0,
                onlineUsers: onlineUsers
            }
        });
    } catch (error) {
        logger.error('获取统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有通知（带筛选和分页）====================
router.get('/', (req, res) => {
    const { type, is_read, search, date, page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            n.id,
            n.user_id,
            n.type,
            n.title,
            n.content,
            n.data,
            n.is_read,
            n.read_at,
            n.created_at,
            u.username as user_name,
            u.email as user_email
        FROM user_notifications n
        LEFT JOIN users u ON n.user_id = u.id
        WHERE 1=1
    `;
    const params = [];
    
    if (type) {
        sql += ' AND n.type = ?';
        params.push(type);
    }
    if (is_read !== undefined && is_read !== '') {
        sql += ' AND n.is_read = ?';
        params.push(parseInt(is_read));
    }
    if (search) {
        sql += ' AND (n.title LIKE ? OR n.content LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (date) {
        sql += ' AND DATE(n.created_at) = ?';
        params.push(date);
    }
    
    let countSql = `
        SELECT COUNT(*) as total FROM user_notifications n
        LEFT JOIN users u ON n.user_id = u.id
        WHERE 1=1
    `;
    const countParams = [];
    if (type) {
        countSql += ' AND n.type = ?';
        countParams.push(type);
    }
    if (is_read !== undefined && is_read !== '') {
        countSql += ' AND n.is_read = ?';
        countParams.push(parseInt(is_read));
    }
    if (search) {
        countSql += ' AND (n.title LIKE ? OR n.content LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const total = db.prepare(countSql).get(...countParams);
    
    sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    try {
        const notifications = db.prepare(sql).all(...params);
        
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
                total: total?.total || 0,
                pages: Math.ceil((total?.total || 0) / limit)
            }
        });
    } catch (error) {
        logger.error('获取通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 创建通知（发送给用户）====================
router.post('/', async (req, res) => {
    const { title, content, type, target_users, user_id, user_ids } = req.body;
    const adminId = req.admin?.id || req.session?.adminId;
    const db = getDb();
    
    if (!title || !content) {
        return res.status(400).json({ success: false, error: '标题和内容不能为空' });
    }
    
    try {
        // 批量发送模式
        if (target_users === 'batch' && user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            if (user_ids.length > 500) {
                return res.status(400).json({ success: false, error: '批量发送最多支持500个用户' });
            }
            
            // 先插入 notifications 表作为模板
            const notifResult = db.prepare(`
                INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(title, content, type || 'info', 'batch', adminId);
            
            const notificationId = notifResult.lastInsertRowid;
            
            const insertStmt = db.prepare(`
                INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            const transaction = db.transaction((ids) => {
                let insertedCount = 0;
                let invalidIds = [];
                for (const uid of ids) {
                    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
                    if (userExists) {
                        insertStmt.run(uid, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId }));
                        insertedCount++;
                    } else {
                        invalidIds.push(uid);
                    }
                }
                return { insertedCount, invalidIds };
            });
            
            const result = transaction(user_ids);
            
            logger.info(`管理员 ${adminId} 批量创建通知: ${title}, 目标用户数: ${result.insertedCount}/${user_ids.length}`);
            
            return res.json({ 
                success: true, 
                data: { 
                    count: result.insertedCount,
                    total: user_ids.length,
                    invalid: result.invalidIds
                },
                message: result.invalidIds.length > 0 
                    ? `成功发送给 ${result.insertedCount} 个用户，${result.invalidIds.length} 个用户不存在`
                    : `成功发送给 ${result.insertedCount} 个用户`
            });
        }
        
        // 单个用户模式
        if (target_users === 'specific' && user_id) {
            const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
            if (!userExists) {
                return res.status(404).json({ success: false, error: '用户不存在' });
            }
            
            // 先插入 notifications 表
            const notifResult = db.prepare(`
                INSERT INTO notifications (title, content, type, target_users, user_id, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(title, content, type || 'info', 'specific', user_id, adminId);
            
            const notificationId = notifResult.lastInsertRowid;
            
            // 再插入 user_notifications 表
            db.prepare(`
                INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(user_id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId }));
            
            logger.info(`管理员 ${adminId} 发送通知给用户 ${user_id}: ${title}`);
            
            return res.json({ 
                success: true, 
                message: '通知已发送',
                data: { count: 1 }
            });
        }
        
        // 全局通知模式 - 发送给所有活跃用户
        const users = db.prepare('SELECT id FROM users WHERE status = "active"').all();
        
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: '没有活跃用户' });
        }
        
        // 先插入 notifications 表作为模板
        const notifResult = db.prepare(`
            INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(title, content, type || 'info', 'all', adminId);
        
        const notificationId = notifResult.lastInsertRowid;
        
        const insertStmt = db.prepare(`
            INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        const transaction = db.transaction((userList) => {
            for (const user of userList) {
                insertStmt.run(user.id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId, is_global: true }));
            }
        });
        
        transaction(users);
        
        logger.info(`管理员 ${adminId} 发送全局通知: ${title}, 目标用户数: ${users.length}`);
        
        res.json({ 
            success: true, 
            message: `全局通知已发送给 ${users.length} 个用户`,
            data: { count: users.length }
        });
        
    } catch (error) {
        logger.error('创建通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取在线用户列表 ====================
router.get('/online-users', (req, res) => {
    try {
        const db = getDb();
        
        const onlineUsers = db.prepare(`
            SELECT 
                u.id as userId, 
                u.username, 
                u.email, 
                MAX(u.last_active_at) as lastActive
            FROM users u
            WHERE u.last_active_at IS NOT NULL 
              AND u.last_active_at >= datetime('now', '-5 minutes')
              AND u.status = 'active'
            GROUP BY u.id, u.username, u.email
            ORDER BY lastActive DESC
            LIMIT 50
        `).all();
        
        res.json({ success: true, data: onlineUsers });
    } catch (error) {
        console.error('获取在线用户失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有用户列表 ====================
router.get('/all-users', (req, res) => {
    try {
        const db = getDb();
        const { search, status, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let sql = `
            SELECT 
                u.id as userId, 
                u.username, 
                u.email,
                u.last_active_at as lastActive,
                CASE 
                    WHEN u.last_active_at IS NOT NULL 
                      AND u.last_active_at >= datetime('now', '-5 minutes') 
                    THEN 1 ELSE 0 
                END as is_online
            FROM users u
            WHERE u.status = 'active'
        `;
        const params = [];
        
        if (search) {
            sql += ' AND (u.username LIKE ? OR u.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status === 'online') {
            sql += ' AND u.last_active_at IS NOT NULL AND u.last_active_at >= datetime(\'now\', \'-5 minutes\')';
        } else if (status === 'offline') {
            sql += ' AND (u.last_active_at IS NULL OR u.last_active_at < datetime(\'now\', \'-5 minutes\'))';
        }
        
        const total = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
        
        sql += ' ORDER BY u.id LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const users = db.prepare(sql).all(...params);
        
        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total?.total || 0,
                pages: Math.ceil((total?.total || 0) / limit)
            }
        });
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个通知 ====================
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        const notification = db.prepare(`
            SELECT n.*, u.username as user_name
            FROM user_notifications n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE n.id = ?
        `).get(id);
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        if (notification.data) {
            try {
                notification.data = JSON.parse(notification.data);
            } catch (e) {
                notification.data = null;
            }
        }
        
        res.json({ success: true, data: notification });
    } catch (error) {
        logger.error('获取通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 删除通知 ====================
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        const result = db.prepare('DELETE FROM user_notifications WHERE id = ?').run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量删除通知 ====================
router.delete('/batch', (req, res) => {
    const { notificationIds } = req.body;
    const db = getDb();
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的通知ID列表' });
    }
    
    try {
        const transaction = db.transaction((ids) => {
            let deletedCount = 0;
            for (const id of ids) {
                const result = db.prepare('DELETE FROM user_notifications WHERE id = ?').run(id);
                if (result.changes > 0) deletedCount++;
            }
            return deletedCount;
        });
        
        const deletedCount = transaction(notificationIds);
        
        res.json({ success: true, message: `成功删除 ${deletedCount} 条通知` });
    } catch (error) {
        logger.error('批量删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 系统通知统计（别名）====================
router.get('/system/stats', (req, res) => {
    const db = getDb();
    
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM user_notifications').get();
        const unreadTotal = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = 0').get();
        const readRate = db.prepare(`
            SELECT ROUND(CAST(SUM(is_read) AS REAL) / COUNT(*) * 100, 1) as rate 
            FROM user_notifications
        `).get();
        const typeStats = db.prepare(`
            SELECT type, COUNT(*) as count 
            FROM user_notifications 
            GROUP BY type
        `).all();
        
        res.json({
            success: true,
            data: {
                total: total?.count || 0,
                unreadTotal: unreadTotal?.count || 0,
                avgReadRate: readRate?.rate || 0,
                typeStats: typeStats
            }
        });
    } catch (error) {
        console.error('获取系统通知统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 系统通知列表（别名）====================
router.get('/system/list', (req, res) => {
    const db = getDb();
    const { type, is_read, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let sql = `
            SELECT 
                n.id,
                n.user_id,
                n.type,
                n.title,
                n.content,
                n.data,
                n.is_read,
                n.read_at,
                n.created_at,
                u.username as user_name,
                u.email as user_email
            FROM user_notifications n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (type) {
            sql += ' AND n.type = ?';
            params.push(type);
        }
        if (is_read !== undefined && is_read !== '') {
            sql += ' AND n.is_read = ?';
            params.push(parseInt(is_read));
        }
        if (search) {
            sql += ' AND (n.title LIKE ? OR n.content LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        let countSql = `
            SELECT COUNT(*) as total FROM user_notifications n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE 1=1
        `;
        const countParams = [];
        if (type) {
            countSql += ' AND n.type = ?';
            countParams.push(type);
        }
        if (is_read !== undefined && is_read !== '') {
            countSql += ' AND n.is_read = ?';
            countParams.push(parseInt(is_read));
        }
        if (search) {
            countSql += ' AND (n.title LIKE ? OR n.content LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        const total = db.prepare(countSql).get(...countParams);
        
        sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const notifications = db.prepare(sql).all(...params);
        
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
                total: total?.total || 0,
                pages: Math.ceil((total?.total || 0) / limit)
            }
        });
    } catch (error) {
        console.error('获取系统通知列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个系统通知详情 ====================
router.get('/system/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        const notification = db.prepare(`
            SELECT 
                n.*,
                u.username as user_name,
                u.email as user_email
            FROM user_notifications n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE n.id = ?
        `).get(id);
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        if (notification.data) {
            try {
                notification.data = JSON.parse(notification.data);
            } catch (e) {
                notification.data = null;
            }
        }
        
        res.json({ success: true, data: notification });
    } catch (error) {
        console.error('获取系统通知详情失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;