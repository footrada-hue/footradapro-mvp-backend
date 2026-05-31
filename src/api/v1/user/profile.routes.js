// src/api/v1/user/profile.routes.js
// ====================================================
// FOOTRADA PROFILE ROUTES
// Language: English (with i18n ready comments)
// i18n标记格式: // i18n: "key" - 用于后续多语言转换
// ====================================================

import express from 'express';
import bcrypt from 'bcrypt';
import { query, getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';
import { sendVerificationEmail } from '../../../services/emailservice.js';
import { 
    storeVerificationCode, 
    verifyCode,
    canSendCode,
    recordSendTime
} from '../../../services/verification.service.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// All routes require authentication
router.use(auth);

// ====================================================
// GET /api/v1/user/profile
// Get user profile information
// ====================================================
router.get('/', async (req, res) => {
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED',
            message: 'User not authenticated'
        });
    }

    try {
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id, 
                    username, 
                    uid, 
                    balance, 
                    vip_level, 
                    is_test_mode, 
                    created_at,
                    has_paypassword
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT 
                    id, 
                    username, 
                    uid, 
                    balance, 
                    vip_level, 
                    is_test_mode, 
                    created_at,
                    has_paypassword
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            logger.warn(`Profile fetch failed: User not found - ID: ${userId}`);
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND',
                message: 'User does not exist'
            });
        }

        const userData = {
            id: user.id,
            username: user.username,
            uid: user.uid,
            balance: parseFloat(user.balance || 0).toFixed(2),
            vip_level: user.vip_level || 0,
            is_test_mode: user.is_test_mode === 1 || user.is_test_mode === true,
            has_paypassword: user.is_test_mode === 1 || user.is_test_mode === true ? false : (user.has_paypassword === 1 || user.has_paypassword === true),
            created_at: user.created_at,
            vip_level_text: getVipLevelText(user.vip_level)
        };

        logger.info(`Profile fetched successfully - User: ${user.username} (${userData.is_test_mode ? 'TEST' : 'REAL'})`);

        res.json({
            success: true,
            data: userData
        });
    } catch (error) {
        logger.error('Failed to fetch user profile:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch user profile'
        });
    }
});

