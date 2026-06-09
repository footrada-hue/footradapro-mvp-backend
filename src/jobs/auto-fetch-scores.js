/**
 * FOOTRADAPRO - Auto Fetch Scores Service
 * @description 自动获取已结束比赛的比分（使用 DeepSeek API 联网搜索）
 * @version 5.0.0 - 永久修复比分获取逻辑
 */

import 'dotenv/config';
import logger from '../utils/logger.js';
import { fetchMatchScore } from '../services/deepseek.service.js';

const isProduction = process.env.NODE_ENV === 'production';

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAYS = {
    LIVE: 5 * 60 * 1000,      // 比赛进行中：5分钟后重试
    PENDING: 3 * 60 * 1000,   // 比赛未开始：3分钟后重试
    FAILED: 10 * 60 * 1000,   // 获取失败：10分钟后重试
    CONFIRM: 2 * 60 * 1000    // 需要确认：2分钟后二次确认
};

/**
 * 获取并更新比赛比分
 */
export async function fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount = 0) {
    try {
        logger.info(`📊 获取比分 (尝试 ${retryCount + 1}/${MAX_RETRIES}): ${homeTeam} vs ${awayTeam}`);
        
        const scoreResult = await fetchMatchScore(homeTeam, awayTeam);
        
        // 情况1：比分获取成功
        if (scoreResult.success && scoreResult.status === 'finished') {
            await updateMatchScore(matchId, scoreResult.home, scoreResult.away);
            logger.info(`✅ 比赛 ${matchId} 比分已更新: ${scoreResult.home}:${scoreResult.away}`);
            return { success: true, updated: true };
        }
        
        // 情况2：比赛正在进行中
        if (scoreResult.success && scoreResult.status === 'live') {
            logger.info(`🔄 比赛 ${matchId} 仍在进行中，${RETRY_DELAYS.LIVE / 60000}分钟后重试...`);
            if (retryCount < MAX_RETRIES - 1) {
                setTimeout(async () => {
                    await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
                }, RETRY_DELAYS.LIVE);
            }
            return { success: false, updated: false };
        }
        
        // 情况3：获取失败，重试
        if (retryCount < MAX_RETRIES - 1) {
            logger.info(`⏳ ${RETRY_DELAYS.FAILED / 60000}分钟后重试...`);
            setTimeout(async () => {
                await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }, RETRY_DELAYS.FAILED);
            return { success: false, updated: false };
        }
        
        logger.warn(`⚠️ 比赛 ${matchId} 多次获取失败: ${scoreResult.error || '未知错误'}`);
        return { success: false, updated: false, error: scoreResult.error };
        
    } catch (error) {
        logger.error(`获取比赛 ${matchId} 比分失败:`, error.message);
        
        if (retryCount < MAX_RETRIES - 1) {
            setTimeout(async () => {
                await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }, RETRY_DELAYS.FAILED);
        }
        
        return { success: false, updated: false, error: error.message };
    }
}

/**
 * 更新比赛比分
 */
async function updateMatchScore(matchId, homeScore, awayScore) {
    try {
        if (isProduction) {
            const { query } = await import('../database/connection.js');
            await query(`
                UPDATE matches 
                SET home_score = $1, 
                    away_score = $2, 
                    score_confirmed = true,
                    score_fetch_triggered = true,
                    updated_at = NOW()
                WHERE id = $3
            `, [homeScore, awayScore, matchId]);
        } else {
            const { getDb } = await import('../database/connection.js');
            const db = getDb();
            db.prepare(`
                UPDATE matches 
                SET home_score = ?, 
                    away_score = ?, 
                    score_confirmed = 1,
                    score_fetch_triggered = 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(homeScore, awayScore, matchId);
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
export async function updateScoresForFinishedMatches() {
    try {
        const { query, getDb } = await import('../database/connection.js');
        
        let matches;
        if (isProduction) {
            matches = await query(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL)
                AND (score_fetch_triggered IS NULL OR score_fetch_triggered = false)
                ORDER BY finished_at DESC
                LIMIT 30
            `);
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL)
                AND (score_fetch_triggered IS NULL OR score_fetch_triggered = 0)
                ORDER BY finished_at DESC
                LIMIT 30
            `).all();
        }
        
        if (!matches || matches.length === 0) {
            return;
        }
        
        logger.info(`📋 发现 ${matches.length} 场待获取比分的比赛`);
        
        for (const match of matches) {
            await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
            // 避免 API 请求过快
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        logger.error('批量更新比分失败:', error);
    }
}

// 启动定时任务：每 10 分钟检查一次
setInterval(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('定时比分获取失败:', err);
    });
}, 10 * 60 * 1000);

// 启动时执行一次
setTimeout(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('初始化比分获取失败:', err);
    });
}, 30000);

export { updateScoresForFinishedMatches };