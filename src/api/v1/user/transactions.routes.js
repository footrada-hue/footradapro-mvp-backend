// src/api/v1/user/transactions.routes.js
import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

// 获取用户交易统计 - 根據 mode 區分測試/真實模式
router.get('/stats', (req, res) => {
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

        // 已結算包含：won, lost, settled
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win,
                SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) as loss
            FROM authorizations 
            WHERE user_id = ? AND is_test = ? AND status IN ('won', 'lost', 'settled')
        `).get(userId, isTestValue);

        logger.info(`用戶 ${userId} 獲取交易統計 [${queryMode ? '測試' : '真實'}]: 總交易=${stats.total || 0}, 盈利=${stats.win || 0}, 虧損=${stats.loss || 0}`);

        res.json({
            success: true,
            data: {
                total: stats.total || 0,
                win: stats.win || 0,
                loss: stats.loss || 0,
                mode: queryMode ? 'test' : 'live'
            }
        });

    } catch (error) {
        logger.error('獲取交易統計失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 获取用户交易记录 - 根據 mode 區分測試/真實模式
router.get('/', (req, res) => {
    const userId = req.session.userId;
    const { status, page = 1, limit = 20, mode } = req.query; // 添加 mode 參數
    const offset = (page - 1) * limit;
    const db = getDb();

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;
        const isTestValue = queryMode ? 1 : 0;

 let query = `
    SELECT 
        a.auth_id,
        a.amount,
        a.executed_amount,
        a.profit,
        a.status,
        a.created_at,
        a.is_test,
        m.home_team,
        m.away_team,
        m.league,
        m.match_time,
        m.home_logo,
        m.away_logo
    FROM authorizations a
    LEFT JOIN matches m ON a.match_id = m.match_id
    WHERE a.user_id = ? AND a.is_test = ?
`;
        const params = [userId, isTestValue];

        // 統一處理狀態篩選
        if (status && status !== 'all') {
            if (status === 'settled') {
                // 已結算包含 won 和 lost
                query += ' AND a.status IN (?, ?)';
                params.push('won', 'lost');
            } else if (status === 'pending') {
                // 進行中只有 pending
                query += ' AND a.status = ?';
                params.push('pending');
            } else {
                // 其他情況（兼容舊版）
                query += ' AND a.status = ?';
                params.push(status);
            }
        }

        query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const transactions = db.prepare(query).all(...params);

        // 獲取總數（也要統一處理）
        let countQuery = 'SELECT COUNT(*) as total FROM authorizations WHERE user_id = ? AND is_test = ?';
        const countParams = [userId, isTestValue];
        
        if (status && status !== 'all') {
            if (status === 'settled') {
                countQuery += ' AND status IN (?, ?)';
                countParams.push('won', 'lost');
            } else if (status === 'pending') {
                countQuery += ' AND status = ?';
                countParams.push('pending');
            } else {
                countQuery += ' AND status = ?';
                countParams.push(status);
            }
        }

        const { total } = db.prepare(countQuery).get(...countParams);

        logger.info(`用戶 ${userId} 獲取 ${transactions.length} 條交易記錄 [${queryMode ? '測試' : '真實'}]`);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            meta: {
                mode: queryMode ? 'test' : 'live'
            }
        });

    } catch (error) {
        logger.error('獲取交易記錄失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取單個交易詳情 - 支援 auth_id 或 id，並根據 mode 區分
router.get('/:identifier', (req, res) => {
    const { identifier } = req.params;
    const userId = req.session.userId;
    const { mode } = req.query; // 添加 mode 參數
    const db = getDb();

    console.log('=== Get Transaction Detail ===');
    console.log('identifier:', identifier);
    console.log('userId:', userId);

    try {
        // 獲取用戶的測試模式狀態
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        const currentUserMode = user?.is_test_mode || false;
        
        // 確定要查詢的模式：如果傳入了 mode 參數就用它，否則用當前用戶模式
        const queryMode = mode !== undefined ? (mode === 'test') : currentUserMode;
        const isTestValue = queryMode ? 1 : 0;

        // 判斷 identifier 是 auth_id 還是數字 id
        const isAuthId = identifier.startsWith('AUTH_');
        
        let auth;
        if (isAuthId) {
            // 用 auth_id 查詢，並加上 is_test 條件
            auth = db.prepare(`
                SELECT * FROM authorizations 
                WHERE auth_id = ? AND user_id = ? AND is_test = ?
            `).get(identifier, userId, isTestValue);
        } else {
            // 用數字 id 查詢，並加上 is_test 條件
            auth = db.prepare(`
                SELECT * FROM authorizations 
                WHERE id = ? AND user_id = ? AND is_test = ?
            `).get(parseInt(identifier), userId, isTestValue);
        }

        if (!auth) {
            console.log('Authorization not found');
            return res.status(404).json({ success: false, error: 'NOT_FOUND' });
        }

        console.log('Auth found:', {
            id: auth.id,
            auth_id: auth.auth_id,
            match_id: auth.match_id,
            amount: auth.amount,
            status: auth.status,
            is_test: auth.is_test
        });

        // 獲取比賽信息 - 使用 match_id 關聯
        const match = db.prepare(`
            SELECT * FROM matches WHERE match_id = ?
        `).get(auth.match_id);

        console.log('Match found:', match ? {
            id: match.id,
            match_id: match.match_id,
            home_team: match.home_team,
            away_team: match.away_team
        } : 'No match found');

// 合併數據
const transaction = {
    ...auth,
    is_test_mode: auth.is_test === 1,
    home_team: match?.home_team || null,
    away_team: match?.away_team || null,
    league: match?.league || null,
    match_time: match?.match_time || null,
    home_score: match?.home_score || null,
    away_score: match?.away_score || null,
    final_score: match?.final_score || null,
    match_result: match?.result || null,
    home_logo: match?.home_logo || null,
    away_logo: match?.away_logo || null
};

        res.json({ 
            success: true, 
            data: transaction,
            meta: {
                mode: queryMode ? 'test' : 'live'
            }
        });

    } catch (error) {
        console.error('Error getting transaction detail:', error);
        logger.error('獲取交易詳情失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;