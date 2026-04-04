import express from 'express';
import { getDb } from '../../database/connection.js';
import { auth, filterByMode, requireTestMode } from '../../middlewares/auth.middleware.js';
// ✅ 正確導入：從 user/ 目錄下導入
import profileRoutes from './user/profile.routes.js';

const router = express.Router();

// ==================== 所有路由都需要认证 ====================
router.use(auth);

// 添加模式過濾中間件（可選）
router.use(filterByMode);

// ==================== 掛載子路由 ====================
// 掛載 profile 相關路由（包含支付密碼API）
router.use('/profile', profileRoutes);

// ==================== 獲取用戶狀態 ====================
router.get('/status', (req, res) => {
    console.log('=== GET /user/status called ===');
    
    const db = getDb();
    const user = db.prepare(
        `SELECT 
            uid, username, balance, test_balance, role, vip_level, 
            total_authorized, is_new_user, has_claimed_bonus, 
            completed_steps, bonus_claimed_at, bonus_expires_at, 
            created_at, is_test_mode, account_status, first_deposit_at,
            has_paypassword
        FROM users 
        WHERE id = ?`
    ).get(req.session.userId);

    if (!user) {
        return res.status(404).json({ 
            success: false, 
            error: 'USER_NOT_FOUND' 
        });
    }

    // 根據模式返回對應的餘額
    const currentBalance = user.is_test_mode ? (user.test_balance || 10000) : user.balance;

    res.json({
        success: true,
        data: {
            ...user,
            balance: currentBalance,
            test_balance: user.test_balance || 10000,
            real_balance: user.balance
        }
    });
});

// ==================== 更新引導步驟 ====================
router.post('/progress', (req, res) => {
    console.log('=== POST /user/progress called ===');
    console.log('Request body:', req.body);
    console.log('Session userId:', req.session.userId);
    
    const { step } = req.body;
    
    if (typeof step !== 'number' || step < 1 || step > 3) {
        return res.status(400).json({ 
            success: false, 
            error: 'INVALID_STEP' 
        });
    }

    const db = getDb();
    
    try {
        // 先查詢當前步驟
        const before = db.prepare('SELECT completed_steps FROM users WHERE id = ?').get(req.session.userId);
        console.log('更新前步驟:', before ? before.completed_steps : '用戶不存在');
        
        // 強制更新
        const result = db.prepare(
            'UPDATE users SET completed_steps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(step, req.session.userId);
        
        console.log('更新結果:', result);
        
        // 驗證更新後的值
        const after = db.prepare('SELECT completed_steps FROM users WHERE id = ?').get(req.session.userId);
        console.log('更新後步驟:', after.completed_steps);

        res.json({ 
            success: true,
            current_step: after.completed_steps
        });
        
    } catch (error) {
        console.error('進度更新錯誤:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 獲取測試餘額（僅測試模式可用）====================
router.get('/test-balance', (req, res) => {
    const db = getDb();
    
    const user = db.prepare(
        'SELECT test_balance, is_test_mode FROM users WHERE id = ?'
    ).get(req.session.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'USER_NOT_FOUND'
        });
    }

    // 如果不是測試模式，返回錯誤
    if (!user.is_test_mode) {
        return res.status(403).json({
            success: false,
            error: 'NOT_TEST_MODE',
            message: 'Test balance is only available in test mode'
        });
    }

    res.json({
        success: true,
        data: {
            balance: user.test_balance || 10000,
            mode: 'test'
        }
    });
});

// ==================== 重置測試資金（僅測試模式可用）====================
router.post('/test-balance/reset', requireTestMode, (req, res) => {
    const db = getDb();
    const DEFAULT_TEST_BALANCE = 10000;
    
    try {
        // 獲取當前測試餘額
        const user = db.prepare('SELECT test_balance FROM users WHERE id = ?').get(req.session.userId);
        const previousBalance = user?.test_balance || DEFAULT_TEST_BALANCE;
        
        // 重置為默認值
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(DEFAULT_TEST_BALANCE, req.session.userId);
        
        // 記錄重置日誌
        db.prepare(`
            INSERT INTO test_reset_logs (user_id, previous_balance, new_balance)
            VALUES (?, ?, ?)
        `).run(req.session.userId, previousBalance, DEFAULT_TEST_BALANCE);
        
        // 記錄資金變動
        db.prepare(`
            INSERT INTO test_balance_logs 
            (user_id, amount, balance_before, balance_after, type, description)
            VALUES (?, ?, ?, ?, 'reset', 'Test funds reset')
        `).run(
            req.session.userId, 
            DEFAULT_TEST_BALANCE - previousBalance, 
            previousBalance, 
            DEFAULT_TEST_BALANCE
        );

        res.json({
            success: true,
            data: {
                balance: DEFAULT_TEST_BALANCE,
                previous_balance: previousBalance,
                message: 'Test funds reset successfully'
            }
        });
        
    } catch (error) {
        console.error('重置測試資金錯誤:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to reset test balance'
        });
    }
});

// ==================== 獲取用戶資料 ====================
router.get('/profile', (req, res) => {
    const db = getDb();
    
    const user = db.prepare(
        `SELECT 
            uid, 
            username, 
            balance, 
            test_balance,
            role, 
            status, 
            created_at, 
            vip_level, 
            total_authorized, 
            is_new_user, 
            has_claimed_bonus, 
            completed_steps, 
            is_test_mode, 
            account_status, 
            first_deposit_at,
            has_paypassword
        FROM users 
        WHERE id = ?`
    ).get(req.session.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'USER_NOT_FOUND'
        });
    }

    // 格式化返回數據
    const userData = {
        uid: user.uid,
        username: user.username,
        balance: parseFloat(user.is_test_mode ? (user.test_balance || 10000) : (user.balance || 0)).toFixed(2),
        test_balance: parseFloat(user.test_balance || 10000).toFixed(2),
        real_balance: parseFloat(user.balance || 0).toFixed(2),
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        vip_level: user.vip_level || 0,
        total_authorized: user.total_authorized || 0,
        is_new_user: user.is_new_user === 1,
        has_claimed_bonus: user.has_claimed_bonus === 1,
        completed_steps: user.completed_steps || 0,
        is_test_mode: user.is_test_mode === 1,
        account_status: user.account_status,
        first_deposit_at: user.first_deposit_at,
        has_paypassword: user.is_test_mode === 1 ? false : (user.has_paypassword === 1)
    };

    res.json({
        success: true,
        data: userData
    });
});

export default router;
// ==================== 临时调试接口 ====================
router.get('/debug/users', (req, res) => {
    try {
        const db = getDb();
        const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id DESC LIMIT 20').all();
        res.json({ 
            success: true, 
            count: users.length,
            data: users 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/debug/db-status', (req, res) => {
    try {
        const db = getDb();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get();
        res.json({ 
            success: true, 
            tables: tables.map(t => t.name),
            userCount: userCount.count,
            dbPath: config.DB_PATH
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});