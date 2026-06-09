/**
 * FOOTRADAPRO - Auto Update Match Status Service
 * @description 自动更新比赛状态：upcoming → live → finished
 * @version 5.0.0 - 永久修复状态更新和比分获取
 */

import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

// 比赛结束判断时间（分钟）- 改为 90 分钟（正常比赛时间+补时）
const MATCH_DURATION_MINUTES = 90;

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
            
            if (toLive?.length > 0) {
                logger.info(`⏰ 已将 ${toLive.length} 场比赛状态更新为 live`);
            }
            
            // 2. 将已结束的比赛从 live 改为 finished（使用更短的时间）
            const toFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'live' 
                AND match_time <= NOW() - INTERVAL '${MATCH_DURATION_MINUTES} minutes'
                RETURNING id, home_team, away_team, league
            `);
            
            // 3. 修复遗漏的比赛：状态是 upcoming 但比赛时间已过
            const orphanFinished = await query(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= NOW() - INTERVAL '${MATCH_DURATION_MINUTES + 10} minutes'
                RETURNING id, home_team, away_team, league
            `);
            
            const finishedMatches = [...(toFinished || []), ...(orphanFinished || [])];
            
            if (finishedMatches.length > 0) {
                logger.info(`✅ 已将 ${finishedMatches.length} 场比赛状态更新为 finished`);
                
                // 立即触发比分获取（不延迟）
                const { fetchAndUpdateMatchScore } = await import('./auto-fetch-scores.js');
                
                for (const match of finishedMatches) {
                    // 异步获取比分，不阻塞
                    setImmediate(async () => {
                        try {
                            logger.info(`📊 获取比分: ${match.home_team} vs ${match.away_team}`);
                            await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
                        } catch (err) {
                            logger.error(`获取比赛 ${match.id} 比分失败:`, err.message);
                        }
                    });
                    // 避免 API 请求过快
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
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
            
            if (toLive.changes > 0) {
                logger.info(`⏰ 已将 ${toLive.changes} 场比赛状态更新为 live`);
            }
            
            const toFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'live' 
                AND datetime(match_time, '+${MATCH_DURATION_MINUTES} minutes') <= datetime('now')
            `).run();
            
            const orphanFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', 
                    finished_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time, '+${MATCH_DURATION_MINUTES + 10} minutes') <= datetime('now')
            `).run();
            
            const finishedCount = toFinished.changes + orphanFinished.changes;
            
            if (finishedCount > 0) {
                logger.info(`✅ 已将 ${finishedCount} 场比赛状态更新为 finished`);
                
                // SQLite 版本也需要触发比分获取
                const { fetchAndUpdateMatchScore } = await import('./auto-fetch-scores.js');
                const finishedMatches = db.prepare(`
                    SELECT id, home_team, away_team, league
                    FROM matches 
                    WHERE status = 'finished' 
                    AND (score_fetch_triggered IS NULL OR score_fetch_triggered = 0)
                    AND datetime(match_time, '+${MATCH_DURATION_MINUTES} minutes') <= datetime('now')
                    LIMIT 20
                `).all();
                
                for (const match of finishedMatches) {
                    setImmediate(async () => {
                        try {
                            await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
                        } catch (err) {
                            logger.error(`获取比赛 ${match.id} 比分失败:`, err.message);
                        }
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
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