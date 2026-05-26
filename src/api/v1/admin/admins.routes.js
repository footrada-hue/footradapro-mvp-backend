import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由都需要管理员认证，且只有超级管理员可以访问
router.use(adminAuth);
router.use(hasRole('super_admin'));

// 获取所有管理员列表
router.get('/', (req, res) => {
    const db = getDb();
    try {
        const admins = db.prepare(`
            SELECT id, username, name, email, role, is_active, is_locked,
                   last_login_at, last_login_ip, created_at
            FROM admins
            ORDER BY id DESC
        `).all();
        
        res.json({ success: true, data: admins });
    } catch (error) {
        logger.error('获取管理员列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 创建子管理员
router.post('/', async (req, res) => {
    const { username, name, email, role, password } = req.body;
    
    // 验证输入
    if (!username || !name || !email || !role || !password) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }
    
    const db = getDb();
    
    try {
        // 检查用户名是否已存在
        const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
        if (existing) {
            return res.status(409).json({ success: false, error: 'USERNAME_EXISTS' });
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // 插入新管理员
        const result = db.prepare(`
            INSERT INTO admins (username, password, name, email, role, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        `).run(username, hashedPassword, name, email, role);
        
        // 记录日志
        await logAdminAction(req, 'create_admin', { username, role }, 'admin', result.lastInsertRowid);
        
        res.json({ 
            success: true, 
            data: { id: result.lastInsertRowid, username, name, email, role }
        });
    } catch (error) {
        logger.error('创建管理员失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 启用/禁用管理员
router.post('/:id/toggle', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        // 不能禁用自己
        if (parseInt(id) === req.admin.id) {
            return res.status(400).json({ success: false, error: 'CANNOT_DISABLE_SELF' });
        }
        
        const admin = db.prepare('SELECT is_active FROM admins WHERE id = ?').get(id);
        if (!admin) {
            return res.status(404).json({ success: false, error: 'ADMIN_NOT_FOUND' });
        }
        
        const newStatus = admin.is_active ? 0 : 1;
        db.prepare('UPDATE admins SET is_active = ? WHERE id = ?').run(newStatus, id);
        
        logAdminAction(req, 'toggle_admin', { adminId: id, newStatus }, 'admin', id);
        
        res.json({ success: true, is_active: newStatus === 1 });
    } catch (error) {
        logger.error('切换管理员状态失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 重置密码
router.post('/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        // 不能重置自己的密码（建议通过修改密码功能）
        if (parseInt(id) === req.admin.id) {
            return res.status(400).json({ success: false, error: 'USE_CHANGE_PASSWORD_INSTEAD' });
        }
        
        const admin = db.prepare('SELECT id FROM admins WHERE id = ?').get(id);
        if (!admin) {
            return res.status(404).json({ success: false, error: 'ADMIN_NOT_FOUND' });
        }
        
        // 生成新密码
        const newPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        db.prepare('UPDATE admins SET password = ?, login_attempts = 0, is_locked = 0 WHERE id = ?')
            .run(hashedPassword, id);
        
        logAdminAction(req, 'reset_password', { adminId: id }, 'admin', id);
        
        res.json({ success: true, password: newPassword });
    } catch (error) {
        logger.error('重置密码失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 生成强密码辅助函数
function generateStrongPassword() {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 6; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default router;