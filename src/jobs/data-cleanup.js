/**
 * 数据清理定时任务
 * 定期清理过期比赛数据，保持数据库轻量
 */

import { getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

// 清理配置（单位：天）
const CLEANUP_CONFIG = {
    // 已结束但未清算的比赛，保留天数
    FINISHED_UNSETTLED_RETENTION: 30,
    // 已清算但无报告的比赛，保留天数
    SETTLED_NO_REPORT_RETENTION: 90,
    // 已发布报告的比赛，永久保留
    HAS_REPORT: 'permanent'
};

/**
 * 启动数据清理调度器
 */
export function startDataCleanup() {
    // 每天凌晨 3 点执行清理
    const schedule = '0 3 * * *';
    
    // 计算下次执行时间
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(3, 0, 0, 0);
    if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
    }
    const delay = nextRun - now;
    
    logger.info(`🧹 数据清理任务已调度，下次执行: ${nextRun.toLocaleString()}`);
    
    setTimeout(() => {
        // 立即执行一次
        cleanupExpiredData();
        // 之后每天执行
        setInterval(cleanupExpiredData, 24 * 60 * 60 * 1000);
    }, delay);
}

/**
 * 执行数据清理
 */
export async function cleanupExpiredData() {
    const db = getDb();
    const now = new Date().toISOString();
    const cutoffFinished = new Date();
    cutoffFinished.setDate(cutoffFinished.getDate() - CLEANUP_CONFIG.FINISHED_UNSETTLED_RETENTION);
    const cutoffSettled = new Date();
    cutoffSettled.setDate(cutoffSettled.getDate() - CLEANUP_CONFIG.SETTLED_NO_REPORT_RETENTION);
    
    const results = {
        finishedUnsettled: 0,
        settledNoReport: 0,
        total: 0
    };
    
    try {
        // 1. 清理已结束但未清算的旧比赛
        const finishedUnsettled = db.prepare(`
            DELETE FROM matches 
            WHERE status = 'finished' 
              AND settled = 0 
              AND match_time < ?
              AND (report IS NULL OR report = '')
        `).run(cutoffFinished.toISOString());
        results.finishedUnsettled = finishedUnsettled.changes;
        
        // 2. 清理已清算但无报告的比赛
        const settledNoReport = db.prepare(`
            DELETE FROM matches 
            WHERE settled = 1 
              AND (report IS NULL OR report = '')
              AND match_time < ?
        `).run(cutoffSettled.toISOString());
        results.settledNoReport = settledNoReport.changes;
        
        results.total = results.finishedUnsettled + results.settledNoReport;
        
        if (results.total > 0) {
            logger.info(`🧹 数据清理完成: 已结束未清算 ${results.finishedUnsettled} 场, 已清算无报告 ${results.settledNoReport} 场`);
            
            // 记录清理统计到数据库
            db.prepare(`
                INSERT INTO admin_logs (action, details, created_at)
                VALUES (?, ?, ?)
            `).run('data_cleanup', JSON.stringify(results), now);
        } else {
            logger.info('🧹 数据清理: 无需清理的数据');
        }
        
        return results;
    } catch (error) {
        logger.error('数据清理失败:', error);
        return results;
    }
}

/**
 * 获取数据统计信息
 */
export function getDataStats() {
    const db = getDb();
    
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
            SUM(CASE WHEN status = 'finished' AND settled = 0 THEN 1 ELSE 0 END) as finished_unsettled,
            SUM(CASE WHEN settled = 1 AND (report IS NULL OR report = '') THEN 1 ELSE 0 END) as settled_no_report,
            SUM(CASE WHEN report IS NOT NULL AND report != '' THEN 1 ELSE 0 END) as has_report,
            MIN(match_time) as oldest_match,
            MAX(match_time) as newest_match
        FROM matches
    `).get();
    
    return stats;
}

export default {
    startDataCleanup,
    cleanupExpiredData,
    getDataStats
};