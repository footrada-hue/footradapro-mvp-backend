import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import supportService from '../services/support.service.js';
import telegramService from '../services/telegram.service.js';

let io = null;

export function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        logger.info(`[Socket] Client connected: ${socket.id}`);

        // ========== 兼容前端的 join 事件 ==========
        socket.on('join', async (data) => {
            const { roomId, userId, role } = data;
            console.log('🔍 [Socket] join 事件收到:', { roomId, userId, role });
            
            if (roomId) {
                socket.join(roomId);
                console.log(`✅ Socket ${socket.id} joined room: ${roomId}`);
            }
            
            if (userId) {
                socket.join(`user_${userId}`);
                console.log(`✅ Socket ${socket.id} joined user_${userId}`);
                socket.userId = userId;
            }
            
            if (role === 'admin') {
                socket.join('admin-support');
                console.log(`✅ Socket ${socket.id} joined admin-support`);
            }
            
            socket.role = role;
        });
        // =========================================

        // 用户加入房间
        socket.on('join-conversation', async (data) => {
            const { convId, userId, role } = data;
            
            console.log('🔍 [Socket] join-conversation 收到:', { convId, userId, role });
            
            // 如果没有 userId，从数据库查询
            let finalUserId = userId;
            if (!finalUserId && convId) {
                try {
                    const db = supportService.getDb();
                    const conv = db.prepare('SELECT user_id FROM support_conversations WHERE id = ?').get(convId);
                    if (conv && conv.user_id) {
                        finalUserId = conv.user_id;
                        console.log('🔍 [Socket] 从数据库查询到 userId:', finalUserId);
                    }
                } catch (err) {
                    console.error('查询 userId 失败:', err);
                }
            }
            
            if (convId) {
                socket.join(`conv-${convId}`);
                socket.userId = finalUserId;
                socket.convId = convId;
                socket.role = role;
                
                logger.info(`[Socket] ${role} ${finalUserId} joined conversation ${convId}`);
                
                socket.to(`conv-${convId}`).emit('user-joined', {
                    userId: finalUserId,
                    role,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // 用户离开房间
        socket.on('leave-conversation', (data) => {
            const { convId } = data;
            if (convId) {
                socket.leave(`conv-${convId}`);
                logger.info(`[Socket] User left conversation ${convId}`);
            }
        });

        // 发送消息
        socket.on('send-message', async (data, callback) => {
            try {
                const { convId, content, type = 'text', attachments = [] } = data;
                let userId = socket.userId;
                const role = socket.role;
                
                console.log('🔍 [Socket] send-message 收到:', { convId, content, userId, role });
                
                // 如果 socket.userId 为空，从数据库查询
                if (!userId && convId) {
                    try {
                        const db = supportService.getDb();
                        const conv = db.prepare('SELECT user_id FROM support_conversations WHERE id = ?').get(convId);
                        if (conv && conv.user_id) {
                            userId = conv.user_id;
                            socket.userId = userId;
                            console.log('🔍 [Socket] 从数据库查询到 userId (send):', userId);
                        }
                    } catch (err) {
                        console.error('查询 userId 失败:', err);
                    }
                }
                
                let message;
                
                if (role === 'user') {
                    if (!userId) {
                        console.error('[Socket] Cannot send message: userId is undefined');
                        if (callback) callback({ success: false, error: 'User ID not found' });
                        return;
                    }
                    
                    message = await supportService.addUserMessage(convId, userId, content);
                    
                    // ========== 添加 Telegram 通知 ==========
                    setImmediate(async () => {
                        try {
                            const onlineCount = supportService.getOnlineAdminCount();
                            console.log(`📊 [Socket] onlineCount = ${onlineCount}`);
                            
                            if (onlineCount === 0) {
                                const db = supportService.getDb();
                                const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
                                
                                console.log('🔍 [Socket] 用户信息:', user);
                                
                                let displayName = 'User';
                                if (user?.username && user.username !== '') {
                                    displayName = user.username;
                                } else if (user?.email && user.email !== '') {
                                    displayName = user.email.split('@')[0];
                                }
                                
                                const conversation = supportService.getConversationById(convId);
                                
                                await telegramService.notifyNewMessage(
                                    { username: displayName, email: user?.email },
                                    content,
                                    convId,
                                    conversation?.country_name
                                );
                                
                                console.log(`✅ [Socket] No online admin, sent Telegram notification for conversation ${convId}, user: ${displayName}`);
                            } else {
                                console.log(`⏭️ [Socket] ${onlineCount} admin(s) online, skip Telegram`);
                            }
                        } catch (telegramError) {
                            console.error('❌ [Socket] Telegram notification failed:', telegramError);
                            logger.error('[Socket] Telegram notification failed:', telegramError);
                        }
                    });
                    // ========== 添加结束 ==========
                    
                } else if (role === 'admin') {
                    message = await supportService.addAdminMessage(convId, userId, content);
                } else {
                    throw new Error('Invalid role');
                }
                
                // 如果有附件，更新消息的附件字段
                if (attachments.length > 0 && message) {
                    const db = supportService.getDb();
                    db.prepare(`
                        UPDATE support_messages 
                        SET attachments = ? 
                        WHERE id = ?
                    `).run(JSON.stringify(attachments), message.id);
                    message.attachments = JSON.stringify(attachments);
                }
                
                // 广播消息到房间所有人
                io.to(`conv-${convId}`).emit('new-message', {
                    ...message,
                    sender_type: role,
                    content_type: type,
                    attachments
                });
                
                if (callback) callback({ success: true, data: message });
                
            } catch (error) {
                logger.error('[Socket] Send message error:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // 标记已读
        socket.on('mark-read', async (data) => {
            const { convId, userId, role } = data;
            try {
                if (role === 'user') {
                    await supportService.markMessagesAsRead(convId, userId, 'user');
                } else if (role === 'admin') {
                    await supportService.markMessagesAsRead(convId, null, 'admin');
                }
                
                socket.to(`conv-${convId}`).emit('message-read', {
                    userId,
                    role,
                    convId,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('[Socket] Mark read error:', error);
            }
        });

        // 用户正在输入
        socket.on('typing', (data) => {
            const { convId, isTyping, role, userName } = data;
            if (convId) {
                socket.to(`conv-${convId}`).emit('user-typing', {
                    convId,
                    isTyping,
                    role,
                    userName,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // 断线
        socket.on('disconnect', () => {
            logger.info(`[Socket] Client disconnected: ${socket.id}`);
            if (socket.convId) {
                io.to(`conv-${socket.convId}`).emit('user-left', {
                    userId: socket.userId,
                    role: socket.role,
                    timestamp: new Date().toISOString()
                });
            }
        });
    });

    return io;
}

export function getIO() {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
}

// 兼容旧版调用（小写 getIo）
export const getIo = getIO;

// 同时导出默认对象
export default { getIO, getIo };