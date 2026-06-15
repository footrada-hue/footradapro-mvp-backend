/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 13.1.0 - 恢复能正常获取数据的配置
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

// 未来抓取天数配置
const FUTURE_DAYS = 30;

// 已结束赛季的联赛黑名单
const ENDED_LEAGUES = [
    'Premier League', 'EFL Championship', 'La Liga', 'La Liga 2',
    'Serie A', 'Serie B', 'Bundesliga', '2. Bundesliga',
    'Ligue 1', 'Ligue 2', 'Eredivisie', 'Primeira Liga',
    'Belgian Pro League', 'Scottish Premiership'
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildPrompt(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + FUTURE_DAYS);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    return `请使用联网搜索，获取 ${startDate} 至 ${endDateStr} 期间的足球比赛赛程。

【优先返回】：
1. FIFA World Cup 2026 所有比赛（小组赛、淘汰赛、决赛）
2. 正在进行的联赛：J1 League, K League, Chinese Super League, MLS, Allsvenskan, Eliteserien, Brazilian Serie A

【不要返回】：
- 英超、西甲、意甲、德甲、法甲（赛季已结束）
- 欧冠、欧联杯

【返回格式 JSON】：
{
  "matches": [
    {"league": "FIFA World Cup 2026", "home_team": "Brazil", "away_team": "Argentina", "match_time_utc": "2026-06-15 20:00:00"}
  ]
}

只返回JSON，不要有其他文字。`;
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
                        content: '你是足球数据助手。使用联网搜索获取真实比赛数据。只返回纯JSON格式。'
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

export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n🎯 获取比赛数据...`);
    console.log(`📅 日期范围: ${todayStr} 至 未来 ${FUTURE_DAYS} 天`);
    
    const prompt = buildPrompt(todayStr);
    
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
        
        console.log(`📡 原始返回: ${content.substring(0, 200)}...`);
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            // 过滤掉已结束联赛
            const validMatches = result.matches.filter(m => {
                const league = m.league || '';
                if (ENDED_LEAGUES.includes(league)) {
                    console.log(`⏭️ 过滤: ${league}`);
                    return false;
                }
                return m.home_team && m.away_team && m.match_time_utc;
            });
            
            console.log(`✅ 获取 ${validMatches.length} 场有效比赛`);
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
    return { success: false, error: 'NOT_IMPLEMENTED', home: 0, away: 0, status: 'unknown' };
}

export default {
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore
};