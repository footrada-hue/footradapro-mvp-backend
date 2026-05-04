import express from 'express';
import jwt from 'jsonwebtoken';
import { auth } from '../../../middlewares/auth.middleware.js';
import supportService from '../../../services/support.service.js';
import geoService from '../../../services/geo.service.js';
import logger from '../../../utils/logger.js';
import telegramService from '../../../services/telegram.service.js';

const router = express.Router();

// 注意：router.use(auth) 会在路由之前执行，但我们仍然需要自己的 userId 获取逻辑
 router.use(auth); // 暂时注释掉，避免干扰

// 辅助函数：从请求中获取用户ID
function getUserIdFromRequest(req) {
    console.log('🔍 getUserIdFromRequest 被调用');
    
    // 方法1: 从 Cookie 中的 JWT token 解码（最可靠）
    if (req.cookies && req.cookies.footradapro_token) {
        try {
            const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
            const decoded = jwt.verify(req.cookies.footradapro_token, JWT_SECRET);
            console.log('✅ JWT 解码成功:', decoded);
            if (decoded && decoded.id) {
                console.log('✅ 从 JWT token 获取 userId:', decoded.id);
                return decoded.id;
            }
        } catch (err) {
            console.error('JWT 解码失败:', err.message);
        }
    }
    
    // 方法2: 从 session
    if (req.session && req.session.userId) {
        console.log('✅ 从 session 获取 userId:', req.session.userId);
        return req.session.userId;
    }
    
    // 方法3: 从 req.user（auth 中间件设置）
    if (req.user && req.user.id) {
        console.log('✅ 从 req.user.id 获取 userId:', req.user.id);
        return req.user.id;
    }
    
    console.log('❌ 无法获取 userId');
    return null;
}

/**
 * POST /api/v1/user/support/init
 */
router.post('/init', async (req, res) => {
    try {
        // 先获取 userId
        let userId = null;
        
        // 从 Cookie 获取
        if (req.cookies && req.cookies.footradapro_token) {
            try {
                const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
                const decoded = jwt.verify(req.cookies.footradapro_token, JWT_SECRET);
                if (decoded && decoded.id) {
                    userId = decoded.id;
                }
            } catch (err) {}
        }
        
        if (!userId && req.session && req.session.userId) {
            userId = req.session.userId;
        }
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { name, email } = req.body;
        const clientIP = geoService.getClientIP(req);
        const geoLocation = geoService.getLocationFromIP(clientIP);
        
        logger.info(`[API] Support init - User: ${userId}, IP: ${clientIP}, Country: ${geoLocation.country_name}`);
        
        const conversation = supportService.getOrCreateConversation(userId, {
            name: name || 'User',
            email: email || ''
        }, clientIP, geoLocation);
        
        const messages = supportService.getMessages(conversation.id, 50);
        
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
 */
router.post('/message', async (req, res) => {
    try {
        // 获取 userId
        let userId = null;
        
        console.log('========== 开始获取 userId ==========');
        
        // 从 Cookie 获取
        if (req.cookies && req.cookies.footradapro_token) {
            console.log('找到 Cookie token');
            try {
                const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
                const decoded = jwt.verify(req.cookies.footradapro_token, JWT_SECRET);
                console.log('JWT 解码结果:', decoded);
                if (decoded && decoded.id) {
                    userId = decoded.id;
                    console.log('✅ 从 JWT token 获取 userId:', userId);
                }
            } catch (err) {
                console.error('JWT 解码失败:', err.message);
            }
        } else {
            console.log('没有找到 Cookie token');
        }
        
        if (!userId && req.session && req.session.userId) {
            userId = req.session.userId;
            console.log('✅ 从 session 获取 userId:', userId);
        }
        
        if (!userId && req.user && req.user.id) {
            userId = req.user.id;
            console.log('✅ 从 req.user.id 获取 userId:', userId);
        }
        
        console.log('最终 userId:', userId);
        console.log('====================================');
        
        if (!userId) {
            logger.error('[API] Send message failed: userId not found');
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'User not authenticated'
            });
        }
        
        const { convId, content } = req.body;
        
        if (!convId || !content || !content.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
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
        
        // 异步发送 Telegram 通知
        setImmediate(async () => {
            try {
                const onlineCount = supportService.getOnlineAdminCount();
                
                if (onlineCount === 0) {
                    const db = supportService.getDb();
                    const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
                    
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
                    
                    logger.info(`[API] Sent Telegram notification for conversation ${convId}, user: ${displayName}`);
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
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/user/support/messages
 */
router.get('/messages', (req, res) => {
    try {
        let userId = null;
        if (req.cookies && req.cookies.footradapro_token) {
            try {
                const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
                const decoded = jwt.verify(req.cookies.footradapro_token, JWT_SECRET);
                if (decoded && decoded.id) userId = decoded.id;
            } catch (err) {}
        }
        if (!userId && req.session?.userId) userId = req.session.userId;
        if (!userId && req.user?.id) userId = req.user.id;
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { convId, limit = 100 } = req.query;
        if (!convId) {
            return res.status(400).json({ success: false, error: 'Missing conversation ID' });
        }
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const messages = supportService.getMessages(convId, parsedLimit);
        
        res.json({ success: true, data: messages });
    } catch (error) {
        logger.error(`[API] Get messages error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/user/support/conversations
 */
router.get('/conversations', (req, res) => {
    try {
        let userId = null;
        if (req.cookies && req.cookies.footradapro_token) {
            try {
                const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
                const decoded = jwt.verify(req.cookies.footradapro_token, JWT_SECRET);
                if (decoded && decoded.id) userId = decoded.id;
            } catch (err) {}
        }
        if (!userId && req.session?.userId) userId = req.session.userId;
        if (!userId && req.user?.id) userId = req.user.id;
        
        if (!userId) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const { limit = 50 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 50, 200);
        const conversations = supportService.getUserConversations(userId, parsedLimit);
        
        res.json({ success: true, data: conversations });
    } catch (error) {
        logger.error(`[API] Get conversations error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;