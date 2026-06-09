/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 11.0.0 - 优化 Prompt，优先抓取世界杯比赛
 * @since 2026-04-12
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

// 优先抓取的赛事（权重从高到低）
const PRIORITY_COMPETITIONS = [
    'World Cup',           // 世界杯 - 最高优先级
    'FIFA World Cup',      // 国际足联世界杯
    'World Cup Qualifiers' // 世界杯预选赛
];

// 在役联赛白名单（6月份有比赛的联赛）
const ACTIVE_LEAGUES = [
    // 世界杯相关赛事（优先）
    'World Cup', 'FIFA World Cup', 'World Cup Qualifiers',
    // 国家队赛事
    'UEFA Nations League', 'UEFA Euro Qualifiers', 'CONMEBOL Qualifiers',
    'AFC Asian Cup Qualifiers', 'CAF Africa Cup of Nations Qualifiers',
    'CONCACAF Nations League',
    // 各大洲俱乐部赛事
    'UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League',
    'AFC Champions League', 'CAF Champions League', 'CONCACAF Champions League',
    'Copa Libertadores', 'Copa Sudamericana',
    // 主流联赛（休赛期可能没有，但保留）
    'J1 League', 'J2 League',
    'K League 1', 'K League 2',
    'Chinese Super League', 'China League One',
    'Major League Soccer',
    'Swedish Allsvenskan',
    'Norwegian Eliteserien',
    'Brazilian Serie A', 'Brazilian Serie B',
    'Argentine Primera División',
    'A-League',
    'Russian Premier League',
    'Turkish Super Lig',
    'Czech First League',
    'Polish Ekstraklasa',
    'Ukrainian Premier League',
    'Danish Superliga',
    'Austrian Bundesliga',
    'Swiss Super League',
    'Croatian First League',
    'Greek Super League',
    'Hungarian NB I',
    'Romanian Liga I',
    'Bulgarian First League',
    'Serbian SuperLiga',
    'Israeli Premier League',
    'Qatar Stars League',
    'UAE Pro League',
    'Saudi Pro League'
];

// 已结束赛季的联赛黑名单（欧洲五大联赛等，5月底已结束）
const ENDED_LEAGUES = [
    'Premier League', 'EFL Championship',
    'La Liga', 'La Liga 2',
    'Serie A', 'Serie B',
    'Bundesliga', '2. Bundesliga',
    'Ligue 1', 'Ligue 2',
    'Eredivisie',
    'Primeira Liga',
    'Belgian Pro League',
    'Scottish Premiership',
    'English League One', 'English League Two'
];

// 未来抓取天数配置
const FUTURE_DAYS = 7;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构建提示词 - 优先抓取世界杯比赛
 * @param {string} startDate - 起始日期 (YYYY-MM-DD)
 * @param {number} targetCount - 目标获取数量
 * @returns {string}
 */
