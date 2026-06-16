/**
 * DeepSeek API Service
 * @description 获取 2026 FIFA World Cup 真实官方赛程（启用联网搜索）
 * @version 16.0.0 - 修复联网搜索参数，添加多语言支持
 * @since 2026-06-16
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_TOKENS = 8192;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// i18n 多语言配置
// ============================================================

const I18N = {
    en: {
        fetching: 'Fetching 2026 FIFA World Cup schedule...',
        noData: '2026 FIFA World Cup official schedule has not been announced yet',
        waitAnnouncement: 'Waiting for FIFA official announcement',
        invalidDate: 'Date out of range',
        apiSuccess: 'API response successful',
        apiError: 'API response invalid',
        emptyContent: 'Empty response content',
        fetchFailed: 'Failed to fetch matches',
        authFailed: 'DEEPSEEK_API_KEY not configured',
        worldCupRange: 'Match date range: 2026-06-11 to 2026-07-19'
    },
    zh: {
        fetching: '正在获取 2026 世界杯赛程...',
        noData: '2026 世界杯官方赛程尚未公布',
        waitAnnouncement: '等待 FIFA 官方公布后会自动获取',
        invalidDate: '日期超出范围',
        apiSuccess: 'API 响应成功',
        apiError: 'API 响应无效',
        emptyContent: '返回内容为空',
        fetchFailed: '获取比赛失败',
        authFailed: 'DEEPSEEK_API_KEY 未配置',
        worldCupRange: '比赛日期范围: 2026-06-11 至 2026-07-19'
    }
};

let currentLanguage = 'en';

/**
 * 设置语言
 * @param {string} lang - 'en' 或 'zh'
 */
export function setLanguage(lang) {
    if (I18N[lang]) {
        currentLanguage = lang;
    }
}

/**
 * 获取国际化文本
 * @param {string} key - 翻译键
 * @returns {string}
 */
function t(key) {
    return I18N[currentLanguage][key] || I18N.en[key] || key;
}

// ============================================================
// Prompt 构建
// ============================================================

