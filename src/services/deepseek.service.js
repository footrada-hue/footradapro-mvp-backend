/**
 * DeepSeek API Service
 * @description 获取 2026 FIFA World Cup 真实官方赛程
 * @version 15.0.0 - 如果赛程未公布则返回空数组
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildWorldCupPrompt() {
    return `【重要任务】

⚠️ **核心规则（必须遵守）**：
1. 如果你【不知道】或【无法确认】2026 FIFA World Cup 的真实赛程，必须返回 {"matches": []}
2. 【绝对禁止】编造任何比赛、球队、时间
3. 只返回 FIFA 官方已经【正式公布】的赛程

📅 **比赛时间范围**：2026-06-11 至 2026-07-19

✅ **只有在你【100%确定】以下信息时才能返回**：
- 球队名称（如 Brazil, Argentina）
- 比赛时间（必须在该范围内）
- 比赛阶段（小组赛/淘汰赛）

❌ **禁止返回的内容**：
- 不要返回今天的比赛（2026-06-15 不是世界杯日期）
- 不要编造对阵
- 不要使用占位符

【返回格式】：
{"matches": []}  ← 如果不确定，就返回这个

或者
{"matches": [
  {"league": "FIFA World Cup 2026", "home_team": "实际球队", "away_team": "实际球队", "match_time_utc": "2026-06-11 20:00:00"}
]}

⚠️ **再次强调：不确定就返回空数组，不要编造！**`;
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
                        content: '你是 FIFA 官方数据助手。如果你不知道某个信息，必须诚实地说不知道，返回空数组。绝对不要编造任何数据。这是最重要的规则。'
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

    console.log(`\n🏆 ========== 获取 2026 FIFA World Cup 真实赛程 ==========`);
    
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
        
        console.log(`📡 返回内容: ${content}`);
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            // 验证比赛时间是否在真实范围内
            const validMatches = result.matches.filter(m => {
                const date = m.match_time_utc?.split(' ')[0];
                if (date && (date < '2026-06-11' || date > '2026-07-19')) {
                    console.log(`   ❌ 拒绝: 日期超出范围 (${date}) - ${m.home_team} vs ${m.away_team}`);
                    return false;
                }
                return true;
            });
            
            console.log(`\n📊 结果: ${validMatches.length} 场有效比赛`);
            
            if (validMatches.length === 0) {
                console.log(`\n⚠️ 2026 FIFA World Cup 官方赛程尚未公布`);
                console.log(`💡 等待 FIFA 官方公布后会自动获取`);
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
    return matches.filter(m => m.match_time_utc?.split(' ')[0] === date);
}

export async function fetchMatchScore(homeTeam, awayTeam) {
    return { success: false, error: 'SCORE_FETCH_DISABLED', home: 0, away: 0, status: 'unknown' };
}

export default {
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore
};