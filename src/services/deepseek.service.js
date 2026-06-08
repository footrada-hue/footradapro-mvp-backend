/**
 * DeepSeek API Service
 * @description 调用 DeepSeek API 获取比赛数据（启用联网搜索）
 * @version 10.0.0 - 优化 Prompt，过滤休赛期虚假比赛
 * @since 2026-04-12
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

// 在役联赛白名单（6月份有比赛的联赛）
const ACTIVE_LEAGUES = [
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构建提示词 - 只获取在役联赛的真实比赛
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @param {number} targetCount - 目标获取数量
 * @returns {string}
 */
function buildPrompt(date, targetCount) {
    return `请使用联网搜索功能，搜索 ${date} 当天正在进行的真实足球比赛赛程。

【核心要求】：
1. ⭐ 只返回 ${date} 当天**真实存在**的官方比赛，不要返回友谊赛、表演赛、慈善赛、预测性赛程
2. ⭐ 只返回以下在役联赛的比赛（这些联赛在6月份有比赛）：
   - J1 League, J2 League (日本)
   - K League 1, K League 2 (韩国)
   - Chinese Super League, China League One (中国)
   - Major League Soccer (美国/加拿大)
   - Swedish Allsvenskan (瑞典)
   - Norwegian Eliteserien (挪威)
   - Brazilian Serie A, Serie B (巴西)
   - Argentine Primera División (阿根廷)
   - A-League (澳大利亚)
   - Russian Premier League (俄罗斯)
   - Turkish Super Lig (土耳其)
   - Czech First League, Polish Ekstraklasa, Ukrainian Premier League
   - Danish Superliga, Austrian Bundesliga, Swiss Super League
   - Croatian First League, Greek Super League, Hungarian NB I
   - Romanian Liga I, Bulgarian First League, Serbian SuperLiga
   - Israeli Premier League, Qatar Stars League, UAE Pro League, Saudi Pro League

3. ⭐ 绝对不要返回以下已结束赛季的联赛：
   - Premier League, EFL Championship (英超及英冠)
   - La Liga, La Liga 2 (西甲及西乙)
   - Serie A, Serie B (意甲及意乙)
   - Bundesliga, 2. Bundesliga (德甲及德乙)
   - Ligue 1, Ligue 2 (法甲及法乙)
   - Eredivisie (荷甲)
   - Primeira Liga (葡超)
   - Belgian Pro League (比甲)
   - Scottish Premiership (苏超)

4. 如果当天上述在役联赛没有比赛，返回空数组 {"matches": []}，绝对不要编造比赛
5. 比赛时间使用 UTC 格式（YYYY-MM-DD HH:MM:SS）
6. 联赛名称使用英文标准名称
7. 球队名称必须使用英文全称
8. 只返回 JSON 格式，不要有任何 markdown 标记或其他文字

【返回格式】：
{
  "matches": [
    {
      "league": "J1 League",
      "home_team": "Kawasaki Frontale",
      "away_team": "Yokohama F Marinos",
      "match_time_utc": "${date} 10:00:00"
    }
  ]
}

如果当天没有符合条件的比赛，返回 {"matches": []}

请开始搜索 ${date} 当天的比赛。`;
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
                        content: '你是一个专业的足球数据助手。请使用联网搜索功能获取最新、真实的足球比赛数据。只返回纯JSON格式的数据，不要有任何额外文字。球队名称必须使用英文全称。只返回在役联赛的真实比赛，绝对不要编造或返回已结束赛季的比赛。'
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
 * 过滤比赛 - 只保留在役联赛，排除已结束联赛
 * @param {Array} matches - 比赛数组
 * @returns {Array}
 */
function filterActiveLeaguesOnly(matches) {
    if (!matches || !Array.isArray(matches)) return [];
    
    return matches.filter(match => {
        const league = match.league || '';
        
        // 检查是否在黑名单中（已结束的欧洲五大联赛）
        if (ENDED_LEAGUES.includes(league)) {
            console.log(`⏭️ 过滤掉已结束联赛: ${league} - ${match.home_team} vs ${match.away_team}`);
            return false;
        }
        
        // 可选：检查是否在白名单中（注释掉，保留所有非黑名单的联赛）
        // if (!ACTIVE_LEAGUES.includes(league) && !ACTIVE_LEAGUES.some(l => league.includes(l))) {
        //     console.log(`⚠️ 未知联赛: ${league} - ${match.home_team} vs ${match.away_team}，保留但请留意`);
        // }
        
        return true;
    });
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
            
            // 过滤掉已结束联赛的比赛
            const filteredMatches = filterActiveLeaguesOnly(validMatches);
            
            const filteredCount = validMatches.length - filteredMatches.length;
            if (filteredCount > 0) {
                console.log(`📌 过滤掉 ${filteredCount} 场已结束联赛的比赛`);
            }
            
            console.log(`✅ 获取 ${result.matches.length} 场，有效 ${validMatches.length} 场（当天），通过联赛过滤 ${filteredMatches.length} 场`);
            return filteredMatches;
        }
        
        return [];
        
    } catch (error) {
        console.error(`❌ 获取比赛数据失败:`, error.message);
        return [];
    }
}

/**
 * 获取未来7天的比赛（备用方案）- 只抓取在役联赛
 * @param {string} startDate - 起始日期
 * @param {number} targetCount - 目标获取数量
 * @returns {Promise<Array>}
 */
async function fetchUpcomingMatchesBackup(startDate, targetCount = 30) {
    const prompt = `请使用联网搜索功能，搜索 ${startDate} 至未来 7 天的足球比赛赛程。

【核心要求】：
1. 只返回**真实存在**的官方比赛
2. 只返回以下在役联赛：
   - J1 League, J2 League (日本)
   - K League 1, K League 2 (韩国)
   - Chinese Super League, China League One (中国)
   - Major League Soccer (美国/加拿大)
   - Swedish Allsvenskan, Norwegian Eliteserien
   - Brazilian Serie A, Serie B
   - Argentine Primera División
   - A-League
   - Russian Premier League, Turkish Super Lig
   - Czech First League, Polish Ekstraklasa, Ukrainian Premier League
   - Danish Superliga, Austrian Bundesliga, Swiss Super League

3. 绝对不要返回欧洲五大联赛（英超、西甲、意甲、德甲、法甲）及荷甲、葡超、比甲、苏超
4. 如果当天没有比赛，返回空数组

【返回格式】：
{
  "matches": [
    {
      "league": "J1 League",
      "home_team": "Kawasaki Frontale",
      "away_team": "Yokohama F Marinos",
      "match_time_utc": "${startDate} 10:00:00"
    }
  ]
}

请返回符合条件的所有比赛。`;
    
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
            const filteredMatches = filterActiveLeaguesOnly(validMatches);
            console.log(`✅ 备用方案获取 ${validMatches.length} 场，过滤后 ${filteredMatches.length} 场`);
            return filteredMatches;
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
    console.log(`📌 已过滤联赛: ${ENDED_LEAGUES.join(', ')}`);
    
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
        console.log(`⚠️ 今天（${todayStr}）没有符合条件的在役联赛比赛（休赛期）`);
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