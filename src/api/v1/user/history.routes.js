/**
 * FOOTRADAPRO - History Routes
 * @description 用户历史授权和结果查询接口
 * 修改说明：适配新的 authorizations 表结构
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要用户认证
router.use(auth);

// ==================== 获取用户交易统计 ====================
router.get('/stats', (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    
    try {
        // 获取用户统计信息
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win_count,
                COALESCE(SUM(profit), 0) as total_profit,
                (SELECT vip_level FROM users WHERE id = ?) as vip_level
            FROM authorizations 
            WHERE user_id = ? AND status = 'settled'
        `).get(userId, userId);
        
        const winRate = stats.total_trades > 0 
            ? (stats.win_count / stats.total_trades * 100).toFixed(1)
            : 0;
        
        res.json({
            success: true,
            data: {
                totalTrades: stats.total_trades || 0,
                winRate: parseFloat(winRate),
                totalProfit: stats.total_profit || 0,
                vipLevel: stats.vip_level || 0
            }
        });
        
    } catch (error) {
        logger.error('获取用户统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取用户历史报告列表 ====================
router.get('/list', (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    const { filter } = req.query;
    
    try {
        let query = `
            SELECT 
                a.id,
                a.auth_id,
                a.match_id,
                a.amount,
                a.executed_amount,
                a.profit,
                a.status,
                a.created_at,
                m.home_team,
                m.away_team,
                m.league,
                m.match_time,
                m.result as actual_result,
                m.final_score,
                COALESCE(r.status, 'draft') as report_status,
                r.id as report_id
            FROM authorizations a
            JOIN matches m ON a.match_id = m.id
            LEFT JOIN reports r ON m.id = r.match_id AND r.status = 'published'
            WHERE a.user_id = ? AND a.status = 'settled'
        `;
        
        const params = [userId];
        
        // 应用筛选
        if (filter === 'win') {
            query += ' AND a.profit > 0';
        } else if (filter === 'loss') {
            query += ' AND a.profit <= 0';
        } else if (filter === 'week') {
            query += " AND a.created_at >= datetime('now', '-7 days')";
        } else if (filter === 'month') {
            query += " AND a.created_at >= datetime('now', '-30 days')";
        }
        
        query += ' ORDER BY a.created_at DESC';
        
        const authorizations = db.prepare(query).all(...params);
        
        // 格式化返回数据
        const reports = authorizations.map(auth => {
            // 计算平台抽成和用户收益
            const platformFee = auth.profit > 0 ? auth.profit * 0.2 : 0;
            const userProfit = auth.profit - platformFee;
            
            return {
                id: auth.id,
                auth_id: auth.auth_id,
                date: auth.created_at.split('T')[0],
                teams: `${auth.home_team} vs ${auth.away_team}`,
                league: auth.league,
                amount: auth.amount,
                executedAmount: auth.executed_amount,
                result: auth.profit > 0 ? 'win' : 'loss',
                profit: auth.profit,
                userProfit: userProfit,
                platformFee: platformFee,
                finalScore: auth.final_score,
                verifiable: auth.report_status === 'published',
                reportId: auth.report_id,
                match_id: auth.match_id
            };
        });
        
        res.json({ success: true, data: reports });
        
    } catch (error) {
        logger.error('获取历史报告失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个授权结果 ====================
router.get('/:authId', (req, res) => {
    const { authId } = req.params;
    const db = getDb();
    const userId = req.session.userId;
    
    try {
        const auth = db.prepare(`
            SELECT 
                a.*,
                m.home_team,
                m.away_team,
                m.league,
                m.match_time,
                m.result as match_result,
                m.final_score,
                u.vip_level
            FROM authorizations a
            JOIN matches m ON a.match_id = m.id
            JOIN users u ON a.user_id = u.id
            WHERE a.auth_id = ? AND a.user_id = ?
        `).get(authId, userId);
        
        if (!auth) {
            return res.status(404).json({ success: false, error: 'NOT_FOUND' });
        }
        
        // 计算平台抽成和用户收益
        const platformFee = auth.profit > 0 ? auth.profit * 0.2 : 0;
        const userProfit = auth.profit - platformFee;
        
        res.json({
            success: true,
            data: {
                auth_id: auth.auth_id,
                match_id: auth.match_id,
                home_team: auth.home_team,
                away_team: auth.away_team,
                final_score: auth.final_score,
                league: auth.league,
                match_time: auth.match_time,
                amount: auth.amount,
                executed_amount: auth.executed_amount,
                vip_level: auth.vip_level,
                profit: auth.profit,
                platform_fee: platformFee,
                user_profit: userProfit,
                status: auth.status,
                created_at: auth.created_at,
                settled_at: auth.settled_at
            }
        });
        
    } catch (error) {
        logger.error('获取授权结果失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;