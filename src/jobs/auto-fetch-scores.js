/**
 * FOOTRADAPRO - Auto Update Match Status Service
 * @description 自动更新比赛状态：upcoming → live → finished
 * @version 4.0.0 - 永久修复状态更新逻辑
 */

import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

// 比赛结束判断时间（分钟）
const MATCH_DURATION_MINUTES = 110;

async function ensureColumns() {
    try {
        if (isProduction) {
            const { query } = await import('../database/connection.js');
            await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_confirmed BOOLEAN DEFAULT FALSE`).catch(() => {});
            await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP`).catch(() => {});
            await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_fetch_triggered BOOLEAN DEFAULT FALSE`).catch(() => {});
        } else {
            const { getDb } = await import('../database/connection.js');
            const db = getDb();
            db.exec(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_confirmed INTEGER DEFAULT 0`).catch(() => {});
            db.exec(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS finished_at TEXT`).catch(() => {});
            db.exec(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_fetch_triggered INTEGER DEFAULT 0`).catch(() => {});
        }
        logger.info('✅ 数据库字段检查完成');
    } catch (err) {
        logger.debug('字段检查:', err.message);
    }
}

async function updateMatchStatus() {
    try {
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        
        await initDatabase();
        
        const now = new Date();
        const nowStr = now.toISOString();
        
        let liveChanges = 0;
        let finishedChanges = 0;
        let orphanChanges = 0;
        
        if (isProduction) {
            // ========== PostgreSQL 版本 ==========
            
            // 1. 将已开始的比赛从 upcoming 改为 live
            const toLive = await query(`
                UPDATE matches 
                SET status = 'live', 
                    updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= NOW()
                RETURNING id
            `);
            liveChanges = toLive?.length || 0;
            
            // 2. 将已结束的比赛从 live 改为 finished
            //    条件：比赛开始时间 + 110分钟 <= 当前时间
            const toFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'live' 
                AND match_time <= NOW() - INTERVAL '${MATCH_DURATION_MINUTES} minutes'
                RETURNING id
            `);
            finishedChanges = toFinished?.length || 0;
            
            // 3. 修复遗漏的比赛：状态是 upcoming 但比赛时间已过（可能之前脚本漏掉了）
            const orphanFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= NOW() - INTERVAL '${MATCH_DURATION_MINUTES + 10} minutes'
                RETURNING id
            `);
            orphanChanges = orphanFinished?.length || 0;
            
        } else {
            // ========== SQLite 版本 ==========
            const db = getDb();
            
            const toLive = db.prepare(`
                UPDATE matches 
                SET status = 'live', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time) <= datetime('now')
            `).run();
            liveChanges = toLive.changes;
            
            const toFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'live' 
                AND datetime(match_time, '+${MATCH_DURATION_MINUTES} minutes') <= datetime('now')
            `).run();
            finishedChanges = toFinished.changes;
            
            const orphanFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time, '+${MATCH_DURATION_MINUTES + 10} minutes') <= datetime('now')
            `).run();
            orphanChanges = orphanFinished.changes;
        }
        
        if (liveChanges > 0) {
            logger.info(`⏰ 已将 ${liveChanges} 场比赛状态更新为 live`);
        }
        
        if (finishedChanges > 0) {
            logger.info(`✅ 已将 ${finishedChanges} 场比赛状态更新为 finished`);
        }
        
        if (orphanChanges > 0) {
            logger.info(`🔧 修复了 ${orphanChanges} 场遗漏的比赛`);
        }
        
        // 如果有比赛刚结束，触发比分获取
        if (finishedChanges > 0 || orphanChanges > 0) {
            // 延迟 5 秒后开始获取比分（等待比赛完全结束）
            setTimeout(async () => {
                const { updateScoresForFinishedMatches } = await import('./auto-fetch-scores.js');
                await updateScoresForFinishedMatches();
            }, 5000);
        }
        
    } catch (error) {
        logger.error('更新比赛状态失败:', error);
    }
}

// 启动服务
async function start() {
    await ensureColumns();
    
    // 立即执行一次
    await updateMatchStatus();
    
    // 每 2 分钟执行一次
    setInterval(updateMatchStatus, 2 * 60 * 1000);
    
    logger.info('⏰ 比赛状态自动更新服务已启动 (每2分钟)');
}

// 延迟启动，等待数据库初始化
setTimeout(start, 5000);

export { updateMatchStatus };