function buildWorldCupPrompt() {
    return `【Important Task - 2026 FIFA World Cup Schedule】

⚠️ **Rules (MUST FOLLOW)**:
1. If you DON'T KNOW or CANNOT CONFIRM the real schedule of 2026 FIFA World Cup, MUST return {"matches": []}
2. ABSOLUTELY FORBIDDEN to fabricate any matches, teams, or times
3. Only return schedules OFFICIALLY ANNOUNCED by FIFA

📅 **Match date range**: 2026-06-11 to 2026-07-19

✅ **Only return when you are 100% sure**:
- Team names (e.g., Brazil, Argentina)
- Match time (must be within the range)
- Match stage (Group Stage / Knockout)

❌ **FORBIDDEN**:
- Do not return today's matches (2026-06-16 is not a World Cup match day)
- Do not fabricate matchups
- Do not use placeholders

【Return Format】:
{"matches": []}  ← Return this if not sure

OR
{"matches": [
  {"league": "FIFA World Cup 2026", "home_team": "Actual Team", "away_team": "Actual Team", "match_time_utc": "2026-06-11 20:00:00"}
]}

⚠️ **REMINDER: Return empty array if not sure, DO NOT FABRICATE!**`;
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
        console.log(`📡 ${t('fetching')}`);
        
        // ✅ 修复：正确的联网搜索参数格式
        const requestBody = {
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'system',
                    content: 'You are an official FIFA data assistant. If you don\'t know something, you MUST honestly say you don\'t know and return an empty array. NEVER fabricate any data. This is the most important rule. Use web search to find real information.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: MAX_TOKENS,
            enable_search: true  // ✅ 正确格式：直接在根级别添加
        };

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log(`📡 Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API error: ${response.status}`, errorText.substring(0, 200));
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📡 ${t('apiSuccess')}`);
        return data;
    } catch (error) {
        if (retryCount < MAX_RETRIES - 1) {
            console.warn(`Retry (${retryCount + 1}/${MAX_RETRIES}):`, error.message);
            await delay(RETRY_DELAY);
            return callWithRetry(prompt, retryCount + 1);
        }
        throw error;
    }
}

/**
 * 验证比赛是否为真实世界杯比赛
 * @param {Object} match - 比赛对象
 * @param {string} lang - 语言
 * @returns {Object} { valid, reason }
 */
function validateMatch(match, lang = 'en') {
    // 检查必要字段
    if (!match.home_team || !match.away_team || !match.match_time_utc) {
        return { valid: false, reason: 'Missing required fields' };
    }
    
    // 检查联赛名称
    const league = (match.league || '').toLowerCase();
    if (!league.includes('fifa world cup') && !league.includes('world cup 2026')) {
        return { valid: false, reason: 'Invalid league name' };
    }
    
    // 检查比赛时间是否在世界杯期间
    const matchDate = match.match_time_utc.split(' ')[0];
    if (matchDate < '2026-06-11' || matchDate > '2026-07-19') {
        return { valid: false, reason: `${t('invalidDate')}: ${matchDate}` };
    }
    
    // 拒绝占位符
    const placeholders = ['winner', 'tbd', 'to be determined', '?', '组', 'group', 'runner-up'];
    const homeLower = match.home_team.toLowerCase();
    const awayLower = match.away_team.toLowerCase();
    
    for (const ph of placeholders) {
        if (homeLower.includes(ph) || awayLower.includes(ph)) {
            return { valid: false, reason: `Placeholder detected: ${match.home_team} vs ${match.away_team}` };
        }
    }
    
    return { valid: true, reason: '' };
}

// ============================================================
// 主要导出函数
// ============================================================

/**
 * 获取即将到来的比赛（主入口）
 * @param {string} lang - 语言偏好 ('en' 或 'zh')
 * @returns {Promise<Array>}
 */
export async function fetchUpcomingMatches(lang = 'en') {
    if (lang && I18N[lang]) {
        currentLanguage = lang;
    }
    
    if (!DEEPSEEK_API_KEY) {
        console.warn(`⚠️ ${t('authFailed')}`);
        return [];
    }

    console.log(`\n🏆 ========== ${t('fetching')} ==========`);
    console.log(`📅 ${t('worldCupRange')}`);
    
    const prompt = buildWorldCupPrompt();
    
    try {
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ ${t('apiError')}`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        console.log(`📡 Raw response length: ${content.length}`);
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ ${t('emptyContent')}`);
            return [];
        }
        
        console.log(`📡 Response: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
        
        // 尝试解析 JSON
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            console.error(`❌ JSON parse failed:`, parseError.message);
            // 尝试提取 JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error(`❌ Cannot extract valid JSON`);
                    return [];
                }
            } else {
                return [];
            }
        }
        
        if (result.matches && Array.isArray(result.matches)) {
            const validMatches = [];
            const invalidMatches = [];
            
            for (const match of result.matches) {
                const validation = validateMatch(match, lang);
                if (validation.valid) {
                    validMatches.push(match);
                    console.log(`   ✅ Valid: ${match.home_team} vs ${match.away_team} (${match.match_time_utc})`);
                } else {
                    invalidMatches.push(match);
                    console.log(`   ❌ Invalid: ${validation.reason}`);
                }
            }
            
            console.log(`\n📊 Result: ${validMatches.length} valid matches, ${invalidMatches.length} invalid matches`);
            
            if (validMatches.length === 0) {
                console.log(`\n⚠️ ${t('noData')}`);
                console.log(`💡 ${t('waitAnnouncement')}`);
            }
            
            return validMatches;
        }
        
        console.log(`⚠️ Unexpected response format:`, Object.keys(result));
        return [];
        
    } catch (error) {
        console.error(`❌ ${t('fetchFailed')}:`, error.message);
        return [];
    }
}

/**
 * 手动指定日期获取比赛
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @param {string} lang - 语言偏好
 * @returns {Promise<Array>}
 */
export async function fetchMatchesForSpecificDate(date, lang = 'en') {
    const matches = await fetchUpcomingMatches(lang);
    return matches.filter(m => {
        const matchDate = m.match_time_utc?.split(' ')[0];
        return matchDate === date;
    });
}

/**
 * 获取比赛比分（世界杯比赛结束后才需要）
 * @param {string} homeTeam - 主队名称
 * @param {string} awayTeam - 客队名称
 * @returns {Promise<Object>}
 */
export async function fetchMatchScore(homeTeam, awayTeam) {
    console.log(`⚠️ Score fetch is disabled for World Cup matches`);
    return { 
        success: false, 
        error: 'SCORE_FETCH_DISABLED', 
        home: 0, 
        away: 0, 
        status: 'unknown' 
    };
}

// ============================================================
// 默认导出
// ============================================================

export default {
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore,
    setLanguage,
    t
};