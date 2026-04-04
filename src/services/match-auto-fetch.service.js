/**
 * Match Auto-Fetch Service
 * @description 自动获取比赛数据并录入到数据库
 * @version 5.0.0
 * @since 2026-04-01
 */

import { getDb } from '../database/connection.js';
import { fetchUpcomingMatches } from './deepseek.service.js';
import logger from '../utils/logger.js';

// 完整的队徽映射表（162 支球队）
// 本地队徽映射（优先使用本地文件）
const TEAM_LOGO_MAP = {
  "ac milan": "/uploads/teams/ac-milan.png",
  "alaves": "/uploads/teams/alaves.png",
  "argentina": "/uploads/teams/argentina.png",
  "arsenal": "/uploads/teams/arsenal.png",
  "aston villa": "/uploads/teams/aston-villa.png",
  "atalanta": "/uploads/teams/atalanta.png",
  "atletico madrid": "/uploads/teams/atletico-madrid.png",
  "australia": "/uploads/teams/australia.png",
  "barcelona": "/uploads/teams/barcelona.png",
  "bayer leverkusen": "/uploads/teams/bayer-leverkusen.png",
  "bayern munich": "/uploads/teams/bayern-munich.png",
  "belgium": "/uploads/teams/belgium.png",
  "boca juniors": "/uploads/teams/boca-juniors.png",
  "bologna": "/uploads/teams/bologna.png",
  "borussia dortmund": "/uploads/teams/borussia-dortmund.png",
  "borussia monchengladbach": "/uploads/teams/borussia-monchengladbach.png",
  "brest": "/uploads/teams/brest.png",
  "cadiz": "/uploads/teams/cadiz.png",
  "celta vigo": "/uploads/teams/celta-vigo.png",
  "cerezo osaka": "/uploads/teams/cerezo-osaka.png",
  "chelsea": "/uploads/teams/chelsea.png",
  "colombia": "/uploads/teams/colombia.png",
  "corinthians": "/uploads/teams/corinthians.png",
  "croatia": "/uploads/teams/croatia.png",
  "denmark": "/uploads/teams/denmark.png",
  "eintracht frankfurt": "/uploads/teams/eintracht-frankfurt.png",
  "empoli": "/uploads/teams/empoli.png",
  "england": "/uploads/teams/england.png",
  "estudiantes": "/uploads/teams/estudiantes.png",
  "everton": "/uploads/teams/everton.png",
  "fiorentina": "/uploads/teams/fiorentina.png",
  "flamengo": "/uploads/teams/flamengo.png",
  "france": "/uploads/teams/france.png",
  "fulham": "/uploads/teams/fulham.png",
  "gamba osaka": "/uploads/teams/gamba-osaka.png",
  "genoa": "/uploads/teams/genoa.png",
  "germany": "/uploads/teams/germany.png",
  "girona": "/uploads/teams/girona.png",
  "granada": "/uploads/teams/granada.png",
  "independiente": "/uploads/teams/independiente.png",
  "inter milan": "/uploads/teams/inter-milan.png",
  "internacional": "/uploads/teams/internacional.png",
  "iraq": "/uploads/teams/iraq.png",
  "italy": "/uploads/teams/italy.png",
  "japan": "/uploads/teams/japan.png",
  "juventus": "/uploads/teams/juventus.png",
  "las palmas": "/uploads/teams/las-palmas.png",
  "lazio": "/uploads/teams/lazio.png",
  "lecce": "/uploads/teams/lecce.png",
  "lens": "/uploads/teams/lens.png",
  "lille": "/uploads/teams/lille.png",
  "liverpool": "/uploads/teams/liverpool.png",
  "lorient": "/uploads/teams/lorient.png",
  "lyon": "/uploads/teams/lyon.png",
  "manchester city": "/uploads/teams/manchester-city.png",
  "manchester united": "/uploads/teams/manchester-united.png",
  "marseille": "/uploads/teams/marseille.png",
  "metz": "/uploads/teams/metz.png",
  "mexico": "/uploads/teams/mexico.png",
  "monaco": "/uploads/teams/monaco.png",
  "montpellier": "/uploads/teams/montpellier.png",
  "nantes": "/uploads/teams/nantes.png",
  "napoli": "/uploads/teams/napoli.png",
  "newcastle united": "/uploads/teams/newcastle-united.png",
  "nice": "/uploads/teams/nice.png",
  "osasuna": "/uploads/teams/osasuna.png",
  "palmeiras": "/uploads/teams/palmeiras.png",
  "pohang steelers": "/uploads/teams/pohang-steelers.png",
  "poland": "/uploads/teams/poland.png",
  "portugal": "/uploads/teams/portugal.png",
  "psg": "/uploads/teams/psg.png",
  "rayo vallecano": "/uploads/teams/rayo-vallecano.png",
  "real betis": "/uploads/teams/real-betis.png",
  "real madrid": "/uploads/teams/real-madrid.png",
  "real sociedad": "/uploads/teams/real-sociedad.png",
  "rennes": "/uploads/teams/rennes.png",
  "roma": "/uploads/teams/roma.png",
  "salernitana": "/uploads/teams/salernitana.png",
  "san lorenzo": "/uploads/teams/san-lorenzo.png",
  "santos": "/uploads/teams/santos.png",
  "sevilla": "/uploads/teams/sevilla.png",
  "shanghai shenhua": "/uploads/teams/shanghai-shenhua.png",
  "south korea": "/uploads/teams/south-korea.png",
  "spain": "/uploads/teams/spain.png",
  "strasbourg": "/uploads/teams/strasbourg.png",
  "switzerland": "/uploads/teams/switzerland.png",
  "torino": "/uploads/teams/torino.png",
  "tottenham hotspur": "/uploads/teams/tottenham-hotspur.png",
  "tottenham": "/uploads/teams/tottenham.png",
  "toulouse": "/uploads/teams/toulouse.png",
  "udinese": "/uploads/teams/udinese.png",
  "uruguay": "/uploads/teams/uruguay.png",
  "uzbekistan": "/uploads/teams/uzbekistan.png",
  "valencia": "/uploads/teams/valencia.png",
  "verona": "/uploads/teams/verona.png",
  "vfb stuttgart": "/uploads/teams/vfb-stuttgart.png",
  "vfl wolfsburg": "/uploads/teams/vfl-wolfsburg.png",
  "villarreal": "/uploads/teams/villarreal.png",
  "yokohama f marinos": "/uploads/teams/yokohama-f-marinos.png",
};

