/**
 * FOOTRADAPRO MVP - Admin Match Management Routes
 */

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';
import fetch from 'node-fetch';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// ==================== 所有路由需要管理员认证 ====================
router.use(adminAuth);

// ==================== 获取联赛列表（必须在 /:id 之前）====================
router.get('/leagues', (req, res) => {
    const db = getDb();
    try {
        const leagues = db.prepare(`
            SELECT league, COUNT(*) as match_count
            FROM matches 
            WHERE league IS NOT NULL AND league != ''
            GROUP BY league
            ORDER BY match_count DESC
        `).all();
        res.json({ success: true, data: leagues });
    } catch (error) {
        logger.error('Fetch leagues error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取缺少队徽的球队列表（必须在 /:id 之前）====================
router.get('/missing-logos', (req, res) => {
    const { league, search } = req.query;
    const db = getDb();
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
            sql += ` AND league = ?`;
            params.push(league);
        }
        if (search) {
            sql += ` AND tl.team_name LIKE ?`;
            params.push(`%${search}%`);
        }
        sql += ` ORDER BY tl.involved_matches DESC, tl.team_name`;
        const teams = db.prepare(sql).all(...params);
        res.json({ success: true, data: teams });
    } catch (error) {
        logger.error('Get missing logos error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取比赛统计概览 ====================
router.get('/stats/overview', (req, res) => {
    const db = getDb();
    try {
        const stats = db.prepare(`
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
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('Get stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取所有球队队徽信息（用于管理）====================
router.get('/all-team-logos', (req, res) => {
    const { league, search } = req.query;
    const db = getDb();
    
    try {
        let sql = `
            SELECT 
                tl.team_name,
                tl.logo_status,
                tl.logo_url,
                tl.involved_matches,
                tl.last_updated,
                COALESCE(
                    (SELECT league FROM matches WHERE home_team = tl.team_name OR away_team = tl.team_name LIMIT 1),
                    'Unknown'
                ) as league
            FROM team_logos tl
            WHERE 1=1
        `;
        const params = [];
        
        if (league && league !== 'all') {
            sql += ` AND league = ?`;
            params.push(league);
        }
        if (search) {
            sql += ` AND tl.team_name LIKE ?`;
            params.push(`%${search}%`);
        }
        
        sql += ` ORDER BY tl.logo_status ASC, tl.team_name`;
        
        const teams = db.prepare(sql).all(...params);
        res.json({ success: true, data: teams });
    } catch (error) {
        logger.error('Get all team logos error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 获取比赛列表 ====================
router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const db = getDb();

    try {
        let query = 'SELECT * FROM matches';
        let countQuery = 'SELECT COUNT(*) as total FROM matches';
        const params = [];

        if (status && status !== 'all') {
            query += ' WHERE status = ?';
            countQuery += ' WHERE status = ?';
            params.push(status);
        }

        query += ' ORDER BY match_time DESC LIMIT ? OFFSET ?';
        
        const { total } = db.prepare(countQuery).get(...params);
        const matches = db.prepare(query).all(...params, limit, offset);

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
    } catch (error) {
        logger.error('Fetch matches list error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取比赛列表（分页）====================
router.get('/list', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const db = getDb();

    try {
        let query = 'SELECT * FROM matches';
        let countQuery = 'SELECT COUNT(*) as total FROM matches';
        const params = [];

        if (status && status !== 'all') {
            query += ' WHERE status = ?';
            countQuery += ' WHERE status = ?';
            params.push(status);
        }

        query += ' ORDER BY match_time DESC LIMIT ? OFFSET ?';
        
        const { total } = db.prepare(countQuery).get(...params);
        const matches = db.prepare(query).all(...params, limit, offset);

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
    } catch (error) {
        logger.error('Fetch matches list error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个比赛（必须放在最后）====================
router.get('/:id',
    [param('id').notEmpty()],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, error: 'VALIDATION_ERROR' });
        }

        const { id } = req.params;
        const db = getDb();

        try {
            const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
            
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
router.post('/add', (req, res) => {
    const {
        match_id, home_team, away_team, league,
        match_time, cutoff_time,
        execution_rate = 30,
        min_authorization = 100,
        match_limit = 500,
        source = 'manual',
        is_active = 1
    } = req.body;

    const db = getDb();

    try {
        const existing = db.prepare('SELECT id FROM matches WHERE match_id = ?').get(match_id);
        if (existing) {
            return res.status(409).json({ success: false, error: 'MATCH_ID_EXISTS' });
        }

        const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
        const hasIsActive = tableInfo.some(col => col.name === 'is_active');

        if (hasIsActive) {
            db.prepare(`
                INSERT INTO matches (
                    match_id, home_team, away_team, league, 
                    match_time, cutoff_time, 
                    execution_rate, min_authorization, match_limit,
                    status, is_active, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)
            `).run(
                match_id, home_team, away_team, league || 'Unknown',
                match_time, cutoff_time,
                execution_rate, min_authorization, match_limit,
                is_active, source
            );
        } else {
            db.prepare(`
                INSERT INTO matches (
                    match_id, home_team, away_team, league, 
                    match_time, cutoff_time, 
                    execution_rate, min_authorization, match_limit,
                    status, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?)
            `).run(
                match_id, home_team, away_team, league || 'Unknown',
                match_time, cutoff_time,
                execution_rate, min_authorization, match_limit,
                source
            );
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Add match error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 更新比赛 ====================
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();

    try {
        const existing = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
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
                fields.push(`${field} = ?`);
                values.push(updates[field]);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'NO_FIELDS_TO_UPDATE' });
        }

        values.push(id);
        db.prepare(`UPDATE matches SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        res.json({ success: true });
    } catch (error) {
        logger.error(`Update match ${id} error:`, error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 切换前台显示状态 ====================
router.put('/:id/toggle-active', (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined || (is_active !== 0 && is_active !== 1)) {
        return res.status(400).json({ success: false, error: 'INVALID_PARAMETERS' });
    }

    const db = getDb();

    try {
        const existing = db.prepare('SELECT id, is_active FROM matches WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }

        db.prepare('UPDATE matches SET is_active = ? WHERE id = ?').run(is_active, id);
        
        res.json({ success: true, message: is_active ? '比赛已在前台显示' : '比赛已隐藏' });
    } catch (error) {
        logger.error('Toggle active error:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量切换显示状态 ====================
router.post('/batch-toggle', (req, res) => {
    const { ids, is_active } = req.body;
    const db = getDb();

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'INVALID_PARAMETERS' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const result = db.prepare(`UPDATE matches SET is_active = ? WHERE id IN (${placeholders})`).run(is_active, ...ids);
        res.json({ success: true, updated: result.changes });
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
        const db = getDb();
        try {
            db.prepare('BEGIN TRANSACTION').run();
            db.prepare(`UPDATE team_logos SET logo_url = ?, logo_status = 'ok', last_updated = CURRENT_TIMESTAMP WHERE team_name = ?`).run(logoUrl, team_name);
            db.prepare(`UPDATE matches SET home_logo = ? WHERE home_team = ?`).run(logoUrl, team_name);
            db.prepare(`UPDATE matches SET away_logo = ? WHERE away_team = ?`).run(logoUrl, team_name);
            db.prepare('COMMIT').run();
            res.json({ success: true, updated_matches: db.prepare(`SELECT COUNT(*) FROM matches WHERE home_team = ? OR away_team = ?`).get(team_name, team_name).count });
        } catch (error) {
            db.prepare('ROLLBACK').run();
            logger.error('Upload logo error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// ==================== 清理过期数据 ====================
router.post('/cleanup', (req, res) => {
    const db = getDb();
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const result = db.prepare(`DELETE FROM matches WHERE status = 'finished' AND match_time < ?`).run(cutoffDate.toISOString());
        res.json({ success: true, message: `已清理 ${result.changes} 场过期比赛` });
    } catch (error) {
        logger.error('Cleanup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



export default router;