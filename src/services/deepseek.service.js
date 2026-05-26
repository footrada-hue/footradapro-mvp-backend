/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 9.0.0
 * @since 2026-04-12
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构建提示词 - 只获取当天的比赛
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @param {number} targetCount - 目标获取数量
 * @returns {string}
 */
function buildPrompt(date, targetCount) {
    return `请使用联网搜索功能，搜索 ${date} 当天的全球足球比赛赛程。

【核心要求】：
1. ⭐ 只返回 ${date} 当天的比赛，绝对不要返回其他日期的比赛
2. 必须使用联网搜索获取最新、真实的比赛数据
3. 只返回 JSON 格式，不要有任何 markdown 标记或其他文字
4. 比赛时间使用 UTC 格式（YYYY-MM-DD HH:MM:SS）
5. 联赛名称使用英文标准名称
6. 球队名称必须使用英文全称
7. 不要限制联赛级别，包括：顶级联赛、次级联赛、杯赛、友谊赛、青年队比赛等所有足球比赛
8. 如果当天比赛不足 ${targetCount} 场，则返回实际数量

【返回格式】：
{
  "matches": [
    {
      "league": "Premier League",
      "home_team": "Manchester City",
      "away_team": "Liverpool",
      "match_time_utc": "${date} 12:30:00"
    }
  ]
}

请返回 ${targetCount} 场 ${date} 当天的比赛。`;
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
                        content: '你是一个专业的足球数据助手。请使用联网搜索功能获取最新、真实的足球比赛数据。只返回纯JSON格式的数据，不要有任何额外文字。球队名称必须使用英文全称。'
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
 * 获取当天的比赛数据
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @param {number} targetCount - 目标获取数量
 * @returns {Promise<Array>}
 */
async function fetchMatchesForDate(date, targetCount = 50) {
    const prompt = buildPrompt(date, targetCount);
    
    try {
        console.log(`📡 调用 DeepSeek API 获取 ${date} 的比赛数据，目标 ${targetCount} 场`);
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ DeepSeek API 响应缺少 choices 字段`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ DeepSeek API 返回内容为空`);
            return [];
        }
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            // 验证比赛时间是否为当天
            const validMatches = result.matches.filter(m => {
                if (!m.home_team || !m.away_team || !m.match_time_utc) {
                    return false;
                }
                // 检查比赛日期是否为当天
                const matchDate = m.match_time_utc.split(' ')[0];
                if (matchDate !== date) {
                    console.warn(`⚠️ 跳过非当天比赛: ${m.home_team} vs ${m.away_team}, 日期: ${matchDate}`);
                    return false;
                }
                return true;
            });
            
            console.log(`✅ 获取 ${result.matches.length} 场，有效 ${validMatches.length} 场（当天）`);
            return validMatches;
        }
        
        return [];
        
    } catch (error) {
        console.error(`❌ 获取比赛数据失败:`, error.message);
        return [];
    }
}

/**
 * 获取未来7天的比赛（备用方案）
 * @param {string} startDate - 起始日期
 * @param {number} targetCount - 目标获取数量
 * @returns {Promise<Array>}
 */
async function fetchUpcomingMatchesBackup(startDate, targetCount = 30) {
    const prompt = `请使用联网搜索功能，搜索 ${startDate} 至未来 7 天的全球足球比赛赛程。

【核心要求】：
1. 必须使用联网搜索获取最新、真实的比赛数据
2. 只返回 JSON 格式，不要有任何 markdown 标记
3. 比赛时间使用 UTC 格式（YYYY-MM-DD HH:MM:SS）
4. 联赛名称和球队名称使用英文
5. 优先返回最近2天的比赛

【返回格式】：
{
  "matches": [
    {
      "league": "Premier League",
      "home_team": "Manchester City",
      "away_team": "Liverpool",
      "match_time_utc": "${startDate} 12:30:00"
    }
  ]
}

请返回 ${targetCount} 场比赛。`;
    
    try {
        console.log(`📡 使用备用方案获取未来7天比赛...`);
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            return [];
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            return [];
        }
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            const validMatches = result.matches.filter(m => m.home_team && m.away_team && m.match_time_utc);
            console.log(`✅ 备用方案获取 ${validMatches.length} 场比赛`);
            return validMatches;
        }
        
        return [];
    } catch (error) {
        console.error(`❌ 备用方案失败:`, error.message);
        return [];
    }
}

/**
 * 获取比赛数据（主入口）
 * @returns {Promise<Array>}
 */
export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    console.log(`📡 开始搜索 ${todayStr} 当天的比赛数据...`);
    
    const startTime = Date.now();
    let allMatches = [];
    
    // 方案一：获取今天的比赛
    console.log(`\n📡 方案一：获取 ${todayStr} 当天的比赛...`);
    const todayMatches = await fetchMatchesForDate(todayStr, 60);
    allMatches.push(...todayMatches);
    console.log(`✅ 当天实际获取 ${todayMatches.length} 场比赛`);
    
    // 如果今天没有比赛，使用备用方案获取未来几天的比赛
    if (todayMatches.length === 0) {
        console.log(`\n⚠️ 当天没有比赛数据，使用备用方案获取未来7天比赛...`);
        const backupMatches = await fetchUpcomingMatchesBackup(todayStr, 50);
        
        // 过滤出未来3天内的比赛
        const threeDaysLater = new Date(today);
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];
        
        const recentMatches = backupMatches.filter(m => {
            const matchDate = m.match_time_utc.split(' ')[0];
            return matchDate <= threeDaysLaterStr;
        });
        
        allMatches.push(...recentMatches);
        console.log(`✅ 备用方案获取未来3天内比赛 ${recentMatches.length} 场`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`\n📊 总共获取 ${allMatches.length} 场比赛，耗时 ${duration}ms`);
    
    if (allMatches.length === 0) {
        console.warn(`⚠️ 未获取到任何比赛数据，请检查 DeepSeek API 配置或网络`);
    }
    
    return allMatches;
}

/**
 * 手动指定日期获取比赛
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function fetchMatchesForSpecificDate(date) {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }
    
    console.log(`📡 手动获取 ${date} 的比赛数据...`);
    return fetchMatchesForDate(date, 50);
}

/**
 * 兼容旧版 API
 * @param {string} date - 日期字符串
 * @returns {Promise<Array>}
 */
export async function fetchMatchesFromDeepSeek(date) {
    return fetchMatchesForDate(date, 20);
}

export default {
    fetchMatchesFromDeepSeek,
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate
};