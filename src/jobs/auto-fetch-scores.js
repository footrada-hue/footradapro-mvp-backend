/**
 * FOOTRADAPRO - Auto Fetch Scores Service
 * @description 自动获取已结束比赛的比分（使用 DeepSeek API 联网搜索）
 * @version 3.0.0
 * @since 2026-04-02
 * @i18n 支持多语言，所有文案已标记
 */

import 'dotenv/config';
import logger from '../utils/logger.js';

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 从 DeepSeek API 获取比赛比分
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} league - 联赛名称
 * @returns {Promise<{home: number, away: number} | null>}
 */
async function fetchScoreFromDeepSeek(homeTeam, awayTeam, league) {
    if (!DEEPSEEK_API_KEY) {
        logger.warn('DeepSeek API key not configured');
        return null;
    }

    // i18n: 提示词 - 按球队名和联赛搜索比分（不依赖日期）
    const prompt = `请搜索 ${homeTeam} vs ${awayTeam} 的 ${league} 比赛最终比分。

要求：
1. 必须使用联网搜索获取真实比分
2. 只返回 JSON 格式，不要有任何额外文字
3. 如果搜索不到，返回 {"home_score": null, "away_score": null}

返回格式示例：
{"home_score": 2, "away_score": 1}`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a football data assistant. Must use web search to get real match scores. Return only pure JSON format data.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 100,
                extra_body: { enable_search: true }
            })
        });

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        
        // 清理 markdown 标记
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const result = JSON.parse(content);
        
        if (result.home_score !== null && result.away_score !== null) {
            return { home: result.home_score, away: result.away_score };
        }
        return null;
    } catch (error) {
        logger.error('Fetch score error:', error.message);
        return null;
    }
}

/**
 * 更新已结束比赛的比分
 */
async function updateScoresForFinishedMatches() {
    // 确保数据库已初始化
    const { initDatabase, getDb } = await import('../database/connection.js');
    await initDatabase();
    const db = getDb();
    
    const now = new Date().toISOString();
    
    try {
        const matches = db.prepare(`
            SELECT id, match_id, home_team, away_team, match_time, league
            FROM matches 
            WHERE status = 'finished' 
            AND (home_score IS NULL OR away_score IS NULL OR (home_score = 0 AND away_score = 0))
            AND datetime(match_time, '+110 minutes') <= datetime(?)
            ORDER BY match_time DESC
            LIMIT 10
        `).all(now);
        
        if (matches.length === 0) {
            return;
        }
        
        logger.info(`Found ${matches.length} finished matches without scores`);
        
        for (const match of matches) {
            logger.info(`Fetching score for: ${match.home_team} vs ${match.away_team} (${match.league})`);
            
            const score = await fetchScoreFromDeepSeek(match.home_team, match.away_team, match.league);
            
            if (score) {
                db.prepare(`
                    UPDATE matches 
                    SET home_score = ?, away_score = ?
                    WHERE id = ?
                `).run(score.home, score.away, match.id);
                
                logger.info(`✅ Score updated: ${match.home_team} ${score.home}:${score.away} ${match.away_team}`);
            } else {
                logger.warn(`⚠️ Could not fetch score for: ${match.home_team} vs ${match.away_team} (${match.league})`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        logger.error('Update scores error:', error);
    }
}

// 立即执行一次
updateScoresForFinishedMatches().catch(err => {
    logger.error('Initial score fetch failed:', err);
});

// 每 10 分钟执行一次
setInterval(() => {
    updateScoresForFinishedMatches().catch(err => {
        logger.error('Scheduled score fetch failed:', err);
    });
}, 10 * 60 * 1000);

export { updateScoresForFinishedMatches };