function buildPrompt(startDate, targetCount) {
    return `请使用联网搜索功能，搜索 ${startDate} 至未来 ${FUTURE_DAYS} 天的足球比赛赛程。

【核心要求 - 按优先级排序】：
1. ⭐⭐⭐ 最高优先级：请优先搜索并返回 **世界杯 (World Cup)** 相关的比赛
   - 包括：FIFA World Cup、World Cup 2026、世界杯正赛
   - 如果未来 ${FUTURE_DAYS} 天内有世界杯比赛，请全部返回

2. ⭐⭐ 第二优先级：国际A级赛事
   - 世界杯预选赛 (World Cup Qualifiers)
   - 欧洲国家联赛 (UEFA Nations League)
   - 欧洲杯预选赛 (UEFA Euro Qualifiers)
   - 美洲杯 (Copa América)
   - 亚洲杯 (AFC Asian Cup)
   - 非洲杯 (Africa Cup of Nations)

3. ⭐ 第三优先级：各大洲俱乐部顶级赛事
   - 欧冠 (UEFA Champions League)
   - 欧联杯 (UEFA Europa League)
   - 亚冠 (AFC Champions League)
   - 解放者杯 (Copa Libertadores)

4. 第四优先级：在役联赛（6月份仍在进行的联赛）
   - J1 League, J2 League (日本)
   - K League 1, K League 2 (韩国)
   - Chinese Super League (中国)
   - Major League Soccer (美国)
   - Swedish Allsvenskan, Norwegian Eliteserien
   - Brazilian Serie A, Argentine Primera División
   - Russian Premier League, Turkish Super Lig
   - 以及其他仍在进行中的联赛

【禁止返回】：
- 绝对不要返回以下已结束赛季的联赛：
  Premier League, La Liga, Serie A, Bundesliga, Ligue 1
  Eredivisie, Primeira Liga, Belgian Pro League, Scottish Premiership

【其他要求】：
- 只返回真实存在的官方比赛，不要编造
- 比赛时间使用 UTC 格式（YYYY-MM-DD HH:MM:SS）
- 联赛名称使用英文标准名称
- 球队名称必须使用英文全称
- 只返回 JSON 格式，不要有任何 markdown 标记

【返回格式】：
{
  "matches": [
    {
      "league": "World Cup",
      "home_team": "Brazil",
      "away_team": "Argentina",
      "match_time_utc": "${startDate} 14:00:00"
    },
    {
      "league": "UEFA Champions League",
      "home_team": "Real Madrid",
      "away_team": "Bayern Munich",
      "match_time_utc": "${startDate} 20:00:00"
    }
  ]
}

请开始搜索，优先返回世界杯比赛。`;
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
                        content: '你是一个专业的足球数据助手，优先关注世界杯比赛。请使用联网搜索功能获取最新、真实的足球比赛数据。世界杯比赛必须优先返回。只返回纯JSON格式的数据，不要有任何额外文字。'
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
 * 过滤比赛 - 优先保留世界杯比赛
 * @param {Array} matches - 比赛数组
 * @returns {Array}
 */
function filterAndPrioritizeMatches(matches) {
    if (!matches || !Array.isArray(matches)) return [];
    
    // 分离世界杯比赛和其他比赛
    const worldCupMatches = [];
    const otherMatches = [];
    
    for (const match of matches) {
        const league = match.league || '';
        const isWorldCup = PRIORITY_COMPETITIONS.some(wc => league.includes(wc));
        
        // 检查是否在黑名单中（已结束的欧洲五大联赛）
        if (ENDED_LEAGUES.includes(league)) {
            console.log(`⏭️ 过滤掉已结束联赛: ${league} - ${match.home_team} vs ${match.away_team}`);
            continue;
        }
        
        if (isWorldCup) {
            worldCupMatches.push(match);
            console.log(`⭐ 优先保留世界杯比赛: ${league} - ${match.home_team} vs ${match.away_team}`);
        } else {
            otherMatches.push(match);
        }
    }
    
    // 世界杯比赛排在前面
    const result = [...worldCupMatches, ...otherMatches];
    console.log(`📊 过滤结果: 世界杯 ${worldCupMatches.length} 场, 其他 ${otherMatches.length} 场`);
    
    return result;
}

/**
 * 获取未来多天的比赛数据
 * @param {string} startDate - 起始日期 (YYYY-MM-DD)
 * @param {number} targetCount - 目标获取数量
 * @returns {Promise<Array>}
 */
async function fetchUpcomingMatchesData(startDate, targetCount = 80) {
    const prompt = buildPrompt(startDate, targetCount);
    
    try {
        console.log(`📡 调用 DeepSeek API 获取未来 ${FUTURE_DAYS} 天的比赛数据，目标 ${targetCount} 场`);
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
            // 验证比赛时间
            const validMatches = result.matches.filter(m => {
                if (!m.home_team || !m.away_team || !m.match_time_utc) {
                    return false;
                }
                // 检查比赛日期是否在范围内
                const matchDate = m.match_time_utc.split(' ')[0];
                if (matchDate < startDate) {
                    console.warn(`⚠️ 跳过过期比赛: ${m.home_team} vs ${m.away_team}, 日期: ${matchDate}`);
                    return false;
                }
                return true;
            });
            
            console.log(`✅ 获取 ${result.matches.length} 场，有效 ${validMatches.length} 场`);
            
            // 过滤和优先级排序
            const prioritizedMatches = filterAndPrioritizeMatches(validMatches);
            
            return prioritizedMatches;
        }
        
        return [];
        
    } catch (error) {
        console.error(`❌ 获取比赛数据失败:`, error.message);
        return [];
    }
}

/**
 * 获取比赛数据（主入口）- 获取未来7天比赛
 * @returns {Promise<Array>}
 */
export async function fetchUpcomingMatches() {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    console.log(`📡 开始搜索未来 ${FUTURE_DAYS} 天的比赛数据...`);
    console.log(`📌 优先抓取: 世界杯 > 国际赛事 > 俱乐部赛事`);
    console.log(`📌 已过滤联赛: ${ENDED_LEAGUES.join(', ')}`);
    
    const startTime = Date.now();
    
    // 直接获取未来 FUTURE_DAYS 天的比赛
    const matches = await fetchUpcomingMatchesData(todayStr, 80);
    
    const duration = Date.now() - startTime;
    console.log(`\n📊 总共获取 ${matches.length} 场比赛，耗时 ${duration}ms`);
    
    if (matches.length === 0) {
        console.log(`⚠️ 未来 ${FUTURE_DAYS} 天内没有符合条件的比赛`);
    } else {
        // 统计世界杯比赛数量
        const worldCupCount = matches.filter(m => 
            PRIORITY_COMPETITIONS.some(wc => (m.league || '').includes(wc))
        ).length;
        console.log(`📊 比赛统计: 世界杯 ${worldCupCount} 场, 其他 ${matches.length - worldCupCount} 场`);
    }
    
    return matches;
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
    // 从指定日期开始获取未来 FUTURE_DAYS 天的比赛
    const matches = await fetchUpcomingMatchesData(date, 80);
    // 只返回指定日期的比赛
    return matches.filter(m => m.match_time_utc.split(' ')[0] === date);
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
 * 获取比赛比分（带联网搜索）- 优化版，大幅减少 token 消耗
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} matchDate - 比赛日期（可选，YYYY-MM-DD）
 * @returns {Promise<{success: boolean, home: number, away: number, status: string, source: string, error?: string}>}
 */
