/**
 * FOOTRADAPRO - 報告管理API路由
 * @description 管理比賽報告的創建、編輯、發布
 * @feature 支援從URL參數載入比賽，報告內容存儲於 ai_deepdive 字段
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
router.get('/', (req, res) => {
    const db = getDb();
    
    try {
        const reports = db.prepare(`
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
        
        // 解析JSON字段
        const formattedReports = reports.map(report => {
            const formatted = { ...report };
            try {
                if (report.prediction_data) formatted.prediction_data = JSON.parse(report.prediction_data);
                if (report.evidence_chain) formatted.evidence_chain = JSON.parse(report.evidence_chain);
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
router.get('/matches', (req, res) => {
    const db = getDb();
    
    try {
const matches = db.prepare(`
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
        
        res.json({ success: true, data: matches });
    } catch (error) {
        logger.error('获取比赛列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单个比赛信息（用于URL参数载入）====================
router.get('/match/:matchId', (req, res) => {
    const { matchId } = req.params;
    const db = getDb();
    
    try {
const match = db.prepare(`
    SELECT 
        match_id, home_team, away_team, league, match_time,
        home_score, away_score
    FROM matches 
    WHERE match_id = ? AND status IN ('finished', 'settled')
`).get(matchId);
        
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
router.get('/:matchId', (req, res) => {
    const { matchId } = req.params;
    const db = getDb();
    
    try {
        const report = db.prepare(`
            SELECT 
                id, match_id, match_time, league,
                home_team, away_team, home_logo, away_logo,
                home_score, away_score,
                prediction_data, evidence_chain, ai_deepdive,
                status, created_at, updated_at, published_at
            FROM reports 
            WHERE match_id = ?
        `).get(matchId);
        
        if (!report) {
            return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND' });
        }
        
        // 解析JSON字段
        if (report.prediction_data) {
            try {
                report.prediction_data = JSON.parse(report.prediction_data);
            } catch (e) {
                report.prediction_data = {};
            }
        }
        if (report.evidence_chain) {
            try {
                report.evidence_chain = JSON.parse(report.evidence_chain);
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
router.post('/save', (req, res) => {
    const report = req.body;
    const adminId = req.session.adminId;
    const db = getDb();
    
    // 验证必要字段
    if (!report.match_id || !report.home_team || !report.away_team) {
        return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS' });
    }
    
    try {
        // 检查是否已存在报告
        const existing = db.prepare('SELECT id FROM reports WHERE match_id = ?').get(report.match_id);
        
        // 准备JSON字段
        const predictionData = report.prediction_data ? JSON.stringify(report.prediction_data) : null;
        const evidenceChain = report.evidence_chain ? JSON.stringify(report.evidence_chain) : null;
        const now = new Date().toISOString();
        
        if (existing) {
            // 更新
            db.prepare(`
                UPDATE reports SET
                    match_time = ?, league = ?,
                    home_team = ?, away_team = ?,
                    home_logo = ?, away_logo = ?,
                    home_score = ?, away_score = ?,
                    prediction_data = ?,
                    evidence_chain = ?,
                    ai_deepdive = ?,
                    updated_at = ?,
                    status = ?
                WHERE match_id = ?
            `).run(
                report.match_time, report.league,
                report.home_team, report.away_team,
                report.home_logo || null, report.away_logo || null,
                report.home_score || 0, report.away_score || 0,
                predictionData,
                evidenceChain,
                report.ai_deepdive || '',  // ✅ 使用 ai_deepdive 字段
                now,
                report.status || 'draft',
                report.match_id
            );
            
            logger.info(`管理员 ${adminId} 更新报告 ${report.match_id}`);
        } else {
            // 新建
            db.prepare(`
                INSERT INTO reports (
                    match_id, match_time, league,
                    home_team, away_team, home_logo, away_logo,
                    home_score, away_score,
                    prediction_data, evidence_chain, ai_deepdive,
                    created_by, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                report.match_id, report.match_time, report.league,
                report.home_team, report.away_team,
                report.home_logo || null, report.away_logo || null,
                report.home_score || 0, report.away_score || 0,
                predictionData,
                evidenceChain,
                report.ai_deepdive || '',  // ✅ 使用 ai_deepdive 字段
                adminId,
                report.status || 'draft'
            );
            
            logger.info(`管理员 ${adminId} 创建报告 ${report.match_id}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('保存报告失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 发布报告 ====================
router.post('/publish/:matchId', (req, res) => {
    const { matchId } = req.params;
    const db = getDb();
    
    try {
        const result = db.prepare(`
            UPDATE reports 
            SET status = 'published', published_at = CURRENT_TIMESTAMP
            WHERE match_id = ?
        `).run(matchId);
        
        if (result.changes === 0) {
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