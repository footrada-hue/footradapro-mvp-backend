// src/services/support.service.js
import database from '../database/connection.js';
import { getIO } from '../socket/index.js';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

class SupportService {
    async getDb() {
        try {
            if (typeof database.get === 'function') {
                return database.get();
            }
            return database;
        } catch (error) {
            logger.error('[SupportService] Failed to get database connection:', error);
            throw error;
        }
    }

    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    async query(sql, params = []) {
        if (isProduction) {
            const { query } = await import('../database/connection.js');
            return query(sql, params);
        } else {
            const db = await this.getDb();
            if (sql.toLowerCase().includes('select')) {
                return db.prepare(sql).all(...params);
            } else {
                const stmt = db.prepare(sql);
                const result = stmt.run(...params);
                return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
            }
        }
    }

    async getOrCreateConversation(userId, userInfo = {}, ipAddress = null, geoInfo = null) {
        try {
            const now = this.getCurrentTimestamp();
            
            let conversation = null;
            
            if (isProduction) {
                const result = await this.query(`
                    SELECT * FROM support_conversations 
                    WHERE user_id = $1 AND status = 'open'
                    ORDER BY created_at DESC LIMIT 1
                `, [userId]);
                conversation = result?.[0] || null;
            } else {
                const db = await this.getDb();
                conversation = db.prepare(`
                    SELECT * FROM support_conversations 
                    WHERE user_id = ? AND status = 'open'
                    ORDER BY created_at DESC LIMIT 1
                `).get(userId);
            }
            
            if (!conversation) {
                let newId = null;
                
                if (isProduction) {
                    const insertResult = await this.query(`
                        INSERT INTO support_conversations 
                        (user_id, visitor_name, visitor_email, status, ip_address, country_code, country_name, city, region, timezone, created_at, updated_at)
                        VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11)
                        RETURNING id
                    `, [
                        userId, 
                        userInfo.name || 'User', 
                        userInfo.email || null,
                        ipAddress,
                        geoInfo?.country_code || null,
                        geoInfo?.country_name || null,
                        geoInfo?.city || null,
                        geoInfo?.region || null,
                        geoInfo?.timezone || null,
                        now, 
                        now
                    ]);
                    newId = insertResult?.[0]?.id;
                    
                    const convResult = await this.query('SELECT * FROM support_conversations WHERE id = $1', [newId]);
                    conversation = convResult?.[0] || null;
                } else {
                    const db = await this.getDb();
                    const insertResult = db.prepare(`
                        INSERT INTO support_conversations 
                        (user_id, visitor_name, visitor_email, status, ip_address, country_code, country_name, city, region, timezone, created_at, updated_at)
                        VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        userId, 
                        userInfo.name || 'User', 
                        userInfo.email || null,
                        ipAddress,
                        geoInfo?.country_code || null,
                        geoInfo?.country_name || null,
                        geoInfo?.city || null,
                        geoInfo?.region || null,
                        geoInfo?.timezone || null,
                        now, 
                        now
                    );
                    newId = insertResult.lastInsertRowid;
                    conversation = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get(newId);
                }
                
                await this.addSystemMessage(conversation.id, '✨ Welcome! How can we help you today?');
                
                if (geoInfo && geoInfo.country_name && geoInfo.country_name !== 'Unknown') {
                    logger.info(`[SupportService] New conversation from ${geoInfo.country_name}${geoInfo.city ? ` (${geoInfo.city})` : ''}`);
                }
            }
            
            return conversation;
        } catch (error) {
            logger.error('[SupportService] getOrCreateConversation error:', error);
            throw error;
        }
    }
    
    async addSystemMessage(convId, content) {
        try {
            const now = this.getCurrentTimestamp();
            let message = null;
            
            if (isProduction) {
                const insertResult = await this.query(`
                    INSERT INTO support_messages (conv_id, sender_type, content, created_at)
                    VALUES ($1, 'system', $2, $3)
                    RETURNING id
                `, [convId, content, now]);
                const newId = insertResult?.[0]?.id;
                const msgResult = await this.query('SELECT * FROM support_messages WHERE id = $1', [newId]);
                message = msgResult?.[0] || null;
            } else {
                const db = await this.getDb();
                const stmt = db.prepare(`
                    INSERT INTO support_messages (conv_id, sender_type, content, created_at)
                    VALUES (?, 'system', ?, ?)
                `);
                const info = stmt.run(convId, content, now);
                message = db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
            }
            return message;
        } catch (error) {
            logger.error('[SupportService] addSystemMessage error:', error);
            throw error;
        }
    }
    
    async addUserMessage(convId, userId, content) {
        try {
            console.log('🔍 [addUserMessage] 被调用');
            console.log('🔍 convId:', convId);
            console.log('🔍 userId:', userId);
            console.log('🔍 content:', content);
            
            const now = this.getCurrentTimestamp();
            
            if (isProduction) {
                const convResult = await this.query('SELECT id FROM support_conversations WHERE id = $1', [convId]);
                if (!convResult || convResult.length === 0) {
                    throw new Error(`Conversation ${convId} not found`);
                }
                
                const insertResult = await this.query(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, created_at)
                    VALUES ($1, 'user', $2, $3, $4)
                    RETURNING id
                `, [convId, userId, content, now]);
                const newId = insertResult?.[0]?.id;
                
                await this.query('UPDATE support_conversations SET updated_at = $1 WHERE id = $2', [now, convId]);
                
                const msgResult = await this.query('SELECT * FROM support_messages WHERE id = $1', [newId]);
                const message = msgResult?.[0] || null;
                
                logger.info(`[SupportService] User ${userId} sent message in conversation ${convId}`);
                
                // WebSocket 广播
                try {
                    const io = getIO();
                    if (io) {
                        io.to('admin-support').emit('new-message', {
                            id: message.id,
                            conv_id: convId,
                            content: message.content,
                            sender_type: 'user',
                            sender_id: userId,
                            created_at: message.created_at
                        });
                        console.log(`📡 WebSocket 广播消息到 admin-support 房间`);
                    }
                } catch (wsErr) {
                    console.error('WebSocket 广播失败:', wsErr.message);
                }
                
                return message;
            } else {
                const db = await this.getDb();
                const conv = db.prepare('SELECT id FROM support_conversations WHERE id = ?').get(convId);
                if (!conv) {
                    throw new Error(`Conversation ${convId} not found`);
                }
                
                const stmt = db.prepare(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, created_at)
                    VALUES (?, 'user', ?, ?, ?)
                `);
                const info = stmt.run(convId, userId, content, now);
                
                db.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?').run(now, convId);
                
                const message = db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
                
                logger.info(`[SupportService] User ${userId} sent message in conversation ${convId}`);
                
                try {
                    const io = getIO();
                    if (io) {
                        io.to('admin-support').emit('new-message', {
                            id: message.id,
                            conv_id: convId,
                            content: message.content,
                            sender_type: 'user',
                            sender_id: userId,
                            created_at: message.created_at
                        });
                    }
                } catch (wsErr) {
                    console.error('WebSocket 广播失败:', wsErr.message);
                }
                
                return message;
            }
        } catch (error) {
            logger.error('[SupportService] addUserMessage error:', error);
            throw error;
        }
    }
    
    async addAdminMessage(convId, adminId, content) {
        try {
            const now = this.getCurrentTimestamp();
            let message = null;
            
            if (isProduction) {
                const insertResult = await this.query(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, created_at)
                    VALUES ($1, 'admin', $2, $3, $4)
                    RETURNING id
                `, [convId, adminId, content, now]);
                const newId = insertResult?.[0]?.id;
                
                await this.query('UPDATE support_conversations SET updated_at = $1 WHERE id = $2', [now, convId]);
                
                const convResult = await this.query('SELECT first_response_at FROM support_conversations WHERE id = $1', [convId]);
                if ((!convResult || convResult.length === 0 || !convResult[0].first_response_at)) {
                    await this.query('UPDATE support_conversations SET first_response_at = $1 WHERE id = $2', [now, convId]);
                }
                
                const msgResult = await this.query('SELECT * FROM support_messages WHERE id = $1', [newId]);
                message = msgResult?.[0] || null;
            } else {
                const db = await this.getDb();
                const stmt = db.prepare(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, created_at)
                    VALUES (?, 'admin', ?, ?, ?)
                `);
                const info = stmt.run(convId, adminId, content, now);
                
                db.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?').run(now, convId);
                
                const conv = db.prepare('SELECT first_response_at FROM support_conversations WHERE id = ?').get(convId);
                if (!conv || !conv.first_response_at) {
                    db.prepare('UPDATE support_conversations SET first_response_at = ? WHERE id = ?').run(now, convId);
                }
                
                message = db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
            }
            
            // WebSocket 广播
            try {
                const io = getIO();
                if (io && message && message.conv_id) {
                    let conversation = null;
                    if (isProduction) {
                        const convResult = await this.query('SELECT user_id FROM support_conversations WHERE id = $1', [message.conv_id]);
                        conversation = convResult?.[0] || null;
                    } else {
                        const db = await this.getDb();
                        conversation = db.prepare('SELECT user_id FROM support_conversations WHERE id = ?').get(message.conv_id);
                    }
                    if (conversation) {
                        io.to(`user_${conversation.user_id}`).emit('new-message', {
                            id: message.id,
                            conv_id: message.conv_id,
                            content: message.content,
                            sender_type: 'admin',
                            sender_id: adminId,
                            created_at: message.created_at
                        });
                        console.log(`📡 WebSocket 广播消息到用户 ${conversation.user_id}`);
                    }
                }
            } catch (wsErr) {
                console.error('WebSocket 广播失败:', wsErr.message);
            }
            
            return message;
        } catch (error) {
            logger.error('[SupportService] addAdminMessage error:', error);
            throw error;
        }
    }
    
    async getMessages(convId, limit = 100) {
        try {
            if (isProduction) {
                return await this.query(`
                    SELECT id, conv_id, sender_type, sender_id, content, content_type, attachments, is_read, read_at, created_at
                    FROM support_messages 
                    WHERE conv_id = $1 
                    ORDER BY created_at ASC 
                    LIMIT $2
                `, [convId, limit]);
            } else {
                const db = await this.getDb();
                return db.prepare(`
                    SELECT id, conv_id, sender_type, sender_id, content, content_type, attachments, is_read, read_at, created_at
                    FROM support_messages 
                    WHERE conv_id = ? 
                    ORDER BY created_at ASC 
                    LIMIT ?
                `).all(convId, limit);
            }
        } catch (error) {
            logger.error('[SupportService] getMessages error:', error);
            throw error;
        }
    }
    
    async getUserConversations(userId, limit = 50) {
        try {
            if (isProduction) {
                return await this.query(`
                    SELECT c.*, 
                        (SELECT COUNT(*) FROM support_messages WHERE conv_id = c.id AND is_read = false AND sender_type = 'admin') as unread_count,
                        (SELECT content FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                        (SELECT created_at FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
                    FROM support_conversations c
                    WHERE c.user_id = $1
                    ORDER BY c.updated_at DESC
                    LIMIT $2
                `, [userId, limit]);
            } else {
                const db = await this.getDb();
                return db.prepare(`
                    SELECT c.*, 
                        (SELECT COUNT(*) FROM support_messages WHERE conv_id = c.id AND is_read = 0 AND sender_type = 'admin') as unread_count,
                        (SELECT content FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                        (SELECT created_at FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
                    FROM support_conversations c
                    WHERE c.user_id = ?
                    ORDER BY c.updated_at DESC
                    LIMIT ?
                `).all(userId, limit);
            }
        } catch (error) {
            logger.error('[SupportService] getUserConversations error:', error);
            throw error;
        }
    }
    
    async getAllConversations(filters = {}, limit = 100, offset = 0) {
        try {
            let sql = `
                SELECT 
                    c.*,
                    u.username,
                    u.email,
                    u.created_at as user_registered_at,
                    (SELECT COUNT(*) FROM support_messages WHERE conv_id = c.id) as message_count,
                    (SELECT content FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                    (SELECT created_at FROM support_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
                FROM support_conversations c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;
            
            if (filters.status) {
                if (isProduction) {
                    sql += ` AND c.status = $${paramIndex++}`;
                } else {
                    sql += ` AND c.status = ?`;
                }
                params.push(filters.status);
            }
            
            if (filters.user_id) {
                if (isProduction) {
                    sql += ` AND c.user_id = $${paramIndex++}`;
                } else {
                    sql += ` AND c.user_id = ?`;
                }
                params.push(filters.user_id);
            }
            
            if (isProduction) {
                sql += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
                params.push(limit, offset);
                
                const conversations = await this.query(sql, params);
                
                let total = 0;
                const totalResult = await this.query('SELECT COUNT(*) as total FROM support_conversations');
                total = parseInt(totalResult?.[0]?.total || 0);
                
                return { data: conversations, total, limit, offset };
            } else {
                sql += ` ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`;
                params.push(limit, offset);
                
                const db = await this.getDb();
                const conversations = db.prepare(sql).all(...params);
                const total = db.prepare('SELECT COUNT(*) as total FROM support_conversations').get();
                
                return { data: conversations, total: total.total, limit, offset };
            }
        } catch (error) {
            logger.error('[SupportService] getAllConversations error:', error);
            throw error;
        }
    }
    
    async updateConversationStatus(convId, status, adminId = null) {
        try {
            const now = this.getCurrentTimestamp();
            
            if (isProduction) {
                await this.query(`
                    UPDATE support_conversations 
                    SET status = $1, 
                        resolved_at = CASE WHEN $2 = 'resolved' THEN $3 ELSE resolved_at END,
                        updated_at = $4
                    WHERE id = $5
                `, [status, status, now, now, convId]);
                
                if (adminId) {
                    await this.query(`
                        INSERT INTO support_logs (admin_id, action, conv_id, created_at)
                        VALUES ($1, 'status_change', $2, $3)
                    `, [adminId, convId, now]);
                }
            } else {
                const db = await this.getDb();
                db.prepare(`
                    UPDATE support_conversations 
                    SET status = ?, 
                        resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END,
                        updated_at = ?
                    WHERE id = ?
                `).run(status, status, now, now, convId);
                
                if (adminId) {
                    db.prepare(`
                        INSERT INTO support_logs (admin_id, action, conv_id, created_at)
                        VALUES (?, 'status_change', ?, ?)
                    `).run(adminId, convId, now);
                }
            }
            
            return true;
        } catch (error) {
            logger.error('[SupportService] updateConversationStatus error:', error);
            throw error;
        }
    }
    
  async getStats() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        if (isProduction) {
            const result = await this.query(`
                SELECT 
                    (SELECT COUNT(*) FROM support_conversations) as total_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'open') as open_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'resolved') as resolved_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'closed') as closed_conversations,
                    (SELECT COUNT(*) FROM support_messages) as total_messages,
                    COALESCE((SELECT ROUND(AVG(score), 1) FROM support_ratings), 0) as avg_rating,
                    (SELECT COUNT(*) FROM support_messages WHERE DATE(created_at) = $1) as today_messages,
                    (SELECT COUNT(*) FROM support_conversations WHERE DATE(created_at) = $1) as today_conversations
            `, [today]);
            const stats = result?.[0] || {};
            
            return {
                total_conversations: parseInt(stats.total_conversations) || 0,
                open_conversations: parseInt(stats.open_conversations) || 0,
                resolved_conversations: parseInt(stats.resolved_conversations) || 0,
                closed_conversations: parseInt(stats.closed_conversations) || 0,
                total_messages: parseInt(stats.total_messages) || 0,
                avg_rating: parseFloat(stats.avg_rating) || 0,
                today_messages: parseInt(stats.today_messages) || 0,
                today_conversations: parseInt(stats.today_conversations) || 0
            };
        } else {
            const db = await this.getDb();
            const stats = db.prepare(`
                SELECT 
                    (SELECT COUNT(*) FROM support_conversations) as total_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'open') as open_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'resolved') as resolved_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'closed') as closed_conversations,
                    (SELECT COUNT(*) FROM support_messages) as total_messages,
                    COALESCE((SELECT ROUND(AVG(score), 1) FROM support_ratings), 0) as avg_rating,
                    (SELECT COUNT(*) FROM support_messages WHERE date(created_at) = ?) as today_messages,
                    (SELECT COUNT(*) FROM support_conversations WHERE date(created_at) = ?) as today_conversations
            `).get(today, today);
            
            return {
                total_conversations: stats.total_conversations || 0,
                open_conversations: stats.open_conversations || 0,
                resolved_conversations: stats.resolved_conversations || 0,
                closed_conversations: stats.closed_conversations || 0,
                total_messages: stats.total_messages || 0,
                avg_rating: stats.avg_rating || 0,
                today_messages: stats.today_messages || 0,
                today_conversations: stats.today_conversations || 0
            };
        }
    } catch (error) {
        logger.error('[SupportService] getStats error:', error);
        throw error;
    }
}
    async markMessagesAsRead(convId, userId, senderType = 'user') {
        try {
            const now = this.getCurrentTimestamp();
            
            if (isProduction) {
                await this.query(`
                    UPDATE support_messages 
                    SET is_read = true, read_at = $1
                    WHERE conv_id = $2 AND sender_type != $3 AND is_read = false
                `, [now, convId, senderType]);
            } else {
                const db = await this.getDb();
                db.prepare(`
                    UPDATE support_messages 
                    SET is_read = 1, read_at = ?
                    WHERE conv_id = ? AND sender_type != ? AND is_read = 0
                `).run(now, convId, senderType);
            }
            return true;
        } catch (error) {
            logger.error('[SupportService] markMessagesAsRead error:', error);
            throw error;
        }
    }
    
    async submitRating(convId, userId, score, comment = '') {
        try {
            const now = this.getCurrentTimestamp();
            
            if (isProduction) {
                const existing = await this.query('SELECT id FROM support_ratings WHERE conv_id = $1', [convId]);
                
                if (existing && existing.length > 0) {
                    await this.query(`UPDATE support_ratings SET score = $1, comment = $2 WHERE conv_id = $3`, [score, comment, convId]);
                } else {
                    await this.query(`
                        INSERT INTO support_ratings (conv_id, user_id, score, comment, created_at)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [convId, userId, score, comment, now]);
                }
            } else {
                const db = await this.getDb();
                const existing = db.prepare('SELECT id FROM support_ratings WHERE conv_id = ?').get(convId);
                
                if (existing) {
                    db.prepare(`UPDATE support_ratings SET score = ?, comment = ? WHERE conv_id = ?`).run(score, comment, convId);
                } else {
                    db.prepare(`
                        INSERT INTO support_ratings (conv_id, user_id, score, comment, created_at)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(convId, userId, score, comment, now);
                }
            }
            
            return true;
        } catch (error) {
            logger.error('[SupportService] submitRating error:', error);
            throw error;
        }
    }
    
    async getTemplates(category = null) {
        try {
            if (isProduction) {
                let sql = 'SELECT id, title, content, category FROM support_templates';
                const params = [];
                if (category) {
                    sql += ' WHERE category = $1';
                    params.push(category);
                }
                sql += ' ORDER BY created_at ASC';
                return await this.query(sql, params);
            } else {
                const db = await this.getDb();
                let sql = 'SELECT id, title, content, category FROM support_templates';
                const params = [];
                if (category) {
                    sql += ' WHERE category = ?';
                    params.push(category);
                }
                sql += ' ORDER BY created_at ASC';
                return db.prepare(sql).all(...params);
            }
        } catch (error) {
            logger.error('[SupportService] getTemplates error:', error);
            return [];
        }
    }
    
    async getConversationById(convId) {
        try {
            if (isProduction) {
                const result = await this.query(`
                    SELECT c.*, u.username, u.email
                    FROM support_conversations c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE c.id = $1
                `, [convId]);
                return result?.[0] || null;
            } else {
                const db = await this.getDb();
                return db.prepare(`
                    SELECT c.*, u.username, u.email
                    FROM support_conversations c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE c.id = ?
                `).get(convId);
            }
        } catch (error) {
            logger.error('[SupportService] getConversationById error:', error);
            throw error;
        }
    }

    async getUserUnreadCount(userId) {
        try {
            if (isProduction) {
                const result = await this.query(`
                    SELECT COUNT(*) as count 
                    FROM support_messages m
                    JOIN support_conversations c ON m.conv_id = c.id
                    WHERE c.user_id = $1 
                    AND m.sender_type = 'admin' 
                    AND m.is_read = false
                `, [userId]);
                return parseInt(result?.[0]?.count || 0);
            } else {
                const db = await this.getDb();
                const result = db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM support_messages m
                    JOIN support_conversations c ON m.conv_id = c.id
                    WHERE c.user_id = ? 
                    AND m.sender_type = 'admin' 
                    AND m.is_read = 0
                `).get(userId);
                return result.count;
            }
        } catch (error) {
            logger.error('[SupportService] getUserUnreadCount error:', error);
            return 0;
        }
    }

 async getAdminUnreadStats() {
    try {
        if (isProduction) {
            // PostgreSQL - 修复列名问题
            const result = await this.query(`
                SELECT 
                    c.id as conv_id,
                    c.user_id,
                    COUNT(m.id) as unread_count
                FROM support_conversations c
                LEFT JOIN support_messages m ON m.conv_id = c.id 
                    AND m.sender_type = 'user' 
                    AND m.is_read = false
                WHERE c.status = 'open'
                GROUP BY c.id, c.user_id
                HAVING COUNT(m.id) > 0
                ORDER BY MAX(m.created_at) DESC
            `);
            return result || [];
        } else {
            const db = await this.getDb();
            return db.prepare(`
                SELECT 
                    c.id as conv_id,
                    c.user_id,
                    COUNT(m.id) as unread_count
                FROM support_conversations c
                LEFT JOIN support_messages m ON m.conv_id = c.id 
                    AND m.sender_type = 'user' 
                    AND m.is_read = 0
                WHERE c.status = 'open'
                GROUP BY c.id, c.user_id
                HAVING COUNT(m.id) > 0
                ORDER BY MAX(m.created_at) DESC
            `).all();
        }
    } catch (error) {
        logger.error('[SupportService] getAdminUnreadStats error:', error);
        return [];
    }
}
    async getAdminTotalUnread() {
        try {
            if (isProduction) {
                const result = await this.query(`
                    SELECT COUNT(*) as count 
                    FROM support_messages m
                    JOIN support_conversations c ON m.conv_id = c.id
                    WHERE m.sender_type = 'user' 
                    AND m.is_read = false
                    AND c.status = 'open'
                `);
                return parseInt(result?.[0]?.count || 0);
            } else {
                const db = await this.getDb();
                const result = db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM support_messages m
                    JOIN support_conversations c ON m.conv_id = c.id
                    WHERE m.sender_type = 'user' 
                    AND m.is_read = 0
                    AND c.status = 'open'
                `).get();
                return result.count;
            }
        } catch (error) {
            logger.error('[SupportService] getAdminTotalUnread error:', error);
            return 0;
        }
    }

    async addMessageWithAttachments(convId, userId, content, senderType, attachments = []) {
        try {
            const now = this.getCurrentTimestamp();
            let message = null;
            
            if (isProduction) {
                const insertResult = await this.query(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, attachments, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                `, [convId, senderType, userId, content, JSON.stringify(attachments), now]);
                const newId = insertResult?.[0]?.id;
                
                await this.query('UPDATE support_conversations SET updated_at = $1 WHERE id = $2', [now, convId]);
                
                const msgResult = await this.query('SELECT * FROM support_messages WHERE id = $1', [newId]);
                message = msgResult?.[0] || null;
            } else {
                const db = await this.getDb();
                const stmt = db.prepare(`
                    INSERT INTO support_messages 
                    (conv_id, sender_type, sender_id, content, attachments, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                const info = stmt.run(convId, senderType, userId, content, JSON.stringify(attachments), now);
                
                db.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?').run(now, convId);
                
                message = db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
            }
            
            return message;
        } catch (error) {
            logger.error('[SupportService] addMessageWithAttachments error:', error);
            throw error;
        }
    }

    async markConversationMessagesRead(convId, adminId = null) {
        try {
            const now = this.getCurrentTimestamp();
            let changes = 0;
            
            if (isProduction) {
                const result = await this.query(`
                    UPDATE support_messages 
                    SET is_read = true, read_at = $1
                    WHERE conv_id = $2 AND sender_type = 'user' AND is_read = false
                `, [now, convId]);
                changes = result?.rowCount || 0;
                
                if (changes > 0 && adminId) {
                    logger.info(`[SupportService] Admin ${adminId} marked ${changes} messages as read in conversation ${convId}`);
                }
            } else {
                const db = await this.getDb();
                const result = db.prepare(`
                    UPDATE support_messages 
                    SET is_read = 1, read_at = ?
                    WHERE conv_id = ? AND sender_type = 'user' AND is_read = 0
                `).run(now, convId);
                changes = result.changes;
                
                if (changes > 0 && adminId) {
                    logger.info(`[SupportService] Admin ${adminId} marked ${changes} messages as read in conversation ${convId}`);
                }
            }
            
            return changes;
        } catch (error) {
            logger.error('[SupportService] markConversationMessagesRead error:', error);
            throw error;
        }
    }
    
    async getAdminStatus(adminId) {
        try {
            if (isProduction) {
                const result = await this.query(`
                    SELECT is_online, status, last_active_at 
                    FROM support_admins 
                    WHERE admin_id = $1
                `, [adminId]);
                const admin = result?.[0] || null;
                
                if (!admin) {
                    return { is_online: false, status: 'offline', last_active_at: null };
                }
                return { is_online: admin.is_online, status: admin.status, last_active_at: admin.last_active_at };
            } else {
                const db = await this.getDb();
                const admin = db.prepare(`
                    SELECT is_online, status, last_active_at 
                    FROM support_admins 
                    WHERE admin_id = ?
                `).get(adminId);
                
                if (!admin) {
                    return { is_online: false, status: 'offline', last_active_at: null };
                }
                return admin;
            }
        } catch (error) {
            logger.error('[SupportService] getAdminStatus error:', error);
            return { is_online: false, status: 'offline', last_active_at: null };
        }
    }

    async updateAdminStatus(adminId, isOnline, status = 'online') {
        try {
            const now = this.getCurrentTimestamp();
            
            if (isProduction) {
                const existing = await this.query('SELECT id FROM support_admins WHERE admin_id = $1', [adminId]);
                
                if (existing && existing.length > 0) {
                    await this.query(`
                        UPDATE support_admins 
                        SET is_online = $1, status = $2, last_active_at = $3
                        WHERE admin_id = $4
                    `, [isOnline, status, now, adminId]);
                } else {
                    await this.query(`
                        INSERT INTO support_admins (admin_id, is_online, status, last_active_at, created_at)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [adminId, isOnline, status, now, now]);
                }
            } else {
                const db = await this.getDb();
                const existing = db.prepare('SELECT id FROM support_admins WHERE admin_id = ?').get(adminId);
                
                if (existing) {
                    db.prepare(`
                        UPDATE support_admins 
                        SET is_online = ?, status = ?, last_active_at = ?
                        WHERE admin_id = ?
                    `).run(isOnline ? 1 : 0, status, now, adminId);
                } else {
                    db.prepare(`
                        INSERT INTO support_admins (admin_id, is_online, status, last_active_at, created_at)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(adminId, isOnline ? 1 : 0, status, now, now);
                }
            }
            
            logger.info(`[SupportService] Admin ${adminId} status: ${status}, online: ${isOnline}`);
            return true;
        } catch (error) {
            logger.error('[SupportService] updateAdminStatus error:', error);
            return false;
        }
    }
    
    async getOnlineAdminCount() {
        try {
            if (isProduction) {
                const result = await this.query(`
                    SELECT COUNT(*) as count 
                    FROM support_admins 
                    WHERE is_online = true
                `);
                return parseInt(result?.[0]?.count || 0);
            } else {
                const db = await this.getDb();
                const result = db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM support_admins 
                    WHERE is_online = 1
                `).get();
                return result.count;
            }
        } catch (error) {
            logger.error('[SupportService] getOnlineAdminCount error:', error);
            return 0;
        }
    }
}

export default new SupportService();