import express from 'express';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import supportService from '../../../services/support.service.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

router.use(adminAuth);

/**
 * GET /api/v1/admin/support/stats
 * Get support statistics
 */
router.get('/stats', (req, res) => {
    try {
        const stats = supportService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error(`[Admin API] Get stats error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to load statistics' });
    }
});

/**
 * GET /api/v1/admin/support/conversations
 * Get all conversations
 */
router.get('/conversations', (req, res) => {
    try {
        const { status, user_id, limit = 100, offset = 0 } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (user_id) filters.user_id = parseInt(user_id);
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const parsedOffset = parseInt(offset) || 0;
        
        const result = supportService.getAllConversations(filters, parsedLimit, parsedOffset);
        
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`[Admin API] Get conversations error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to load conversations' });
    }
});

/**
 * POST /api/v1/admin/support/reply
 * Admin reply to conversation
 */
router.post('/reply', (req, res) => {
    try {
        const adminId = req.admin.id;
        const { convId, content } = req.body;
        
        if (!convId || !content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        
        if (content.trim().length > 5000) {
            return res.status(400).json({ success: false, error: 'Reply cannot exceed 5000 characters' });
        }
        
        logger.info(`[Admin API] Admin ${adminId} replying to conversation ${convId}`);
        
        const message = supportService.addAdminMessage(convId, adminId, content.trim());
        
        res.json({
            success: true,
            data: {
                id: message.id,
                content: message.content,
                created_at: message.created_at
            }
        });
    } catch (error) {
        logger.error(`[Admin API] Reply error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to send reply' });
    }
});

/**
 * POST /api/v1/admin/support/status
 * Update conversation status
 */
router.post('/status', (req, res) => {
    try {
        const adminId = req.admin.id;
        const { convId, status } = req.body;
        
        if (!convId || !status || !['open', 'closed', 'resolved'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid parameters' });
        }
        
        supportService.updateConversationStatus(convId, status, adminId);
        
        const statusMessages = {
            open: 'Conversation status updated to Open',
            resolved: 'Conversation status updated to Resolved',
            closed: 'Conversation status updated to Closed'
        };
        
        res.json({ success: true, message: statusMessages[status] });
    } catch (error) {
        logger.error(`[Admin API] Update status error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to update status' });
    }
});

/**
 * GET /api/v1/admin/support/messages
 * Get conversation messages
 */
router.get('/messages', (req, res) => {
    try {
        const { convId, limit = 100 } = req.query;
        
        if (!convId) {
            return res.status(400).json({ success: false, error: 'Missing conversation ID' });
        }
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const messages = supportService.getMessages(convId, parsedLimit);
        
        setImmediate(() => {
            try {
                supportService.markMessagesAsRead(convId, null, 'admin');
            } catch (err) {
                logger.error(`[Admin API] Mark read error: ${err.message}`);
            }
        });
        
        res.json({ success: true, data: messages });
    } catch (error) {
        logger.error(`[Admin API] Get messages error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to load messages' });
    }
});

/**
 * GET /api/v1/admin/support/templates
 * Get quick reply templates
 */
router.get('/templates', (req, res) => {
    try {
        const { category } = req.query;
        const templates = supportService.getTemplates(category);
        res.json({ success: true, data: templates });
    } catch (error) {
        logger.error(`[Admin API] Get templates error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to load templates' });
    }
});

/**
 * GET /api/v1/admin/support/unread/stats
 * Get admin unread statistics
 */
router.get('/unread/stats', (req, res) => {
    try {
        const totalUnread = supportService.getAdminTotalUnread();
        const conversationStats = supportService.getAdminUnreadStats();
        
        res.json({
            success: true,
            data: {
                total_unread: totalUnread,
                conversations: conversationStats
            }
        });
    } catch (error) {
        logger.error(`[Admin API] Get unread stats error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get unread stats'
        });
    }
});

/**
 * POST /api/v1/admin/support/conversations/read
 * Mark conversation messages as read
 */
router.post('/conversations/read', (req, res) => {
    try {
        const adminId = req.admin.id;
        const { convId } = req.body;
        
        if (!convId) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation ID'
            });
        }
        
        const markedCount = supportService.markConversationMessagesRead(convId, adminId);
        
        res.json({
            success: true,
            data: { marked_count: markedCount },
            message: `${markedCount} messages marked as read`
        });
    } catch (error) {
        logger.error(`[Admin API] Mark conversation read error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to mark messages as read'
        });
    }
});

/**
 * GET /api/v1/admin/support/status
 * Get admin status (online/away/busy)
 */
router.get('/status', (req, res) => {
    try {
        const adminId = req.admin.id;
        const status = supportService.getAdminStatus(adminId);
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error(`[Admin API] Get status error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/admin/support/status
 * Update admin status
 */
router.post('/status', (req, res) => {
    try {
        const adminId = req.admin.id;
        const { status } = req.body;
        
        if (!status || !['online', 'away', 'busy'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status. Must be online, away, or busy' 
            });
        }
        
        const isOnline = status === 'online';
        supportService.updateAdminStatus(adminId, isOnline, status);
        
        res.json({ success: true, message: `Status updated to ${status}` });
    } catch (error) {
        logger.error(`[Admin API] Update status error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/admin/support/heartbeat
 * Heartbeat to keep online status
 */
router.post('/heartbeat', (req, res) => {
    try {
        const adminId = req.admin.id;
        const db = supportService.getDb();
        const now = supportService.getCurrentTimestamp();
        
        db.prepare(`
            UPDATE support_admins 
            SET last_active_at = ?
            WHERE admin_id = ?
        `).run(now, adminId);
        
        res.json({ success: true });
    } catch (error) {
        logger.error(`[Admin API] Heartbeat error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;