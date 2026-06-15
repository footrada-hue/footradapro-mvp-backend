/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 14.1.0 - 获取所有能搜索到的真实比赛
 * @since 2026-06-15
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

// 未来抓取天数配置
const FUTURE_DAYS = 60;

// 黑名单：绝对不要的比赛类型
const BLACKLIST_LEAGUES = [
    'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'EFL Championship', 'La Liga 2', 'Serie B', '2. Bundesliga', 'Ligue 2',
    'Eredivisie', 'Primeira Liga', 'Belgian Pro League', 'Scottish Premiership',
    'World Cup Qualifier', 'Qualifier', 'UEFA Champions League', 'UEFA Europa League',
    'UEFA Europa Conference League', 'Champions League', 'Europa League'
];

// 黑名单关键词（包含这些关键词的比赛跳过）
const BLACKLIST_KEYWORDS = [
    'qualifier', 'qualifiers', '预选赛', 'U21', 'U19', 'U17', 'Reserves',
    'Youth', 'Amateur', 'Women', 'Friendly', 'Club Friendly'
];

// 白名单：优先保留的比赛类型
const WHITELIST_LEAGUES = [
    'FIFA World Cup 2026', 'World Cup 2026', '2026 FIFA World Cup',
    'J1 League', 'J2 League', 'K League 1', 'K League 2',
    'Chinese Super League', 'CSL', 'Major League Soccer', 'MLS',
    'Allsvenskan', 'Eliteserien', 'Brasileirao', 'Brazilian Serie A',
    'Argentine Primera Division', 'Liga MX', 'A-League',
    'Saudi Pro League', 'Qatar Stars League', 'UAE Pro League',
    'AFC Champions League', 'CAF Champions League', 'Copa Libertadores'
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构建 Prompt - 获取所有能搜索到的比赛
 * @param {string} startDate - 起始日期
 * @returns {string}
 */
function buildPrompt(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + FUTURE_DAYS);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    return `【任务：获取足球比赛赛程】

请使用联网搜索，获取 ${startDate} 至 ${endDateStr} 期间的【真实】足球比赛。

【可以获取的比赛】：
✅ 2026 FIFA World Cup（如果有官方赛程）
✅ 正在进行的联赛：
   - J1 League / J2 League（日本）
   - K League 1 / K League 2（韩国）
   - Chinese Super League（中国）
   - Major League Soccer（美国）
   - Allsvenskan（瑞典）
   - Eliteserien（挪威）
   - Brazilian Serie A（巴西）
   - Argentine Primera Division（阿根廷）

【绝对不要返回】：
❌ 已经结束的五大联赛（英超、西甲、意甲、德甲、法甲）
❌ 欧冠、欧联杯（赛季已结束）
❌ 世界杯预选赛
❌ 青年队比赛、友谊赛
❌ 不要编造任何比赛

【要求】：
- 只返回真实存在的比赛
- 比赛时间使用 UTC 格式
- 球队名称使用英文全称

【返回格式 JSON】：
{
  "matches": [
    {
      "league": "J1 League",
      "home_team": "Yokohama F. Marinos",
      "away_team": "Vissel Kobe",
      "match_time_utc": "${startDate} 10:00:00"
    }
  ]
}

请开始搜索，返回所有能找到的真实比赛！`;
}

/**
 * 检查比赛是否应该被过滤
 * @param {Object} match - 比赛对象
 * @returns {boolean} - true=跳过, false=保留
 */
function shouldFilterMatch(match) {
    const league = (match.league || '').toLowerCase();
    const homeTeam = (match.home_team || '').toLowerCase();
    const awayTeam = (match.away_team || '').toLowerCase();
    
    // 1. 检查黑名单联赛
    for (const black of BLACKLIST_LEAGUES) {
        if (league.includes(black.toLowerCase())) {
            console.log(`   ⏭️ 黑名单联赛: ${match.league}`);
            return true;
        }
    }
    
    // 2. 检查黑名单关键词
    for (const keyword of BLACKLIST_KEYWORDS) {
        if (league.includes(keyword.toLowerCase()) ||
            homeTeam.includes(keyword.toLowerCase()) ||
            awayTeam.includes(keyword.toLowerCase())) {
            console.log(`   ⏭️ 黑名单关键词: ${keyword}`);
            return true;
        }
    }
    
    // 3. 检查球队名称是否有效
    if (!homeTeam || !awayTeam || homeTeam.length < 2 || awayTeam.length < 2) {
        console.log(`   ⏭️ 无效球队名称`);
        return true;
    }
    
    // 4. 检查比赛时间是否有效
    if (!match.match_time_utc || match.match_time_utc.length < 10) {
        console.log(`   ⏭️ 无效比赛时间`);
        return true;
    }
    
    return false;
}

