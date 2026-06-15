/**
 * DeepSeek API Service
 * @description 获取 2026 FIFA World Cup 真实官方赛程
 * @version 14.0.0 - 只获取真实世界杯数据，拒绝编造
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 真实世界杯日期范围
const WORLD_CUP_START = '2026-06-11';
const WORLD_CUP_END = '2026-07-19';

function buildWorldCupPrompt() {
    return `【重要任务：获取 2026 FIFA World Cup 官方真实赛程】

⚠️ **严格限制**：
- 只返回 FIFA 官方已经公布的【真实】赛程
- 如果官方赛程尚未公布，请返回空数组 []
- 绝对不要编造任何比赛、球队、时间

📅 **比赛时间范围**：${WORLD_CUP_START} 至 ${WORLD_CUP_END}

🏆 **比赛阶段**：
1. 小组赛（Group Stage）- 48 场比赛
2. 淘汰赛（Knockout Stage）
   - Round of 32（32强）
   - Round of 16（16强）
   - Quarter-finals（8强）
   - Semi-finals（半决赛）
   - Final（决赛）
   - Third-place match（季军赛）

✅ **真实示例**：
{"league": "FIFA World Cup 2026", "home_team": "USA", "away_team": "Mexico", "match_time_utc": "2026-06-11 20:00:00"}

❌ **禁止行为**：
- 不要编造球队对阵
- 不要使用 "Winner of Group A" 等占位符
- 不要返回未确认的比赛

【返回格式】：
{
  "matches": [
    {"league": "FIFA World Cup 2026", "home_team": "实际主队", "away_team": "实际客队", "match_time_utc": "2026-06-11 20:00:00"}
  ]
}

⚠️ **如果赛程未公布，只返回 {"matches": []}**

请诚实回答，只返回官方已确认的比赛。`;
}

function cleanMarkdown(content) {
    if (!content) return '';
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    return cleaned;
}

async function callWithRetry(prompt, retryCount = 0) {
    try {
        console.log(`📡 发送请求到 DeepSeek API...`);
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
                        content: '你是 FIFA 官方数据助手。只返回已经官方公布的、100% 真实的足球赛程。如果不知道或不确定，返回空数组。绝对不要编造任何数据。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: MAX_TOKENS,
                extra_body: { enable_search: true }
            })
        });

        console.log(`📡 响应状态码: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📡 API 响应成功`);
        return data;
    } catch (error) {
        if (retryCount < MAX_RETRIES - 1) {
            console.warn(`重试 (${retryCount + 1}/${MAX_RETRIES}):`, error.message);
            await delay(RETRY_DELAY);
            return callWithRetry(prompt, retryCount + 1);
        }
        throw error;
    }
}

/**
 * 验证比赛是否为真实世界杯比赛
 */
function isValidMatch(match) {
    // 检查必要字段
    if (!match.home_team || !match.away_team || !match.match_time_utc) {
        return false;
    }
    
    // 检查联赛名称
    const league = (match.league || '').toLowerCase();
    if (!league.includes('fifa world cup') && !league.includes('world cup 2026')) {
        return false;
    }
    
    // 检查比赛时间是否在世界杯期间
    const matchDate = match.match_time_utc.split(' ')[0];
    if (matchDate < WORLD_CUP_START || matchDate > WORLD_CUP_END) {
        console.log(`   ⏭️ 日期超出范围: ${matchDate}`);
        return false;
    }
    
    // 拒绝占位符
    const placeholders = ['winner', 'tbd', 'to be determined', '?', '组', 'group'];
    const homeLower = match.home_team.toLowerCase();
    const awayLower = match.away_team.toLowerCase();
    
    for (const ph of placeholders) {
        if (homeLower.includes(ph) || awayLower.includes(ph)) {
            console.log(`   ⏭️ 拒绝占位符: ${match.home_team} vs ${match.away_team}`);
            return false;
        }
    }
    
    return true;
}

export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    console.log(`\n🏆 ========== 获取 2026 FIFA World Cup 真实赛程 ==========`);
    console.log(`📅 比赛日期范围: ${WORLD_CUP_START} 至 ${WORLD_CUP_END}`);
    console.log(`⚽ 模式: 只返回官方已确认的真实比赛\n`);
    
    const prompt = buildWorldCupPrompt();
    
    try {
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ API 响应无效`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ 返回内容为空`);
            return [];
        }
        
        console.log(`📡 原始返回: ${content.substring(0, 300)}...`);
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            const validMatches = result.matches.filter(match => {
                const isValid = isValidMatch(match);
                if (isValid) {
                    console.log(`   ✅ 有效: ${match.home_team} vs ${match.away_team} (${match.match_time_utc})`);
                } else {
                    console.log(`   ❌ 无效: ${JSON.stringify(match)}`);
                }
                return isValid;
            });
            
            console.log(`\n📊 结果: 总共 ${result.matches.length} 场，有效 ${validMatches.length} 场`);
            
            if (validMatches.length === 0) {
                console.log(`\n⚠️ 未能获取到真实世界杯赛程`);
                console.log(`💡 原因: 2026 FIFA World Cup 官方完整赛程可能尚未公布`);
                console.log(`💡 建议: 等待 FIFA 官方公布后重试，或手动导入赛程`);
            }
            
            return validMatches;
        }
        
        return [];
    } catch (error) {
        console.error(`❌ 获取失败:`, error.message);
        return [];
    }
}

export async function fetchMatchesForSpecificDate(date) {
    const matches = await fetchUpcomingMatches();
    return matches.filter(m => m.match_time_utc.split(' ')[0] === date);
}

export async function fetchMatchScore(homeTeam, awayTeam) {
    return { success: false, error: 'SCORE_FETCH_DISABLED', home: 0, away: 0, status: 'unknown' };
}

export default {
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore
};