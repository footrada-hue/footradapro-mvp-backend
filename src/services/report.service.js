/**
 * 报告服务 - 处理复盘报告的生成和格式化
 */

/**
 * 格式化报告数据，用于前端展示
 * @param {Object} report - 数据库中的原始报告数据
 * @returns {Object} 格式化后的报告数据
 */
export function formatReportForDisplay(report) {
    if (!report) return null;
    
    // 解析JSON字段
    const keyEvents = report.key_events ? JSON.parse(report.key_events) : [];
    const playerStats = report.player_stats ? JSON.parse(report.player_stats) : [];
    
    return {
        match_id: report.match_id,
        home_team: report.home_team,
        away_team: report.away_team,
        home_score: report.home_score || 0,
        away_score: report.away_score || 0,
        league: report.league,
        match_time: report.match_time,
        ai_conclusion: report.ai_conclusion || '暂无AI分析',
        
        // 比赛数据
        possession: {
            home: report.possession_home || 0,
            away: report.possession_away || 0
        },
        shots: {
            home: report.shots_home || 0,
            away: report.shots_away || 0
        },
        shotsOnTarget: {
            home: report.shots_ontarget_home || 0,
            away: report.shots_ontarget_away || 0
        },
        corners: {
            home: report.corners_home || 0,
            away: report.corners_away || 0
        },
        fouls: {
            home: report.fouls_home || 0,
            away: report.fouls_away || 0
        },
        yellowCards: {
            home: report.yellow_cards_home || 0,
            away: report.yellow_cards_away || 0
        },
        redCards: {
            home: report.red_cards_home || 0,
            away: report.red_cards_away || 0
        },
        xg: {
            home: report.xg_home || 0,
            away: report.xg_away || 0
        },
        
        // 事件和时间线
        key_events: keyEvents,
        player_stats: playerStats,
        
        // 元数据
        created_at: report.created_at,
        published_at: report.published_at,
        status: report.status
    };
}

/**
 * 生成AI分析结论（基于比赛数据）
 * @param {Object} matchData - 比赛数据
 * @returns {string} AI分析结论
 */
export function generateAIConclusion(matchData) {
    const {
        home_team, away_team, home_score, away_score,
        possession_home, possession_away,
        shots_home, shots_away,
        xg_home, xg_away
    } = matchData;
    
    let conclusion = '';
    
    // 根据控球率判断场面优势
    if (possession_home > possession_away) {
        conclusion += `${home_team} 占据控球优势 (${possession_home}% vs ${possession_away}%)`;
    } else {
        conclusion += `${away_team} 占据控球优势 (${possession_away}% vs ${possession_home}%)`;
    }
    
    conclusion += '，';
    
    // 根据射门次数判断进攻威胁
    if (shots_home > shots_away) {
        conclusion += `射门次数 ${shots_home} 次，远超对手的 ${shots_away} 次`;
    } else {
        conclusion += `射门次数 ${shots_away} 次，对手仅 ${shots_home} 次`;
    }
    
    conclusion += '。';
    
    // 根据预期进球分析
    if (xg_home > xg_away) {
        conclusion += ` 预期进球 ${xg_home.toFixed(2)} vs ${xg_away.toFixed(2)}，${home_team} 创造更多机会`;
    } else {
        conclusion += ` 预期进球 ${xg_away.toFixed(2)} vs ${xg_home.toFixed(2)}，${away_team} 创造更多机会`;
    }
    
    // 比赛结果评价
    if (home_score > away_score) {
        conclusion += `，最终 ${home_team} ${home_score}:${away_score} 获胜，符合场面优势。`;
    } else if (home_score < away_score) {
        conclusion += `，最终 ${away_team} ${away_score}:${home_score} 获胜，把握机会能力更强。`;
    } else {
        conclusion += `，最终 ${home_score}:${away_score} 战平，场面和数据基本均衡。`;
    }
    
    return conclusion;
}

/**
 * 验证报告数据的完整性
 * @param {Object} report - 报告数据
 * @returns {Object} 验证结果
 */
export function validateReport(report) {
    const errors = [];
    const warnings = [];
    
    // 必填字段验证
    if (!report.match_id) errors.push('比赛ID不能为空');
    if (report.home_score === undefined || report.home_score === null) errors.push('主队比分不能为空');
    if (report.away_score === undefined || report.away_score === null) errors.push('客队比分不能为空');
    
    // 数据合理性验证
    if (report.possession_home + report.possession_away !== 100) {
        warnings.push('控球率总和应为100%');
    }
    
    if (report.shots_ontarget_home > report.shots_home) {
        warnings.push('射正次数不能大于射门次数（主队）');
    }
    
    if (report.shots_ontarget_away > report.shots_away) {
        warnings.push('射正次数不能大于射门次数（客队）');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * 从清算数据生成基础报告模板
 * @param {Object} settlement - 清算数据
 * @returns {Object} 报告模板
 */
export function createReportTemplateFromSettlement(settlement) {
    return {
        match_id: settlement.match_id,
        home_score: settlement.home_score || 0,
        away_score: settlement.away_score || 0,
        possession_home: 50,
        possession_away: 50,
        shots_home: 0,
        shots_away: 0,
        shots_ontarget_home: 0,
        shots_ontarget_away: 0,
        corners_home: 0,
        corners_away: 0,
        fouls_home: 0,
        fouls_away: 0,
        yellow_cards_home: 0,
        yellow_cards_away: 0,
        red_cards_home: 0,
        red_cards_away: 0,
        xg_home: 0,
        xg_away: 0,
        ai_conclusion: generateAIConclusion({
            home_team: settlement.home_team,
            away_team: settlement.away_team,
            home_score: settlement.home_score,
            away_score: settlement.away_score,
            possession_home: 50,
            possession_away: 50,
            shots_home: 0,
            shots_away: 0,
            xg_home: 0,
            xg_away: 0
        }),
        key_events: [],
        player_stats: [],
        status: 'draft'
    };
}

export default {
    formatReportForDisplay,
    generateAIConclusion,
    validateReport,
    createReportTemplateFromSettlement
};