/**
 * DeepSeek API Service
 * @description 获取 2026 FIFA World Cup 真实官方赛程（启用联网搜索）
 * @version 19.0.0 - 自由搜索模式：DeepSeek 可搜索任何网站获取数据
 * @since 2026-06-24
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
        noData: 'No upcoming matches found in the schedule',
        waitAnnouncement: 'No matches available for the selected date range',
        invalidDate: 'Date out of range',
        apiSuccess: 'API response successful',
        apiError: 'API response invalid',
        emptyContent: 'Empty response content',
        fetchFailed: 'Failed to fetch matches',
        authFailed: 'DEEPSEEK_API_KEY not configured',
        worldCupRange: 'Match date range: {start} to {end}'
    },
    zh: {
        fetching: '正在获取 2026 世界杯赛程...',
        noData: '未找到即将到来的比赛',
        waitAnnouncement: '所选日期范围内没有比赛',
        invalidDate: '日期超出范围',
        apiSuccess: 'API 响应成功',
        apiError: 'API 响应无效',
        emptyContent: '返回内容为空',
        fetchFailed: '获取比赛失败',
        authFailed: 'DEEPSEEK_API_KEY 未配置',
        worldCupRange: '比赛日期范围: {start} 至 {end}'
    }
};

let currentLanguage = 'en';

export function setLanguage(lang) {
    if (I18N[lang]) {
        currentLanguage = lang;
    }
}

function t(key, params = {}) {
    let text = I18N[currentLanguage][key] || I18N.en[key] || key;
    Object.keys(params).forEach(k => {
        text = text.replace(`{${k}}`, params[k]);
    });
    return text;
}

// ============================================================
// 日期工具函数
// ============================================================

function getDateRange() {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const todayStr = todayUTC.toISOString().split('T')[0];
    
    // 从明天开始搜索（今天比赛可能已结束）
    const startDate = new Date(todayUTC);
    startDate.setUTCDate(startDate.getUTCDate() + 1);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // 搜索未来 30 天
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 30);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    return { todayStr, startDateStr, endDateStr };
}

// ============================================================
// Prompt 构建 - 自由搜索模式
// ============================================================

function buildWorldCupPrompt() {
    const { todayStr, startDateStr, endDateStr } = getDateRange();
    
    return `【Important Task - Get 2026 FIFA World Cup schedule】

⚠️ **Today's date is ${todayStr}. Please search for matches from ${startDateStr} to ${endDateStr}.**

🔍 **Search Instructions**:
Use web search to find the 2026 FIFA World Cup schedule.

You can search ANY website, including but not limited to:
- ESPN
- FIFA Official
- Google Sports
- BBC Sport
- Sky Sports
- Any sports news website

Try these search queries:
"2026 FIFA World Cup schedule ${startDateStr}"
"2026 World Cup fixtures ${startDateStr}"
"2026世界杯赛程 ${startDateStr}"
"FIFA World Cup 2026 match list"

【Return Format - JSON only】:
{
  "matches": [
    {"league": "FIFA World Cup 2026", "home_team": "Team A", "away_team": "Team B", "match_time_utc": "2026-06-25 16:00:00"}
  ]
}

⚠️ **CRITICAL RULES**:
1. ONLY return matches that are on or after ${todayStr}
2. DO NOT return matches that have already happened
3. If you find matches for a date, return ALL of them
4. If a date has no matches, skip it
5. DO NOT fabricate any matches
6. Use REAL team names (e.g., "France" not "FRA")
7. Convert all times to UTC format

If you cannot find any matches, return {"matches": []}.

Please search now!`;
}

// ============================================================
// 备用 Prompt - 只搜索特定日期
// ============================================================

function buildDateSpecificPrompt(dateStr) {
    return `【Search 2026 FIFA World Cup for ${dateStr}】

Use web search to find matches for ${dateStr}.

Search ANY website:
- ESPN
- FIFA Official
- Google Sports
- BBC Sport
- Any sports news

Search queries:
"2026 FIFA World Cup ${dateStr}"
"2026 World Cup ${dateStr} schedule"
"2026世界杯 ${dateStr} 赛程"

Return ALL matches for ${dateStr} in JSON format:
{
  "matches": [
    {"league": "FIFA World Cup 2026", "home_team": "Team A", "away_team": "Team B", "match_time_utc": "${dateStr} 16:00:00"}
  ]
}

If no matches found, return {"matches": []}.`;
}

// ============================================================
// 辅助函数
// ============================================================

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
        console.log(`📡 ${t('fetching')}`);
        
        const requestBody = {
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'system',
                    content: 'You are a FIFA World Cup data assistant. Use web search to find REAL 2026 FIFA World Cup matches. Search ANY website to find the data. Only return matches that are actually scheduled. NEVER fabricate data. Return only valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: MAX_TOKENS,
            enable_search: true
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

function validateMatch(match, lang = 'en') {
    if (!match.home_team || !match.away_team || !match.match_time_utc) {
        return { valid: false, reason: 'Missing required fields' };
    }
    
    const league = (match.league || '').toLowerCase();
    if (!league.includes('fifa world cup') && !league.includes('world cup 2026')) {
        return { valid: false, reason: 'Invalid league name' };
    }
    
    const matchDate = match.match_time_utc.split(' ')[0];
    const { todayStr } = getDateRange();
    
    // 只返回今天及未来的比赛
    if (matchDate < todayStr) {
        return { valid: false, reason: `Match already passed: ${matchDate}` };
    }
    
    if (matchDate < '2026-06-11' || matchDate > '2026-07-19') {
        return { valid: false, reason: `${t('invalidDate')}: ${matchDate}` };
    }
    
    // 拒绝占位符
    const placeholders = ['winner', 'tbd', 'to be determined', '?', '组', 'group', 'runner-up', 'qualifier', 'playoff'];
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

export async function fetchUpcomingMatches(lang = 'en') {
    if (lang && I18N[lang]) {
        currentLanguage = lang;
    }
    
    if (!DEEPSEEK_API_KEY) {
        console.warn(`⚠️ ${t('authFailed')}`);
        return [];
    }

    const { todayStr, startDateStr, endDateStr } = getDateRange();

    console.log(`\n🏆 ========== ${t('fetching')} ==========`);
    console.log(`📅 ${t('worldCupRange', { start: startDateStr, end: endDateStr })}`);
    console.log(`📌 策略: 自由搜索（任何网站）`);
    
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
        
        console.log(`📡 Response preview: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
        
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            console.error(`❌ JSON parse failed:`, parseError.message);
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
        
        return [];
        
    } catch (error) {
        console.error(`❌ ${t('fetchFailed')}:`, error.message);
        return [];
    }
}

/**
 * 获取特定日期的比赛
 * @param {string} date - YYYY-MM-DD 格式
 * @param {string} lang - 语言
 * @returns {Promise<Array>}
 */
