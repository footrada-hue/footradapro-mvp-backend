import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import supportService from '../services/support.service.js';

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

        // 用户加入房间
        socket.on('join-conversation', async (data) => {
            const { convId, userId, role } = data;
            if (convId) {
                socket.join(`conv-${convId}`);
                socket.userId = userId;
                socket.convId = convId;
                socket.role = role;
                
                logger.info(`[Socket] ${role} ${userId} joined conversation ${convId}`);
                
                socket.to(`conv-${convId}`).emit('user-joined', {
                    userId,
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
                const userId = socket.userId;
                const role = socket.role;
                
                let message;
                
                if (role === 'user') {
                    message = await supportService.addUserMessage(convId, userId, content);
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