/**
 * 将时间字符串转换为 UTC ISO 8601 格式
 */
function toUTCISOString(timeStr) {
    if (!timeStr) return null;
    timeStr = timeStr.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timeStr)) return timeStr;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timeStr)) return timeStr + '.000Z';
    const match = timeStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
        const [, date, hour, minute, second] = match;
        return `${date}T${hour}:${minute}:${second}.000Z`;
    }
    try {
        const date = new Date(timeStr);
        if (!isNaN(date.getTime())) return date.toISOString();
    } catch (e) {}
    logger.warn(`无效的时间格式: ${timeStr}`);
    return null;
}

/**
 * 检查比赛是否已存在
 */
function isMatchExists(db, match) {
    const { home_team, away_team, match_time_utc } = match;
    const isoTime = toUTCISOString(match_time_utc);
    if (!isoTime) return false;
    const existing = db.prepare(`SELECT id FROM match_pool WHERE home_team = ? AND away_team = ? AND match_datetime = ?`).get(home_team, away_team, isoTime);
    return !!existing;
}

/**
 * 获取球队队徽 URL
 */
function getTeamLogo(teamName) {
    if (!teamName) return '/uploads/teams/default.png';
    
    // 转换为小写进行匹配
    const lowerName = teamName.toLowerCase();
    
    if (TEAM_LOGO_MAP[lowerName]) {
        return TEAM_LOGO_MAP[lowerName];
    }
    
    // 尝试去掉常见后缀
    const cleanName = lowerName.replace(/ fc$/, '').replace(/ afc$/, '').trim();
    if (TEAM_LOGO_MAP[cleanName]) {
        return TEAM_LOGO_MAP[cleanName];
    }
    
    return '/uploads/teams/default.png';
}

/**
 * 插入比赛到 match_pool 表（跑马灯专用，不需要队徽）
 */
