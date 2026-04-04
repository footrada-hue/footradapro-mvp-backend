import express from 'express';
import { auth } from '../../../middlewares/auth.middleware.js';
import supportService from '../../../services/support.service.js';
import geoService from '../../../services/geo.service.js';
import logger from '../../../utils/logger.js';
import telegramService from '../../../services/telegram.service.js';

const router = express.Router();

router.use(auth);

/**
 * POST /api/v1/user/support/init
 * Initialize support session
 */
router.post('/init', (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email } = req.body;
        
        const clientIP = geoService.getClientIP(req);
        const geoLocation = geoService.getLocationFromIP(clientIP);
        
        logger.info(`[API] Support init - User: ${userId}, IP: ${clientIP}, Country: ${geoLocation.country_name}`);
        
        const conversation = supportService.getOrCreateConversation(userId, {
            name: name || req.user.username || 'User',
            email: email || req.user.email || ''
        }, clientIP, geoLocation);
        
        const messages = supportService.getMessages(conversation.id, 50);
        
        res.json({
            success: true,
            data: {
                conversation: {
                    id: conversation.id,
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
        res.status(500).json({
            success: false,
            error: error.message || 'Initialization failed'
        });
    }
});

/**
 * GET /api/v1/user/support/templates
 * Get quick reply templates
 */
router.get('/templates', (req, res) => {
    try {
        const { category } = req.query;
        const templates = supportService.getTemplates(category || 'greeting');
        
        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        logger.error(`[API] Get templates error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to load templates'
        });
    }
});

/**
 * POST /api/v1/user/support/message
 * Send a message
 */
router.post('/message', (req, res) => {
    try {
        const userId = req.user.id;
        const { convId, content } = req.body;
        
        if (!convId || !content || !content.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: conversation ID and message content'
            });
        }
        
        if (content.trim().length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Message content cannot exceed 5000 characters'
            });
        }
        
        logger.info(`[API] Send message - User: ${userId}, Conv: ${convId}`);
        
        const message = supportService.addUserMessage(convId, userId, content.trim());
        
        // 异步检查是否有客服在线，如果没有则发送 Telegram 通知（不阻塞响应）
        setImmediate(async () => {
            try {
                const onlineCount = supportService.getOnlineAdminCount();
                
                if (onlineCount === 0) {
                    // 获取用户信息
                    const db = supportService.getDb();
                    const user = db.prepare('SELECT username, email FROM users WHERE id = ?').get(userId);
                    const conversation = supportService.getConversationById(convId);
                    
                    await telegramService.notifyNewMessage(
                        { username: user?.username || 'User', email: user?.email },
                        content,
                        convId,
                        conversation?.country_name
                    );
                    
                    logger.info(`[API] No online admin, sent Telegram notification for conversation ${convId}`);
                }
            } catch (telegramError) {
                logger.error('[API] Telegram notification failed:', telegramError);
            }
        });
        
        res.json({
            success: true,
            data: {
                id: message.id,
                content: message.content,
                created_at: message.created_at
            }
        });
    } catch (error) {
        logger.error(`[API] Send message error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send message'
        });
    }
});

/**
 * GET /api/v1/user/support/messages
 * Get conversation messages
 */
router.get('/messages', (req, res) => {
    try {
        const userId = req.user.id;
        const { convId, limit = 100 } = req.query;
        
        if (!convId) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation ID'
            });
        }
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const messages = supportService.getMessages(convId, parsedLimit);
        
        setImmediate(() => {
            try {
                supportService.markMessagesAsRead(convId, userId, 'user');
            } catch (err) {
                logger.error(`[API] Mark read error: ${err.message}`);
            }
        });
        
        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        logger.error(`[API] Get messages error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to load messages'
        });
    }
});

/**
 * GET /api/v1/user/support/conversations
 * Get user's conversation history
 */
router.get('/conversations', (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50 } = req.query;
        
        const parsedLimit = Math.min(parseInt(limit) || 50, 200);
        const conversations = supportService.getUserConversations(userId, parsedLimit);
        
        res.json({
            success: true,
            data: conversations
        });
    } catch (error) {
        logger.error(`[API] Get conversations error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to load conversations'
        });
    }
});

/**
 * POST /api/v1/user/support/rating
 * Submit rating
 */
router.post('/rating', (req, res) => {
    try {
        const userId = req.user.id;
        const { convId, score, comment } = req.body;
        
        if (!convId || !score || score < 1 || score > 5) {
            return res.status(400).json({
                success: false,
                error: 'Invalid parameters: conversation ID and score (1-5) required'
            });
        }
        
        supportService.submitRating(convId, userId, parseInt(score), comment || '');
        
        res.json({
            success: true,
            message: 'Thank you for your feedback!'
        });
    } catch (error) {
        logger.error(`[API] Submit rating error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to submit rating'
        });
    }
});

/**
 * GET /api/v1/user/support/unread/count
 * Get user unread message count
 */
router.get('/unread/count', (req, res) => {
    try {
        const userId = req.user.id;
        const count = supportService.getUserUnreadCount(userId);
        
        res.json({
            success: true,
            data: { unread_count: count }
        });
    } catch (error) {
        logger.error(`[API] Get unread count error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get unread count'
        });
    }
});

/**
 * POST /api/v1/user/support/messages/read
 * Mark messages as read
 */
router.post('/messages/read', (req, res) => {
    try {
        const userId = req.user.id;
        const { convId } = req.body;
        
        if (!convId) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation ID'
            });
        }
        
        supportService.markMessagesAsRead(convId, userId, 'user');
        
        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        logger.error(`[API] Mark read error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to mark messages as read'
        });
    }
});

export default router;