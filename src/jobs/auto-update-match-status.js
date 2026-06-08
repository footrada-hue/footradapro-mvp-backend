/**
 * FOOTRADAPRO - Auto Update Match Status Service
 * @description 自动更新比赛状态：upcoming → live → finished
 * @version 4.0.0 - 修复状态更新逻辑
 */

import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

async function updateMatchStatus() {
    try {
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        
        await initDatabase();
        
        const now = new Date().toISOString();
        
        let liveChanges = 0;
        let finishedChanges = 0;
        
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
            
            // 2. 将已结束的比赛从 live 改为 finished（不依赖 score_fetch_triggered）
            const toFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'live' 
                AND match_time <= NOW() - INTERVAL '110 minutes'
                RETURNING id
            `);
            finishedChanges = toFinished?.length || 0;
            
            // 3. 额外处理：如果比赛时间已过但状态还是 upcoming（比如脚本漏掉了）
            const orphanFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= NOW() - INTERVAL '120 minutes'
                RETURNING id
            `);
            
            if (orphanFinished?.length > 0) {
                finishedChanges += orphanFinished.length;
                logger.info(`⏰ 修复了 ${orphanFinished.length} 场遗漏的已结束比赛`);
            }
            
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
                AND datetime(match_time, '+110 minutes') <= datetime('now')
            `).run();
            finishedChanges = toFinished.changes;
            
            const orphanFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time, '+120 minutes') <= datetime('now')
            `).run();
            finishedChanges += orphanFinished.changes;
        }
        
        if (liveChanges > 0) {
            logger.info(`⏰ 已将 ${liveChanges} 场比赛状态更新为 live`);
        }
        
        if (finishedChanges > 0) {
            logger.info(`✅ 已将 ${finishedChanges} 场比赛状态更新为 finished`);
            
            // 触发比分获取（异步）
            const { fetchAndUpdateMatchScore } = await import('./auto-fetch-scores.js');
            
            // 获取刚更新的比赛ID并获取比分
            if (isProduction) {
                const finishedMatches = await query(`
                    SELECT id, home_team, away_team, league
                    FROM matches 
                    WHERE status = 'finished' 
                    AND (score_fetch_triggered IS NULL OR score_fetch_triggered = false)
                    AND match_time <= NOW() - INTERVAL '110 minutes'
                    LIMIT 20
                `);
                
                for (const match of finishedMatches) {
                    setImmediate(async () => {
                        try {
                            await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
                            await query(`UPDATE matches SET score_fetch_triggered = true WHERE id = $1`, [match.id]);
                        } catch (err) {
                            logger.error(`获取比赛 ${match.id} 比分失败:`, err);
                        }
                    });
                }
            }
        }
        
    } catch (error) {
        logger.error('更新比赛状态失败:', error);
    }
}

// 立即执行一次
setTimeout(() => {
    updateMatchStatus();
}, 3000);

// 每 2 分钟执行一次
setInterval(updateMatchStatus, 2 * 60 * 1000);

export { updateMatchStatus };