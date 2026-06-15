/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 14.0.0 - 专注获取 2026 年 FIFA World Cup 真实赛程
 * @since 2026-06-15
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

// 世界杯关键词（精确匹配）
const WORLD_CUP_KEYWORDS = [
    'FIFA World Cup 2026',
    '2026 FIFA World Cup',
    'World Cup 2026',
    '2026 World Cup'
];

// 未来抓取天数配置（世界杯赛程覆盖到7月19日）
const FUTURE_DAYS = 45;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构建世界杯专用 Prompt - 只获取 2026 年世界杯真实赛程
 * @param {string} startDate - 起始日期 (YYYY-MM-DD)
 * @returns {string}
 */
function buildWorldCupPrompt(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + FUTURE_DAYS);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    return `【重要任务：获取 2026 FIFA World Cup 真实赛程】

⚠️ **任务说明**：
请使用联网搜索，获取 **FIFA World Cup 2026** 的【官方真实】赛程。

📅 **搜索范围**：${startDate} 至 ${endDateStr}

🏆 **必须获取的比赛**：
1. **小组赛（Group Stage）** - 48 场比赛
   - 所有 48 支球队的分组情况
   - 每组 4 支球队，循环赛

2. **淘汰赛（Knockout Stage）**
   - Round of 32（32强）
   - Round of 16（16强）
   - Quarter-finals（8强赛）
   - Semi-finals（半决赛）
   - Third-place match（季军赛）
   - Final（决赛）

⚠️ **重要限制**：
- 只返回 **FIFA 官方公布**的真实赛程
- 不要编造任何比赛对阵
- 如果赛程尚未官方公布，请明确告知
- 球队名称必须使用英文全称

📍 **已知信息**：
- 举办国：USA（美国）、Canada（加拿大）、Mexico（墨西哥）
- 比赛时间：2026年6月11日 - 7月19日
- 参赛队伍：48 支球队

✅ **正确示例**：
{"league": "FIFA World Cup 2026", "home_team": "USA", "away_team": "Mexico", "match_time_utc": "2026-06-11 20:00:00"}

❌ **错误示例**：
- 不要返回世界杯预选赛
- 不要返回其他联赛
- 不要返回编造的对阵

【返回格式 JSON】：
{
  "matches": [
    {
      "league": "FIFA World Cup 2026",
      "home_team": "Brazil",
      "away_team": "Argentina",
      "match_time_utc": "2026-06-15 20:00:00"
    }
  ]
}

请立即搜索并返回 **2026 FIFA World Cup 官方赛程**！`;
}

/**
 * 验证比赛是否为真正的世界杯比赛
 * @param {Object} match - 比赛对象
 * @returns {boolean}
 */
function isValidWorldCupMatch(match) {
    if (!match) return false;
    
    const league = (match.league || '').toLowerCase();
    const homeTeam = match.home_team || '';
    const awayTeam = match.away_team || '';
    const matchTime = match.match_time_utc || '';
    
    // 1. 检查联赛名称
    const isValidLeague = league.includes('fifa world cup') || 
                         league.includes('world cup 2026') ||
                         league === 'world cup';
    
    if (!isValidLeague) return false;
    
    // 2. 检查比赛时间在 2026 年 6-7 月
    const matchYear = matchTime.split('-')[0];
    const matchMonth = matchTime.split('-')[1];
    const isValidDate = matchYear === '2026' && (matchMonth === '06' || matchMonth === '07');
    
    if (!isValidDate) return false;
    
    // 3. 检查球队名称不为空且不包含占位符
    const hasValidTeams = homeTeam && awayTeam && 
                          homeTeam.length > 2 && awayTeam.length > 2 &&
                          !homeTeam.includes('TBD') && !awayTeam.includes('TBD') &&
                          !homeTeam.includes('?') && !awayTeam.includes('?');
    
    return hasValidTeams;
}

/**
 * 清理 Markdown 格式
 * @param {string} content - 原始内容
 * @returns {string}
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
 * @param {string} prompt - 提示词
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<object>}
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
                        content: '你是 FIFA World Cup 2026 官方数据助手。只返回 FIFA 官方公布的真实赛程。不要编造任何数据。只返回纯 JSON 格式。'
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
 * 专门获取 2026 世界杯真实赛程
 * @returns {Promise<Array>}
 */
