/**
 * FOOTRADAPRO - 報告管理API路由
 * @description 管理比賽報告的創建、編輯、發布
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// 所有路由需要管理员认证
router.use(adminAuth);

// ==================== 确保上传目录存在 ====================
const uploadDir = path.join(process.cwd(), 'public/uploads/teams');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ==================== 图片上传配置 ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'team-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片'));
        }
    }
});

// ==================== 上传队徽 ====================
router.post('/upload-logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择图片' });
        }
        
        const imageUrl = '/uploads/teams/' + req.file.filename;
        logger.info(`队徽上传成功: ${imageUrl}`);
        
        res.json({ success: true, data: { url: imageUrl } });
    } catch (error) {
        logger.error('上传队徽失败:', error);
        res.status(500).json({ success: false, error: 'UPLOAD_FAILED' });
    }
});

// ==================== 获取所有报告列表（后台用）====================
router.get('/', async (req, res) => {
    try {
        let reports = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id, match_id, match_time, league,
                    home_team, away_team, home_logo, away_logo,
                    home_score, away_score,
                    prediction_data, evidence_chain, ai_deepdive,
                    status, created_at, updated_at, published_at
                FROM reports 
                ORDER BY created_at DESC
                LIMIT 50
            `);
            reports = result || [];
        } else {
            const db = getDb();
            reports = db.prepare(`
                SELECT 
                    id, match_id, match_time, league,
                    home_team, away_team, home_logo, away_logo,
                    home_score, away_score,
                    prediction_data, evidence_chain, ai_deepdive,
                    status, created_at, updated_at, published_at
                FROM reports 
                ORDER BY created_at DESC
                LIMIT 50
            `).all();
        }
        
        // 解析JSON字段
        const formattedReports = reports.map(report => {
            const formatted = { ...report };
            try {
                if (report.prediction_data) {
                    formatted.prediction_data = typeof report.prediction_data === 'string' 
                        ? JSON.parse(report.prediction_data) 
                        : report.prediction_data;
                }
                if (report.evidence_chain) {
                    formatted.evidence_chain = typeof report.evidence_chain === 'string' 
                        ? JSON.parse(report.evidence_chain) 
                        : report.evidence_chain;
                }
            } catch (e) {
                // 忽略解析错误
            }
            return formatted;
        });
        
        res.json({ success: true, data: formattedReports });
    } catch (error) {
        logger.error('获取报告列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取比赛列表（用于创建报告）====================
router.get('/matches', async (req, res) => {
    try {
        let matches = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    m.match_id, m.home_team, m.away_team, m.league, m.match_time,
                    m.home_score, m.away_score,
                    CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as has_report,
                    r.status as report_status
                FROM matches m
                LEFT JOIN reports r ON m.match_id = r.match_id
                WHERE m.status IN ('finished', 'settled')
                ORDER BY m.match_time DESC
            `);
            matches = result || [];
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT 
                    m.match_id, m.home_team, m.away_team, m.league, m.match_time,
                    m.home_score, m.away_score,
                    CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as has_report,
                    r.status as report_status
                FROM matches m
                LEFT JOIN reports r ON m.match_id = r.match_id
                WHERE m.status IN ('finished', 'settled')
                ORDER BY m.match_time DESC
            `).all();
        }
        
        res.json({ success: true, data: matches });
    } catch (error) {
        logger.error('获取比赛列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个比赛信息（用于URL参数载入）====================
router.get('/match/:matchId', async (req, res) => {
    const { matchId } = req.params;
    
    try {
        let match = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    match_id, home_team, away_team, league, match_time,
                    home_score, away_score
                FROM matches 
                WHERE match_id = $1 AND status IN ('finished', 'settled')
            `, [matchId]);
            match = result?.[0];
        } else {
            const db = getDb();
            match = db.prepare(`
                SELECT 
                    match_id, home_team, away_team, league, match_time,
                    home_score, away_score
                FROM matches 
                WHERE match_id = ? AND status IN ('finished', 'settled')
            `).get(matchId);
        }
        
        if (!match) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }
        
        res.json({ success: true, data: match });
    } catch (error) {
        logger.error('獲取比賽信息失敗:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个报告详情（后台用）====================
router.get('/:matchId', async (req, res) => {
    const { matchId } = req.params;
    
    try {
        let report = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    id, match_id, match_time, league,
                    home_team, away_team, home_logo, away_logo,
                    home_score, away_score,
                    prediction_data, evidence_chain, ai_deepdive,
                    status, created_at, updated_at, published_at
                FROM reports 
                WHERE match_id = $1
            `, [matchId]);
            report = result?.[0];
        } else {
            const db = getDb();
            report = db.prepare(`
                SELECT 
                    id, match_id, match_time, league,
                    home_team, away_team, home_logo, away_logo,
                    home_score, away_score,
                    prediction_data, evidence_chain, ai_deepdive,
                    status, created_at, updated_at, published_at
                FROM reports 
                WHERE match_id = ?
            `).get(matchId);
        }
        
        if (!report) {
            return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND' });
        }
        
        // 解析JSON字段
        if (report.prediction_data) {
            try {
                report.prediction_data = typeof report.prediction_data === 'string' 
                    ? JSON.parse(report.prediction_data) 
                    : report.prediction_data;
            } catch (e) {
                report.prediction_data = {};
            }
        }
        if (report.evidence_chain) {
            try {
                report.evidence_chain = typeof report.evidence_chain === 'string' 
                    ? JSON.parse(report.evidence_chain) 
                    : report.evidence_chain;
            } catch (e) {
                report.evidence_chain = [];
            }
        }
        
        res.json({ success: true, data: report });
    } catch (error) {
        logger.error('获取报告失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 创建或更新报告 ====================
router.post('/save', async (req, res) => {
    const report = req.body;
    const adminId = req.session.adminId;
    
    // 验证必要字段
    if (!report.match_id || !report.home_team || !report.away_team) {
        return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS' });
    }
    
    try {
        let existing = null;
        
        if (isProduction) {
            const result = await query('SELECT id FROM reports WHERE match_id = $1', [report.match_id]);
            existing = result?.[0];
        } else {
            const db = getDb();
            existing = db.prepare('SELECT id FROM reports WHERE match_id = ?').get(report.match_id);
        }
        
        // 准备JSON字段
        const predictionData = report.prediction_data ? JSON.stringify(report.prediction_data) : null;
        const evidenceChain = report.evidence_chain ? JSON.stringify(report.evidence_chain) : null;
        
        if (existing) {
            // 更新
            if (isProduction) {
                await query(`
                    UPDATE reports SET
                        match_time = $1, league = $2,
                        home_team = $3, away_team = $4,
                        home_logo = $5, away_logo = $6,
                        home_score = $7, away_score = $8,
                        prediction_data = $9,
                        evidence_chain = $10,
                        ai_deepdive = $11,
                        updated_at = NOW(),
                        status = $12
                    WHERE match_id = $13
                `, [
                    report.match_time, report.league,
                    report.home_team, report.away_team,
                    report.home_logo || null, report.away_logo || null,
                    report.home_score || 0, report.away_score || 0,
                    predictionData,
                    evidenceChain,
                    report.ai_deepdive || '',
                    report.status || 'draft',
                    report.match_id
                ]);
            } else {
                const db = getDb();
                db.prepare(`
                    UPDATE reports SET
                        match_time = ?, league = ?,
                        home_team = ?, away_team = ?,
                        home_logo = ?, away_logo = ?,
                        home_score = ?, away_score = ?,
                        prediction_data = ?,
                        evidence_chain = ?,
                        ai_deepdive = ?,
                        updated_at = CURRENT_TIMESTAMP,
                        status = ?
                    WHERE match_id = ?
                `).run(
                    report.match_time, report.league,
                    report.home_team, report.away_team,
                    report.home_logo || null, report.away_logo || null,
                    report.home_score || 0, report.away_score || 0,
                    predictionData,
                    evidenceChain,
                    report.ai_deepdive || '',
                    report.status || 'draft',
                    report.match_id
                );
            }
            
            logger.info(`管理员 ${adminId} 更新报告 ${report.match_id}`);
        } else {
            // 新建
            if (isProduction) {
                await query(`
                    INSERT INTO reports (
                        match_id, match_time, league,
                        home_team, away_team, home_logo, away_logo,
                        home_score, away_score,
                        prediction_data, evidence_chain, ai_deepdive,
                        created_by, status, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
                `, [
                    report.match_id, report.match_time, report.league,
                    report.home_team, report.away_team,
                    report.home_logo || null, report.away_logo || null,
                    report.home_score || 0, report.away_score || 0,
                    predictionData,
                    evidenceChain,
                    report.ai_deepdive || '',
                    adminId,
                    report.status || 'draft'
                ]);
            } else {
                const db = getDb();
                db.prepare(`
                    INSERT INTO reports (
                        match_id, match_time, league,
                        home_team, away_team, home_logo, away_logo,
                        home_score, away_score,
                        prediction_data, evidence_chain, ai_deepdive,
                        created_by, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `).run(
                    report.match_id, report.match_time, report.league,
                    report.home_team, report.away_team,
                    report.home_logo || null, report.away_logo || null,
                    report.home_score || 0, report.away_score || 0,
                    predictionData,
                    evidenceChain,
                    report.ai_deepdive || '',
                    adminId,
                    report.status || 'draft'
                );
            }
            
            logger.info(`管理员 ${adminId} 创建报告 ${report.match_id}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('保存报告失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 发布报告 ====================
router.post('/publish/:matchId', async (req, res) => {
    const { matchId } = req.params;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                UPDATE reports 
                SET status = 'published', published_at = NOW()
                WHERE match_id = $1
            `, [matchId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                UPDATE reports 
                SET status = 'published', published_at = CURRENT_TIMESTAMP
                WHERE match_id = ?
            `).run(matchId);
            changes = result.changes;
        }
        
        if (changes === 0) {
            return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND' });
        }
        
        logger.info(`报告已发布: ${matchId}`);
        res.json({ success: true });
        
    } catch (error) {
        logger.error('发布报告失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;