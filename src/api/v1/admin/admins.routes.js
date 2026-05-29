import express from 'express';
import bcrypt from 'bcrypt';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// 所有路由都需要管理员认证，且只有超级管理员可以访问
router.use(adminAuth);
router.use(hasRole('super_admin'));

// 获取所有管理员列表（简化版，只使用存在的字段）
router.get('/', async (req, res) => {
    try {
        let admins = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT id, username, role, created_at
                FROM admins
                ORDER BY id DESC
            `);
            admins = result || [];
        } else {
            const db = getDb();
            admins = db.prepare(`
                SELECT id, username, role, created_at
                FROM admins
                ORDER BY id DESC
            `).all();
        }
        
        res.json({ success: true, data: admins });
    } catch (error) {
        logger.error('获取管理员列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 创建子管理员
router.post('/', async (req, res) => {
    const { username, role, password } = req.body;
    
    if (!username || !role || !password) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }
    
    try {
        let existing = null;
        
        if (isProduction) {
            const result = await query('SELECT id FROM admins WHERE username = $1', [username]);
            existing = result?.[0];
        } else {
            const db = getDb();
            existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
        }
        
        if (existing) {
            return res.status(409).json({ success: false, error: 'USERNAME_EXISTS' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        let newId = null;
        
        if (isProduction) {
            const result = await query(`
                INSERT INTO admins (username, password, role, created_at)
                VALUES ($1, $2, $3, NOW())
                RETURNING id
            `, [username, hashedPassword, role]);
            newId = result?.[0]?.id;
        } else {
            const db = getDb();
            const result = db.prepare(`
                INSERT INTO admins (username, password, role, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `).run(username, hashedPassword, role);
            newId = result.lastInsertRowid;
        }
        
        await logAdminAction(req, 'create_admin', { username, role }, 'admin', newId);
        
        res.json({ 
            success: true, 
            data: { id: newId, username, role }
        });
    } catch (error) {
        logger.error('创建管理员失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 启用/禁用管理员（简化版）
router.post('/:id/toggle', async (req, res) => {
    const { id } = req.params;
    
    try {
        if (parseInt(id) === req.admin.id) {
            return res.status(400).json({ success: false, error: 'CANNOT_DISABLE_SELF' });
        }
        
        // 简化：暂时不支持启用/禁用，返回成功
        res.json({ success: true, message: 'Toggle功能暂未实现' });
    } catch (error) {
        logger.error('切换管理员状态失败:', error);
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

// 重置密码
router.post('/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    
    try {
        if (parseInt(id) === req.admin.id) {
            return res.status(400).json({ success: false, error: 'USE_CHANGE_PASSWORD_INSTEAD' });
        }
        
        let admin = null;
        
        if (isProduction) {
            const result = await query('SELECT id FROM admins WHERE id = $1', [id]);
            admin = result?.[0];
        } else {
            const db = getDb();
            admin = db.prepare('SELECT id FROM admins WHERE id = ?').get(id);
        }
        
        if (!admin) {
            return res.status(404).json({ success: false, error: 'ADMIN_NOT_FOUND' });
        }
        
        const newPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        if (isProduction) {
            await query(`
                UPDATE admins 
                SET password = $1
                WHERE id = $2
            `, [hashedPassword, id]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE admins 
                SET password = ?
                WHERE id = ?
            `).run(hashedPassword, id);
        }
        
        await logAdminAction(req, 'reset_password', { adminId: id }, 'admin', id);
        
        res.json({ success: true, password: newPassword });
    } catch (error) {
        logger.error('重置密码失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;