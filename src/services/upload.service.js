import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 上传目录
const uploadDir = path.join(__dirname, '../../public/uploads/chat');

// 确保目录存在
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 文件类型限制
const allowedMimes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt'
};

const maxSize = 10 * 1024 * 1024; // 10MB

// Multer 配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    if (allowedMimes[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: maxSize },
    fileFilter
});

class UploadService {
    getUploadMiddleware() {
        return upload.single('file');
    }

    getUploadFieldsMiddleware() {
        return upload.array('files', 5);
    }

    getFileUrl(filename) {
        return `/uploads/chat/${filename}`;
    }

    getFileInfo(file) {
        if (!file) return null;
        
        const ext = path.extname(file.filename).toLowerCase();
        const type = this.getFileType(file.mimetype);
        
        return {
            id: uuidv4(),
            filename: file.filename,
            originalName: file.originalname,
            url: this.getFileUrl(file.filename),
            size: file.size,
            mimeType: file.mimetype,
            type: type,
            extension: ext,
            createdAt: new Date().toISOString()
        };
    }

    getFileType(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.includes('word')) return 'document';
        if (mimeType.includes('excel')) return 'spreadsheet';
        if (mimeType === 'text/plain') return 'text';
        return 'file';
    }

    deleteFile(filename) {
        try {
            const filePath = path.join(uploadDir, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.info(`[Upload] Deleted file: ${filename}`);
                return true;
            }
        } catch (error) {
            logger.error('[Upload] Delete file error:', error);
        }
        return false;
    }
}

export default new UploadService();