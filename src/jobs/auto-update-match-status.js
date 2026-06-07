/**
 * FOOTRADAPRO - Auto Update Match Status Service
 * @description 自动更新比赛状态：upcoming → live → finished
 * @version 3.2.0 - 比赛结束后立即触发比分获取
 */

import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

async function updateMatchStatus() {
    try {
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        
        // 确保数据库已初始化
        await initDatabase();
        
        const now = new Date().toISOString();
        
        let liveChanges = 0;
        let finishedMatches = [];
        
        if (isProduction) {
            // PostgreSQL 版本
            // 1. 将已开始的比赛从 upcoming 改为 live
            const toLive = await query(`
                UPDATE matches 
                SET status = 'live', updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= $1::timestamp
                RETURNING id
            `, [now]);
            liveChanges = toLive?.length || 0;
            
            // 2. 获取已结束但尚未触发比分获取的比赛
            const toFinished = await query(`
                SELECT id, home_team, away_team, league, match_time
                FROM matches 
                WHERE status = 'live' 
                AND match_time + INTERVAL '110 minutes' <= $1::timestamp
                  AND (score_fetch_triggered IS NULL OR score_fetch_triggered = false)
                RETURNING id, home_team, away_team, league
            `, [now]);
            finishedMatches = toFinished || [];
            
            // 标记为已触发，避免重复
            if (finishedMatches.length > 0) {
                const ids = finishedMatches.map(m => m.id);
                await query(`
                    UPDATE matches 
                    SET status = 'finished', 
                        score_fetch_triggered = true,
                        finished_at = NOW(),
                        updated_at = NOW()
                    WHERE id = ANY($1::int[])
                `, [ids]);
            }
            
        } else {
            // SQLite 版本
            const db = getDb();
            
            const toLive = db.prepare(`
                UPDATE matches 
                SET status = 'live', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time) <= datetime(?)
            `).run(now);
            liveChanges = toLive.changes;
            
            const toFinished = db.prepare(`
                SELECT id, home_team, away_team, league, match_time
                FROM matches 
                WHERE status = 'live' 
                AND datetime(match_time, '+110 minutes') <= datetime(?)
                  AND (score_fetch_triggered IS NULL OR score_fetch_triggered = 0)
            `).all(now);
            finishedMatches = toFinished || [];
            
            if (finishedMatches.length > 0) {
                const ids = finishedMatches.map(m => m.id).join(',');
                db.prepare(`
                    UPDATE matches 
                    SET status = 'finished', 
                        score_fetch_triggered = 1,
                        finished_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id IN (${ids})
                `).run();
            }
        }
        
        if (liveChanges > 0) {
            logger.info(`⏰ 已将 ${liveChanges} 场比赛状态更新为 live`);
        }
        
        // 3. 对已结束的比赛，立即触发比分获取（异步执行）
        if (finishedMatches.length > 0) {
            logger.info(`📊 发现 ${finishedMatches.length} 场比赛已结束，开始获取比分...`);
            
            // 动态导入比分获取服务
            const { fetchAndUpdateMatchScore } = await import('./auto-fetch-scores.js');
            
            for (const match of finishedMatches) {
                // 异步获取比分，不阻塞后续处理
                setImmediate(async () => {
                    try {
                        await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
                    } catch (err) {
                        logger.error(`获取比赛 ${match.id} 比分失败:`, err);
                    }
                });
            }
        }
        
    } catch (error) {
        logger.error('更新比赛状态失败:', error);
    }
}

// 延迟执行，等待数据库初始化
setTimeout(() => {
    updateMatchStatus();
}, 3000);

// 每 2 分钟执行一次（更频繁检测比赛结束）
setInterval(updateMatchStatus, 2 * 60 * 1000);

export { updateMatchStatus };