export async function fetchMatchScore(homeTeam, awayTeam, matchDate = null) {
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return { success: false, error: 'API_KEY_NOT_CONFIGURED', home: 0, away: 0, status: 'unknown' };
    }

    // 优化后的精简 prompt（减少 90% token 消耗）
    const prompt = `${homeTeam} vs ${awayTeam} 最终比分，只返回 JSON：{"home":0,"away":0}`;

    try {
        console.log(`📡 获取比分: ${homeTeam} vs ${awayTeam}`);
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ DeepSeek API 响应缺少 choices 字段`);
            return { success: false, error: 'API_RESPONSE_ERROR', home: 0, away: 0, status: 'unknown' };
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            return { success: false, error: 'EMPTY_RESPONSE', home: 0, away: 0, status: 'unknown' };
        }
        
        const result = JSON.parse(content);
        
        if (result.home !== undefined && result.away !== undefined) {
            console.log(`✅ 比分获取成功: ${homeTeam} ${result.home}:${result.away} ${awayTeam}`);
            return {
                success: true,
                home: result.home,
                away: result.away,
                status: 'finished',
                source: 'deepseek'
            };
        }
        
        return { success: false, error: '无法解析比分', home: 0, away: 0, status: 'unknown' };
        
    } catch (error) {
        console.error(`❌ 获取比分失败:`, error.message);
        return { success: false, error: error.message, home: 0, away: 0, status: 'unknown' };
    }
}

/**
 * 获取比赛比分（带二次确认）
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @param {string} matchDate - 比赛日期
 * @returns {Promise<{success: boolean, home: number, away: number, confirmed: boolean, needManualCheck: boolean, message?: string}>}
 */
export async function fetchAndConfirmMatchScore(homeTeam, awayTeam, matchDate = null) {
    console.log(`📊 开始获取并确认比分: ${homeTeam} vs ${awayTeam}`);
    
    // 第一次获取
    const firstResult = await fetchMatchScore(homeTeam, awayTeam, matchDate);
    console.log(`第一次获取结果: ${firstResult.success ? `${firstResult.home}:${firstResult.away}` : firstResult.error}`);
    
    if (!firstResult.success) {
        return {
            success: false,
            home: 0,
            away: 0,
            confirmed: false,
            needManualCheck: true,
            message: firstResult.error
        };
    }
    
    // 如果比赛不是 finished 状态，直接返回
    if (firstResult.status !== 'finished') {
        return {
            success: false,
            home: 0,
            away: 0,
            confirmed: false,
            needManualCheck: false,
            message: `比赛状态: ${firstResult.status}`
        };
    }
    
    // 等待 60 秒后第二次确认
    console.log('⏳ 等待 60 秒进行第二次确认...');
    await delay(60000);
    
    // 第二次获取
    const secondResult = await fetchMatchScore(homeTeam, awayTeam, matchDate);
    console.log(`第二次获取结果: ${secondResult.success ? `${secondResult.home}:${secondResult.away}` : secondResult.error}`);
    
    if (!secondResult.success || secondResult.status !== 'finished') {
        return {
            success: true,
            home: firstResult.home,
            away: firstResult.away,
            confirmed: false,
            needManualCheck: true,
            message: '第二次获取失败或比赛未结束，请人工确认'
        };
    }
    
    // 对比两次结果
    if (firstResult.home === secondResult.home && firstResult.away === secondResult.away) {
        console.log(`✅ 两次比分一致，确认: ${firstResult.home}:${firstResult.away}`);
        return {
            success: true,
            home: firstResult.home,
            away: firstResult.away,
            confirmed: true,
            needManualCheck: false
        };
    }
    
    // 两次不一致，进行第三次确认
    console.log('⚠️ 两次比分不一致，进行第三次确认...');
    await delay(30000);
    
    const thirdResult = await fetchMatchScore(homeTeam, awayTeam, matchDate);
    console.log(`第三次获取结果: ${thirdResult.success ? `${thirdResult.home}:${thirdResult.away}` : thirdResult.error}`);
    
    if (thirdResult.success && thirdResult.status === 'finished' &&
        thirdResult.home === secondResult.home && thirdResult.away === secondResult.away) {
        // 第二、三次一致
        return {
            success: true,
            home: thirdResult.home,
            away: thirdResult.away,
            confirmed: true,
            needManualCheck: false
        };
    }
    
    // 仍然不一致，需要人工确认
    return {
        success: true,
        home: secondResult.home,
        away: secondResult.away,
        confirmed: false,
        needManualCheck: true,
        message: `比分不一致，请人工确认。第一次: ${firstResult.home}:${firstResult.away}, 第二次: ${secondResult.home}:${secondResult.away}`
    };
}

export default {
    fetchMatchesFromDeepSeek,
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore,
    fetchAndConfirmMatchScore
};