/**
 * 清理 Markdown 格式
 */
function cleanMarkdown(content) {
    if (!content) return '';
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return cleaned.trim();
}

/**
 * 带重试机制的 API 调用
 */
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
                        content: '你是足球数据助手。使用联网搜索获取真实比赛数据。只返回纯JSON格式，不要有额外文字。'
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
            const errText = await response.text();
            console.error(`❌ API 错误: ${response.status}`, errText.substring(0, 200));
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📡 API 响应成功，token 使用: ${data.usage?.total_tokens || '未知'}`);
        return data;
    } catch (error) {
        if (retryCount < MAX_RETRIES - 1) {
            console.warn(`DeepSeek API 调用失败，${RETRY_DELAY}ms 后重试 (${retryCount + 1}/${MAX_RETRIES}):`, error.message);
            await delay(RETRY_DELAY);
            return callWithRetry(prompt, retryCount + 1);
        }
        throw error;
    }
}

/**
 * 获取比赛数据
 * @returns {Promise<Array>}
 */
export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n🎯 ========== 获取足球比赛 ==========`);
    console.log(`📅 日期范围: ${todayStr} 至 未来 ${FUTURE_DAYS} 天`);
    console.log(`⚽ 模式: 获取所有能搜索到的真实比赛\n`);
    
    const startTime = Date.now();
    const prompt = buildPrompt(todayStr);
    
    try {
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ DeepSeek API 响应缺少 choices 字段`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        console.log(`📡 DeepSeek 返回内容长度: ${content.length}`);
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ DeepSeek API 返回内容为空`);
            return [];
        }
        
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            console.error(`❌ JSON 解析失败:`, parseError.message);
            // 尝试提取 JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error(`❌ 无法提取有效 JSON`);
                    return [];
                }
            } else {
                return [];
            }
        }
        
        if (result.matches && Array.isArray(result.matches)) {
            console.log(`\n📊 DeepSeek 返回 ${result.matches.length} 场比赛`);
            
            // 过滤比赛
            const validMatches = [];
            for (const match of result.matches) {
                if (!shouldFilterMatch(match)) {
                    validMatches.push(match);
                    console.log(`   ✅ 保留: ${match.league} - ${match.home_team} vs ${match.away_team} (${match.match_time_utc})`);
                }
            }
            
            const duration = Date.now() - startTime;
            console.log(`\n📊 最终结果: ${validMatches.length} 场有效比赛`);
            console.log(`📊 总耗时: ${duration}ms`);
            
            return validMatches;
        }
        
        return [];
        
    } catch (error) {
        console.error(`❌ 获取比赛数据失败:`, error.message);
        return [];
    }
}

/**
 * 手动获取指定日期的比赛
 */
export async function fetchMatchesForSpecificDate(date) {
    console.log(`📡 手动获取 ${date} 的比赛...`);
    const allMatches = await fetchUpcomingMatches();
    return allMatches.filter(m => {
        const matchDate = m.match_time_utc.split(' ')[0];
        return matchDate === date;
    });
}

export async function fetchMatchesFromDeepSeek(date) {
    return fetchMatchesForSpecificDate(date);
}

export async function fetchMatchScore(homeTeam, awayTeam) {
    return { success: false, error: 'NOT_IMPLEMENTED', home: 0, away: 0, status: 'unknown' };
}

export default {
    fetchMatchesFromDeepSeek,
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore,
    isWorldCupMatch: () => false,
    WORLD_CUP_KEYWORDS: []
};