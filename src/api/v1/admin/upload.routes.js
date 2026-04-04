/**
 * FOOTRADAPRO - 文件上傳路由
 * @description 處理隊徽、截圖等文件上傳
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 確保上傳目錄存在
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'teams');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ 創建上傳目錄:', uploadDir);
}

// 配置 multer 存儲
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名：時間戳-原文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'logo-' + uniqueSuffix + ext);
    }
});

// 文件過濾器
const fileFilter = (req, file, cb) => {
    // 只允許圖片文件
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('只支持 JPEG、PNG、GIF、WEBP、SVG 格式的圖片'), false);
    }
};

// 初始化 multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
         fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// ==================== 上傳隊徽 ====================
router.post('/team-logo', adminAuth, (req, res) => {
    upload.single('logo')(req, res, function(err) {
        if (err) {
            logger.error('上傳失敗:', err);
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ 
                        success: false, 
                        error: '文件大小不能超過 2MB' 
                    });
                }
            }
            
            return res.status(400).json({ 
                success: false, 
                error: err.message || '上傳失敗' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: '沒有選擇文件' 
            });
        }

        // 生成訪問 URL
        const fileUrl = `/uploads/teams/${req.file.filename}`;
        
        logger.info(`管理員 ${req.session?.adminId} 上傳隊徽: ${fileUrl}`);

        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: req.file.filename
            }
        });
    });
});

// ==================== 刪除隊徽 ====================
router.delete('/team-logo/:filename', adminAuth, (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadDir, filename);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`管理員 ${req.session?.adminId} 刪除隊徽: ${filename}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: '文件不存在' });
        }
    } catch (err) {
        logger.error('刪除文件失敗:', err);
        res.status(500).json({ success: false, error: '刪除失敗' });
    }
});

export default router;