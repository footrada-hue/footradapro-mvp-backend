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
        
        // ==================== 设置认证信息 ====================
        
        // 1. 生成 Cookie Token（用于前端可能的用途）
        const token = Buffer.from(admin.id + ':' + Date.now()).toString('base64');
        
        // Cookie 配置（生产环境安全配置）
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
        
        // 2. 设置 Session（中间件 adminAuth 需要）
        req.session.userId = admin.id;
        req.session.adminId = admin.id;
        req.session.adminRole = admin.role;
        req.session.adminName = admin.username;
        
        logger.info('管理员登录成功: ' + username, { 
            adminId: admin.id, 
            role: admin.role,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        
        // 3. 返回用户信息（不包含敏感数据）
        res.json({
            success: true,
            data: {
                id: admin.id,
                username: admin.username,
                name: admin.name || admin.username,
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

// ==================== 验证当前登录状态 ====================
router.get('/verify', (req, res) => {
    // 添加防快取頭
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 优先检查 Session（中间件使用的方式）
    if (req.session && req.session.adminId) {
        const db = getDb();
        const admin = db.prepare(`
            SELECT id, username, name, role 
            FROM admins 
            WHERE id = ? AND is_active = 1 AND is_locked = 0
        `).get(req.session.adminId);
        
        if (admin) {
            // 更新 session 信息
            req.session.adminName = admin.name;
            req.session.adminRole = admin.role;
            
            return res.json({
                success: true,
                data: {
                    id: admin.id,
                    username: admin.username,
                    name: admin.name || admin.username,
                    role: admin.role
                }
            });
        }
    }
    
    // 回退：检查 Cookie Token
    const token = req.cookies.admin_token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED',
            message: '未登录或会话已过期'
        });
    }
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split(':');
        const adminId = parts[0];
        
        const db = getDb();
        const admin = db.prepare(`
            SELECT id, username, name, role 
            FROM admins 
            WHERE id = ? AND is_active = 1 AND is_locked = 0
        `).get(adminId);
        
        if (!admin) {
            return res.status(401).json({ 
                success: false, 
                error: 'UNAUTHORIZED',
                message: '管理员账号不存在或已被禁用'
            });
        }
        
        // 同步设置 Session
        req.session.userId = admin.id;
        req.session.adminId = admin.id;
        req.session.adminRole = admin.role;
        req.session.adminName = admin.username;
        
        res.json({
            success: true,
            data: {
                id: admin.id,
                username: admin.username,
                name: admin.name || admin.username,
                role: admin.role
            }
        });
        
    } catch (error) {
        logger.error('Token验证错误:', error);
        res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED',
            message: '会话验证失败，请重新登录'
        });
    }
});

// ==================== 退出登录 ====================
router.post('/logout', (req, res) => {
    // 清除 Cookie
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
    
    // 销毁 Session
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                logger.error('Session销毁错误:', err);
            }
        });
    }
    
    logger.info('管理员退出登录', { 
        adminId: req.session?.adminId,
        ip: req.ip 
    });
    
    res.json({ 
        success: true, 
        message: '已安全退出登录'
    });
});

// ==================== 修改密码（可选） ====================
router.post('/change-password', async (req, res) => {
    // 先验证登录状态
    if (!req.session || !req.session.adminId) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: '请先登录'
        });
    }
    
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            error: '旧密码和新密码不能为空'
        });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            error: '新密码长度不能少于6位'
        });
    }
    
    const db = getDb();
    
    try {
        const admin = db.prepare('SELECT password FROM admins WHERE id = ?').get(req.session.adminId);
        
        if (!admin) {
            return res.status(404).json({
                success: false,
                error: '管理员账号不存在'
            });
        }
        
        const validPassword = bcrypt.compareSync(oldPassword, admin.password);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: '原密码错误'
            });
        }
        
        const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
        
        db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashedNewPassword, req.session.adminId);
        
        logger.info('管理员密码已修改', { adminId: req.session.adminId });
        
        res.json({
            success: true,
            message: '密码修改成功，请重新登录'
        });
        
    } catch (error) {
        logger.error('修改密码错误:', error);
        res.status(500).json({
            success: false,
            error: '服务器错误，请稍后重试'
        });
    }
});

export default router;