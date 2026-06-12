/**
 * FOOTRADAPRO - Auto Fetch Scores Service
 * @description 自动获取已结束比赛的比分（使用 DeepSeek API 联网搜索）
 * @version 5.2.0 - 修复无限重试问题，移除自动启动，添加防重复机制
 * @since 2026-06-12
 */

import 'dotenv/config';
import logger from '../utils/logger.js';
import { fetchMatchScore } from '../services/deepseek.service.js';

const isProduction = process.env.NODE_ENV === 'production';

// 重试配置
const MAX_RETRIES = 2;  // 减少重试次数
const RETRY_DELAYS = {
    LIVE: 10 * 60 * 1000,      // 比赛进行中：10分钟后重试
    PENDING: 15 * 60 * 1000,   // 比赛未开始：15分钟后重试
    FAILED: 30 * 60 * 1000,    // 获取失败：30分钟后重试
    CONFIRM: 2 * 60 * 1000     // 需要确认：2分钟后二次确认
};

// 防止重复请求的缓存
const pendingRequests = new Map();
const recentlyProcessed = new Map(); // 记录最近处理的比赛，避免重复

/**
 * 检查是否应该跳过（避免频繁重试）
 * @param {number|string} matchId - 比赛ID
 * @returns {boolean}
 */
function shouldSkip(matchId) {
    if (recentlyProcessed.has(matchId)) {
        const lastProcess = recentlyProcessed.get(matchId);
        if (Date.now() - lastProcess < 30 * 60 * 1000) { // 30分钟内不重复处理
            return true;
        }
    }
    return false;
}

/**
 * 更新比赛比分
 * @param {number|string} matchId - 比赛ID
 * @param {number} homeScore - 主队比分
 * @param {number} awayScore - 客队比分
 * @returns {Promise<boolean>}
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
        
        // 记录已处理
        recentlyProcessed.set(matchId, Date.now());
        return true;
    } catch (error) {
        logger.error('更新比赛比分失败:', error);
        return false;
    }
}

/**
 * 获取并更新比赛比分（带防重复）
 * @param {number|string} matchId - 比赛ID
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} league - 联赛名称
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<{success: boolean, updated: boolean, skipped?: boolean, status?: string, error?: string}>}
 */
export async function fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount = 0) {
    // 防止重复请求
    if (pendingRequests.has(matchId)) {
        logger.info(`⏸️ 跳过重复请求: ${homeTeam} vs ${awayTeam}`);
        return { success: false, updated: false, skipped: true };
    }
    
    // 检查是否最近处理过
    if (shouldSkip(matchId)) {
        logger.info(`⏸️ ${homeTeam} vs ${awayTeam} 最近已处理，跳过`);
        return { success: false, updated: false, skipped: true };
    }
    
    pendingRequests.set(matchId, true);
    
    try {
        logger.info(`📊 获取比分 (尝试 ${retryCount + 1}/${MAX_RETRIES}): ${homeTeam} vs ${awayTeam}`);
        
        const scoreResult = await fetchMatchScore(homeTeam, awayTeam);
        
        // 情况1：比分获取成功
        if (scoreResult.success && scoreResult.status === 'finished') {
            const updated = await updateMatchScore(matchId, scoreResult.home, scoreResult.away);
            if (updated) {
                logger.info(`✅ 比赛 ${matchId} 比分已更新: ${scoreResult.home}:${scoreResult.away}`);
            }
            pendingRequests.delete(matchId);
            return { success: true, updated: true };
        }
        
        // 情况2：比赛正在进行中（不重试，等待下次定时任务）
        if (scoreResult.success && scoreResult.status === 'live') {
            logger.info(`🔄 比赛 ${matchId} (${homeTeam} vs ${awayTeam}) 仍在进行中，等待下次检查`);
            pendingRequests.delete(matchId);
            return { success: false, updated: false, status: 'live' };
        }
        
        // 情况3：比赛未开始
        if (scoreResult.success && scoreResult.status === 'upcoming') {
            logger.info(`⏳ 比赛 ${matchId} (${homeTeam} vs ${awayTeam}) 尚未开始，等待下次检查`);
            pendingRequests.delete(matchId);
            return { success: false, updated: false, status: 'upcoming' };
        }
        
        // 情况4：获取失败，记录但不递归重试
        if (retryCount < MAX_RETRIES - 1) {
            logger.info(`⏳ ${homeTeam} vs ${awayTeam} 获取失败，${RETRY_DELAYS.FAILED / 60000}分钟后重试...`);
            setTimeout(async () => {
                pendingRequests.delete(matchId);
                await fetchAndUpdateMatchScore(matchId, homeTeam, awayTeam, league, retryCount + 1);
            }, RETRY_DELAYS.FAILED);
            return { success: false, updated: false };
        }
        
        logger.warn(`⚠️ 比赛 ${matchId} (${homeTeam} vs ${awayTeam}) 多次获取失败: ${scoreResult.error || '未知错误'}`);
        pendingRequests.delete(matchId);
        return { success: false, updated: false, error: scoreResult.error };
        
    } catch (error) {
        logger.error(`获取比赛 ${matchId} 比分失败:`, error.message);
        pendingRequests.delete(matchId);
        return { success: false, updated: false, error: error.message };
    }
}

/**
 * 批量获取已结束但无比分比赛的比分
 * @param {number} limit - 每次处理的数量限制（默认5，避免API过载）
 * @returns {Promise<{processed: number, updated: number, error?: string}>}
 */
export async function updateScoresForFinishedMatches(limit = 5) {
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
                LIMIT $1
            `, [limit]);
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT id, home_team, away_team, league
                FROM matches 
                WHERE status = 'finished' 
                AND (home_score IS NULL OR away_score IS NULL)
                AND (score_fetch_triggered IS NULL OR score_fetch_triggered = 0)
                ORDER BY finished_at DESC
                LIMIT ?
            `).all(limit);
        }
        
        if (!matches || matches.length === 0) {
            logger.info('📋 暂无待获取比分的比赛');
            return { processed: 0, updated: 0 };
        }
        
        logger.info(`📋 发现 ${matches.length} 场待获取比分的比赛`);
        
        let updated = 0;
        for (const match of matches) {
            const result = await fetchAndUpdateMatchScore(match.id, match.home_team, match.away_team, match.league);
            if (result.updated) updated++;
            // 添加延迟，避免 API 限流
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        logger.info(`📊 比分更新完成: 处理 ${matches.length} 场，更新 ${updated} 场`);
        return { processed: matches.length, updated };
        
    } catch (error) {
        logger.error('批量更新比分失败:', error);
        return { processed: 0, updated: 0, error: error.message };
    }
}

/**
 * 清理缓存（用于测试或手动重置）
 */
export function clearCache() {
    pendingRequests.clear();
    recentlyProcessed.clear();
    logger.info('🧹 比分获取缓存已清理');
}

// ========== 注意：移除了自动启动的 setInterval 和 setTimeout ==========
// 定时任务现在由 app.js 统一控制启动

export default {
    fetchAndUpdateMatchScore,
    updateScoresForFinishedMatches,
    clearCache
};