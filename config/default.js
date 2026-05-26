/**
 * FOOTRADAPRO MVP - Default Configuration
 * @description 基础配置
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

export default {
    // ==================== 服务器 ====================
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,

    // ==================== 安全 ====================
    SESSION_SECRET: process.env.SESSION_SECRET,
    SALT_ROUNDS: 10,

    // ==================== 数据库 ====================
    DB_PATH: process.env.DB_PATH || path.join(PROJECT_ROOT, 'src', 'database', 'data', 'footradapro.sqlite'),

    // ==================== 日志 ====================
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // ==================== 信任机制 ====================
    AUTHORIZATION_CUTOFF_MINUTES: 5,

    // ==================== 静态文件缓存 ====================
    staticOptions: {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        }
    },

    // ==================== CORS ====================
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
        : (process.env.NODE_ENV === 'production' 
            ? ['https://你的域名.com']
            : ['http://localhost:3000']),

    // ==================== 邮件服务配置 ====================
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENDER_EMAIL: process.env.SENDER_EMAIL || 'noreply@footradapro.com',
    EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@footradapro.com',

    // ==================== 验证码配置 ====================
    CODE_EXPIRE_MINUTES: 10,
    MAX_RETRIES_PER_CHANNEL: 1,
};