import database from '../database/connection.js';
import { getIO } from '../socket/index.js';
import logger from '../utils/logger.js';

class SupportService {
    getDb() {
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

    getOrCreateConversation(userId, userInfo = {}, ipAddress = null, geoInfo = null) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            let conversation = db.prepare(`
                SELECT * FROM support_conversations 
                WHERE user_id = ? AND status = 'open'
                ORDER BY created_at DESC LIMIT 1
            `).get(userId);
            
            if (!conversation) {
                const result = db.prepare(`
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
                
                conversation = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get(result.lastInsertRowid);
                
                this.addSystemMessage(conversation.id, '✨ Welcome! How can we help you today?');
                
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
    
    addSystemMessage(convId, content) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            const stmt = db.prepare(`
                INSERT INTO support_messages (conv_id, sender_type, content, created_at)
                VALUES (?, 'system', ?, ?)
            `);
            const info = stmt.run(convId, content, now);
            return db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
        } catch (error) {
            logger.error('[SupportService] addSystemMessage error:', error);
            throw error;
        }
    }
    
    addUserMessage(convId, userId, content) {
        try {
            console.log('🔍 [addUserMessage] 被调用');
            console.log('🔍 convId:', convId);
            console.log('🔍 userId:', userId);
            console.log('🔍 content:', content);
            
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
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
            
            // ========== WebSocket 广播 ==========
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
                } else {
                    console.log('⚠️ WebSocket 未初始化');
                }
            } catch (wsErr) {
                console.error('WebSocket 广播失败:', wsErr.message);
            }
            // =================================
            
            return message;
        } catch (error) {
            logger.error('[SupportService] addUserMessage error:', error);
            throw error;
        }
    }
    
    addAdminMessage(convId, adminId, content) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
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
            
            const message = db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
            
            // ========== WebSocket 广播 ==========
            try {
                const io = getIO();
                if (io && message.conv_id) {
                    const conversation = db.prepare('SELECT user_id FROM support_conversations WHERE id = ?').get(message.conv_id);
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
            // =================================
            
            return message;
        } catch (error) {
            logger.error('[SupportService] addAdminMessage error:', error);
            throw error;
        }
    }
    
    getMessages(convId, limit = 100) {
        try {
            const db = this.getDb();
            return db.prepare(`
                SELECT id, conv_id, sender_type, sender_id, content, content_type, attachments, is_read, read_at, created_at
                FROM support_messages 
                WHERE conv_id = ? 
                ORDER BY created_at ASC 
                LIMIT ?
            `).all(convId, limit);
        } catch (error) {
            logger.error('[SupportService] getMessages error:', error);
            throw error;
        }
    }
    
    getUserConversations(userId, limit = 50) {
        try {
            const db = this.getDb();
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
        } catch (error) {
            logger.error('[SupportService] getUserConversations error:', error);
            throw error;
        }
    }
    
    getAllConversations(filters = {}, limit = 100, offset = 0) {
        try {
            const db = this.getDb();
            
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
            
            if (filters.status) {
                sql += ' AND c.status = ?';
                params.push(filters.status);
            }
            
            if (filters.user_id) {
                sql += ' AND c.user_id = ?';
                params.push(filters.user_id);
            }
            
            sql += ` ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const conversations = db.prepare(sql).all(...params);
            
            const total = db.prepare('SELECT COUNT(*) as total FROM support_conversations').get();
            
            return {
                data: conversations,
                total: total.total,
                limit,
                offset
            };
        } catch (error) {
            logger.error('[SupportService] getAllConversations error:', error);
            throw error;
        }
    }
    
    updateConversationStatus(convId, status, adminId = null) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
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
            
            return true;
        } catch (error) {
            logger.error('[SupportService] updateConversationStatus error:', error);
            throw error;
        }
    }
    
    getStats() {
        try {
            const db = this.getDb();
            const today = new Date().toISOString().split('T')[0];
            
            const stats = db.prepare(`
                SELECT 
                    (SELECT COUNT(*) FROM support_conversations) as total_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'open') as open_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'resolved') as resolved_conversations,
                    (SELECT COUNT(*) FROM support_conversations WHERE status = 'closed') as closed_conversations,
                    (SELECT COUNT(*) FROM support_messages) as total_messages,
                    (SELECT ROUND(AVG(score), 1) FROM support_ratings) as avg_rating,
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
        } catch (error) {
            logger.error('[SupportService] getStats error:', error);
            throw error;
        }
    }
    
    markMessagesAsRead(convId, userId, senderType = 'user') {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            db.prepare(`
                UPDATE support_messages 
                SET is_read = 1, read_at = ?
                WHERE conv_id = ? AND sender_type != ? AND is_read = 0
            `).run(now, convId, senderType);
            return true;
        } catch (error) {
            logger.error('[SupportService] markMessagesAsRead error:', error);
            throw error;
        }
    }
    
    submitRating(convId, userId, score, comment = '') {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            const existing = db.prepare('SELECT id FROM support_ratings WHERE conv_id = ?').get(convId);
            
            if (existing) {
                db.prepare(`UPDATE support_ratings SET score = ?, comment = ? WHERE conv_id = ?`).run(score, comment, convId);
            } else {
                db.prepare(`
                    INSERT INTO support_ratings (conv_id, user_id, score, comment, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(convId, userId, score, comment, now);
            }
            
            return true;
        } catch (error) {
            logger.error('[SupportService] submitRating error:', error);
            throw error;
        }
    }
    
    getTemplates(category = null) {
        try {
            const db = this.getDb();
            
            let sql = 'SELECT id, title, content, category FROM support_templates';
            const params = [];
            
            if (category) {
                sql += ' WHERE category = ?';
                params.push(category);
            }
            
            sql += ' ORDER BY created_at ASC';
            
            return db.prepare(sql).all(...params);
        } catch (error) {
            logger.error('[SupportService] getTemplates error:', error);
            return [];
        }
    }
    
    getConversationById(convId) {
        try {
            const db = this.getDb();
            return db.prepare(`
                SELECT c.*, u.username, u.email
                FROM support_conversations c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.id = ?
            `).get(convId);
        } catch (error) {
            logger.error('[SupportService] getConversationById error:', error);
            throw error;
        }
    }

    getUserUnreadCount(userId) {
        try {
            const db = this.getDb();
            const result = db.prepare(`
                SELECT COUNT(*) as count 
                FROM support_messages m
                JOIN support_conversations c ON m.conv_id = c.id
                WHERE c.user_id = ? 
                AND m.sender_type = 'admin' 
                AND m.is_read = 0
            `).get(userId);
            return result.count;
        } catch (error) {
            logger.error('[SupportService] getUserUnreadCount error:', error);
            return 0;
        }
    }

    getAdminUnreadStats() {
        try {
            const db = this.getDb();
            const stats = db.prepare(`
                SELECT 
                    c.id as conv_id,
                    c.user_id,
                    COUNT(m.id) as unread_count
                FROM support_conversations c
                LEFT JOIN support_messages m ON m.conv_id = c.id 
                    AND m.sender_type = 'user' 
                    AND m.is_read = 0
                WHERE c.status = 'open'
                GROUP BY c.id
                HAVING unread_count > 0
                ORDER BY MAX(m.created_at) DESC
            `).all();
            return stats;
        } catch (error) {
            logger.error('[SupportService] getAdminUnreadStats error:', error);
            return [];
        }
    }

    getAdminTotalUnread() {
        try {
            const db = this.getDb();
            const result = db.prepare(`
                SELECT COUNT(*) as count 
                FROM support_messages m
                JOIN support_conversations c ON m.conv_id = c.id
                WHERE m.sender_type = 'user' 
                AND m.is_read = 0
                AND c.status = 'open'
            `).get();
            return result.count;
        } catch (error) {
            logger.error('[SupportService] getAdminTotalUnread error:', error);
            return 0;
        }
    }

    addMessageWithAttachments(convId, userId, content, senderType, attachments = []) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            const stmt = db.prepare(`
                INSERT INTO support_messages 
                (conv_id, sender_type, sender_id, content, attachments, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const info = stmt.run(convId, senderType, userId, content, JSON.stringify(attachments), now);
            
            db.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?').run(now, convId);
            
            return db.prepare('SELECT * FROM support_messages WHERE rowid = ?').get(info.lastInsertRowid);
        } catch (error) {
            logger.error('[SupportService] addMessageWithAttachments error:', error);
            throw error;
        }
    }

    markConversationMessagesRead(convId, adminId = null) {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
            const result = db.prepare(`
                UPDATE support_messages 
                SET is_read = 1, read_at = ?
                WHERE conv_id = ? AND sender_type = 'user' AND is_read = 0
            `).run(now, convId);
            
            if (result.changes > 0 && adminId) {
                logger.info(`[SupportService] Admin ${adminId} marked ${result.changes} messages as read in conversation ${convId}`);
            }
            
            return result.changes;
        } catch (error) {
            logger.error('[SupportService] markConversationMessagesRead error:', error);
            throw error;
        }
    }
    
    getAdminStatus(adminId) {
        try {
            const db = this.getDb();
            const admin = db.prepare(`
                SELECT is_online, status, last_active_at 
                FROM support_admins 
                WHERE admin_id = ?
            `).get(adminId);
            
            if (!admin) {
                return { is_online: false, status: 'offline', last_active_at: null };
            }
            return admin;
        } catch (error) {
            logger.error('[SupportService] getAdminStatus error:', error);
            return { is_online: false, status: 'offline', last_active_at: null };
        }
    }

    updateAdminStatus(adminId, isOnline, status = 'online') {
        try {
            const db = this.getDb();
            const now = this.getCurrentTimestamp();
            
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
            
            logger.info(`[SupportService] Admin ${adminId} status: ${status}, online: ${isOnline}`);
            return true;
        } catch (error) {
            logger.error('[SupportService] updateAdminStatus error:', error);
            return false;
        }
    }
    
    getOnlineAdminCount() {
        try {
            const db = this.getDb();
            const result = db.prepare(`
                SELECT COUNT(*) as count 
                FROM support_admins 
                WHERE is_online = 1
            `).get();
            return result.count;
        } catch (error) {
            logger.error('[SupportService] getOnlineAdminCount error:', error);
            return 0;
        }
    }
}

export default new SupportService();