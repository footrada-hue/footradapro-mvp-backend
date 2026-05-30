/**
 * FOOTRADAPRO MVP - Admin Match Management Routes
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';
import fetch from 'node-fetch';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { autoFetchAndInsertMatches } from '../../../services/match-auto-fetch.service.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// ==================== 所有路由需要管理员认证 ====================
router.use(adminAuth);

// ==================== 获取联赛列表（必须在 /:id 之前）====================
router.get('/leagues', async (req, res) => {
    try {
        let leagues = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT league, COUNT(*) as match_count
                FROM matches 
                WHERE league IS NOT NULL AND league != ''
                GROUP BY league
                ORDER BY match_count DESC
            `);
            leagues = result || [];
        } else {
            const db = getDb();
            leagues = db.prepare(`
                SELECT league, COUNT(*) as match_count
                FROM matches 
                WHERE league IS NOT NULL AND league != ''
                GROUP BY league
                ORDER BY match_count DESC
            `).all();
        }
        
        res.json({ success: true, data: leagues });
    } catch (error) {
        logger.error('Fetch leagues error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取缺少队徽的球队列表（必须在 /:id 之前）====================
router.get('/missing-logos', async (req, res) => {
    const { league, search } = req.query;
    
    try {
        let sql = `
            SELECT 
                tl.team_name,
                tl.involved_matches,
                tl.logo_status,
                COALESCE(
                    (SELECT league FROM matches WHERE home_team = tl.team_name OR away_team = tl.team_name LIMIT 1),
                    'Unknown'
                ) as league
            FROM team_logos tl
            WHERE tl.logo_status = 'missing'
        `;
        const params = [];
        
        if (league && league !== 'all') {
            if (isProduction) {
                sql += ` AND league = $${params.length + 1}`;
            } else {
                sql += ` AND league = ?`;
            }
            params.push(league);
        }
        if (search) {
            if (isProduction) {
                sql += ` AND tl.team_name LIKE $${params.length + 1}`;
            } else {
                sql += ` AND tl.team_name LIKE ?`;
            }
            params.push(`%${search}%`);
        }
        sql += ` ORDER BY tl.involved_matches DESC, tl.team_name`;
        
        let teams = [];
        if (isProduction) {
            const result = await query(sql, params);
            teams = result || [];
        } else {
            const db = getDb();
            teams = db.prepare(sql).all(...params);
        }
        
        res.json({ success: true, data: teams });
    } catch (error) {
        logger.error('Get missing logos error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取比赛统计概览 ====================
router.get('/stats/overview', async (req, res) => {
    try {
        let stats = {};
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
                    SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as live,
                    SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished,
                    COUNT(DISTINCT source) as sources,
                    MIN(match_time) as oldest_match,
                    MAX(match_time) as newest_match
                FROM matches
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
                    SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as live,
                    SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished,
                    COUNT(DISTINCT source) as sources,
                    MIN(match_time) as oldest_match,
                    MAX(match_time) as newest_match
                FROM matches
            `).get();
        }
        
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('Get stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 從 matches 表獲取所有球隊信息（直接用於管理）====================
router.get('/all-teams-from-matches', async (req, res) => {
    const { search } = req.query;
    
    try {
        let teams = [];
        
        if (isProduction) {
            let sql = `
                SELECT DISTINCT 
                    team_name,
                    COUNT(*) as involved_matches
                FROM (
                    SELECT home_team as team_name FROM matches
                    UNION ALL
                    SELECT away_team as team_name FROM matches
                ) sub
                WHERE 1=1
            `;
            const params = [];
            
            if (search) {
                sql += ` AND team_name LIKE $1`;
                params.push(`%${search}%`);
            }
            
            sql += ` GROUP BY team_name ORDER BY team_name`;
            
            const result = await query(sql, params);
            teams = result || [];
        } else {
            const db = getDb();
            let sql = `
                SELECT DISTINCT 
                    team_name,
                    COUNT(*) as involved_matches
                FROM (
                    SELECT home_team as team_name FROM matches
                    UNION ALL
                    SELECT away_team as team_name FROM matches
                )
                WHERE 1=1
            `;
            const params = [];
            
            if (search) {
                sql += ` AND team_name LIKE ?`;
                params.push(`%${search}%`);
            }
            
            sql += ` GROUP BY team_name ORDER BY team_name`;
            
            teams = db.prepare(sql).all(...params);
        }
        
        const results = [];
        for (const team of teams) {
            let logoUrl = null;
            let league = null;
            
            try {
                if (isProduction) {
                    const logoResult = await query(`
                        SELECT home_logo as logo_url FROM matches WHERE home_team = $1 AND home_logo IS NOT NULL AND home_logo != ''
                        UNION ALL
                        SELECT away_logo as logo_url FROM matches WHERE away_team = $1 AND away_logo IS NOT NULL AND away_logo != ''
                        LIMIT 1
                    `, [team.team_name]);
                    if (logoResult && logoResult.length > 0) logoUrl = logoResult[0].logo_url;
                    
                    const leagueResult = await query(`
                        SELECT league FROM matches WHERE home_team = $1 OR away_team = $1 LIMIT 1
                    `, [team.team_name]);
                    if (leagueResult && leagueResult.length > 0) league = leagueResult[0].league;
                } else {
                    const db = getDb();
                    const logoResult = db.prepare(`
                        SELECT home_logo as logo_url FROM matches WHERE home_team = ? AND home_logo IS NOT NULL AND home_logo != ''
                        UNION ALL
                        SELECT away_logo as logo_url FROM matches WHERE away_team = ? AND away_logo IS NOT NULL AND away_logo != ''
                        LIMIT 1
                    `).get(team.team_name, team.team_name);
                    if (logoResult) logoUrl = logoResult.logo_url;
                    
                    const leagueResult = db.prepare(`
                        SELECT league FROM matches WHERE home_team = ? OR away_team = ? LIMIT 1
                    `).get(team.team_name, team.team_name);
                    if (leagueResult) league = leagueResult.league;
                }
            } catch(e) {}
            
            results.push({
                team_name: team.team_name,
                league: league || 'Unknown',
                involved_matches: team.involved_matches,
                logo_url: logoUrl || null
            });
        }
        
        res.json({ success: true, data: results });
    } catch (error) {
        logger.error('Get all teams from matches error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取比赛列表（分页）====================
router.get('/list', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    try {
        let queryStr = 'SELECT * FROM matches';
        let countQuery = 'SELECT COUNT(*) as total FROM matches';
        const params = [];

        if (status && status !== 'all') {
            if (isProduction) {
                queryStr += ' WHERE status = $1';
                countQuery += ' WHERE status = $1';
            } else {
                queryStr += ' WHERE status = ?';
                countQuery += ' WHERE status = ?';
            }
            params.push(status);
        }

        if (isProduction) {
            queryStr += ' ORDER BY match_time DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            
            const totalResult = await query(countQuery, params);
            const total = totalResult?.[0]?.total || 0;
            
            const matches = await query(queryStr, [...params, limit, offset]);
            
            res.json({
                success: true,
                data: matches || [],
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } else {
            const db = getDb();
            queryStr += ' ORDER BY match_time DESC LIMIT ? OFFSET ?';
            
            const { total } = db.prepare(countQuery).get(...params);
            const matches = db.prepare(queryStr).all(...params, limit, offset);
            
            res.json({
                success: true,
                data: matches,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        }
    } catch (error) {
        logger.error('Fetch matches list error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 自动从 DeepSeek AI 获取比赛数据 ====================
router.post('/auto-fetch', async (req, res) => {
    try {
        logger.info('Starting auto-fetch matches from DeepSeek AI...');
        
        const results = await autoFetchAndInsertMatches();
        
        logger.info(`Auto-fetch completed: ${results.newToMatches} new matches added, total: ${results.total}`);
        
        res.json({
            success: true,
            message: `成功获取 ${results.newToMatches} 场新比赛`,
            data: {
                total: results.total,
                newToPool: results.newToPool,
                newToMatches: results.newToMatches,
                skipped: results.skipped,
                errors: results.errors,
                matches: results.matches
            }
        });
        
    } catch (error) {
        logger.error('Auto-fetch matches error:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: error.message
        });
    }
});

// ==================== 获取单个比赛 ====================
router.get('/:id',
    [param('id').notEmpty()],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, error: 'VALIDATION_ERROR' });
        }

        const { id } = req.params;

        try {
            let match = null;
            
            if (isProduction) {
                const result = await query('SELECT * FROM matches WHERE id = $1', [id]);
                match = result?.[0];
            } else {
                const db = getDb();
                match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
            }
            
            if (!match) {
                return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
            }

            res.json({ success: true, data: match });
        } catch (error) {
            logger.error(`Fetch match ${id} error:`, error);
            res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
        }
    }
);

// ==================== 添加比赛 ====================
router.post('/add', async (req, res) => {
    const {
        match_id, home_team, away_team, league,
        match_time, cutoff_time,
        execution_rate = 30,
        min_authorization = 100,
        match_limit = 500,
        source = 'manual',
        is_active = 1
    } = req.body;

    try {
        let existing = null;
        
        if (isProduction) {
            const result = await query('SELECT id FROM matches WHERE match_id = $1', [match_id]);
            existing = result?.[0];
        } else {
            const db = getDb();
            existing = db.prepare('SELECT id FROM matches WHERE match_id = ?').get(match_id);
        }
        
        if (existing) {
            return res.status(409).json({ success: false, error: 'MATCH_ID_EXISTS' });
        }

        if (isProduction) {
            await query(`
                INSERT INTO matches (
                    match_id, home_team, away_team, league, 
                    match_time, cutoff_time, 
                    execution_rate, min_authorization, match_limit,
                    status, is_active, source, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'upcoming', $10, $11, NOW(), NOW())
            `, [
                match_id, home_team, away_team, league || 'Unknown',
                match_time, cutoff_time,
                execution_rate, min_authorization, match_limit,
                is_active, source
            ]);
        } else {
            const db = getDb();
            db.prepare(`
                INSERT INTO matches (
                    match_id, home_team, away_team, league, 
                    match_time, cutoff_time, 
                    execution_rate, min_authorization, match_limit,
                    status, is_active, source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, datetime('now'), datetime('now'))
            `).run(
                match_id, home_team, away_team, league || 'Unknown',
                match_time, cutoff_time,
                execution_rate, min_authorization, match_limit,
                is_active, source
            );
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Add match error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 更新比赛 ====================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
        let existing = null;
        
        if (isProduction) {
            const result = await query('SELECT id FROM matches WHERE id = $1', [id]);
            existing = result?.[0];
        } else {
            const db = getDb();
            existing = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
        }
        
        if (!existing) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }

        const fields = [];
        const values = [];
        const allowedFields = [
            'home_team', 'away_team', 'league', 
            'match_time', 'cutoff_time',
            'execution_rate', 'min_authorization', 'match_limit',
            'status', 'result', 'report', 'is_active'
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                if (isProduction) {
                    fields.push(`${field} = $${fields.length + 1}`);
                } else {
                    fields.push(`${field} = ?`);
                }
                values.push(updates[field]);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'NO_FIELDS_TO_UPDATE' });
        }

        values.push(id);
        
        if (isProduction) {
            await query(`UPDATE matches SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
        } else {
            const db = getDb();
            db.prepare(`UPDATE matches SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
        }

        res.json({ success: true });
    } catch (error) {
        logger.error(`Update match ${id} error:`, error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 切换前台显示状态 ====================
router.put('/:id/toggle-active', async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined || (is_active !== 0 && is_active !== 1)) {
        return res.status(400).json({ success: false, error: 'INVALID_PARAMETERS' });
    }

    try {
        let existing = null;
        
        if (isProduction) {
            const result = await query('SELECT id, is_active FROM matches WHERE id = $1', [id]);
            existing = result?.[0];
        } else {
            const db = getDb();
            existing = db.prepare('SELECT id, is_active FROM matches WHERE id = ?').get(id);
        }
        
        if (!existing) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }

        if (isProduction) {
            await query('UPDATE matches SET is_active = $1 WHERE id = $2', [is_active, id]);
        } else {
            const db = getDb();
            db.prepare('UPDATE matches SET is_active = ? WHERE id = ?').run(is_active, id);
        }
        
        res.json({ success: true, message: is_active ? '比赛已在前台显示' : '比赛已隐藏' });
    } catch (error) {
        logger.error('Toggle active error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量切换显示状态 ====================
router.post('/batch-toggle', async (req, res) => {
    const { ids, is_active } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'INVALID_PARAMETERS' });
    }

    try {
        let changes = 0;
        
        if (isProduction) {
            const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
            const result = await query(`UPDATE matches SET is_active = $1 WHERE id IN (${placeholders})`, [is_active, ...ids]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const placeholders = ids.map(() => '?').join(',');
            const result = db.prepare(`UPDATE matches SET is_active = ? WHERE id IN (${placeholders})`).run(is_active, ...ids);
            changes = result.changes;
        }
        
        res.json({ success: true, updated: changes });
    } catch (error) {
        logger.error('Batch toggle error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 上传球队队徽 ====================
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'teams');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const teamName = req.body.team_name || 'unknown';
        const safeName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ext = path.extname(file.originalname);
        cb(null, `${safeName}${ext}`);
    }
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } }).single('logo');

router.post('/upload-logo', (req, res) => {
    uploadLogo(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        const { team_name } = req.body;
        if (!team_name || !req.file) {
            return res.status(400).json({ success: false, error: '缺少球队名称或图片' });
        }
        const logoUrl = `/uploads/teams/${req.file.filename}`;
        
        try {
            if (isProduction) {
                await query(`UPDATE team_logos SET logo_url = $1, logo_status = 'ok', last_updated = NOW() WHERE team_name = $2`, [logoUrl, team_name]);
                await query(`UPDATE matches SET home_logo = $1 WHERE home_team = $2`, [logoUrl, team_name]);
                await query(`UPDATE matches SET away_logo = $1 WHERE away_team = $2`, [logoUrl, team_name]);
            } else {
                const db = getDb();
                db.prepare('BEGIN TRANSACTION').run();
                db.prepare(`UPDATE team_logos SET logo_url = ?, logo_status = 'ok', last_updated = CURRENT_TIMESTAMP WHERE team_name = ?`).run(logoUrl, team_name);
                db.prepare(`UPDATE matches SET home_logo = ? WHERE home_team = ?`).run(logoUrl, team_name);
                db.prepare(`UPDATE matches SET away_logo = ? WHERE away_team = ?`).run(logoUrl, team_name);
                db.prepare('COMMIT').run();
            }
            
            let count = 0;
            if (isProduction) {
                const result = await query(`SELECT COUNT(*) as count FROM matches WHERE home_team = $1 OR away_team = $1`, [team_name]);
                count = result?.[0]?.count || 0;
            } else {
                const db = getDb();
                const result = db.prepare(`SELECT COUNT(*) as count FROM matches WHERE home_team = ? OR away_team = ?`).get(team_name, team_name);
                count = result.count;
            }
            
            res.json({ success: true, updated_matches: count });
        } catch (error) {
            if (!isProduction) {
                const db = getDb();
                db.prepare('ROLLBACK').run();
            }
            logger.error('Upload logo error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// ==================== 编辑球队信息（名称 + 队徽）====================
const editTeamUploadDir = path.join(process.cwd(), 'public', 'uploads', 'teams');
if (!fs.existsSync(editTeamUploadDir)) fs.mkdirSync(editTeamUploadDir, { recursive: true });

const editTeamStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, editTeamUploadDir),
    filename: (req, file, cb) => {
        const teamName = req.body.new_name || req.body.original_name || 'unknown';
        const safeName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ext = path.extname(file.originalname);
        cb(null, `${safeName}${ext}`);
    }
});
const uploadEditTeamLogo = multer({ storage: editTeamStorage, limits: { fileSize: 2 * 1024 * 1024 } }).single('logo');

router.post('/edit-team', (req, res) => {
    uploadEditTeamLogo(req, res, async (err) => {
        if (err) {
            logger.error('Upload error:', err);
            return res.status(400).json({ success: false, error: err.message });
        }
        
        const { original_name, new_name } = req.body;
        
        if (!original_name) {
            return res.status(400).json({ success: false, error: '缺少原始球隊名稱' });
        }
        
        const finalNewName = (new_name && new_name.trim()) ? new_name.trim() : original_name;
        
        try {
            let updatedMatches = 0;
            
            if (isProduction) {
                const homeResult = await query(`UPDATE matches SET home_team = $1 WHERE home_team = $2`, [finalNewName, original_name]);
                updatedMatches += homeResult?.rowCount || 0;
                const awayResult = await query(`UPDATE matches SET away_team = $1 WHERE away_team = $2`, [finalNewName, original_name]);
                updatedMatches += awayResult?.rowCount || 0;
                await query(`UPDATE match_pool SET home_team = $1 WHERE home_team = $2`, [finalNewName, original_name]);
                await query(`UPDATE match_pool SET away_team = $1 WHERE away_team = $2`, [finalNewName, original_name]);
            } else {
                const db = getDb();
                db.prepare('BEGIN TRANSACTION').run();
                const homeResult = db.prepare(`UPDATE matches SET home_team = ? WHERE home_team = ?`).run(finalNewName, original_name);
                updatedMatches += homeResult.changes;
                const awayResult = db.prepare(`UPDATE matches SET away_team = ? WHERE away_team = ?`).run(finalNewName, original_name);
                updatedMatches += awayResult.changes;
                db.prepare(`UPDATE match_pool SET home_team = ? WHERE home_team = ?`).run(finalNewName, original_name);
                db.prepare(`UPDATE match_pool SET away_team = ? WHERE away_team = ?`).run(finalNewName, original_name);
            }
            
            let logoUrl = null;
            if (req.file) {
                logoUrl = `/uploads/teams/${req.file.filename}`;
                if (isProduction) {
                    await query(`UPDATE team_logos SET team_name = $1, logo_url = $2, logo_status = 'ok', last_updated = NOW() WHERE team_name = $3`, [finalNewName, logoUrl, original_name]);
                } else {
                    const db = getDb();
                    db.prepare(`UPDATE team_logos SET team_name = ?, logo_url = ?, logo_status = 'ok', last_updated = CURRENT_TIMESTAMP WHERE team_name = ?`).run(finalNewName, logoUrl, original_name);
                }
            } else {
                if (isProduction) {
                    await query(`UPDATE team_logos SET team_name = $1 WHERE team_name = $2`, [finalNewName, original_name]);
                } else {
                    const db = getDb();
                    db.prepare(`UPDATE team_logos SET team_name = ? WHERE team_name = ?`).run(finalNewName, original_name);
                }
            }
            
            if (!isProduction) {
                const db = getDb();
                db.prepare('COMMIT').run();
            }
            
            logger.info(`Team edited: ${original_name} -> ${finalNewName}, affected matches: ${updatedMatches}`);
            
            res.json({
                success: true,
                message: `球隊信息已更新`,
                updated_matches: updatedMatches,
                data: {
                    original_name,
                    new_name: finalNewName,
                    logo_url: logoUrl
                }
            });
            
        } catch (error) {
            if (!isProduction) {
                const db = getDb();
                db.prepare('ROLLBACK').run();
            }
            logger.error('Edit team error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// ==================== 清理过期数据 ====================
router.post('/cleanup', async (req, res) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`DELETE FROM matches WHERE status = 'finished' AND match_time < $1`, [cutoffDate.toISOString()]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`DELETE FROM matches WHERE status = 'finished' AND match_time < ?`).run(cutoffDate.toISOString());
            changes = result.changes;
        }
        
        res.json({ success: true, message: `已清理 ${changes} 场过期比赛` });
    } catch (error) {
        logger.error('Cleanup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;