import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要管理員認證
router.use(adminAuth);

// ==================== 獲取通知統計 ====================
router.get('/stats', (req, res) => {
    const db = getDb();
    
    try {
        // 總通知數
        const total = db.prepare('SELECT COUNT(*) as count FROM notifications').get();
        
        // 已讀記錄總數
        const readCount = db.prepare('SELECT COUNT(*) as count FROM notification_reads').get();
        
        // 平均閱讀率
        const readRate = db.prepare(`
            SELECT 
                ROUND(AVG(
                    CASE 
                        WHEN nr.notification_id IS NOT NULL THEN 1 
                        ELSE 0 
                    END * 100
                ), 1) as avg_rate
            FROM notifications n
            LEFT JOIN notification_reads nr ON n.id = nr.notification_id
        `).get();
        
        // 在線用戶數（從數據庫查詢最近5分鐘活躍的用戶）
        const onlineUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE last_active_at IS NOT NULL 
              AND last_active_at >= datetime('now', '-5 minutes')
              AND status = 'active'
        `).get().count;
        
        res.json({
            success: true,
            data: {
                total: total.count,
                unreadTotal: readCount.count,
                avgReadRate: readRate.avg_rate || 0,
                onlineUsers: onlineUsers
            }
        });
    } catch (error) {
        logger.error('獲取統計失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取所有通知（帶篩選和分頁）====================
router.get('/', (req, res) => {
    const { type, is_active, search, date, page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            n.*, 
            a.username as creator_name,
            (
                SELECT COUNT(*) 
                FROM notification_reads 
                WHERE notification_id = n.id
            ) as read_count,
            (
                SELECT COUNT(*) 
                FROM users 
                WHERE (n.target_users = 'all' OR n.user_id = users.id)
            ) as target_count
        FROM notifications n
        LEFT JOIN admins a ON n.created_by = a.id
        WHERE 1=1
    `;
    const params = [];
    
    if (type) {
        sql += ' AND n.type = ?';
        params.push(type);
    }
    if (is_active !== undefined && is_active !== '') {
        sql += ' AND n.is_active = ?';
        params.push(parseInt(is_active));
    }
    if (search) {
        sql += ' AND (n.title LIKE ? OR n.content LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    if (date) {
        sql += ' AND DATE(n.created_at) = ?';
        params.push(date);
    }
    
    sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    try {
        const notifications = db.prepare(sql).all(...params);
        
        // 計算閱讀率
        notifications.forEach(n => {
            n.read_rate = n.target_count > 0 ? 
                Math.round((n.read_count / n.target_count) * 100) : 0;
        });
        
        // 獲取總數（用於分頁）
        let countSql = 'SELECT COUNT(*) as total FROM notifications n WHERE 1=1';
        const countParams = [];
        if (type) {
            countSql += ' AND n.type = ?';
            countParams.push(type);
        }
        if (is_active !== undefined && is_active !== '') {
            countSql += ' AND n.is_active = ?';
            countParams.push(parseInt(is_active));
        }
        if (search) {
            countSql += ' AND (n.title LIKE ? OR n.content LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (date) {
            countSql += ' AND DATE(n.created_at) = ?';
            countParams.push(date);
        }
        
        const total = db.prepare(countSql).get(...countParams);
        
        res.json({ 
            success: true, 
            data: notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.total,
                pages: Math.ceil(total.total / limit)
            }
        });
    } catch (error) {
        logger.error('獲取通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 創建通知（支持批量）====================
router.post('/', (req, res) => {
    const { title, content, type, target_users, user_id, user_ids, start_at, end_at, is_active } = req.body;
    const adminId = req.session.adminId;
    const db = getDb();
    
    // 驗證必要字段
    if (!title || !content) {
        return res.status(400).json({ success: false, error: '標題和內容不能為空' });
    }
    
    try {
        // 批量發送模式
        if (target_users === 'batch' && user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            // 限制批量數量
            if (user_ids.length > 500) {
                return res.status(400).json({ success: false, error: '批量發送最多支持500個用戶' });
            }
            
            const insertStmt = db.prepare(`
                INSERT INTO notifications (
                    title, content, type, target_users, user_id, 
                    start_at, end_at, is_active, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            // 使用事務批量插入
            const transaction = db.transaction((ids) => {
                let insertedCount = 0;
                let invalidIds = [];
                for (const uid of ids) {
                    // 檢查用戶是否存在
                    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
                    if (userExists) {
                        insertStmt.run(
                            title, content, type || 'info', 'specific', uid,
                            start_at || null, end_at || null, 
                            is_active !== undefined ? is_active : 1, adminId
                        );
                        insertedCount++;
                    } else {
                        invalidIds.push(uid);
                    }
                }
                return { insertedCount, invalidIds };
            });
            
            const result = transaction(user_ids);
            
            logger.info(`管理員 ${adminId} 批量創建通知: ${title}, 目標用戶數: ${result.insertedCount}/${user_ids.length}`);
            
            return res.json({ 
                success: true, 
                data: { 
                    count: result.insertedCount,
                    total: user_ids.length,
                    invalid: result.invalidIds
                },
                message: result.invalidIds.length > 0 
                    ? `成功發送給 ${result.insertedCount} 個用戶，${result.invalidIds.length} 個用戶不存在`
                    : `成功發送給 ${result.insertedCount} 個用戶`
            });
        }
        
        // 單個用戶或全部用戶模式
        const result = db.prepare(`
            INSERT INTO notifications (
                title, content, type, target_users, user_id, 
                start_at, end_at, is_active, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            title, content, type || 'info', target_users || 'all', 
            target_users === 'specific' ? user_id : null,
            start_at || null, end_at || null, 
            is_active !== undefined ? is_active : 1, adminId
        );
        
        logger.info(`管理員 ${adminId} 創建通知: ${title}, 目標: ${target_users}`);
        
        res.json({ 
            success: true, 
            data: { id: result.lastInsertRowid }
        });
        
    } catch (error) {
        logger.error('創建通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取在線用戶列表 ====================
router.get('/online-users', (req, res) => {
    try {
        const db = getDb();
        
        const onlineUsers = db.prepare(`
            SELECT 
                u.id as userId, 
                u.username, 
                u.email, 
                u.last_active_at as lastActive
            FROM users u
            WHERE u.last_active_at IS NOT NULL 
              AND u.last_active_at >= datetime('now', '-5 minutes')
              AND u.status = 'active'
            ORDER BY u.last_active_at DESC
            LIMIT 50
        `).all();
        
        res.json({ success: true, data: onlineUsers });
    } catch (error) {
        console.error('獲取在線用戶失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取所有用戶列表（用於選擇）====================
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
            WHERE 1=1
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
        
        // 獲取總數
        let countSql = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
        const countParams = [];
        if (search) {
            countSql += ' AND (u.username LIKE ? OR u.email LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (status === 'online') {
            countSql += ' AND u.last_active_at IS NOT NULL AND u.last_active_at >= datetime(\'now\', \'-5 minutes\')';
        } else if (status === 'offline') {
            countSql += ' AND (u.last_active_at IS NULL OR u.last_active_at < datetime(\'now\', \'-5 minutes\'))';
        }
        
        const total = db.prepare(countSql).get(...countParams);
        
        sql += ' ORDER BY u.id LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const users = db.prepare(sql).all(...params);
        
        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.total,
                pages: Math.ceil(total.total / limit)
            }
        });
    } catch (error) {
        console.error('獲取用戶列表失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取單個通知 ====================
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true, data: notification });
    } catch (error) {
        logger.error('獲取通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 更新通知 ====================
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { title, content, type, target_users, user_id, is_active, start_at, end_at } = req.body;
    const db = getDb();
    
    if (!title || !content) {
        return res.status(400).json({ success: false, error: '標題和內容不能為空' });
    }
    
    try {
        const result = db.prepare(`
            UPDATE notifications SET
                title = ?, content = ?, type = ?,
                target_users = ?, user_id = ?,
                is_active = ?, start_at = ?, end_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            title, content, type, target_users || 'all', 
            target_users === 'specific' ? user_id : null,
            is_active, start_at || null, end_at || null, id
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('更新通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 刪除通知 ====================
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        // 使用事務確保數據一致性
        const transaction = db.transaction(() => {
            // 先刪除關聯的已讀記錄
            db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(id);
            // 再刪除通知
            const result = db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
            return result;
        });
        
        const result = transaction();
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('刪除通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量刪除通知 ====================
router.delete('/batch', (req, res) => {
    const { notificationIds } = req.body;
    const db = getDb();
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: '請提供要刪除的通知ID列表' });
    }
    
    try {
        const transaction = db.transaction((ids) => {
            let deletedCount = 0;
            for (const id of ids) {
                // 先刪除關聯的已讀記錄
                db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(id);
                // 再刪除通知
                const result = db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
                if (result.changes > 0) deletedCount++;
            }
            return deletedCount;
        });
        
        const deletedCount = transaction(notificationIds);
        
        res.json({ success: true, message: `成功刪除 ${deletedCount} 條通知` });
    } catch (error) {
        logger.error('批量刪除通知失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;