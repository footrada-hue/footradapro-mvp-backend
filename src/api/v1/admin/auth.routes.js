import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../../../database/connection.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 获取环境变量
const NODE_ENV = process.env.NODE_ENV || 'development';

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
        
        // 设置 HttpOnly Cookie（自动适应环境）
        const cookieOptions = {
            httpOnly: true,
            secure: NODE_ENV === 'production',  // 生产环境 true，开发环境 false
            sameSite: NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7天
        };
        
        // 生产环境添加域名（可选）
        if (NODE_ENV === 'production') {
            cookieOptions.domain = '.yourdomain.com'; // 替换为您的域名
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
        
        // 返回用户信息（不包含 token）
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
            error: '服务器错误' 
        });
    }
});

// ==================== 验证 Cookie ====================
router.get('/verify', (req, res) => {
    console.log('=== 管理员 verify 请求 ===');
    console.log('Cookies:', req.cookies);
    
    // 直接从 cookie 获取 token
    const token = req.cookies.admin_token;
    console.log('Token from cookie:', token);
    
    if (!token) {
        console.log('❌ 没有找到 admin_token cookie');
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split(':');
        const adminId = parts[0];
        
        const db = getDb();
        const admin = db.prepare('SELECT id, username, name, role FROM admins WHERE id = ?').get(adminId);
        
        if (!admin) {
            console.log('❌ 管理员不存在:', adminId);
            return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        // 更新 session
        req.session.userId = admin.id;
        req.session.adminId = admin.id;
        req.session.adminRole = admin.role;
        req.session.adminName = admin.username;
        
        console.log('✅ 验证成功:', admin.username);
        res.json({ success: true, data: admin });
        
    } catch (error) {
        console.error('❌ Token验证错误:', error);
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
});

// ==================== 退出登录 ====================
router.post('/logout', (req, res) => {
    // 清除 cookie
    res.clearCookie('admin_token');
    req.session.destroy();
    res.json({ success: true });
});

export default router;