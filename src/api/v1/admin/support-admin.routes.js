// src/api/v1/admin/support-admin.routes.js
import express from 'express';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import supportService from '../../../services/support.service.js';
import uploadService from '../../../services/upload.service.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

router.use(adminAuth);

/**
 * GET /api/v1/admin/support/stats
 * Get support statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await supportService.getStats();
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
router.get('/conversations', async (req, res) => {
    try {
        const { status, user_id, limit = 100, offset = 0 } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (user_id) filters.user_id = parseInt(user_id);
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const parsedOffset = parseInt(offset) || 0;
        
        const result = await supportService.getAllConversations(filters, parsedLimit, parsedOffset);
        
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`[Admin API] Get conversations error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to load conversations' });
    }
});

/**
 * POST /api/v1/admin/support/reply
 * Admin reply to conversation (supports text and attachments)
 */
router.post('/reply', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        const { convId, content, attachments } = req.body;
        
        if (!convId) {
            return res.status(400).json({ success: false, error: 'Missing conversation ID' });
        }
        
        // 检查是否有内容或附件
        const hasContent = content && content.trim();
        const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
        
        if (!hasContent && !hasAttachments) {
            return res.status(400).json({ success: false, error: 'No content or attachments provided' });
        }
        
        if (hasContent && content.trim().length > 5000) {
            return res.status(400).json({ success: false, error: 'Reply cannot exceed 5000 characters' });
        }
        
        logger.info(`[Admin API] Admin ${adminId} replying to conversation ${convId}${hasAttachments ? ` with ${attachments.length} attachment(s)` : ''}`);
        
        const message = await supportService.addAdminMessage(convId, adminId, hasContent ? content.trim() : '', attachments);
        
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
        logger.error(`[Admin API] Reply error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to send reply' });
    }
});

/**
 * POST /api/v1/admin/support/status
 * Update conversation status
 */
router.post('/status', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        const { convId, status } = req.body;
        
        if (!convId || !status || !['open', 'closed', 'resolved'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid parameters' });
        }
        
        await supportService.updateConversationStatus(convId, status, adminId);
        
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
router.get('/messages', async (req, res) => {
    try {
        const { convId, limit = 100 } = req.query;
        
        if (!convId) {
            return res.status(400).json({ success: false, error: 'Missing conversation ID' });
        }
        
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const messages = await supportService.getMessages(convId, parsedLimit);
        
        // 异步标记为已读
        setImmediate(async () => {
            try {
                await supportService.markMessagesAsRead(convId, null, 'admin');
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
router.get('/templates', async (req, res) => {
    try {
        const { category } = req.query;
        const templates = await supportService.getTemplates(category);
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
router.get('/unread/stats', async (req, res) => {
    try {
        const totalUnread = await supportService.getAdminTotalUnread();
        const conversationStats = await supportService.getAdminUnreadStats();
        
        // conversationStats 现在返回 { conversations: [], total_unread: 0 }
        const conversations = conversationStats.conversations || conversationStats || [];
        const totalUnreadValue = conversationStats.total_unread !== undefined 
            ? conversationStats.total_unread 
            : totalUnread;
        
        res.json({
            success: true,
            data: {
                total_unread: totalUnreadValue,
                conversations: conversations
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
router.post('/conversations/read', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        const { convId } = req.body;
        
        if (!convId) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation ID'
            });
        }
        
        const markedCount = await supportService.markConversationMessagesRead(convId, adminId);
        
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
router.get('/status', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        const status = await supportService.getAdminStatus(adminId);
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
router.post('/status', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        const { status } = req.body;
        
        if (!status || !['online', 'away', 'busy'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status. Must be online, away, or busy' 
            });
        }
        
        const isOnline = status === 'online';
        await supportService.updateAdminStatus(adminId, isOnline, status);
        
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
router.post('/heartbeat', async (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        
        if (adminId) {
            await supportService.updateAdminStatus(adminId, true, 'online');
        }
        
        res.json({ success: true, data: { timestamp: new Date().toISOString() } });
    } catch (error) {
        logger.error(`[Admin API] Heartbeat error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ==================== 文件上传 API ====================
 */

/**
 * POST /api/v1/admin/support/upload
 * Upload image/file for conversation
 */
router.post('/upload', (req, res) => {
    try {
        const adminId = req.admin?.id || req.session?.adminId;
        
        // 使用 multer 中间件处理文件上传
        const uploadMiddleware = uploadService.getUploadMiddleware();
        
        uploadMiddleware(req, res, async (err) => {
            if (err) {
                logger.error(`[Admin API] Upload error: ${err.message}`);
                return res.status(400).json({ success: false, error: err.message });
            }
            
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            
            // 从 req.body 获取 convId（multer 解析后可用）
            const convId = req.body.convId;
            
            if (!convId) {
                logger.error(`[Admin API] Missing convId. Body: ${JSON.stringify(req.body)}`);
                // 清理上传的文件
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
                
                logger.info(`[Admin API] Admin ${adminId} uploaded file: ${fileInfo.filename} for conversation ${convId}`);
                
                // 可选：自动发送带附件的消息
                // await supportService.addAdminMessage(convId, adminId, '', [fileInfo]);
                
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
                logger.error(`[Admin API] Upload processing error: ${error.message}`);
                // 清理上传的文件
                if (req.file && req.file.filename) {
                    uploadService.deleteFile(req.file.filename);
                }
                res.status(500).json({ success: false, error: error.message || 'Failed to process upload' });
            }
        });
    } catch (error) {
        logger.error(`[Admin API] Upload route error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload file' });
    }
});

export default router;