// ====================================================
// GET /api/v1/user/profile/paypassword/status
// Check payment password status
// ====================================================
router.get('/paypassword/status', async (req, res) => {
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    try {
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id,
                    is_test_mode,
                    has_paypassword
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT 
                    id,
                    is_test_mode,
                    has_paypassword
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        const isTestMode = user.is_test_mode === 1 || user.is_test_mode === true;
        const hasPaypassword = user.has_paypassword === 1 || user.has_paypassword === true;

        const responseData = {
            success: true,
            data: {
                has_paypassword: isTestMode ? false : hasPaypassword,
                is_test_mode: isTestMode,
                can_set_paypassword: !isTestMode,
                need_paypassword: !isTestMode
            }
        };

        logger.debug(`PayPassword status checked - User: ${userId}, TestMode: ${isTestMode}, HasPassword: ${responseData.data.has_paypassword}`);
        res.json(responseData);
        
    } catch (error) {
        logger.error('Failed to check payment password status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ====================================================
// POST /api/v1/user/profile/paypassword/set
// Set payment password
// Body: { password: "123456", confirm_password: "123456" }
// ====================================================
router.post('/paypassword/set', async (req, res) => {
    const userId = req.session?.userId;
    const { password, confirm_password } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    if (!password || !confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'MISSING_FIELDS',
            message: 'Password and confirm password are required'
        });
    }

    if (password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'Passwords do not match'
        });
    }

    if (!/^\d{6}$/.test(password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits'
        });
    }

    try {
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT id, is_test_mode, has_paypassword 
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT id, is_test_mode, has_paypassword 
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        const isTestMode = user.is_test_mode === 1 || user.is_test_mode === true;
        const hasPaypassword = user.has_paypassword === 1 || user.has_paypassword === true;

        if (isTestMode) {
            logger.warn(`Test user attempted to set paypassword - User: ${userId}`);
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot set payment password'
            });
        }

        if (hasPaypassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'ALREADY_SET',
                message: 'Payment password already set'
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const now = new Date().toISOString();

        if (isProduction) {
            await query(`
                UPDATE users 
                SET 
                    has_paypassword = true,
                    paypassword_hash = $1,
                    paypassword_set_at = $2,
                    paypassword_updated_at = $2
                WHERE id = $3
            `, [hashedPassword, now, userId]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE users 
                SET 
                    has_paypassword = 1,
                    paypassword_hash = ?,
                    paypassword_set_at = ?,
                    paypassword_updated_at = ?
                WHERE id = ?
            `).run(hashedPassword, now, now, userId);
        }

        logger.info(`PayPassword set successfully - User: ${userId}`);

        res.json({
            success: true,
            message: 'Payment password set successfully',
            data: {
                set_at: now
            }
        });

    } catch (error) {
        logger.error('Failed to set payment password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: 'Failed to set payment password'
        });
    }
});

// ====================================================
// POST /api/v1/user/profile/paypassword/verify
// Verify payment password
// Body: { password: "123456" }
// ====================================================
router.post('/paypassword/verify', async (req, res) => {
    const userId = req.session?.userId;
    const { password } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    if (!password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_REQUIRED',
            message: 'Password is required'
        });
    }

    try {
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT is_test_mode, has_paypassword, paypassword_hash 
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT is_test_mode, has_paypassword, paypassword_hash 
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        const isTestMode = user.is_test_mode === 1 || user.is_test_mode === true;
        const hasPaypassword = user.has_paypassword === 1 || user.has_paypassword === true;

        if (isTestMode) {
            logger.debug(`Test user paypassword verification skipped - User: ${userId}`);
            return res.json({
                success: true,
                data: { 
                    verified: true, 
                    is_test_mode: true,
                    message: 'Test mode user - verification skipped'
                }
            });
        }

        if (!hasPaypassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'PAYPASSWORD_NOT_SET',
                message: 'Payment password not set'
            });
        }

        const isValid = await bcrypt.compare(password, user.paypassword_hash);

        if (isValid) {
            res.json({
                success: true,
                data: { 
                    verified: true,
                    is_test_mode: false
                }
            });
        } else {
            logger.warn(`PayPassword verification failed - User: ${userId}`);
            res.status(401).json({ 
                success: false, 
                error: 'INVALID_PASSWORD',
                message: 'Invalid payment password'
            });
        }

    } catch (error) {
        logger.error('Failed to verify payment password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ====================================================
// POST /api/v1/user/profile/paypassword/change
// Change payment password (requires old password)
// Body: { old_password: "123456", new_password: "654321", confirm_password: "654321" }
// ====================================================
router.post('/paypassword/change', async (req, res) => {
    const userId = req.session?.userId;
    const { old_password, new_password, confirm_password } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    if (!old_password || !new_password || !confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'MISSING_FIELDS',
            message: 'All fields are required'
        });
    }

    if (new_password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'New passwords do not match'
        });
    }

    if (!/^\d{6}$/.test(new_password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits'
        });
    }

    try {
        let user = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT is_test_mode, has_paypassword, paypassword_hash 
                FROM users 
                WHERE id = $1
            `, [userId]);
            user = result?.[0] || null;
        } else {
            const db = getDb();
            user = db.prepare(`
                SELECT is_test_mode, has_paypassword, paypassword_hash 
                FROM users 
                WHERE id = ?
            `).get(userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        const isTestMode = user.is_test_mode === 1 || user.is_test_mode === true;
        const hasPaypassword = user.has_paypassword === 1 || user.has_paypassword === true;

        if (isTestMode) {
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot change payment password'
            });
        }

        if (!hasPaypassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'NOT_SET',
                message: 'Payment password not set'
            });
        }

        const isValid = await bcrypt.compare(old_password, user.paypassword_hash);

        if (!isValid) {
            logger.warn(`PayPassword change failed - Invalid old password - User: ${userId}`);
            return res.status(401).json({ 
                success: false, 
                error: 'INVALID_OLD_PASSWORD',
                message: 'Current password is incorrect'
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);
        const now = new Date().toISOString();

        if (isProduction) {
            await query(`
                UPDATE users 
                SET 
                    paypassword_hash = $1,
                    paypassword_updated_at = $2
                WHERE id = $3
            `, [hashedPassword, now, userId]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE users 
                SET 
                    paypassword_hash = ?,
                    paypassword_updated_at = ?
                WHERE id = ?
            `).run(hashedPassword, now, userId);
        }

        logger.info(`PayPassword changed successfully - User: ${userId}`);

        res.json({
            success: true,
            message: 'Payment password changed successfully',
            data: {
                updated_at: now
            }
        });

    } catch (error) {
        logger.error('Failed to change payment password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ====================================================
// POST /api/v1/user/profile/paypassword/reset
// Reset payment password (requires verification code)
// Body: { verification_code: "123456", new_password: "654321", confirm_password: "654321" }
// ====================================================
router.post('/paypassword/reset', async (req, res) => {
    const userId = req.session?.userId;
    const { verification_code, new_password, confirm_password } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    if (!verification_code || !new_password || !confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'MISSING_FIELDS',
            message: 'Verification code and new password are required'
        });
    }

    if (new_password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'New passwords do not match'
        });
    }

    if (!/^\d{6}$/.test(new_password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits'
        });
    }

    try {
        let isTestMode = false;
        
        if (isProduction) {
            const result = await query(`
                SELECT is_test_mode 
                FROM users 
                WHERE id = $1
            `, [userId]);
            isTestMode = result?.[0]?.is_test_mode === true;
        } else {
            const db = getDb();
            const user = db.prepare(`
                SELECT is_test_mode 
                FROM users 
                WHERE id = ?
            `).get(userId);
            isTestMode = user?.is_test_mode === 1;
        }

        if (isTestMode) {
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot reset payment password'
            });
        }

        // Verify verification code
        const isValidCode = verifyCode(userId.toString(), verification_code, 'reset_paypassword');
        
        if (!isValidCode) {
            return res.status(400).json({ 
                success: false, 
                error: 'INVALID_CODE',
                message: 'Invalid or expired verification code'
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);
        const now = new Date().toISOString();

        if (isProduction) {
            await query(`
                UPDATE users 
                SET 
                    has_paypassword = true,
                    paypassword_hash = $1,
                    paypassword_updated_at = $2
                WHERE id = $3
            `, [hashedPassword, now, userId]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE users 
                SET 
                    has_paypassword = 1,
                    paypassword_hash = ?,
                    paypassword_updated_at = ?
                WHERE id = ?
            `).run(hashedPassword, now, userId);
        }

        logger.info(`PayPassword reset successfully - User: ${userId} (with verification code)`);

        res.json({
            success: true,
            message: 'Payment password reset successfully'
        });

    } catch (error) {
        logger.error('Failed to reset payment password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ====================================================
// POST /api/v1/user/profile/paypassword/send-code
// Send password reset verification code
// Body: { email: "user@example.com" } (optional, uses user's email if not provided)
// ====================================================
router.post('/paypassword/send-code', async (req, res) => {
    const userId = req.session?.userId;
    const { email } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    try {
        // 1. Rate limit check (60 seconds cooldown)
        const rateLimit = canSendCode(userId.toString());
        if (!rateLimit.allowed) {
            return res.status(429).json({ 
                success: false, 
                error: 'RATE_LIMIT',
                message: `Please wait ${rateLimit.remainingSeconds} seconds before requesting another code`
            });
        }

        // 2. Get user email
        let userEmail = email;
        if (!userEmail) {
            let userInfo = null;
            if (isProduction) {
                const result = await query('SELECT username FROM users WHERE id = $1', [userId]);
                userInfo = result?.[0] || null;
            } else {
                const db = getDb();
                userInfo = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
            }
            if (!userInfo) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'USER_NOT_FOUND' 
                });
            }
            userEmail = userInfo.username;
        }

        // 3. Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            return res.status(400).json({ 
                success: false, 
                error: 'INVALID_EMAIL',
                message: 'Please set a valid email address first'
            });
        }

        // 4. Check test mode (test users don't need password reset)
        let isTestMode = false;
        if (isProduction) {
            const result = await query('SELECT is_test_mode FROM users WHERE id = $1', [userId]);
            isTestMode = result?.[0]?.is_test_mode === true;
        } else {
            const db = getDb();
            const userMode = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
            isTestMode = userMode?.is_test_mode === 1;
        }
        
        if (isTestMode) {
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users do not need password reset'
            });
        }

        // 5. Generate and store verification code
        const code = storeVerificationCode(userId.toString(), 'reset_paypassword');
        
        // 6. Record send time for rate limiting
        recordSendTime(userId.toString());
        
        // 7. Send email
        const emailSent = await sendVerificationEmail(userEmail, code);
        
        if (emailSent) {
            logger.info(`Password reset code sent to user ${userId} (${userEmail})`);
            res.json({
                success: true,
                message: 'Verification code sent to your email',
                data: {
                    code: process.env.NODE_ENV === 'development' ? code : undefined
                }
            });
        } else {
            logger.error(`Failed to send password reset code to user ${userId}`);
            res.status(500).json({
                success: false,
                error: 'EMAIL_SEND_FAILED',
                message: 'Failed to send verification email. Please try again later.'
            });
        }
    } catch (error) {
        logger.error('Send password reset code error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// ====================================================
// Helper function: Get VIP level text
// ====================================================
function getVipLevelText(level) {
    const levelMap = {
        0: 'Regular',
        1: 'Bronze',
        2: 'Silver',
        3: 'Gold',
        4: 'Platinum'
    };
    return levelMap[level] || 'Regular';
}

export default router;