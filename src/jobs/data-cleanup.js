/**
 * 数据清理定时任务
 * 定期清理过期比赛数据，保持数据库轻量
 */

import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

// 清理配置（单位：天）
const CLEANUP_CONFIG = {
    FINISHED_UNSETTLED_RETENTION: 30,
    SETTLED_NO_REPORT_RETENTION: 90,
    HAS_REPORT: 'permanent'
};

/**
 * 启动数据清理调度器
 */
export function startDataCleanup() {
    const schedule = '0 3 * * *';
    
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(3, 0, 0, 0);
    if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
    }
    const delay = nextRun - now;
    
    logger.info(`🧹 数据清理任务已调度，下次执行: ${nextRun.toLocaleString()}`);
    
    // 延迟首次执行
    setTimeout(() => {
        // 延迟5秒等待数据库初始化
        setTimeout(() => {
            cleanupExpiredData();
        }, 5000);
        setInterval(cleanupExpiredData, 24 * 60 * 60 * 1000);
    }, delay);
}

/**
 * 执行数据清理
 */
export async function cleanupExpiredData() {
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
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        await initDatabase();
        
        if (isProduction) {
            // PostgreSQL 版本
            // 1. 清理已结束但未清算的旧比赛
            const finishedUnsettled = await query(`
                DELETE FROM matches 
                WHERE status = 'finished' 
                  AND settled = false
                  AND match_time < $1::timestamp
                  AND (report IS NULL OR report = '')
            `, [cutoffFinished.toISOString()]);
            results.finishedUnsettled = finishedUnsettled?.rowCount || 0;
            
            // 2. 清理已清算但无报告的比赛
            const settledNoReport = await query(`
                DELETE FROM matches 
                WHERE settled = true
                  AND (report IS NULL OR report = '')
                  AND match_time < $1::timestamp
            `, [cutoffSettled.toISOString()]);
            results.settledNoReport = settledNoReport?.rowCount || 0;
            
        } else {
            // SQLite 版本
            const db = getDb();
            
            const finishedUnsettled = db.prepare(`
                DELETE FROM matches 
                WHERE status = 'finished' 
                  AND settled = 0 
                  AND match_time < ?
                  AND (report IS NULL OR report = '')
            `).run(cutoffFinished.toISOString());
            results.finishedUnsettled = finishedUnsettled.changes;
            
            const settledNoReport = db.prepare(`
                DELETE FROM matches 
                WHERE settled = 1 
                  AND (report IS NULL OR report = '')
                  AND match_time < ?
            `).run(cutoffSettled.toISOString());
            results.settledNoReport = settledNoReport.changes;
        }
        
        results.total = results.finishedUnsettled + results.settledNoReport;
        
        if (results.total > 0) {
            logger.info(`🧹 数据清理完成: 已结束未清算 ${results.finishedUnsettled} 场, 已清算无报告 ${results.settledNoReport} 场`);
            
            // 记录清理统计
            try {
                if (isProduction) {
                    await query(`
                        INSERT INTO admin_logs (action, details, created_at)
                        VALUES ($1, $2, NOW())
                    `, ['data_cleanup', JSON.stringify(results)]);
                } else {
                    const db = getDb();
                    db.prepare(`
                        INSERT INTO admin_logs (action, details, created_at)
                        VALUES (?, ?, ?)
                    `).run('data_cleanup', JSON.stringify(results), new Date().toISOString());
                }
            } catch (logErr) {
                // admin_logs 表可能不存在，忽略
                logger.debug('无法记录清理日志:', logErr.message);
            }
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
export async function getDataStats() {
    try {
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        await initDatabase();
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
                    SUM(CASE WHEN status = 'finished' AND settled = false THEN 1 ELSE 0 END) as finished_unsettled,
                    SUM(CASE WHEN settled = true AND (report IS NULL OR report = '') THEN 1 ELSE 0 END) as settled_no_report,
                    SUM(CASE WHEN report IS NOT NULL AND report != '' THEN 1 ELSE 0 END) as has_report,
                    MIN(match_time) as oldest_match,
                    MAX(match_time) as newest_match
                FROM matches
            `);
            return result[0];
        } else {
            const db = getDb();
            return db.prepare(`
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
        }
    } catch (error) {
        logger.error('获取数据统计失败:', error);
        return null;
    }
}

export default {
    startDataCleanup,
    cleanupExpiredData,
    getDataStats
};