async function fetchWorldCupMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n🏆 ========== 获取 2026 FIFA World Cup 赛程 ==========`);
    console.log(`📅 当前日期: ${todayStr}`);
    console.log(`⚽ 目标赛事: 2026 FIFA World Cup (2026年6月11日 - 7月19日)\n`);
    
    const prompt = buildWorldCupPrompt(todayStr);
    
    try {
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ DeepSeek API 响应缺少 choices 字段`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        console.log(`📡 DeepSeek 原始返回内容长度: ${content.length}`);
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ DeepSeek API 返回内容为空`);
            return [];
        }
        
        // 尝试解析 JSON
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            console.error(`❌ JSON 解析失败:`, parseError.message);
            console.log(`原始内容前500字符: ${content.substring(0, 500)}`);
            return [];
        }
        
        if (result.matches && Array.isArray(result.matches)) {
            // 验证每一场比赛
            const validMatches = result.matches.filter(match => {
                const isValid = isValidWorldCupMatch(match);
                if (!isValid) {
                    console.warn(`⚠️ 跳过无效比赛: ${JSON.stringify(match)}`);
                }
                return isValid;
            });
            
            console.log(`\n📊 获取结果:`);
            console.log(`   原始获取: ${result.matches.length} 场`);
            console.log(`   验证通过: ${validMatches.length} 场`);
            
            if (validMatches.length > 0) {
                console.log(`\n🏆 世界杯赛程列表:`);
                validMatches.forEach((match, idx) => {
                    console.log(`   ${idx + 1}. ${match.home_team} vs ${match.away_team}`);
                    console.log(`      时间: ${match.match_time_utc}`);
                    console.log(`      赛事: ${match.league}`);
                });
            } else {
                console.log(`\n⚠️ 未获取到有效世界杯赛程`);
                console.log(`💡 可能原因:`);
                console.log(`   1. 官方赛程尚未完全公布`);
                console.log(`   2. DeepSeek 联网搜索未返回数据`);
                console.log(`   3. 建议稍后重试或手动导入赛程`);
            }
            
            return validMatches;
        }
        
        console.log(`⚠️ API 返回格式异常:`, Object.keys(result));
        return [];
        
    } catch (error) {
        console.error(`❌ 获取世界杯赛程失败:`, error.message);
        return [];
    }
}

/**
 * 获取比赛数据（主入口）- 只获取世界杯
 * @returns {Promise<Array>}
 */
export async function fetchUpcomingMatches() {
    console.log(`\n🎯 模式: 仅获取 2026 FIFA World Cup 赛程`);
    const startTime = Date.now();
    
    // 只获取世界杯比赛
    const worldCupMatches = await fetchWorldCupMatches();
    
    const duration = Date.now() - startTime;
    console.log(`\n📊 总耗时: ${duration}ms`);
    console.log(`✅ 共获取 ${worldCupMatches.length} 场有效世界杯比赛`);
    
    if (worldCupMatches.length === 0) {
        console.log(`\n⚠️ 未能获取到世界杯赛程`);
        console.log(`💡 建议:`);
        console.log(`   1. 检查 DeepSeek API Key 是否有效`);
        console.log(`   2. 确认联网搜索功能已开启`);
        console.log(`   3. 等待 FIFA 官方公布完整赛程后重试`);
        console.log(`   4. 或手动导入官方赛程到数据库`);
    }
    
    return worldCupMatches;
}

/**
 * 手动指定日期获取比赛（兼容旧接口）
 * @param {string} date - 日期字符串
 * @returns {Promise<Array>}
 */
export async function fetchMatchesForSpecificDate(date) {
    console.log(`📡 手动获取 ${date} 的世界杯比赛...`);
    const allMatches = await fetchWorldCupMatches();
    return allMatches.filter(m => {
        const matchDate = m.match_time_utc.split(' ')[0];
        return matchDate === date;
    });
}

/**
 * 兼容旧版 API
 * @param {string} date - 日期字符串
 * @returns {Promise<Array>}
 */
export async function fetchMatchesFromDeepSeek(date) {
    return fetchMatchesForSpecificDate(date);
}

/**
 * 获取比赛比分（暂不实现，世界杯比赛结束后才需要）
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @returns {Promise<{success: boolean, home: number, away: number, status: string}>}
 */
export async function fetchMatchScore(homeTeam, awayTeam) {
    console.log(`⚠️ 比分获取功能暂未启用（世界杯比赛尚未开始）`);
    return { 
        success: false, 
        error: 'NOT_IMPLEMENTED', 
        home: 0, 
        away: 0, 
        status: 'unknown' 
    };
}

export default {
    fetchMatchesFromDeepSeek,
    fetchUpcomingMatches,
    fetchWorldCupMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore,
    isWorldCupMatch: (league) => WORLD_CUP_KEYWORDS.some(kw => (league || '').includes(kw)),
    WORLD_CUP_KEYWORDS
};