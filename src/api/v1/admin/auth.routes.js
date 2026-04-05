import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../../../database/connection.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 获取环境变量
const NODE_ENV = process.env.NODE_ENV || 'development';
// Cookie 域名配置 - 從環境變量讀取，便於不同環境部署
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || null;

// ==================== 管理员登录 ====================
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            error: '用户名和密码不能为空' 
        });
    }
    
    const db = getDb();
    
    try {
        // 查找管理员
        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
        
        if (!admin) {
            logger.warn('管理员登录失败: 用户不存在 - ' + username);
            return res.status(401).json({ 
                success: false, 
                error: '用户名或密码错误' 
            });
        }
        
        // 验证密码
        const validPassword = bcrypt.compareSync(password, admin.password);
        
        if (!validPassword) {
            logger.warn('管理员登录失败: 密码错误 - ' + username);
            return res.status(401).json({ 
                success: false, 
                error: '用户名或密码错误' 
            });
        }
        
        // 生成简单的会话 token
        const token = Buffer.from(admin.id + ':' + Date.now()).toString('base64');
        
        // 设置 HttpOnly Cookie（生产环境安全配置）
        const cookieOptions = {
            httpOnly: true,                           // 防止 XSS 攻击
            secure: NODE_ENV === 'production',        // 生产环境强制 HTTPS
            sameSite: 'strict',                       // 防止 CSRF 攻击
            maxAge: 7 * 24 * 60 * 60 * 1000,          // 7天
            path: '/'                                  // 全站有效
        };
        
        // 仅在明确配置域名时添加（支持跨子域名）
        if (COOKIE_DOMAIN) {
            cookieOptions.domain = COOKIE_DOMAIN;
        }
        
        res.cookie('admin_token', token, cookieOptions);
        
        // 设置 session（用于权限验证）
        req.session.userId = admin.id;
        req.session.adminId = admin.id;
        req.session.adminRole = admin.role;
        req.session.adminName = admin.username;
        
        logger.info('管理员登录成功: ' + username, { 
            adminId: admin.id, 
            role: admin.role 
        });
        
        // 返回用户信息（前端不需要手动处理 token，HttpOnly Cookie 会自动携带）
        res.json({
            success: true,
            data: {
                id: admin.id,
                username: admin.username,
                name: admin.name,
                role: admin.role
            }
        });
        
    } catch (error) {
        logger.error('管理员登录错误:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器错误，请稍后重试' 
        });
    }
});

// ==================== 验证 Cookie ====================
router.get('/verify', (req, res) => {
    // 直接从 cookie 获取 token
    const token = req.cookies.admin_token;
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split(':');
        const adminId = parts[0];
        
        const db = getDb();
        const admin = db.prepare('SELECT id, username, name, role FROM admins WHERE id = ?').get(adminId);
        
        if (!admin) {
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        // 更新 session
        req.session.userId = admin.id;
        req.session.adminId = admin.id;
        req.session.adminRole = admin.role;
        req.session.adminName = admin.username;
        
        res.json({ success: true, data: admin });
        
    } catch (error) {
        logger.error('Token验证错误:', error);
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
});

// ==================== 退出登录 ====================
router.post('/logout', (req, res) => {
    // 清除 cookie（使用相同的配置确保能正确清除）
    const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    };
    
    if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
    }
    
    res.clearCookie('admin_token', cookieOptions);
    
    if (req.session) {
        req.session.destroy();
    }
    
    res.json({ success: true });
});

export default router;