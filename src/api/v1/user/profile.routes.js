// src/api/v1/user/profile.routes.js
// ====================================================
// FOOTRADA PROFILE ROUTES
// Language: English (with i18n ready comments)
// i18n标记格式: // i18n: "key" - 用于后续多语言转换
// ====================================================

import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../../../database/connection.js';
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

// All routes require authentication
router.use(auth);

// ====================================================
// GET /api/v1/user/profile
// Get user profile information
// ====================================================
router.get('/', (req, res) => {
    const userId = req.session?.userId;
    const db = getDb();

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED',
            message: 'User not authenticated' // i18n: "error.unauthorized"
        });
    }

    try {
        const user = db.prepare(`
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

        if (!user) {
            logger.warn(`Profile fetch failed: User not found - ID: ${userId}`);
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND',
                message: 'User does not exist' // i18n: "error.user_not_found"
            });
        }

        const userData = {
            id: user.id,
            username: user.username,
            uid: user.uid,
            balance: parseFloat(user.balance || 0).toFixed(2),
            vip_level: user.vip_level || 0,
            is_test_mode: user.is_test_mode === 1,
            has_paypassword: user.is_test_mode === 1 ? false : (user.has_paypassword === 1),
            created_at: user.created_at,
            vip_level_text: getVipLevelText(user.vip_level)
        };

        logger.info(`Profile fetched successfully - User: ${user.username} (${user.is_test_mode ? 'TEST' : 'REAL'})`);

        res.json({
            success: true,
            data: userData
        });
    } catch (error) {
        logger.error('Failed to fetch user profile:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch user profile' // i18n: "error.profile_fetch_failed"
        });
    }
});

// ====================================================
// GET /api/v1/user/profile/paypassword/status
// Check payment password status
// ====================================================
router.get('/paypassword/status', (req, res) => {
    const userId = req.session?.userId;
    const db = getDb();

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED' 
        });
    }

    try {
        const user = db.prepare(`
            SELECT 
                id,
                is_test_mode,
                has_paypassword
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        const responseData = {
            success: true,
            data: {
                has_paypassword: user.is_test_mode ? false : (user.has_paypassword === 1),
                is_test_mode: user.is_test_mode === 1,
                can_set_paypassword: !user.is_test_mode,
                need_paypassword: !user.is_test_mode
            }
        };

        logger.debug(`PayPassword status checked - User: ${userId}, TestMode: ${user.is_test_mode}, HasPassword: ${responseData.data.has_paypassword}`);
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
    const db = getDb();

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
            message: 'Password and confirm password are required' // i18n: "error.paypassword.fields_required"
        });
    }

    if (password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'Passwords do not match' // i18n: "error.paypassword.mismatch"
        });
    }

    if (!/^\d{6}$/.test(password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits' // i18n: "error.paypassword.invalid_format"
        });
    }

    try {
        db.exec('BEGIN TRANSACTION');

        const user = db.prepare(`
            SELECT id, is_test_mode, has_paypassword 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        if (user.is_test_mode) {
            db.exec('ROLLBACK');
            logger.warn(`Test user attempted to set paypassword - User: ${userId}`);
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot set payment password' // i18n: "error.paypassword.test_mode_disabled"
            });
        }

        if (user.has_paypassword) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'ALREADY_SET',
                message: 'Payment password already set' // i18n: "error.paypassword.already_set"
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE users 
            SET 
                has_paypassword = 1,
                paypassword_hash = ?,
                paypassword_set_at = ?,
                paypassword_updated_at = ?
            WHERE id = ?
        `).run(hashedPassword, now, now, userId);

        db.exec('COMMIT');

        logger.info(`PayPassword set successfully - User: ${userId}`);

        res.json({
            success: true,
            message: 'Payment password set successfully', // i18n: "success.paypassword.set"
            data: {
                set_at: now
            }
        });

    } catch (error) {
        db.exec('ROLLBACK');
        logger.error('Failed to set payment password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: 'Failed to set payment password' // i18n: "error.paypassword.set_failed"
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
    const db = getDb();

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
            message: 'Password is required' // i18n: "error.paypassword.password_required"
        });
    }

    try {
        const user = db.prepare(`
            SELECT is_test_mode, has_paypassword, paypassword_hash 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        if (user.is_test_mode) {
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

        if (!user.has_paypassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'PAYPASSWORD_NOT_SET',
                message: 'Payment password not set' // i18n: "error.paypassword.not_set"
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
                message: 'Invalid payment password' // i18n: "error.paypassword.invalid"
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
    const db = getDb();

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
            message: 'All fields are required' // i18n: "error.paypassword.all_fields_required"
        });
    }

    if (new_password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'New passwords do not match' // i18n: "error.paypassword.new_mismatch"
        });
    }

    if (!/^\d{6}$/.test(new_password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits' // i18n: "error.paypassword.invalid_format"
        });
    }

    try {
        db.exec('BEGIN TRANSACTION');

        const user = db.prepare(`
            SELECT is_test_mode, has_paypassword, paypassword_hash 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'USER_NOT_FOUND' 
            });
        }

        if (user.is_test_mode) {
            db.exec('ROLLBACK');
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot change payment password' // i18n: "error.paypassword.test_mode_change_disabled"
            });
        }

        if (!user.has_paypassword) {
            db.exec('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'NOT_SET',
                message: 'Payment password not set' // i18n: "error.paypassword.not_set"
            });
        }

        const isValid = await bcrypt.compare(old_password, user.paypassword_hash);

        if (!isValid) {
            db.exec('ROLLBACK');
            logger.warn(`PayPassword change failed - Invalid old password - User: ${userId}`);
            return res.status(401).json({ 
                success: false, 
                error: 'INVALID_OLD_PASSWORD',
                message: 'Current password is incorrect' // i18n: "error.paypassword.invalid_old"
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE users 
            SET 
                paypassword_hash = ?,
                paypassword_updated_at = ?
            WHERE id = ?
        `).run(hashedPassword, now, userId);

        db.exec('COMMIT');

        logger.info(`PayPassword changed successfully - User: ${userId}`);

        res.json({
            success: true,
            message: 'Payment password changed successfully', // i18n: "success.paypassword.changed"
            data: {
                updated_at: now
            }
        });

    } catch (error) {
        db.exec('ROLLBACK');
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
    const db = getDb();

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
            message: 'Verification code and new password are required' // i18n: "error.paypassword.reset_fields_required"
        });
    }

    if (new_password !== confirm_password) {
        return res.status(400).json({ 
            success: false, 
            error: 'PASSWORD_MISMATCH',
            message: 'New passwords do not match' // i18n: "error.paypassword.new_mismatch"
        });
    }

    if (!/^\d{6}$/.test(new_password)) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_PASSWORD_FORMAT',
            message: 'Payment password must be 6 digits' // i18n: "error.paypassword.invalid_format"
        });
    }

    try {
        const user = db.prepare(`
            SELECT is_test_mode 
            FROM users 
            WHERE id = ?
        `).get(userId);

        if (user.is_test_mode) {
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users cannot reset payment password' // i18n: "error.paypassword.test_mode_reset_disabled"
            });
        }

        // Verify verification code
        const isValidCode = verifyCode(userId.toString(), verification_code, 'reset_paypassword');
        
        if (!isValidCode) {
            return res.status(400).json({ 
                success: false, 
                error: 'INVALID_CODE',
                message: 'Invalid or expired verification code' // i18n: "error.paypassword.invalid_code"
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE users 
            SET 
                has_paypassword = 1,
                paypassword_hash = ?,
                paypassword_updated_at = ?
            WHERE id = ?
        `).run(hashedPassword, now, userId);

        logger.info(`PayPassword reset successfully - User: ${userId} (with verification code)`);

        res.json({
            success: true,
            message: 'Payment password reset successfully' // i18n: "success.paypassword.reset"
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
    const db = getDb();

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
                message: `Please wait ${rateLimit.remainingSeconds} seconds before requesting another code` // i18n: "error.rate_limit"
            });
        }

        // 2. Get user email
        let userEmail = email;
        if (!userEmail) {
            const userInfo = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
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
                message: 'Please set a valid email address first' // i18n: "error.invalid_email"
            });
        }

        // 4. Check test mode (test users don't need password reset)
        const userMode = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        if (userMode?.is_test_mode) {
            return res.status(403).json({ 
                success: false, 
                error: 'TEST_MODE_USER',
                message: 'Test mode users do not need password reset' // i18n: "error.paypassword.test_mode_reset_disabled"
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
                message: 'Verification code sent to your email', // i18n: "success.paypassword.code_sent"
                data: {
                    // Development only: return code for testing
                    code: process.env.NODE_ENV === 'development' ? code : undefined
                }
            });
        } else {
            logger.error(`Failed to send password reset code to user ${userId}`);
            res.status(500).json({
                success: false,
                error: 'EMAIL_SEND_FAILED',
                message: 'Failed to send verification email. Please try again later.' // i18n: "error.email_send_failed"
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
        0: 'Regular',    // i18n: "vip.regular"
        1: 'Bronze',     // i18n: "vip.bronze"
        2: 'Silver',     // i18n: "vip.silver"
        3: 'Gold',       // i18n: "vip.gold"
        4: 'Platinum'    // i18n: "vip.platinum"
    };
    return levelMap[level] || 'Regular';
}

export default router;