function insertIntoMatchPool(db, match) {
    const { league, home_team, away_team, match_time_utc } = match;
    
    const isoTime = toUTCISOString(match_time_utc);
    if (!isoTime) {
        logger.error(`时间格式无效: ${match_time_utc}`);
        return;
    }
    
    const matchDate = isoTime.split('T')[0];
    const matchTime = isoTime.split('T')[1]?.replace('.000Z', '') || '00:00:00';
    
    try {
        // match_pool 不需要队徽，只给跑马灯用
        db.prepare(`INSERT OR IGNORE INTO match_pool (league, home_team, away_team, match_date, match_time, match_datetime, status, weight) VALUES (?, ?, ?, ?, ?, ?, 'upcoming', 100)`).run(
            league || 'Unknown', home_team, away_team, matchDate, matchTime, isoTime
        );
    } catch (err) {
        logger.error(`插入 match_pool 失败: ${home_team} vs ${away_team}`, err.message);
        throw err;
    }
}

/**
 * 插入比赛到 matches 表
 */
function insertIntoMatches(db, match) {
    const { league, home_team, away_team, match_time_utc, home_logo, away_logo } = match;
    
    const isoTime = toUTCISOString(match_time_utc);
    if (!isoTime) {
        logger.error(`时间格式无效: ${match_time_utc}`);
        return false;
    }
    
    const finalHomeLogo = getTeamLogo(home_team);
    const finalAwayLogo = getTeamLogo(away_team);
    
    const matchId = `${home_team.substring(0, 3)}${away_team.substring(0, 3)}${Date.now()}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const matchDateObj = new Date(isoTime);
    const cutoffDateTimeUTC = new Date(matchDateObj.getTime() - 5 * 60 * 1000).toISOString();
    
    const existing = db.prepare(`SELECT id FROM matches WHERE home_team = ? AND away_team = ? AND date(match_time) = date(?)`).get(home_team, away_team, isoTime);
    if (existing) return false;
    
    try {
        db.prepare(`INSERT INTO matches (match_id, home_team, away_team, league, home_logo, away_logo, match_time, cutoff_time, status, is_active, source, execution_rate, min_authorization, match_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', 1, 'auto-deepseek', 30, 100, 500)`).run(
            matchId, home_team, away_team, league || 'Unknown', finalHomeLogo, finalAwayLogo, isoTime, cutoffDateTimeUTC
        );
        return true;
    } catch (err) {
        logger.error(`插入 matches 失败: ${home_team} vs ${away_team}`, err.message);
        throw err;
    }
}

/**
 * 自动获取并录入比赛
 */
export async function autoFetchAndInsertMatches() {
    const db = getDb();
    const results = { total: 0, newToPool: 0, newToMatches: 0, skipped: 0, errors: 0, matches: [] };
    
    try {
        logger.info('🔄 开始自动获取比赛数据...');
        const matches = await fetchUpcomingMatches();
        if (!matches || matches.length === 0) {
            logger.warn('未获取到比赛数据');
            return results;
        }
        results.total = matches.length;
        logger.info(`📋 获取到 ${matches.length} 场比赛`);
        db.prepare('BEGIN TRANSACTION').run();
        
        for (const match of matches) {
            try {
                if (!match.home_team || !match.away_team || !match.match_time_utc) {
                    results.errors++;
                    continue;
                }
                if (isMatchExists(db, match)) {
                    results.skipped++;
                    continue;
                }
                insertIntoMatchPool(db, match);
                results.newToPool++;
                if (insertIntoMatches(db, match)) results.newToMatches++;
                results.matches.push({ home_team: match.home_team, away_team: match.away_team, match_time: match.match_time_utc });
            } catch (err) {
                results.errors++;
                logger.error(`录入失败 ${match.home_team} vs ${match.away_team}:`, err.message);
            }
        }
        db.prepare('COMMIT').run();
        logger.info(`📊 自动录入完成: 总计 ${results.total}, 新增 match_pool ${results.newToPool}, 新增 matches ${results.newToMatches}, 跳过 ${results.skipped}, 错误 ${results.errors}`);
        return results;
    } catch (error) {
        db.prepare('ROLLBACK').run();
        logger.error('自动录入失败:', error);
        results.errors++;
        return results;
    }
}

export async function manualFetchAndInsert() {
    logger.info('👤 管理员手动触发比赛数据同步');
    return autoFetchAndInsertMatches();
}

export default {
    autoFetchAndInsertMatches,
    manualFetchAndInsert
};