// upload.js - 文件上传配置
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 上传目录配置
const UPLOAD_CONFIG = {
    screenshot: {
        dir: 'uploads/screenshots',
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    }
};

// 确保上传目录存在
export function ensureUploadDir(type = 'screenshot') {
    const config = UPLOAD_CONFIG[type];
    if (!config) throw new Error('未知的上传类型');
    
    const uploadDir = path.join(__dirname, '../../public', config.dir);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        console.log(`✅ 创建上传目录: ${uploadDir}`);
    }
    return uploadDir;
}

// 生成安全的文件名
function generateSecureFilename(originalname) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(originalname).toLowerCase();
    return `${timestamp}-${random}${ext}`;
}

// 创建上传中间件
export function createUploadMiddleware(type = 'screenshot', fieldName = 'screenshot') {
    const config = UPLOAD_CONFIG[type];
    if (!config) throw new Error('未知的上传类型');
    
    // 确保目录存在
    const uploadDir = ensureUploadDir(type);
    
    // 配置存储
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const secureName = generateSecureFilename(file.originalname);
            cb(null, secureName);
        }
    });
    
    // 文件过滤器
    const fileFilter = (req, file, cb) => {
        if (config.allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`不支持的文件类型。允许的类型: ${config.allowedTypes.join(', ')}`), false);
        }
    };
    
    // 创建 multer 实例
    return multer({
        storage: storage,
        limits: { fileSize: config.maxSize },
        fileFilter: fileFilter
    }).single(fieldName);
}

// 删除上传的文件
export function deleteUploadFile(filePath) {
    if (!filePath) return false;
    
    try {
        const fullPath = path.join(__dirname, '../../public', filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`✅ 删除文件: ${fullPath}`);
            return true;
        }
    } catch (err) {
        console.error('❌ 删除文件失败:', err);
    }
    return false;
}

// 获取文件的完整URL
export function getFileUrl(req, filePath) {
    if (!filePath) return null;
    return `${req.protocol}://${req.get('host')}${filePath}`;
}