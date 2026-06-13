/**
 * Match Data Service - 使用 DeepSeek API 获取比赛详细数据并生成深度报告
 * @version 2.1.0 - 添加禁用开关和速率限制，防止 API 过度调用
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// ✅ 添加禁用开关
const DISABLE_DEEPSEEK_REPORTS = process.env.DISABLE_DEEPSEEK_REPORTS === 'true';

// ✅ 添加速率限制（每分钟最多 2 次调用）
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 30000;
let callCount = 0;
const MAX_CALLS_PER_HOUR = 10;
let hourResetTime = Date.now();

function checkRateLimit() {
    const now = Date.now();
    
    if (now - lastCallTime < MIN_CALL_INTERVAL) {
        console.warn('⏸️ DeepSeek API 调用太频繁（30秒内），已跳过');
        return false;
    }
    
    if (now - hourResetTime > 3600000) {
        callCount = 0;
        hourResetTime = now;
    }
    
    if (callCount >= MAX_CALLS_PER_HOUR) {
        console.warn(`⏸️ DeepSeek API 调用已达小时限制 (${MAX_CALLS_PER_HOUR}次/小时)，已跳过`);
        return false;
    }
    
    lastCallTime = now;
    callCount++;
    return true;
}

if (DISABLE_DEEPSEEK_REPORTS) {
    console.log('⏸️ DeepSeek 报告生成服务已禁用 (DISABLE_DEEPSEEK_REPORTS=true)');
}

function buildMatchDataPrompt(homeTeam, awayTeam, league, matchDate, result) {
    const resultText = result === 'home_win' ? `${homeTeam} 获胜` : 
                       result === 'away_win' ? `${awayTeam} 获胜` : '平局';
    
    return `请使用联网搜索功能，搜索 ${homeTeam} vs ${awayTeam} (${league}) 在 ${matchDate} 的比赛详细数据。

【核心要求】：
1. 必须使用联网搜索获取真实比赛数据
2. 只返回 JSON 格式，不要有任何 markdown 标记
3. 数据要准确、完整

【需要获取的数据】：
- 控球率 (possession): home, away (百分比)
- 射门 (shots): home, away (次数)
- 射正 (shots_on_target): home, away (次数)
- 角球 (corners): home, away (次数)
- 犯规 (fouls): home, away (次数)
- 黄牌 (yellow_cards): home, away (次数)
- 红牌 (red_cards): home, away (次数)
- 预期进球 (xg): home, away (数值)
- 比赛简述 (summary): 150-200字的专业比赛回顾
- 关键事件 (key_events): 进球、红黄牌、关键扑救等
- 获胜队伍关键表现 (winning_analysis): 深度分析获胜队伍的关键表现因素

【比赛结果】：${resultText}

【返回格式】：
{
  "statistics": {
    "possession": { "home": 58, "away": 42 },
    "shots": { "home": 15, "away": 8 },
    "shots_on_target": { "home": 6, "away": 3 },
    "corners": { "home": 7, "away": 4 },
    "fouls": { "home": 12, "away": 14 },
    "yellow_cards": { "home": 2, "away": 3 },
    "red_cards": { "home": 0, "away": 0 },
    "xg": { "home": 2.4, "away": 1.1 }
  },
  "key_events": [
    { "time": "15'", "event": "进球", "team": "${homeTeam}", "player": "Haaland", "score": "1:0" },
    { "time": "38'", "event": "黄牌", "team": "${awayTeam}", "player": "Van Dijk" }
  ],
  "summary": "比赛综述...",
  "winning_analysis": "获胜队伍的关键表现分析..."
}`;
}

function buildDeepReportPrompt(params) {
    const { 
        homeTeam, awayTeam, league, matchDate,
        homeScore, awayScore, result,
        statistics, keyEvents,
        totalAmount, profit, payout,
        isWin
    } = params;
    
    const winner = result === 'home_win' ? homeTeam : (result === 'away_win' ? awayTeam : '平局');
    const loser = result === 'home_win' ? awayTeam : (result === 'away_win' ? homeTeam : '无');
    const winnerScore = result === 'home_win' ? homeScore : awayScore;
    const loserScore = result === 'home_win' ? awayScore : homeScore;
    const profitStatus = isWin ? '盈利' : '亏损';
    const profitSign = isWin ? '+' : '';
    
    const possessionDiff = statistics.possession.home - statistics.possession.away;
    const possessionAdvantage = possessionDiff > 0 ? homeTeam : awayTeam;
    const possessionAdvantageText = `控球率方面，${possessionAdvantage}以${Math.abs(possessionDiff)}%的优势掌控比赛节奏`;
    
    const shotsDiff = statistics.shots.home - statistics.shots.away;
    const shotsAdvantage = shotsDiff > 0 ? homeTeam : awayTeam;
    const shotsAdvantageText = `射门次数上，${shotsAdvantage}创造出${Math.abs(shotsDiff)}次更多的射门机会`;
    
    const xgDiff = statistics.xg.home - statistics.xg.away;
    const xgAdvantage = xgDiff > 0 ? homeTeam : awayTeam;
    const xgAdvantageText = `预期进球(xG)数据显示，${xgAdvantage}的进攻质量更高，领先${Math.abs(xgDiff).toFixed(1)}个预期进球`;
    
    return `你是一位顶级的足球数据分析师和交易策略专家。请根据以下比赛数据，生成一份专业、深度、有说服力的足球交易复盘报告。

【比赛基本信息】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 赛事：${homeTeam} vs ${awayTeam}
📋 联赛：${league}
📅 时间：${matchDate}
🎯 最终比分：${homeScore} : ${awayScore}
🏆 获胜方：${winner} (${winnerScore}:${loserScore})

【详细统计数据】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 控球率：${statistics.possession.home}% vs ${statistics.possession.away}% (差值: ${possessionDiff > 0 ? '+' : ''}${possessionDiff}%)
🎯 射门：${statistics.shots.home} vs ${statistics.shots.away} (差值: ${shotsDiff > 0 ? '+' : ''}${shotsDiff})
🎪 射正：${statistics.shots_on_target.home} vs ${statistics.shots_on_target.away}
⛳ 角球：${statistics.corners.home} vs ${statistics.corners.away}
⚡ 犯规：${statistics.fouls.home} vs ${statistics.fouls.away}
🟨 黄牌：${statistics.yellow_cards.home} vs ${statistics.yellow_cards.away}
🟥 红牌：${statistics.red_cards.home} vs ${statistics.red_cards.away}
📈 预期进球(xG)：${statistics.xg.home} vs ${statistics.xg.away} (差值: ${xgDiff > 0 ? '+' : ''}${xgDiff.toFixed(1)})

${possessionAdvantageText}。${shotsAdvantageText}。${xgAdvantageText}。

【关键事件时间轴】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${keyEvents.map(e => `⏱️ ${e.time}：${e.team} - ${e.event}${e.player ? ` (${e.player})` : ''}${e.score ? ` → 比分 ${e.score}` : ''}`).join('\n')}

【交易结果】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 授权金额：${totalAmount} USDT
📊 盈亏：${profitSign}${Math.abs(profit).toFixed(2)} USDT (${profitStatus})
💵 实际到账：${payout} USDT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【报告生成要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请生成一份专业的足球交易复盘报告，必须包含以下部分：

## 🏆 比赛综述
## 🎯 为什么选择 ${winner}？
## 📈 数据深度剖析
## 💰 交易收益解析
## 🔮 AI 智能总结
## 📌 最终结论

请生成报告，使用专业、华丽、有说服力的语言风格。只返回报告内容，不要有其他说明。`;
}

async function callDeepSeekAPI(prompt) {
    if (DISABLE_DEEPSEEK_REPORTS) {
        throw new Error('DeepSeek 报告生成已禁用');
    }
    
    if (!checkRateLimit()) {
        throw new Error('Rate limit exceeded');
    }
    
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
                    content: '你是一位顶级的足球数据分析专家和交易策略师。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.5,
            max_tokens: 8192,
            extra_body: { enable_search: true }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API 错误: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
        return { content: data.choices[0].message.content };
    }
    
    throw new Error('DeepSeek API 返回数据异常');
}

export async function fetchMatchStatistics(homeTeam, awayTeam, league, matchDate, result) {
    if (DISABLE_DEEPSEEK_REPORTS) {
        console.log('⏸️ 比赛数据获取已禁用');
        return null;
    }
    
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return null;
    }
    
    const prompt = buildMatchDataPrompt(homeTeam, awayTeam, league, matchDate, result);
    
    try {
        console.log(`📡 获取比赛数据: ${homeTeam} vs ${awayTeam} (${league})`);
        const response = await callDeepSeekAPI(prompt);
        
        if (response && response.content) {
            let content = response.content;
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const data = JSON.parse(content);
            console.log(`✅ 成功获取 ${homeTeam} vs ${awayTeam} 的比赛数据`);
            return data;
        }
        return null;
    } catch (error) {
        console.error('获取比赛数据失败:', error.message);
        return null;
    }
}

export async function generateDeepReport(params) {
    if (DISABLE_DEEPSEEK_REPORTS) {
        console.log('⏸️ 深度报告生成已禁用');
        return `## 📊 比赛报告\n\n${params.homeTeam} vs ${params.awayTeam} 的比赛数据正在整理中。\n\n💡 深度分析报告功能暂时不可用，请稍后再试。`;
    }
    
    if (!DEEPSEEK_API_KEY) {
        console.warn('⚠️ DEEPSEEK_API_KEY 未配置');
        return null;
    }
    
    const prompt = buildDeepReportPrompt(params);
    
    try {
        console.log(`📡 生成深度报告: ${params.homeTeam} vs ${params.awayTeam}`);
        const response = await callDeepSeekAPI(prompt);
        
        if (response && response.content) {
            console.log(`✅ 成功生成 ${params.homeTeam} vs ${params.awayTeam} 的深度报告`);
            return response.content.trim();
        }
        return null;
    } catch (error) {
        console.error('生成报告失败:', error.message);
        return null;
    }
}

export default {
    fetchMatchStatistics,
    generateDeepReport
};