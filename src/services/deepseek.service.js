/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 分批获取比赛数据和队徽 URL（启用联网搜索）
 * @version 7.1.0
 * @since 2026-04-01
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildBatchPrompt(date, leagueGroup, leagues, targetCount) {
    return `【重要】请使用联网搜索功能，实时搜索 ${date} 至未来 7 天的全球足球比赛赛程，联赛类型为：${leagues}。

【核心要求】：
1. 必须使用联网搜索获取最新比赛数据
2. 只返回 JSON 格式，不要有任何 markdown 标记
3. 比赛时间使用 UTC 格式（YYYY-MM-DD HH:MM:SS）
4. 联赛名称使用英文标准名称
5. 球队名称必须使用英文

【返回格式】：
{
  "matches": [
    {
      "league": "Premier League",
      "home_team": "Manchester City",
      "away_team": "Liverpool",
      "match_time_utc": "2026-04-01 12:30:00"
    }
  ]
}

请返回 ${targetCount} 场比赛。`;
}

function cleanMarkdown(content) {
    if (!content) return '';
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return cleaned.trim();
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
                        content: '你是一个足球数据助手。请使用联网搜索功能获取最新数据。只返回纯JSON格式的数据。球队名称必须使用英文。'
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

async function fetchBatch(leagueGroup, leagues, date, targetCount) {
    const prompt = buildBatchPrompt(date, leagueGroup, leagues, targetCount);
    
    try {
        console.log(`📡 调用 DeepSeek API (联网搜索) - ${leagueGroup}，目标 ${targetCount} 场`);
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ DeepSeek API 响应缺少 choices 字段 (${leagueGroup})`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ DeepSeek API 返回内容为空 (${leagueGroup})`);
            return [];
        }
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
const validMatches = result.matches.filter(m => {
    return m.home_team && m.away_team && m.match_time_utc;
});
            
            console.log(`✅ ${leagueGroup}: 获取 ${result.matches.length} 场，有效 ${validMatches.length} 场`);
            return validMatches;
        }
        
        return [];
        
    } catch (error) {
        console.error(`❌ ${leagueGroup} 批次失败:`, error.message);
        return [];
    }
}

export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    console.log(`📡 开始联网搜索比赛数据，起始日期: ${todayStr}`);
    
    const startTime = Date.now();
    const allMatches = [];
    
    const batches = [
        {
            name: 'European Top Leagues',
            leagues: '英超 (Premier League), 西甲 (La Liga), 意甲 (Serie A), 德甲 (Bundesliga), 法甲 (Ligue 1)',
            target: 40
        },
        {
            name: 'European Cups',
            leagues: '欧冠 (Champions League), 欧联杯 (Europa League)',
            target: 20
        },
        {
            name: 'International & Others',
            leagues: '国际友谊赛 (International Friendly), 世界杯预选赛 (World Cup Qualifier), 亚洲联赛 (J1 League, K League 1, Chinese Super League), 南美联赛 (Campeonato Brasileiro Série A, Primera División Argentina)',
            target: 30
        }
    ];
    
for (const batch of batches) {
    console.log(`\n📡 正在获取: ${batch.name} (目标 ${batch.target} 场)...`);
    const matches = await fetchBatch(batch.name, batch.leagues, todayStr, batch.target);
    allMatches.push(...matches);
    console.log(`✅ ${batch.name}: 实际获取 ${matches.length} 场`);
    
    await delay(1500);
}
    
const duration = Date.now() - startTime;
console.log(`\n📊 总共获取 ${allMatches.length} 场比赛，耗时 ${duration}ms`);
    
    return allMatches;
}

export async function fetchMatchesFromDeepSeek(date) {
    return fetchBatch('Test Batch', 'Premier League', date, 20);
}

export default {
    fetchMatchesFromDeepSeek,
    fetchUpcomingMatches
};