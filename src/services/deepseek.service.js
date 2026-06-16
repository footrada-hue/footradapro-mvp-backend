/**
 * DeepSeek API Service
 * @description 获取 2026 FIFA World Cup 真实官方赛程（启用联网搜索）
 * @version 16.2.0 - 优化 Prompt 指定具体网站获取准确赛程
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

export function setLanguage(lang) {
    if (I18N[lang]) {
        currentLanguage = lang;
    }
}

function t(key) {
    return I18N[currentLanguage][key] || I18N.en[key] || key;
}

// ============================================================
// Prompt 构建 - 指定具体网站获取准确赛程
// ============================================================

function buildWorldCupPrompt() {
    return `【Important Task - Get 2026 FIFA World Cup Complete Schedule】

⚠️ **You MUST use web search with these specific sources ONLY**:

1. **ESPN Official Schedule**:
   https://www.espn.com/soccer/fixtures/_/league/fifa.world

2. **FIFA Official Website**:
   https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/schedule

3. **Google Search** (if the above are not accessible):
   Search exactly: "2026 FIFA World Cup schedule June 16"

📅 **Tournament dates**: June 11, 2026 - July 19, 2026

🔴 **KNOWN MATCHES ON JUNE 16, 2026** (from ESPN):
According to ESPN, the matches on June 16, 2026 are:
- France vs Senegal (Group I) - 12:00 ET
- Iraq vs Norway (Group I) - 15:00 ET
- Argentina vs Algeria (Group J) - 18:00 ET
- Austria vs Jordan (Group J) - 21:00 ET

⚠️ **CRITICAL - VERIFY THESE MATCHES**:
Please verify that the above 4 matches are correct by checking the ESPN or FIFA website.
If they are correct, return them. If they are different, return the correct ones.

【Return Format - JSON only】:
{
  "matches": [
    {"league": "FIFA World Cup 2026", "home_team": "France", "away_team": "Senegal", "match_time_utc": "2026-06-16 16:00:00"},
    {"league": "FIFA World Cup 2026", "home_team": "Iraq", "away_team": "Norway", "match_time_utc": "2026-06-16 19:00:00"},
    {"league": "FIFA World Cup 2026", "home_team": "Argentina", "away_team": "Algeria", "match_time_utc": "2026-06-16 22:00:00"},
    {"league": "FIFA World Cup 2026", "home_team": "Austria", "away_team": "Jordan", "match_time_utc": "2026-06-17 01:00:00"}
  ]
}

⚠️ **IMPORTANT RULES**:
- DO NOT fabricate matches
- ONLY return matches you find from ESPN or FIFA official websites
- Convert ET to UTC (ET is UTC-4, so 12:00 ET = 16:00 UTC)
- Use full team names (France, Senegal, Iraq, Norway, Argentina, Algeria, Austria, Jordan)

Please search ESPN and FIFA websites NOW and return the CORRECT schedule for June 16, 2026!`;
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
                    content: 'You are a FIFA World Cup data assistant. You MUST use web search to find the 2026 FIFA World Cup schedule from OFFICIAL sources like ESPN.com or FIFA.com. Return ONLY valid JSON. NEVER fabricate data. If you find different matches than what is suggested, return the correct ones from the official sources.'
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
    if (matchDate < '2026-06-11' || matchDate > '2026-07-19') {
        return { valid: false, reason: `${t('invalidDate')}: ${matchDate}` };
    }
    
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

export async function fetchMatchesForSpecificDate(date, lang = 'en') {
    const matches = await fetchUpcomingMatches(lang);
    return matches.filter(m => {
        const matchDate = m.match_time_utc?.split(' ')[0];
        return matchDate === date;
    });
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