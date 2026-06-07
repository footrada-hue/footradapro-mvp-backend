/**
 * FOOTRADAPRO - Auto Fetch Scores Service
 * @description 自动获取已结束比赛的比分（使用 DeepSeek API 联网搜索，带二次确认）
 * @version 4.0.0
 * @since 2026-06-07
 */

import 'dotenv/config';
import logger from '../utils/logger.js';
import { fetchAndConfirmMatchScore } from '../services/deepseek.service.js';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 获取并更新比赛比分（带二次确认）
 * @param {number} matchId - 比赛ID
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} league - 联赛名称
 * @returns {Promise<{success: boolean, updated: boolean, needManualCheck: boolean}>}
 */
export async function fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league) {
    try {
        logger.info(`📊 开始获取比分: ${homeTeam} vs ${awayTeam} (${league})`);
        
        // 调用 deepseek.service.js 中带二次确认的比分获取函数
        const scoreResult = await fetchAndConfirmMatchScore(homeTeam, awayTeam);
        
        if (scoreResult.success && scoreResult.confirmed) {
            // 比分确认，更新数据库
            await updateMatchScore(matchId, scoreResult.home, scoreResult.away, true);
            logger.info(`✅ 比赛 ${matchId} 比分已确认: ${scoreResult.home}:${scoreResult.away}`);
            return { success: true, updated: true, needManualCheck: false };
            
        } else if (scoreResult.success && scoreResult.needManualCheck) {
            // 比分不一致，需人工确认（仍然保存比分，但标记为未确认）
            await updateMatchScore(matchId, scoreResult.home, scoreResult.away, false);
            logger.warn(`⚠️ 比赛 ${matchId} 比分需人工确认: ${scoreResult.message}`);
            return { success: true, updated: true, needManualCheck: true, message: scoreResult.message };
            
        } else {
            logger.error(`❌ 比赛 ${matchId} 获取比分失败: ${scoreResult.error}`);
            return { success: false, updated: false, needManualCheck: true, error: scoreResult.error };
        }
        
    } catch (error) {
        logger.error(`获取比赛 ${matchId} 比分失败:`, error.message);
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
        
        // 获取需要更新比分的比赛
        let matches;
        if (isProduction) {
            matches = await query(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL OR score_confirmed = false)
                ORDER BY finished_at DESC
                LIMIT 20
            `);
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL OR score_confirmed = 0)
                ORDER BY finished_at DESC
                LIMIT 20
            `).all();
        }
        
        if (!matches || matches.length === 0) {
            return;
        }
        
        logger.info(`📋 发现 ${matches.length} 场待获取比分的比赛`);
        
        for (const match of matches) {
            await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
            // 避免 API 请求过快
            await new Promise(resolve => setTimeout(resolve, 2000));
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

// 每 15 分钟执行一次（作为补充）
setInterval(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('定时比分获取失败:', err);
    });
}, 15 * 60 * 1000);

export { updateScoresForFinishedMatches };