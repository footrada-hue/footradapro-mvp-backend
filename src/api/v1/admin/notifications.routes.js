// src/api/v1/admin/notifications.routes.js
import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth, hasRole } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// 所有路由需要管理员认证
router.use(adminAuth);
router.use(hasRole(['super_admin', 'finance_admin']));

// ==================== 获取通知统计 ====================
router.get('/stats', async (req, res) => {
    try {
        let total = 0, unreadTotal = 0, readRate = 0, onlineUsers = 0;
        
        if (isProduction) {
            // PostgreSQL
            const totalResult = await query('SELECT COUNT(*) as count FROM user_notifications');
            total = parseInt(totalResult?.[0]?.count || 0);
            
            const unreadResult = await query('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = false');
            unreadTotal = parseInt(unreadResult?.[0]?.count || 0);
            
            const rateResult = await query(`
                SELECT ROUND(CAST(SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) AS DECIMAL) / NULLIF(COUNT(*), 0) * 100, 1) as rate 
                FROM user_notifications
            `);
            readRate = parseFloat(rateResult?.[0]?.rate || 0);
            
            const onlineResult = await query(`
                SELECT COUNT(DISTINCT u.id) as count FROM users u
                WHERE u.last_active_at IS NOT NULL 
                  AND u.last_active_at >= NOW() - INTERVAL '5 minutes'
                  AND u.status = 'active'
            `);
            onlineUsers = parseInt(onlineResult?.[0]?.count || 0);
        } else {
            // SQLite
            const db = getDb();
            total = db.prepare('SELECT COUNT(*) as count FROM user_notifications').get()?.count || 0;
            unreadTotal = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = 0').get()?.count || 0;
            const rateResult = db.prepare(`
                SELECT ROUND(CAST(SUM(is_read) AS REAL) / COUNT(*) * 100, 1) as rate 
                FROM user_notifications
            `).get();
            readRate = rateResult?.rate || 0;
            const onlineResult = db.prepare(`
                SELECT COUNT(DISTINCT u.id) as count FROM users u
                WHERE u.last_active_at IS NOT NULL 
                  AND u.last_active_at >= datetime('now', '-5 minutes')
                  AND u.status = 'active'
            `).get();
            onlineUsers = onlineResult?.count || 0;
        }
        
        res.json({
            success: true,
            data: {
                total,
                unreadTotal,
                avgReadRate: readRate,
                onlineUsers
            }
        });
    } catch (error) {
        logger.error('获取统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有通知（带筛选和分页）====================
router.get('/', async (req, res) => {
    const { type, is_read, search, date, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let notifications = [];
        let total = 0;
        
        if (isProduction) {
            // PostgreSQL
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
            let paramIndex = 1;
            
            if (type) {
                sql += ` AND n.type = $${paramIndex++}`;
                params.push(type);
            }
            if (is_read !== undefined && is_read !== '') {
                sql += ` AND n.is_read = $${paramIndex++}`;
                params.push(is_read === 'true' || parseInt(is_read) === 1);
            }
            if (search) {
                sql += ` AND (n.title ILIKE $${paramIndex++} OR n.content ILIKE $${paramIndex++} OR u.username ILIKE $${paramIndex++} OR u.email ILIKE $${paramIndex++})`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
            }
            if (date) {
                sql += ` AND DATE(n.created_at) = $${paramIndex++}`;
                params.push(date);
            }
            
            // 获取总数
            let countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
            const countResult = await query(countSql, params);
            total = parseInt(countResult?.[0]?.total || 0);
            
            // 获取数据
            sql += ` ORDER BY n.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), offset);
            
            const result = await query(sql, params);
            notifications = result || [];
        } else {
            // SQLite
            const db = getDb();
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
            
            let countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
            const totalResult = db.prepare(countSql).get(...params);
            total = totalResult?.total || 0;
            
            sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            notifications = db.prepare(sql).all(...params);
        }
        
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
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
                total: total,
                pages: Math.ceil(total / limit)
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
    
    if (!title || !content) {
        return res.status(400).json({ success: false, error: '标题和内容不能为空' });
    }
    
    try {
        if (target_users === 'batch' && user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            if (user_ids.length > 500) {
                return res.status(400).json({ success: false, error: '批量发送最多支持500个用户' });
            }
            
            let notificationId = null;
            let insertedCount = 0;
            let invalidIds = [];
            
            if (isProduction) {
                // PostgreSQL
                const notifResult = await query(`
                    INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    RETURNING id
                `, [title, content, type || 'info', 'batch', adminId]);
                notificationId = notifResult?.[0]?.id;
                
                for (const uid of user_ids) {
                    const userExists = await query('SELECT id FROM users WHERE id = $1', [uid]);
                    if (userExists && userExists.length > 0) {
                        await query(`
                            INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                            VALUES ($1, $2, $3, $4, $5, $6, NOW())
                        `, [uid, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId })]);
                        insertedCount++;
                    } else {
                        invalidIds.push(uid);
                    }
                }
            } else {
                // SQLite
                const db = getDb();
                const notifResult = db.prepare(`
                    INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(title, content, type || 'info', 'batch', adminId);
                notificationId = notifResult.lastInsertRowid;
                
                const insertStmt = db.prepare(`
                    INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `);
                
                for (const uid of user_ids) {
                    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
                    if (userExists) {
                        insertStmt.run(uid, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId }));
                        insertedCount++;
                    } else {
                        invalidIds.push(uid);
                    }
                }
            }
            
            logger.info(`管理员 ${adminId} 批量创建通知: ${title}, 目标用户数: ${insertedCount}/${user_ids.length}`);
            
            return res.json({ 
                success: true, 
                data: { 
                    count: insertedCount,
                    total: user_ids.length,
                    invalid: invalidIds
                },
                message: invalidIds.length > 0 
                    ? `成功发送给 ${insertedCount} 个用户，${invalidIds.length} 个用户不存在`
                    : `成功发送给 ${insertedCount} 个用户`
            });
        }
        
        // 单个用户模式
        if (target_users === 'specific' && user_id) {
            if (isProduction) {
                const userExists = await query('SELECT id FROM users WHERE id = $1', [user_id]);
                if (!userExists || userExists.length === 0) {
                    return res.status(404).json({ success: false, error: '用户不存在' });
                }
                
                const notifResult = await query(`
                    INSERT INTO notifications (title, content, type, target_users, user_id, created_by, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    RETURNING id
                `, [title, content, type || 'info', 'specific', user_id, adminId]);
                const notificationId = notifResult?.[0]?.id;
                
                await query(`
                    INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [user_id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId })]);
            } else {
                const db = getDb();
                const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
                if (!userExists) {
                    return res.status(404).json({ success: false, error: '用户不存在' });
                }
                
                const notifResult = db.prepare(`
                    INSERT INTO notifications (title, content, type, target_users, user_id, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(title, content, type || 'info', 'specific', user_id, adminId);
                const notificationId = notifResult.lastInsertRowid;
                
                db.prepare(`
                    INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(user_id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId }));
            }
            
            logger.info(`管理员 ${adminId} 发送通知给用户 ${user_id}: ${title}`);
            return res.json({ success: true, message: '通知已发送', data: { count: 1 } });
        }
        
        // 全局通知模式 - 发送给所有活跃用户
        let users = [];
        if (isProduction) {
            const result = await query('SELECT id FROM users WHERE status = $1', ['active']);
            users = result || [];
        } else {
            const db = getDb();
            users = db.prepare('SELECT id FROM users WHERE status = "active"').all();
        }
        
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: '没有活跃用户' });
        }
        
        if (isProduction) {
            const notifResult = await query(`
                INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING id
            `, [title, content, type || 'info', 'all', adminId]);
            const notificationId = notifResult?.[0]?.id;
            
            for (const user of users) {
                await query(`
                    INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [user.id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId, is_global: true })]);
            }
        } else {
            const db = getDb();
            const notifResult = db.prepare(`
                INSERT INTO notifications (title, content, type, target_users, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(title, content, type || 'info', 'all', adminId);
            const notificationId = notifResult.lastInsertRowid;
            
            const insertStmt = db.prepare(`
                INSERT INTO user_notifications (user_id, notification_id, type, title, content, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            for (const user of users) {
                insertStmt.run(user.id, notificationId, type || 'info', title, content, JSON.stringify({ from_admin: adminId, is_global: true }));
            }
        }
        
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
router.get('/online-users', async (req, res) => {
    try {
        let onlineUsers = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    u.id as "userId", 
                    u.username, 
                    u.email, 
                    u.last_active_at as "lastActive"
                FROM users u
                WHERE u.last_active_at IS NOT NULL 
                  AND u.last_active_at >= NOW() - INTERVAL '5 minutes'
                  AND u.status = 'active'
                ORDER BY u.last_active_at DESC
                LIMIT 50
            `);
            onlineUsers = result || [];
        } else {
            const db = getDb();
            onlineUsers = db.prepare(`
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
        }
        
        res.json({ success: true, data: onlineUsers });
    } catch (error) {
        logger.error('获取在线用户失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取所有用户列表 ====================
router.get('/all-users', async (req, res) => {
    const { search, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let users = [];
        let total = 0;
        
        if (isProduction) {
            let sql = `
                SELECT 
                    u.id as "userId", 
                    u.username, 
                    u.email,
                    u.last_active_at as "lastActive",
                    CASE 
                        WHEN u.last_active_at IS NOT NULL 
                          AND u.last_active_at >= NOW() - INTERVAL '5 minutes' 
                        THEN 1 ELSE 0 
                    END as is_online
                FROM users u
                WHERE u.status = 'active'
            `;
            const params = [];
            let paramIndex = 1;
            
            if (search) {
                sql += ` AND (u.username ILIKE $${paramIndex++} OR u.email ILIKE $${paramIndex++})`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (status === 'online') {
                sql += ` AND u.last_active_at IS NOT NULL AND u.last_active_at >= NOW() - INTERVAL '5 minutes'`;
            } else if (status === 'offline') {
                sql += ` AND (u.last_active_at IS NULL OR u.last_active_at < NOW() - INTERVAL '5 minutes')`;
            }
            
            const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
            total = parseInt(countResult?.[0]?.total || 0);
            
            sql += ` ORDER BY u.id LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), offset);
            
            const result = await query(sql, params);
            users = result || [];
        } else {
            const db = getDb();
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
            
            const totalResult = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
            total = totalResult?.total || 0;
            
            sql += ' ORDER BY u.id LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            users = db.prepare(sql).all(...params);
        }
        
        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个通知 ====================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let notification = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT n.*, u.username as user_name
                FROM user_notifications n
                LEFT JOIN users u ON n.user_id = u.id
                WHERE n.id = $1
            `, [id]);
            notification = result?.[0] || null;
        } else {
            const db = getDb();
            notification = db.prepare(`
                SELECT n.*, u.username as user_name
                FROM user_notifications n
                LEFT JOIN users u ON n.user_id = u.id
                WHERE n.id = ?
            `).get(id);
        }
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        if (notification.data) {
            try {
                notification.data = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
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
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query('DELETE FROM user_notifications WHERE id = $1', [id]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare('DELETE FROM user_notifications WHERE id = ?').run(id);
            changes = result.changes;
        }
        
        if (changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量删除通知 ====================
router.delete('/batch', async (req, res) => {
    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的通知ID列表' });
    }
    
    try {
        let deletedCount = 0;
        
        if (isProduction) {
            const placeholders = notificationIds.map((_, i) => `$${i + 1}`).join(',');
            const result = await query(`DELETE FROM user_notifications WHERE id IN (${placeholders})`, notificationIds);
            deletedCount = result?.rowCount || 0;
        } else {
            const db = getDb();
            const placeholders = notificationIds.map(() => '?').join(',');
            const result = db.prepare(`DELETE FROM user_notifications WHERE id IN (${placeholders})`).run(...notificationIds);
            deletedCount = result.changes;
        }
        
        res.json({ success: true, message: `成功删除 ${deletedCount} 条通知` });
    } catch (error) {
        logger.error('批量删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 系统通知统计（别名）====================
router.get('/system/stats', async (req, res) => {
    try {
        let total = 0, unreadTotal = 0, readRate = 0, typeStats = [];
        
        if (isProduction) {
            const totalResult = await query('SELECT COUNT(*) as count FROM user_notifications');
            total = parseInt(totalResult?.[0]?.count || 0);
            
            const unreadResult = await query('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = false');
            unreadTotal = parseInt(unreadResult?.[0]?.count || 0);
            
            const rateResult = await query(`
                SELECT ROUND(CAST(SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) AS DECIMAL) / NULLIF(COUNT(*), 0) * 100, 1) as rate 
                FROM user_notifications
            `);
            readRate = parseFloat(rateResult?.[0]?.rate || 0);
            
            const typeResult = await query('SELECT type, COUNT(*) as count FROM user_notifications GROUP BY type');
            typeStats = typeResult || [];
        } else {
            const db = getDb();
            total = db.prepare('SELECT COUNT(*) as count FROM user_notifications').get()?.count || 0;
            unreadTotal = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE is_read = 0').get()?.count || 0;
            const rateResult = db.prepare(`
                SELECT ROUND(CAST(SUM(is_read) AS REAL) / COUNT(*) * 100, 1) as rate 
                FROM user_notifications
            `).get();
            readRate = rateResult?.rate || 0;
            typeStats = db.prepare('SELECT type, COUNT(*) as count FROM user_notifications GROUP BY type').all();
        }
        
        res.json({
            success: true,
            data: {
                total,
                unreadTotal,
                avgReadRate: readRate,
                typeStats
            }
        });
    } catch (error) {
        logger.error('获取系统通知统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 系统通知列表（别名）====================
router.get('/system/list', async (req, res) => {
    const { type, is_read, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let notifications = [];
        let total = 0;
        
        if (isProduction) {
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
            let paramIndex = 1;
            
            if (type) {
                sql += ` AND n.type = $${paramIndex++}`;
                params.push(type);
            }
            if (is_read !== undefined && is_read !== '') {
                sql += ` AND n.is_read = $${paramIndex++}`;
                params.push(is_read === 'true' || parseInt(is_read) === 1);
            }
            if (search) {
                sql += ` AND (n.title ILIKE $${paramIndex++} OR n.content ILIKE $${paramIndex++} OR u.username ILIKE $${paramIndex++} OR u.email ILIKE $${paramIndex++})`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
            }
            
            const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
            total = parseInt(countResult?.[0]?.total || 0);
            
            sql += ` ORDER BY n.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), offset);
            
            const result = await query(sql, params);
            notifications = result || [];
        } else {
            const db = getDb();
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
            
            const totalResult = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
            total = totalResult?.total || 0;
            
            sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            notifications = db.prepare(sql).all(...params);
        }
        
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
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
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('获取系统通知列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个系统通知详情 ====================
router.get('/system/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let notification = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    n.*,
                    u.username as user_name,
                    u.email as user_email
                FROM user_notifications n
                LEFT JOIN users u ON n.user_id = u.id
                WHERE n.id = $1
            `, [id]);
            notification = result?.[0] || null;
        } else {
            const db = getDb();
            notification = db.prepare(`
                SELECT 
                    n.*,
                    u.username as user_name,
                    u.email as user_email
                FROM user_notifications n
                LEFT JOIN users u ON n.user_id = u.id
                WHERE n.id = ?
            `).get(id);
        }
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        if (notification.data) {
            try {
                notification.data = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
            } catch (e) {
                notification.data = null;
            }
        }
        
        res.json({ success: true, data: notification });
    } catch (error) {
        logger.error('获取系统通知详情失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;