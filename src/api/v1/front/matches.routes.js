import express from 'express';
import { getDb } from '../../../database/connection.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

/**
 * 获取球队队徽显示URL（降级逻辑）
 * 如果队徽不存在或为默认路径，返回 null，让前端显示首字母徽章
 */
function getLogoUrl(logoUrl) {
    if (!logoUrl) return null;
    if (logoUrl === '/uploads/teams/default.png') return null;
    return logoUrl;
}

// ==================== 获取比赛列表（只返回已啟用的比賽）====================
router.get('/', (req, res) => {
    console.log('=== GET /api/v1/matches called ===');
    
    try {
        const db = getDb();
        
        const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
        const hasHomeLogo = tableInfo.some(col => col.name === 'home_logo');
        const hasAwayLogo = tableInfo.some(col => col.name === 'away_logo');
        const hasIsActive = tableInfo.some(col => col.name === 'is_active');
        
        let query = `
            SELECT 
                id,
                match_id,
                home_team,
                away_team,
                league,
                match_time,
                execution_rate,
                min_authorization,
                match_limit,
                status,
                CASE 
                    WHEN datetime(match_time) > datetime('now') THEN 1 
                    ELSE 0 
                END as is_open
        `;
        
        if (hasHomeLogo) {
            query += `, home_logo`;
        } else {
            query += `, NULL as home_logo`;
        }
        
        if (hasAwayLogo) {
            query += `, away_logo`;
        } else {
            query += `, NULL as away_logo`;
        }
        
        if (hasIsActive) {
            query += ` FROM matches WHERE is_active = 1 AND (status = 'upcoming' OR status = 'pending') AND datetime(match_time) > datetime('now')`;
        } else {
            query += ` FROM matches WHERE (status = 'upcoming' OR status = 'pending') AND datetime(match_time) > datetime('now')`;
        }
        
        query += ` ORDER BY match_time ASC LIMIT 200`;
        
        const matches = db.prepare(query).all();
        
        // 处理队徽降级
        const processedMatches = matches.map(match => ({
            ...match,
            home_logo: getLogoUrl(match.home_logo),
            away_logo: getLogoUrl(match.away_logo)
        }));
        
        console.log(`找到 ${processedMatches.length} 場可授權比賽`);
        
        res.json({
            success: true,
            data: processedMatches,
            total: processedMatches.length
        });
        
    } catch (error) {
        console.error('獲取比賽列表失敗:', error);
        logger.error('Error fetching matches:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 获取单场比赛详情 ====================
router.get('/:matchId', (req, res) => {
    const { matchId } = req.params;
    console.log(`=== GET /api/v1/matches/${matchId} called ===`);
    
    try {
        const db = getDb();
        
        const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
        const hasHomeLogo = tableInfo.some(col => col.name === 'home_logo');
        const hasAwayLogo = tableInfo.some(col => col.name === 'away_logo');
        const hasIsActive = tableInfo.some(col => col.name === 'is_active');
        
        let query = `
            SELECT 
                id,
                match_id,
                home_team,
                away_team,
                league,
                match_time,
                execution_rate,
                min_authorization,
                match_limit,
                status
        `;
        
        if (hasHomeLogo) {
            query += `, home_logo`;
        } else {
            query += `, NULL as home_logo`;
        }
        
        if (hasAwayLogo) {
            query += `, away_logo`;
        } else {
            query += `, NULL as away_logo`;
        }
        
        if (hasIsActive) {
            query += ` FROM matches WHERE (match_id = ? OR id = ?) AND is_active = 1`;
        } else {
            query += ` FROM matches WHERE match_id = ? OR id = ?`;
        }
        
        const match = db.prepare(query).get(matchId, matchId);
        
        if (!match) {
            return res.status(404).json({ 
                success: false, 
                error: 'MATCH_NOT_FOUND' 
            });
        }
        
        // 处理队徽降级
        const processedMatch = {
            ...match,
            home_logo: getLogoUrl(match.home_logo),
            away_logo: getLogoUrl(match.away_logo)
        };
        
        res.json({
            success: true,
            data: processedMatch
        });
        
    } catch (error) {
        console.error('獲取比賽詳情失敗:', error);
        logger.error('Error fetching match:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 按聯賽分組獲取比賽（用於前台展示）====================
router.get('/grouped/by-league', (req, res) => {
    console.log('=== GET /api/v1/matches/grouped/by-league called ===');
    
    try {
        const db = getDb();
        
        const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
        const hasHomeLogo = tableInfo.some(col => col.name === 'home_logo');
        const hasAwayLogo = tableInfo.some(col => col.name === 'away_logo');
        const hasIsActive = tableInfo.some(col => col.name === 'is_active');
        
        let selectFields = `
            m.league,
            COUNT(*) as count,
            json_group_array(
                json_object(
                    'id', m.id,
                    'match_id', m.match_id,
                    'home_team', m.home_team,
                    'away_team', m.away_team,
                    'match_time', m.match_time
        `;
        
        if (hasHomeLogo) {
            selectFields += `, 'home_logo', m.home_logo`;
        }
        
        if (hasAwayLogo) {
            selectFields += `, 'away_logo', m.away_logo`;
        }
        
        selectFields += `)) as matches`;
        
        let whereClause = '';
        if (hasIsActive) {
            whereClause = 'WHERE m.is_active = 1 AND (m.status = "upcoming" OR m.status = "pending") AND datetime(m.match_time) > datetime("now")';
        } else {
            whereClause = 'WHERE (m.status = "upcoming" OR m.status = "pending") AND datetime(m.match_time) > datetime("now")';
        }
        
        const query = `
            SELECT ${selectFields}
            FROM matches m
            ${whereClause}
            GROUP BY m.league
            ORDER BY 
                CASE m.league
                    WHEN 'Premier League' THEN 1
                    WHEN 'La Liga' THEN 2
                    WHEN 'Serie A' THEN 3
                    WHEN 'Bundesliga' THEN 4
                    WHEN 'Ligue 1' THEN 5
                    WHEN 'Champions League' THEN 6
                    ELSE 7
                END
        `;
        
        const results = db.prepare(query).all();
        
        // 解析 JSON 并处理队徽降级
        const groupedMatches = results.map(row => {
            const matches = JSON.parse(row.matches);
            const processedMatches = matches.map(match => ({
                ...match,
                home_logo: getLogoUrl(match.home_logo),
                away_logo: getLogoUrl(match.away_logo)
            }));
            return {
                ...row,
                matches: processedMatches
            };
        });
        
        res.json({
            success: true,
            data: groupedMatches
        });
        
    } catch (error) {
        console.error('獲取分組比賽失敗:', error);
        logger.error('Error fetching grouped matches:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 檢查比賽是否可授權 ====================
router.get('/:matchId/check-availability', (req, res) => {
    const { matchId } = req.params;
    
    try {
        const db = getDb();
        
        const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
        const hasIsActive = tableInfo.some(col => col.name === 'is_active');
        
        let query = `
            SELECT 
                id,
                match_time,
                status,
                execution_rate,
                min_authorization,
                match_limit
        `;
        
        if (hasIsActive) {
            query += ` FROM matches WHERE (match_id = ? OR id = ?) AND is_active = 1`;
        } else {
            query += ` FROM matches WHERE match_id = ? OR id = ?`;
        }
        
        const match = db.prepare(query).get(matchId, matchId);
        
        if (!match) {
            return res.json({
                success: false,
                available: false,
                reason: 'MATCH_NOT_AVAILABLE'
            });
        }
        
        const now = new Date();
        const matchTime = new Date(match.match_time);
        const isAvailable = (match.status === 'upcoming' || match.status === 'pending') && matchTime > now;
        
        res.json({
            success: true,
            available: isAvailable,
            match: {
                id: match.id,
                execution_rate: match.execution_rate,
                min_authorization: match.min_authorization,
                match_limit: match.match_limit,
                match_time: match.match_time
            },
            reason: isAvailable ? null : 'MATCH_STARTED_OR_ENDED'
        });
        
    } catch (error) {
        console.error('檢查比賽可用性失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
});

export default router;