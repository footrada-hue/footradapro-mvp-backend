// 在文件开头添加这个函数
async function ensureColumns() {
    try {
        const { query } = await import('../database/connection.js');
        await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_confirmed BOOLEAN DEFAULT FALSE`).catch(() => {});
        await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP`).catch(() => {});
        await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_fetch_triggered BOOLEAN DEFAULT FALSE`).catch(() => {});
        logger.info('✅ 数据库字段检查完成');
    } catch (err) {
        logger.debug('字段检查:', err.message);
    }
}

// 在 setTimeout 之前调用
setTimeout(async () => {
    await ensureColumns();
    updateScoresForFinishedMatches();
}, 8000);
/**
 * FOOTRADAPRO - Auto Fetch Scores Service
 * @description 自动获取已结束比赛的比分（使用 DeepSeek API 联网搜索）
 * @version 4.2.0 - 智能二次确认，处理伤停补时和加时赛
 * @since 2026-06-07
 */

import 'dotenv/config';
import logger from '../utils/logger.js';
import { fetchMatchScore } from '../services/deepseek.service.js';

const isProduction = process.env.NODE_ENV === 'production';

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAYS = {
    LIVE: 15 * 60 * 1000,      // 比赛进行中：15分钟后重试
    PENDING: 10 * 60 * 1000,   // 比赛未开始：10分钟后重试
    FAILED: 30 * 60 * 1000,    // 获取失败：30分钟后重试
    CONFIRM: 5 * 60 * 1000     // 需要确认：5分钟后二次确认
};

/**
 * 获取并更新比赛比分（带智能重试）
 * @param {number} matchId - 比赛ID
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} league - 联赛名称
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<{success: boolean, updated: boolean, needManualCheck: boolean, retryAfter?: number}>}
 */
export async function fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount = 0) {
    try {
        logger.info(`📊 获取比分 (尝试 ${retryCount + 1}/${MAX_RETRIES}): ${homeTeam} vs ${awayTeam} (${league})`);
        
        const scoreResult = await fetchMatchScore(homeTeam, awayTeam);
        
        // 情况1：比分获取成功且比赛已结束
        if (scoreResult.success && scoreResult.status === 'finished') {
            // 第一次获取成功，等待 5 分钟后二次确认
            if (retryCount === 0) {
                logger.info(`⏳ 第一次获取比分成功，等待 5 分钟后二次确认...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS.CONFIRM));
                return await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }
            
            // 二次确认成功，更新数据库
            await updateMatchScore(matchId, scoreResult.home, scoreResult.away, true);
            logger.info(`✅ 比赛 ${matchId} 比分已确认: ${scoreResult.home}:${scoreResult.away}`);
            return { success: true, updated: true, needManualCheck: false };
        }
        
        // 情况2：比赛正在进行中
        if (scoreResult.success && scoreResult.status === 'live') {
            logger.info(`🔄 比赛 ${matchId} 仍在进行中，15分钟后重试...`);
            
            if (retryCount < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS.LIVE));
                return await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }
            
            // 超过重试次数，标记需人工确认
            logger.warn(`⚠️ 比赛 ${matchId} 多次获取仍在进行中，请人工确认`);
            return { success: false, updated: false, needManualCheck: true, message: '比赛进行中，请人工确认' };
        }
        
        // 情况3：比赛尚未开始或无法获取
        if (scoreResult.status === 'pending' || !scoreResult.success) {
            logger.warn(`⚠️ 比赛 ${matchId} 状态: ${scoreResult.status || '未知'}，${RETRY_DELAYS.PENDING / 60000}分钟后重试`);
            
            if (retryCount < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS.PENDING));
                return await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }
            
            // 超过重试次数，标记需人工确认
            logger.warn(`⚠️ 比赛 ${matchId} 多次获取失败，请人工确认`);
            return { success: false, updated: false, needManualCheck: true, error: scoreResult.error };
        }
        
        return { success: false, updated: false, needManualCheck: true, error: '未知错误' };
        
    } catch (error) {
        logger.error(`获取比赛 ${matchId} 比分失败:`, error.message);
        
        if (retryCount < MAX_RETRIES - 1) {
            logger.info(`⏳ ${RETRY_DELAYS.FAILED / 60000}分钟后重试...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS.FAILED));
            return await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
        }
        
        return { success: false, updated: false, needManualCheck: true, error: error.message };
    }
}

/**
 * 更新比赛比分
 */
async function updateMatchScore(matchId, homeScore, awayScore, confirmed = true) {
    try {
        if (isProduction) {
            const { query } = await import('../database/connection.js');
            await query(`
                UPDATE matches 
                SET home_score = $1, 
                    away_score = $2, 
                    score_confirmed = $3,
                    updated_at = NOW()
                WHERE id = $4
            `, [homeScore, awayScore, confirmed, matchId]);
        } else {
            const { getDb } = await import('../database/connection.js');
            const db = getDb();
            db.prepare(`
                UPDATE matches 
                SET home_score = ?, 
                    away_score = ?, 
                    score_confirmed = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(homeScore, awayScore, confirmed ? 1 : 0, matchId);
        }
        return true;
    } catch (error) {
        logger.error('更新比赛比分失败:', error);
        return false;
    }
}

/**
 * 批量获取已结束但无比分比赛的比分（定时任务备用）
 */
async function updateScoresForFinishedMatches() {
    try {
        const { query, getDb } = await import('../database/connection.js');
        
        // 只获取最近 7 天内的比赛（给加时赛足够时间）
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        let matches;
        if (isProduction) {
            matches = await query(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL OR score_confirmed = false)
                AND finished_at >= $1
                ORDER BY finished_at DESC
                LIMIT 20
            `, [sevenDaysAgo.toISOString()]);
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL OR score_confirmed = 0)
                AND finished_at >= date('now', '-7 days')
                ORDER BY finished_at DESC
                LIMIT 20
            `).all();
        }
        
        if (!matches || matches.length === 0) {
            return;
        }
        
        logger.info(`📋 发现 ${matches.length} 场待获取比分的比赛`);
        
        for (const match of matches) {
            // 异步执行，不阻塞
            setImmediate(async () => {
                await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
            });
            // 避免 API 请求过快
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        logger.error('批量更新比分失败:', error);
    }
}

// 延迟执行
setTimeout(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('初始化比分获取失败:', err);
    });
}, 8000);

// 每 60 分钟执行一次（降低频率，作为兜底）
setInterval(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('定时比分获取失败:', err);
    });
}, 60 * 60 * 1000);

export { updateScoresForFinishedMatches };