export async function fetchMatchesForSpecificDate(date, lang = 'en') {
    if (lang && I18N[lang]) {
        currentLanguage = lang;
    }
    
    if (!DEEPSEEK_API_KEY) {
        console.warn(`⚠️ ${t('authFailed')}`);
        return [];
    }
    
    console.log(`\n📅 获取 ${date} 的比赛...`);
    
    const prompt = buildDateSpecificPrompt(date);
    
    try {
        const data = await callWithRetry(prompt);
        
        if (!data.choices || !data.choices[0]) {
            console.error(`❌ ${t('apiError')}`);
            return [];
        }
        
        let content = data.choices[0].message.content;
        content = cleanMarkdown(content);
        
        if (!content) {
            console.error(`❌ ${t('emptyContent')}`);
            return [];
        }
        
        const result = JSON.parse(content);
        
        if (result.matches && Array.isArray(result.matches)) {
            const validMatches = [];
            for (const match of result.matches) {
                const validation = validateMatch(match, lang);
                if (validation.valid) {
                    validMatches.push(match);
                }
            }
            console.log(`📊 获取到 ${validMatches.length} 场有效比赛`);
            return validMatches;
        }
        
        return [];
    } catch (error) {
        console.error(`❌ 获取 ${date} 比赛失败:`, error.message);
        return [];
    }
}

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

export default {
    fetchUpcomingMatches,
    fetchMatchesForSpecificDate,
    fetchMatchScore,
    setLanguage,
    t
};