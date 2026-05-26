// src/api/v1/user/stats.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

// 1. 交易統計 API - 根據 mode 參數區分測試/真實模式
router.get('/trade', (req, res) => {
    const userId = req.session.userId;
    const { mode } = req.query; // 'test' 或 'live'
    const db = getDb();

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;

        // 根據模式決定 is_test 值
        const isTestValue = queryMode ? 1 : 0;

        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
                COALESCE(SUM(profit), 0) as total_profit
            FROM settlements 
            WHERE user_id = ? AND is_test = ?
        `).get(userId, isTestValue);

        const total = stats.total || 0;
        const wins = stats.wins || 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const totalProfit = stats.total_profit || 0;

        logger.info(`用戶 ${userId} 獲取交易統計 [${queryMode ? '測試' : '真實'}]: 總交易=${total}, 勝率=${winRate}%, 總盈虧=${totalProfit}`);

        res.json({
            success: true,
            data: {
                total,
                win_rate: winRate,
                total_profit: totalProfit,
                mode: queryMode ? 'test' : 'live'
            }
        });
    } catch (error) {
        logger.error('交易統計API錯誤:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// 2. 資金統計 API - 根據 mode 參數區分測試/真實模式
router.get('/fund', (req, res) => {
    const userId = req.session.userId;
    const { mode } = req.query; // 'test' 或 'live'
    const db = getDb();

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode, test_balance FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;

        if (queryMode) {
            // 測試模式：返回測試餘額
            const testBalance = user?.test_balance || 10000;
            
            logger.info(`用戶 ${userId} 獲取測試資金統計: 測試餘額=${testBalance}`);

            res.json({
                success: true,
                data: {
                    test_balance: testBalance,
                    mode: 'test'
                }
            });
        } else {
            // 真實模式：從 balance_logs 統計充值/提現
            const deposit = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM balance_logs 
                WHERE user_id = ? AND type = 'deposit' AND amount > 0
            `).get(userId);

            const withdraw = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM balance_logs 
                WHERE user_id = ? AND type = 'withdraw' AND amount < 0
            `).get(userId);

            const totalDeposit = deposit.total || 0;
            const totalWithdraw = Math.abs(withdraw.total || 0);
            const netFund = totalDeposit - totalWithdraw;

            logger.info(`用戶 ${userId} 獲取真實資金統計: 充值=${totalDeposit}, 提現=${totalWithdraw}, 淨資金=${netFund}`);

            res.json({
                success: true,
                data: {
                    total_deposit: totalDeposit,
                    total_withdraw: totalWithdraw,
                    net_fund: netFund,
                    mode: 'live'
                }
            });
        }
    } catch (error) {
        logger.error('資金統計API錯誤:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// 3. 鎖定資金 API - 統計進行中的授權總金額
router.get('/locked', (req, res) => {
    const userId = req.session.userId;
    const { mode } = req.query; // 'test' 或 'live'
    const db = getDb();

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;
        const isTestValue = queryMode ? 1 : 0;

        // 統計進行中的授權 (status = 'pending' 或 'upcoming')
        const locked = db.prepare(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total
            FROM authorizations 
            WHERE user_id = ? 
              AND is_test = ?
              AND status IN ('pending', 'upcoming')
        `).get(userId, isTestValue);

        const count = locked.count || 0;
        const total = locked.total || 0;

        logger.info(`用戶 ${userId} 獲取鎖定資金 [${queryMode ? '測試' : '真實'}]: 總金額=${total}, 場次=${count}`);

        res.json({
            success: true,
            data: {
                total: total,
                count: count,
                mode: queryMode ? 'test' : 'live'
            }
        });
    } catch (error) {
        logger.error('鎖定資金API錯誤:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

// 4. 活動時間軸 API - 根據 mode 參數區分測試/真實模式
router.get('/activities', (req, res) => {
    const userId = req.session.userId;
    const limit = parseInt(req.query.limit) || 10;
    const { mode, type } = req.query; // mode: 'test'/'live', type: 'trade'/'all'
    const db = getDb();

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;
        const isTestValue = queryMode ? 1 : 0;

        let activities = [];

        if (type === 'trade' || !type) {
            // 獲取交易記錄（根據模式過濾），並返回狀態
            const trades = db.prepare(`
                SELECT 
                    'trade' as type,
                    a.id,
                    a.auth_id,
                    a.amount,
                    a.profit,
                    a.status,
                    a.created_at,
                    a.is_test,
                    m.home_team,
                    m.away_team,
                    m.league
                FROM authorizations a
                LEFT JOIN matches m ON a.match_id = m.match_id
                WHERE a.user_id = ? AND a.is_test = ?
                ORDER BY a.created_at DESC
                LIMIT ?
            `).all(userId, isTestValue, limit);
            
            activities = trades;
        }

        logger.info(`用戶 ${userId} 獲取 ${activities.length} 條活動記錄 [${queryMode ? '測試' : '真實'}]`);

        res.json({
            success: true,
            data: activities,
            meta: {
                mode: queryMode ? 'test' : 'live',
                total: activities.length
            }
        });
    } catch (error) {
        logger.error('獲取活動失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});
// 5. 图表数据 API - 按日期统计授权金额和盈亏
router.get('/chart', (req, res) => {
    const userId = req.session.userId;
    const { mode, days = 30 } = req.query; // mode: 'test'/'live', days: 7/30/90/365
    const db = getDb();

    try {
        // 获取用户的测试模式状态
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 确定要查询的模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;
        const isTestValue = queryMode ? 1 : 0;
        
        const daysNum = parseInt(days) || 30;
        
        // 生成日期数组
        const labels = [];
        const authorizedData = [];
        const profitData = [];
        
        for (let i = daysNum - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // 格式化显示标签
            let label = '';
            if (daysNum <= 7) {
                // 1D 或 1W: 显示 MM/DD
                label = `${month}/${day}`;
            } else if (daysNum <= 31) {
                // 1M: 显示 MM/DD
                label = `${month}/${day}`;
            } else if (daysNum <= 93) {
                // 3M: 显示 MM/DD
                label = `${month}/${day}`;
            } else {
                // 1Y: 显示 MM
                label = `${month}月`;
            }
            labels.push(label);
            
            // 查询当日授权金额
            const auth = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM authorizations
                WHERE user_id = ? AND is_test = ? AND date(created_at) = ?
            `).get(userId, isTestValue, dateStr);
            authorizedData.push(auth.total || 0);
            
            // 查询当日盈亏
            const profit = db.prepare(`
                SELECT COALESCE(SUM(profit), 0) as total
                FROM settlements
                WHERE user_id = ? AND is_test = ? AND date(settled_at) = ?
            `).get(userId, isTestValue, dateStr);
            profitData.push(profit.total || 0);
        }
        
        logger.info(`用户 ${userId} 获取图表数据 [${queryMode ? '测试' : '真实'}]: ${daysNum}天`);

        res.json({
            success: true,
            data: {
                labels: labels,
                authorized: authorizedData,
                profit: profitData,
                mode: queryMode ? 'test' : 'live',
                days: daysNum
            }
        });
    } catch (error) {
        logger.error('图表数据API错误:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});
export default router;