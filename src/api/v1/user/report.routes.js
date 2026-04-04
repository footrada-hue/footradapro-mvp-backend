/**
 * FOOTRADAPRO - 用戶端報告API路由
 * @description 用戶查看比賽報告，檢查授權權限
 * @feature 支援沙盒用戶，測試用戶也能查看報告
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
router.use(auth);

// ==================== 獲取比賽報告 ====================
router.get('/:matchId', (req, res) => {
    const { matchId } = req.params;
    const userId = req.session.userId;
    const db = getDb();

    try {
        // 1. 檢查用戶是否有授權該比賽
        const authCheck = db.prepare(`
            SELECT id FROM authorizations 
            WHERE match_id = ? AND user_id = ?
        `).get(matchId, userId);

        if (!authCheck) {
            return res.status(403).json({ 
                success: false, 
                error: 'UNAUTHORIZED',
                message: '您沒有授權該比賽，無法查看報告'
            });
        }

        // 2. 獲取比賽信息（用於返回）
        const match = db.prepare(`
            SELECT 
                home_team, 
                away_team, 
                league, 
                match_time
            FROM matches 
            WHERE match_id = ?
        `).get(matchId);

        // 3. 獲取報告 - 將 ai_deepdive 映射為 report_text
const report = db.prepare(`
    SELECT 
        r.match_id,
        m.home_score,
        m.away_score,
        r.ai_deepdive as report_text,
        r.status,
        r.created_at,
        r.published_at
    FROM reports r
    LEFT JOIN matches m ON r.match_id = m.match_id
    WHERE r.match_id = ? AND r.status = 'published'
`).get(matchId);

        if (!report) {
            return res.status(404).json({ 
                success: false, 
                error: 'REPORT_NOT_FOUND',
                message: '該比賽報告尚未發布'
            });
        }

        // 4. 獲取用戶是否為測試模式
        const user = db.prepare(`
            SELECT is_test_mode FROM users WHERE id = ?
        `).get(userId);

        // 5. 組合返回數據
        res.json({
            success: true,
            data: {
                match_id: report.match_id,
                home_team: match?.home_team || '主隊',
                away_team: match?.away_team || '客隊',
                league: match?.league || '未知聯賽',
                match_time: match?.match_time,
                home_score: report.home_score || 0,
                away_score: report.away_score || 0,
                report_text: report.report_text || '',  // ✅ 前端用這個字段
                created_at: report.created_at,
                published_at: report.published_at,
                is_test_mode: user?.is_test_mode || false
            }
        });

    } catch (error) {
        console.error('獲取報告失敗:', error);
        logger.error('獲取報告失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

export default router;