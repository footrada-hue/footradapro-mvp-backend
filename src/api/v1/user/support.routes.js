// src/api/v1/user/support.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { auth } from '../../../middlewares/auth.middleware.js';
import supportService from '../../../services/support.service.js';
import geoService from '../../../services/geo.service.js';
import logger from '../../../utils/logger.js';
import telegramService from '../../../services/telegram.service.js';
import uploadService from '../../../services/upload.service.js';

const router = express.Router();

// 使用 auth 中间件进行认证
router.use(auth);

// 辅助函数：从请求中获取用户ID（auth 中间件已经设置了 req.user）
function getUserIdFromRequest(req) {
    // auth 中间件已经设置了 req.user
    if (req.user && req.user.id) {
        console.log('✅ 从 req.user.id 获取 userId:', req.user.id);
        return req.user.id;
    }
    
    // 备选：从 session 获取
    if (req.session && req.session.userId) {
        console.log('✅ 从 session 获取 userId:', req.session.userId);
        return req.session.userId;
    }
    
    console.log('❌ 无法获取 userId');
    return null;
}

/**
 * POST /api/v1/user/support/init
 * 初始化客服会话
 */
router.post('/init', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { name, email } = req.body;
        const clientIP = geoService.getClientIP(req);
        const geoLocation = geoService.getLocationFromIP(clientIP);
        
        logger.info(`[API] Support init - User: ${userId}, IP: ${clientIP}, Country: ${geoLocation.country_name}`);
        
        const conversation = await supportService.getOrCreateConversation(userId, {
            name: name || 'User',
            email: email || ''
        }, clientIP, geoLocation);
        
        const messages = await supportService.getMessages(conversation.id, 50);
        
        res.json({
            success: true,
            data: {
                conversation: {
                    id: conversation.id,
                    user_id: conversation.user_id,
                    status: conversation.status,
                    created_at: conversation.created_at
                },
                messages,
                geo: {
                    country: geoLocation.country_name,
                    city: geoLocation.city,
                    is_local: geoLocation.is_local
                }
            }
        });
    } catch (error) {
        logger.error(`[API] Support init error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/user/support/message
 * 发送客服消息 - 强制发送 Telegram 通知
 */
router.post('/message', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'User not authenticated'
            });
        }
        
        const { convId, content, attachments } = req.body;
        
        if (!convId) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation ID'
            });
        }
        
        const hasContent = content && content.trim();
        const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
        
        if (!hasContent && !hasAttachments) {
            return res.status(400).json({
                success: false,
                error: 'No content or attachments provided'
            });
        }
        
        if (hasContent && content.trim().length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Message content cannot exceed 5000 characters'
            });
        }
        
        logger.info(`[API] Send message - User: ${userId}, Conv: ${convId}, Has attachments: ${hasAttachments}`);
        
        let message;
        if (hasAttachments) {
            // 使用带附件的方法
            message = await supportService.addMessageWithAttachments(
                convId, 
                userId, 
                hasContent ? content.trim() : '', 
                'user', 
                attachments
            );
        } else {
            message = await supportService.addUserMessage(convId, userId, content.trim());
        }
        
        // 异步发送 Telegram 通知
        setImmediate(async () => {
            try {
                const db = supportService.getDb();
                const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
                
                let displayName = 'User';
                if (user?.username && user.username !== '') {
                    displayName = user.username;
                } else if (user?.email && user.email !== '') {
                    displayName = user.email.split('@')[0];
                }
                
                const conversation = await supportService.getConversationById(convId);
                
                await telegramService.notifyNewMessage(
                    { username: displayName, email: user?.email },
                    content || '[Attachment]',
                    convId,
                    conversation?.country_name
                );
                
                logger.info(`[API] Sent Telegram notification for conversation ${convId}, user: ${displayName}`);
            } catch (telegramError) {
                logger.error('[API] Telegram notification failed:', telegramError);
            }
        });
        
        res.json({
            success: true,
            data: {
                id: message.id,
                content: message.content,
                attachments: message.attachments ? (typeof message.attachments === 'string' ? JSON.parse(message.attachments) : message.attachments) : null,
                created_at: message.created_at
            }
        });
    } catch (error) {
        logger.error(`[API] Send message error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/user/support/messages
 * 获取会话消息列表
 */
router.get('/messages', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { convId, limit = 100 } = req.query;
        if (!convId) {
            return res.status(400).json({ success: false, error: 'Missing conversation ID' });
        }
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const messages = await supportService.getMessages(convId, parsedLimit);
        
        res.json({ success: true, data: messages });
    } catch (error) {
        logger.error(`[API] Get messages error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/user/support/conversations
 * 获取用户会话列表
 */
router.get('/conversations', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { limit = 50 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 50, 200);
        const conversations = await supportService.getUserConversations(userId, parsedLimit);
        
        res.json({ success: true, data: conversations });
    } catch (error) {
        logger.error(`[API] Get conversations error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/user/support/rate
 * 评价客服会话
 */
router.post('/rate', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { convId, score, comment } = req.body;
        
        if (!convId || !score || score < 1 || score > 5) {
            return res.status(400).json({
                success: false,
                error: 'Invalid parameters'
            });
        }
        
        await supportService.submitRating(convId, userId, score, comment || '');
        
        logger.info(`[API] User ${userId} rated conversation ${convId} with score ${score}`);
        
        res.json({
            success: true,
            message: 'Rating submitted successfully'
        });
    } catch (error) {
        logger.error(`[API] Rate error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/user/support/upload
 * Upload image/file for conversation
 */
router.post('/upload', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        // 使用 multer 中间件处理文件上传
        const uploadMiddleware = uploadService.getUploadMiddleware();
        
        uploadMiddleware(req, res, async (err) => {
            if (err) {
                logger.error(`[API] Upload error: ${err.message}`);
                return res.status(400).json({ success: false, error: err.message });
            }
            
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            
            // 从 req.body 获取 convId
            const convId = req.body.convId;
            
            if (!convId) {
                logger.error(`[API] Missing convId. Body: ${JSON.stringify(req.body)}`);
                if (req.file && req.file.filename) {
                    uploadService.deleteFile(req.file.filename);
                }
                return res.status(400).json({ success: false, error: 'Missing conversation ID' });
            }
            
            try {
                const fileInfo = uploadService.getFileInfo(req.file);
                
                if (!fileInfo) {
                    return res.status(400).json({ success: false, error: 'Failed to process file' });
                }
                
                logger.info(`[API] User ${userId} uploaded file: ${fileInfo.filename} for conversation ${convId}`);
                
                res.json({
                    success: true,
                    data: {
                        url: fileInfo.url,
                        filename: fileInfo.originalName,
                        type: fileInfo.type,
                        size: fileInfo.size,
                        convId: convId
                    },
                    message: 'File uploaded successfully'
                });
            } catch (error) {
                logger.error(`[API] Upload processing error: ${error.message}`);
                if (req.file && req.file.filename) {
                    uploadService.deleteFile(req.file.filename);
                }
                res.status(500).json({ success: false, error: error.message || 'Failed to process upload' });
            }
        });
    } catch (error) {
        logger.error(`[API] Upload route error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload file' });
    }
});

export default router;