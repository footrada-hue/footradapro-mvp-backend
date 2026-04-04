import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import fetch from 'node-fetch';
import { getDb } from '../../database/connection.js';
import logger from '../../utils/logger.js';
import { captchaStore } from './captcha.routes.js'; // 导入图形验证码存储

const router = express.Router();

// ==================== 邮件配置 ====================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@footradapro.com';
const SENDER_NAME = 'FOOTRADAPRO';

// ==================== 验证码存储（内存，生产建议用Redis）====================
const verificationCodes = new Map();
const CODE_EXPIRY = 10 * 60 * 1000; // 10分钟

function generateEmailHtml(code) {
    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #FF7A00;">FOOTRADAPRO Verification Code</h2>
        <p>Your verification code is:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong style="font-size: 24px; color: #333;">${code}</strong>
        </div>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
    </div>`;
}

// ==================== 验证规则 ====================
const loginValidation = [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
];

const registerValidation = [
    body('username').isEmail().withMessage('请输入有效的邮箱地址'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
    body('firstName').optional().isString(),
    body('lastName').optional().isString(),
    body('country').optional().isString(),
    body('occupation').optional().isString(),
    body('token').notEmpty().withMessage('缺少临时令牌')
];

// ==================== 发送验证码（需携带图形验证码令牌）- 增强错误日志 ====================
router.post('/send-code',
    body('email').isEmail().normalizeEmail(),
    async (req, res) => {
        console.log('=== /send-code called ===');
        console.log('Request body:', req.body);
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', JSON.stringify(errors.array(), null, 2));
            return res.status(400).json({ 
                success: false, 
                error: 'VALIDATION_ERROR',
                details: errors.array() 
            });
        }

        const { email, captchaToken } = req.body;
        console.log('Email:', email);
        console.log('CaptchaToken:', captchaToken);



        // 检查邮箱是否已注册
        const db = getDb();
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(email);
        if (existing) {
            console.log('❌ Email already registered:', email);
            return res.status(409).json({ success: false, error: 'EMAIL_ALREADY_REGISTERED' });
        }

        // 生成邮箱验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + CODE_EXPIRY;
        verificationCodes.set(email, {
            code,
            expires,
            attempts: 0,
            lockedUntil: null
        });
        
        console.log('✅ Generated email code for', email, ':', code);
        console.log('Current verificationCodes size:', verificationCodes.size);

        // 发送邮件
        try {
            console.log('Sending email via Brevo...');
            const response = await fetch(BREVO_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': BREVO_API_KEY
                },
                body: JSON.stringify({
                    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
                    to: [{ email }],
                    subject: 'Your FOOTRADAPRO Verification Code',
                    htmlContent: generateEmailHtml(code)
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Brevo API error:', response.status, errorText);
                return res.status(500).json({ success: false, error: 'SEND_FAILED' });
            }

            console.log('✅ Email sent successfully');
            res.json({ success: true });
        } catch (err) {
            console.error('❌ Error sending email:', err);
            res.status(500).json({ success: false, error: 'SEND_FAILED' });
        }
    }
);

// ==================== 验证邮箱验证码（生成临时令牌）====================
router.post('/verify-code',
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    async (req, res) => {
        console.log('=== /verify-code called ===');
        console.log('Request body:', req.body);
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({ 
                success: false, 
                error: 'VALIDATION_ERROR' 
            });
        }

        const { email, code } = req.body;
        console.log('Looking up code for email:', email);
        
        const record = verificationCodes.get(email);
        console.log('Record found:', record ? 'Yes' : 'No');
        
        if (record) {
            console.log('Stored code:', record.code, 'Expires:', new Date(record.expires));
            console.log('Received code:', code);
        }

        // 检查是否被锁定
        if (record?.lockedUntil && record.lockedUntil > Date.now()) {
            console.log('Account locked until:', new Date(record.lockedUntil));
            return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS' });
        }

        if (!record) {
            console.log('No record found for email');
            return res.status(400).json({ success: false, error: 'INVALID_OR_EXPIRED_CODE' });
        }

        if (record.expires < Date.now()) {
            console.log('Code expired');
            verificationCodes.delete(email);
            return res.status(400).json({ success: false, error: 'INVALID_OR_EXPIRED_CODE' });
        }

        if (record.code !== code) {
            console.log('Code mismatch');
            
            // 记录错误次数
            record.attempts = (record.attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.CODE_MAX_ATTEMPTS || 5);
            if (record.attempts >= maxAttempts) {
                record.lockedUntil = Date.now() + (parseInt(process.env.CODE_LOCK_MINUTES || 15) * 60 * 1000);
                console.log('Account locked due to too many attempts');
            }
            verificationCodes.set(email, record);
            
            return res.status(400).json({ success: false, error: 'INVALID_OR_EXPIRED_CODE' });
        }

        // 验证成功，生成临时 JWT
        const jwtSecret = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
        const tempToken = jwt.sign(
            { email, purpose: 'registration' },
            jwtSecret,
            { expiresIn: '15m' }
        );

        // 清除邮箱验证码记录
        verificationCodes.delete(email);
        
        console.log('Code verified successfully, token generated');

        res.json({ success: true, data: { token: tempToken } });
    }
);

// ==================== 注册（需要临时令牌）- 添加邮箱标准化处理 ====================
// ==================== 注册（需要临时令牌）====================
router.post('/register', registerValidation, async (req, res) => {
    console.log('=== /register called ===');
    console.log('Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ 
            success: false, 
            error: 'VALIDATION_ERROR',
            details: errors.array() 
        });
    }

    const { username, password, firstName, lastName, country, occupation, token } = req.body;

    // 验证临时令牌
    let decoded;
    try {
        const jwtSecret = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';
        decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
        console.log('Token verification failed:', err.message);
        return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // 邮箱标准化处理：移除点号并转为小写（针对 Gmail）
    const normalizedRequestEmail = username.replace(/\./g, '').toLowerCase();
    const normalizedTokenEmail = decoded.email.replace(/\./g, '').toLowerCase();
    
    console.log('Normalized request email:', normalizedRequestEmail);
    console.log('Normalized token email:', normalizedTokenEmail);
    
    if (normalizedRequestEmail !== normalizedTokenEmail || decoded.purpose !== 'registration') {
        console.log('Email mismatch - Token email:', decoded.email, 'Request email:', username);
        return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    const db = getDb();

    try {
        // 检查用户是否已存在（使用原始邮箱，但移除点号后检查）
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                error: 'USERNAME_EXISTS'
            });
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // 生成唯一UID
        const uid = 'U' + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2, 5).toUpperCase();
        console.log('Generated UID:', uid);

        // 插入用户 - 使用原始邮箱（带点号）
        const stmt = db.prepare(`
            INSERT INTO users (
                uid, username, password, first_name, last_name, country, occupation,
                balance, role, status, is_new_user, has_claimed_bonus, completed_steps,
                reg_ip, reg_verified_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'user', 'active', 1, 0, 0, ?, datetime('now'), datetime('now'), datetime('now'))
        `);
        
        stmt.run(
            uid, username, hashedPassword, firstName, lastName, country, occupation,
            req.ip
        );

        // 获取新用户
        const newUser = db.prepare('SELECT id, uid, username, role FROM users WHERE uid = ?').get(uid);
        console.log('New user in DB:', newUser);

        // 自动登录：设置 session
        req.session.userId = newUser.id;
        req.session.uid = newUser.uid;
        req.session.role = newUser.role;
        req.session.isNewUser = true;
        
        // 更新最后登录时间
        db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(newUser.id);
        
        console.log('Auto login successful for new user:', newUser.uid);

        res.json({
            success: true,
            data: {
                uid: newUser.uid,
                username: newUser.username,
                balance: 100.00,
                role: newUser.role,
                isNewUser: true
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 登录 ====================
router.post('/login', loginValidation, async (req, res) => {
    console.log('=== /login called ===');
    console.log('Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ 
            success: false, 
            error: 'VALIDATION_ERROR'
        });
    }

    const { username, password } = req.body;
    console.log('Login attempt for:', username);

    const db = getDb();

    try {
        // 查找用户
        const user = db.prepare('SELECT id, uid, username, password, balance, role, status FROM users WHERE username = ?').get(username);
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'INVALID_CREDENTIALS'
            });
        }

        // 检查用户状态
        if (user.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                error: 'ACCOUNT_DISABLED'
            });
        }

        // 验证密码
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password valid:', validPassword);
        
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'INVALID_CREDENTIALS'
            });
        }

        // 设置 session
        req.session.userId = user.id;
        req.session.uid = user.uid;
        req.session.role = user.role;
        
        // 更新最后登录时间
        db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        console.log('Login successful:', user.uid);

        res.json({
            success: true,
            data: {
                uid: user.uid,
                username: user.username,
                balance: user.balance,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ==================== 登出 ====================
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'LOGOUT_FAILED' });
        }
        res.clearCookie('footradapro.sid');
        res.json({ success: true });
    });
});

// ==================== 获取当前会话 ====================
router.get('/session', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'NOT_AUTHENTICATED' });
    }

    const db = getDb();
    const user = db.prepare('SELECT uid, username, balance, role FROM users WHERE id = ?').get(req.session.userId);

    if (!user) {
        req.session.destroy();
        return res.status(401).json({ success: false, error: 'USER_NOT_FOUND' });
    }

    res.json({ success: true, data: user });
});

export default router;