import express from 'express';
import { auth } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/admin.middleware.js';
import uploadService from '../../services/upload.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * POST /api/v1/upload/chat
 * 上传聊天文件 (用户端)
 */
router.post('/chat', auth, (req, res) => {
    const upload = uploadService.getUploadMiddleware();
    
    upload(req, res, (err) => {
        if (err) {
            logger.error('[Upload] Error:', err);
            return res.status(400).json({
                success: false,
                error: err.message || '文件上传失败'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请选择文件'
            });
        }
        
        const fileInfo = uploadService.getFileInfo(req.file);
        
        res.json({
            success: true,
            data: fileInfo
        });
    });
});

/**
 * POST /api/v1/upload/chat/admin
 * 上传聊天文件 (管理员端)
 */
router.post('/chat/admin', adminAuth, (req, res) => {
    const upload = uploadService.getUploadMiddleware();
    
    upload(req, res, (err) => {
        if (err) {
            logger.error('[Upload] Admin upload error:', err);
            return res.status(400).json({
                success: false,
                error: err.message || '文件上传失败'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请选择文件'
            });
        }
        
        const fileInfo = uploadService.getFileInfo(req.file);
        
        res.json({
            success: true,
            data: fileInfo
        });
    });
});

export default router;