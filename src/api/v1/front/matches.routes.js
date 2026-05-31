// src/api/v1/front/matches.routes.js
import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * 获取球队队徽显示URL（降级逻辑）
 * 如果队徽不存在或为默认路径，返回 null，让前端显示首字母徽章
 */
function getLogoUrl(logoUrl) {
    if (!logoUrl) return null;
    if (logoUrl === '/uploads/teams/default.png') return null;
    return logoUrl;
}

// ==================== 获取比赛列表（只返回已启用的比赛）====================
router.get('/', async (req, res) => {
    console.log('=== GET /api/v1/matches called ===');
    
    try {
        let matches = [];
        
        if (isProduction) {
            // PostgreSQL 查询
            const result = await query(`
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
                    home_logo,
                    away_logo,
                    CASE 
                        WHEN match_time > NOW() THEN 1 
                        ELSE 0 
                    END as is_open
                FROM matches 
                WHERE is_active = true 
                    AND (status = 'upcoming' OR status = 'pending') 
                    AND match_time > NOW()
                ORDER BY match_time ASC 
                LIMIT 200
            `);
            matches = result || [];
        } else {
            // SQLite 查询
            const db = getDb();
            
            const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
            const hasHomeLogo = tableInfo.some(col => col.name === 'home_logo');
            const hasAwayLogo = tableInfo.some(col => col.name === 'away_logo');
            const hasIsActive = tableInfo.some(col => col.name === 'is_active');
            
            let sql = `
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
                sql += `, home_logo`;
            } else {
                sql += `, NULL as home_logo`;
            }
            
            if (hasAwayLogo) {
                sql += `, away_logo`;
            } else {
                sql += `, NULL as away_logo`;
            }
            
            if (hasIsActive) {
                sql += ` FROM matches WHERE is_active = 1 AND (status = 'upcoming' OR status = 'pending') AND datetime(match_time) > datetime('now')`;
            } else {
                sql += ` FROM matches WHERE (status = 'upcoming' OR status = 'pending') AND datetime(match_time) > datetime('now')`;
            }
            
            sql += ` ORDER BY match_time ASC LIMIT 200`;
            
            matches = db.prepare(sql).all();
        }
        
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
router.get('/:matchId', async (req, res) => {
    const { matchId } = req.params;
    console.log(`=== GET /api/v1/matches/${matchId} called ===`);
    
    try {
        let match = null;
        
        if (isProduction) {
            // PostgreSQL 查询
            const result = await query(`
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
                    home_logo,
                    away_logo
                FROM matches 
                WHERE (match_id = $1 OR id = $1::INTEGER) AND is_active = true
            `, [matchId]);
            match = result?.[0] || null;
        } else {
            // SQLite 查询
            const db = getDb();
            
            const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
            const hasHomeLogo = tableInfo.some(col => col.name === 'home_logo');
            const hasAwayLogo = tableInfo.some(col => col.name === 'away_logo');
            const hasIsActive = tableInfo.some(col => col.name === 'is_active');
            
            let sql = `
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
                sql += `, home_logo`;
            } else {
                sql += `, NULL as home_logo`;
            }
            
            if (hasAwayLogo) {
                sql += `, away_logo`;
            } else {
                sql += `, NULL as away_logo`;
            }
            
            if (hasIsActive) {
                sql += ` FROM matches WHERE (match_id = ? OR id = ?) AND is_active = 1`;
            } else {
                sql += ` FROM matches WHERE match_id = ? OR id = ?`;
            }
            
            match = db.prepare(sql).get(matchId, matchId);
        }
        
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
router.get('/grouped/by-league', async (req, res) => {
    console.log('=== GET /api/v1/matches/grouped/by-league called ===');
    
    try {
        let groupedMatches = [];
        
        if (isProduction) {
            // PostgreSQL 查询 - 使用 json_agg
            const result = await query(`
                SELECT 
                    league,
                    COUNT(*) as count,
                    json_agg(
                        json_build_object(
                            'id', id,
                            'match_id', match_id,
                            'home_team', home_team,
                            'away_team', away_team,
                            'match_time', match_time,
                            'home_logo', home_logo,
                            'away_logo', away_logo
                        )
                    ) as matches
                FROM matches 
                WHERE is_active = true 
                    AND (status = 'upcoming' OR status = 'pending') 
                    AND match_time > NOW()
                GROUP BY league
                ORDER BY 
                    CASE league
                        WHEN 'Premier League' THEN 1
                        WHEN 'La Liga' THEN 2
                        WHEN 'Serie A' THEN 3
                        WHEN 'Bundesliga' THEN 4
                        WHEN 'Ligue 1' THEN 5
                        WHEN 'Champions League' THEN 6
                        ELSE 7
                    END
            `);
            
            groupedMatches = (result || []).map(row => ({
                league: row.league,
                count: parseInt(row.count),
                matches: row.matches || []
            }));
        } else {
            // SQLite 查询
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
            
            const querySql = `
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
            
            const results = db.prepare(querySql).all();
            
            groupedMatches = results.map(row => ({
                ...row,
                matches: JSON.parse(row.matches)
            }));
        }
        
        // 处理队徽降级
        const processedMatches = groupedMatches.map(group => ({
            ...group,
            matches: group.matches.map(match => ({
                ...match,
                home_logo: getLogoUrl(match.home_logo),
                away_logo: getLogoUrl(match.away_logo)
            }))
        }));
        
        res.json({
            success: true,
            data: processedMatches
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
router.get('/:matchId/check-availability', async (req, res) => {
    const { matchId } = req.params;
    
    try {
        let match = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id,
                    match_time,
                    status,
                    execution_rate,
                    min_authorization,
                    match_limit
                FROM matches 
                WHERE (match_id = $1 OR id = $1::INTEGER) AND is_active = true
            `, [matchId]);
            match = result?.[0] || null;
        } else {
            const db = getDb();
            
            const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
            const hasIsActive = tableInfo.some(col => col.name === 'is_active');
            
            let querySql = `
                SELECT 
                    id,
                    match_time,
                    status,
                    execution_rate,
                    min_authorization,
                    match_limit
            `;
            
            if (hasIsActive) {
                querySql += ` FROM matches WHERE (match_id = ? OR id = ?) AND is_active = 1`;
            } else {
                querySql += ` FROM matches WHERE match_id = ? OR id = ?`;
            }
            
            match = db.prepare(querySql).get(matchId, matchId);
        }
        
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