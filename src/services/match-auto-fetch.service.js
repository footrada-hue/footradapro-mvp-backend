/**
 * Match Auto-Fetch Service
 * @description 自动获取比赛数据并录入到数据库
 * @version 7.0.0 - PostgreSQL 兼容版
 * @since 2026-06-07
 */

import { query, getDb } from '../database/connection.js';
import { fetchUpcomingMatches } from './deepseek.service.js';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

// ==================== 球隊名稱標準化映射（保持不变）====================
const TEAM_NAME_NORMALIZE = {
    // 西甲
    'FC Barcelona': 'Barcelona',
    'Barcelona FC': 'Barcelona',
    'Barcelona Football Club': 'Barcelona',
    'Real Madrid CF': 'Real Madrid',
    'Real Madrid Club de Fútbol': 'Real Madrid',
    'Real Madrid FC': 'Real Madrid',
    'Atletico Madrid': 'Atletico Madrid',
    'Atlético Madrid': 'Atletico Madrid',
    'Sevilla FC': 'Sevilla',
    'Sevilla CF': 'Sevilla',
    'Valencia CF': 'Valencia',
    'Valencia FC': 'Valencia',
    'Villarreal CF': 'Villarreal',
    'Villarreal FC': 'Villarreal',
    
    // 英超
    'Arsenal': 'Arsenal',
    'Arsenal FC': 'Arsenal',
    'Arsenal Football Club': 'Arsenal',
    'Chelsea': 'Chelsea',
    'Chelsea FC': 'Chelsea',
    'Chelsea Football Club': 'Chelsea',
    'Manchester United': 'Manchester United',
    'Manchester United FC': 'Manchester United',
    'Manchester United Football Club': 'Manchester United',
    'Man United': 'Manchester United',
    'Man Utd': 'Manchester United',
    'Manchester City': 'Manchester City',
    'Manchester City FC': 'Manchester City',
    'Manchester City Football Club': 'Manchester City',
    'Man City': 'Manchester City',
    'Liverpool': 'Liverpool',
    'Liverpool FC': 'Liverpool',
    'Liverpool Football Club': 'Liverpool',
    'Tottenham Hotspur': 'Tottenham Hotspur',
    'Tottenham Hotspur FC': 'Tottenham Hotspur',
    'Tottenham': 'Tottenham Hotspur',
    'Newcastle United': 'Newcastle United',
    'Newcastle United FC': 'Newcastle United',
    'Newcastle': 'Newcastle United',
    'Leicester City': 'Leicester City',
    'Leicester City FC': 'Leicester City',
    'Leicester': 'Leicester City',
    'Aston Villa': 'Aston Villa',
    'Aston Villa FC': 'Aston Villa',
    'West Ham United': 'West Ham United',
    'West Ham United FC': 'West Ham United',
    'West Ham': 'West Ham United',
    'Everton': 'Everton',
    'Everton FC': 'Everton',
    'Crystal Palace': 'Crystal Palace',
    'Crystal Palace FC': 'Crystal Palace',
    'Wolverhampton Wanderers': 'Wolverhampton Wanderers',
    'Wolves': 'Wolverhampton Wanderers',
    'Brighton & Hove Albion': 'Brighton',
    'Brighton': 'Brighton',
    'Brentford': 'Brentford',
    'Brentford FC': 'Brentford',
    'Fulham': 'Fulham',
    'Fulham FC': 'Fulham',
    'Nottingham Forest': 'Nottingham Forest',
    'Nottingham Forest FC': 'Nottingham Forest',
    'Bournemouth': 'Bournemouth',
    'AFC Bournemouth': 'Bournemouth',
    
    // 德甲
    'FC Bayern Munich': 'Bayern Munich',
    'Bayern München': 'Bayern Munich',
    'Bayern Munich': 'Bayern Munich',
    'Borussia Dortmund': 'Borussia Dortmund',
    'Dortmund': 'Borussia Dortmund',
    'Bayer 04 Leverkusen': 'Bayer Leverkusen',
    'Bayer Leverkusen': 'Bayer Leverkusen',
    'RB Leipzig': 'RB Leipzig',
    'Leipzig': 'RB Leipzig',
    'Eintracht Frankfurt': 'Eintracht Frankfurt',
    'Frankfurt': 'Eintracht Frankfurt',
    'Borussia Mönchengladbach': 'Borussia Monchengladbach',
    'Borussia Monchengladbach': 'Borussia Monchengladbach',
    'VfB Stuttgart': 'Stuttgart',
    'Stuttgart': 'Stuttgart',
    'VfL Wolfsburg': 'Wolfsburg',
    'Wolfsburg': 'Wolfsburg',
    'FC Köln': 'Koln',
    'Köln': 'Koln',
    '1. FC Köln': 'Koln',
    'Mainz 05': 'Mainz',
    '1. FSV Mainz 05': 'Mainz',
    'FC Augsburg': 'Augsburg',
    'Augsburg': 'Augsburg',
    'TSG Hoffenheim': 'Hoffenheim',
    'Hoffenheim': 'Hoffenheim',
    'Werder Bremen': 'Werder Bremen',
    'Bremen': 'Werder Bremen',
    'SC Freiburg': 'Freiburg',
    'Freiburg': 'Freiburg',
    'Union Berlin': 'Union Berlin',
    '1. FC Union Berlin': 'Union Berlin',
    'FC Schalke 04': 'Schalke 04',
    'Schalke 04': 'Schalke 04',
    'Hertha BSC': 'Hertha Berlin',
    'Hertha Berlin': 'Hertha Berlin',
    
    // 意甲
    'Inter Milan': 'Inter Milan',
    'FC Internazionale Milano': 'Inter Milan',
    'Internazionale': 'Inter Milan',
    'Inter': 'Inter Milan',
    'AC Milan': 'AC Milan',
    'Milan AC': 'AC Milan',
    'Milan': 'AC Milan',
    'Juventus': 'Juventus',
    'Juventus FC': 'Juventus',
    'AS Roma': 'Roma',
    'Roma': 'Roma',
    'SSC Napoli': 'Napoli',
    'Napoli': 'Napoli',
    'Lazio': 'Lazio',
    'SS Lazio': 'Lazio',
    'Atalanta': 'Atalanta',
    'Atalanta BC': 'Atalanta',
    'Fiorentina': 'Fiorentina',
    'ACF Fiorentina': 'Fiorentina',
    'Torino': 'Torino',
    'Torino FC': 'Torino',
    'Bologna': 'Bologna',
    'Bologna FC': 'Bologna',
    'Udinese': 'Udinese',
    'Udinese Calcio': 'Udinese',
    'Genoa': 'Genoa',
    'Genoa CFC': 'Genoa',
    'Sassuolo': 'Sassuolo',
    'US Sassuolo': 'Sassuolo',
    'Empoli': 'Empoli',
    'Empoli FC': 'Empoli',
    'Salernitana': 'Salernitana',
    'US Salernitana': 'Salernitana',
    'Lecce': 'Lecce',
    'US Lecce': 'Lecce',
    'Verona': 'Verona',
    'Hellas Verona': 'Verona',
    
    // 法甲
    'Paris Saint-Germain': 'Paris Saint-Germain',
    'Paris Saint-Germain FC': 'Paris Saint-Germain',
    'Paris SG': 'Paris Saint-Germain',
    'PSG': 'Paris Saint-Germain',
    'Olympique Marseille': 'Marseille',
    'Marseille': 'Marseille',
    'Olympique Lyonnais': 'Lyon',
    'Lyon': 'Lyon',
    'AS Monaco': 'Monaco',
    'AS Monaco FC': 'Monaco',
    'Monaco': 'Monaco',
    'OGC Nice': 'Nice',
    'Nice': 'Nice',
    'LOSC Lille': 'Lille',
    'Lille': 'Lille',
    'Stade Rennais': 'Rennes',
    'Rennes': 'Rennes',
    'RC Lens': 'Lens',
    'Lens': 'Lens',
    'FC Nantes': 'Nantes',
    'Nantes': 'Nantes',
    'Montpellier HSC': 'Montpellier',
    'Montpellier': 'Montpellier',
    'RC Strasbourg': 'Strasbourg',
    'Strasbourg': 'Strasbourg',
    'Stade Brestois': 'Brest',
    'Brest': 'Brest',
    'FC Lorient': 'Lorient',
    'Lorient': 'Lorient',
    'FC Metz': 'Metz',
    'Metz': 'Metz',
    'Toulouse FC': 'Toulouse',
    'Toulouse': 'Toulouse',
    'Clermont Foot': 'Clermont',
    'Clermont': 'Clermont',
    
    // 其他欧洲球队
    'Ajax Amsterdam': 'Ajax',
    'AFC Ajax': 'Ajax',
    'Ajax': 'Ajax',
    'FC Porto': 'Porto',
    'Porto': 'Porto',
    'SL Benfica': 'Benfica',
    'Benfica': 'Benfica',
    'Sporting CP': 'Sporting Lisbon',
    'Sporting Lisbon': 'Sporting Lisbon',
    'Celtic FC': 'Celtic',
    'Celtic': 'Celtic',
    'Rangers FC': 'Rangers',
    'Rangers': 'Rangers',
    'Fenerbahçe': 'Fenerbahce',
    'Fenerbahce': 'Fenerbahce',
    'Galatasaray': 'Galatasaray',
    'Galatasaray SK': 'Galatasaray',
    
    // 国家队
    'Argentina': 'Argentina',
    'Argentina National Team': 'Argentina',
    'Brazil': 'Brazil',
    'Brazil National Team': 'Brazil',
    'France': 'France',
    'France National Team': 'France',
    'Germany': 'Germany',
    'Germany National Team': 'Germany',
    'Spain': 'Spain',
    'Spain National Team': 'Spain',
    'England': 'England',
    'England National Team': 'England',
    'Italy': 'Italy',
    'Italy National Team': 'Italy',
    'Portugal': 'Portugal',
    'Portugal National Team': 'Portugal',
    'Netherlands': 'Netherlands',
    'Holland': 'Netherlands',
    'Belgium': 'Belgium',
    'Belgium National Team': 'Belgium',
    'Croatia': 'Croatia',
    'Croatia National Team': 'Croatia',
    'Japan': 'Japan',
    'Japan National Team': 'Japan',
    'South Korea': 'South Korea',
    'Korea Republic': 'South Korea',
    'Australia': 'Australia',
    'Socceroos': 'Australia',
    'Mexico': 'Mexico',
    'Mexico National Team': 'Mexico',
    'Uruguay': 'Uruguay',
    'Uruguay National Team': 'Uruguay',
    'Colombia': 'Colombia',
    'Colombia National Team': 'Colombia'
};

// 本地队徽映射（保持不变）
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
    "brighton": "/uploads/teams/brighton.png",
    "cadiz": "/uploads/teams/cadiz.png",
    "celta vigo": "/uploads/teams/celta-vigo.png",
    "cerezo osaka": "/uploads/teams/cerezo-osaka.png",
    "chelsea": "/uploads/teams/chelsea.png",
    "colombia": "/uploads/teams/colombia.png",
    "corinthians": "/uploads/teams/corinthians.png",
    "croatia": "/uploads/teams/croatia.png",
    "crystal palace": "/uploads/teams/crystal-palace.png",
    "denmark": "/uploads/teams/denmark.png",
    "eintracht frankfurt": "/uploads/teams/eintracht-frankfurt.png",
    "empoli": "/uploads/teams/empoli.png",
    "england": "/uploads/teams/england.png",
    "estudiantes": "/uploads/teams/estudiantes.png",
    "everton": "/uploads/teams/everton.png",
    "fiorentina": "/uploads/teams/fiorentina.png",
    "flamengo": "/uploads/teams/flamengo.png",
    "france": "/uploads/teams/france.png",
    "freiburg": "/uploads/teams/freiburg.png",
    "fulham": "/uploads/teams/fulham.png",
    "gamba osaka": "/uploads/teams/gamba-osaka.png",
    "genoa": "/uploads/teams/genoa.png",
    "germany": "/uploads/teams/germany.png",
    "girona": "/uploads/teams/girona.png",
    "granada": "/uploads/teams/granada.png",
    "hertha berlin": "/uploads/teams/hertha-berlin.png",
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
    "mainz": "/uploads/teams/mainz.png",
    "metz": "/uploads/teams/metz.png",
    "mexico": "/uploads/teams/mexico.png",
    "monaco": "/uploads/teams/monaco.png",
    "montpellier": "/uploads/teams/montpellier.png",
    "nantes": "/uploads/teams/nantes.png",
    "napoli": "/uploads/teams/napoli.png",
    "newcastle united": "/uploads/teams/newcastle-united.png",
    "nice": "/uploads/teams/nice.png",
    "nottingham forest": "/uploads/teams/nottingham-forest.png",
    "osasuna": "/uploads/teams/osasuna.png",
    "palmeiras": "/uploads/teams/palmeiras.png",
    "pohang steelers": "/uploads/teams/pohang-steelers.png",
    "poland": "/uploads/teams/poland.png",
    "portugal": "/uploads/teams/portugal.png",
    "psg": "/uploads/teams/psg.png",
    "rayo vallecano": "/uploads/teams/rayo-vallecano.png",
    "rb leipzig": "/uploads/teams/rb-leipzig.png",
    "real betis": "/uploads/teams/real-betis.png",
    "real madrid": "/uploads/teams/real-madrid.png",
    "real sociedad": "/uploads/teams/real-sociedad.png",
    "rennes": "/uploads/teams/rennes.png",
    "roma": "/uploads/teams/roma.png",
    "salernitana": "/uploads/teams/salernitana.png",
    "san lorenzo": "/uploads/teams/san-lorenzo.png",
    "santos": "/uploads/teams/santos.png",
    "sassuolo": "/uploads/teams/sassuolo.png",
    "schalke 04": "/uploads/teams/schalke-04.png",
    "sevilla": "/uploads/teams/sevilla.png",
    "shanghai shenhua": "/uploads/teams/shanghai-shenhua.png",
    "south korea": "/uploads/teams/south-korea.png",
    "spain": "/uploads/teams/spain.png",
    "strasbourg": "/uploads/teams/strasbourg.png",
    "stuttgart": "/uploads/teams/stuttgart.png",
    "switzerland": "/uploads/teams/switzerland.png",
    "torino": "/uploads/teams/torino.png",
    "tottenham hotspur": "/uploads/teams/tottenham-hotspur.png",
    "toulouse": "/uploads/teams/toulouse.png",
    "udinese": "/uploads/teams/udinese.png",
    "union berlin": "/uploads/teams/union-berlin.png",
    "uruguay": "/uploads/teams/uruguay.png",
    "uzbekistan": "/uploads/teams/uzbekistan.png",
    "valencia": "/uploads/teams/valencia.png",
    "verona": "/uploads/teams/verona.png",
    "vfb stuttgart": "/uploads/teams/vfb-stuttgart.png",
    "vfl wolfsburg": "/uploads/teams/vfl-wolfsburg.png",
    "villarreal": "/uploads/teams/villarreal.png",
    "west ham united": "/uploads/teams/west-ham-united.png",
    "wolfsburg": "/uploads/teams/wolfsburg.png",
    "wolverhampton wanderers": "/uploads/teams/wolves.png",
    "yokohama f marinos": "/uploads/teams/yokohama-f-marinos.png",
};

function normalizeTeamName(teamName) {
    if (!teamName || typeof teamName !== 'string') return teamName;
    
    let normalized = teamName.trim();
    
    if (TEAM_NAME_NORMALIZE[normalized]) {
        return TEAM_NAME_NORMALIZE[normalized];
    }
    
    const lowerName = normalized.toLowerCase();
    for (const [key, value] of Object.entries(TEAM_NAME_NORMALIZE)) {
        if (key.toLowerCase() === lowerName) {
            return value;
        }
    }
    
    normalized = normalized
        .replace(/^(FC|AFC|SC|SSV|VfB|VfL|SV|TSV|1\.\s*FC|1\.\s*FFC|AC|AS|US|SS|CD|SD|CF)\s+/i, '')
        .replace(/^(Football Club\s+)/i, '')
        .replace(/^(Club\s+)/i, '')
        .replace(/^(Real\s+)/i, 'Real ')
        .replace(/^(Atlético\s+)/i, 'Atletico ')
        .replace(/^(Athletic\s+)/i, 'Athletic ');
    
    normalized = normalized
        .replace(/\s+(FC|AFC|SC|SSV|SV|CF|AC|AS|US|SS|CD|SD|Club|Football Club|F\.C\.|C\.F\.|A\.F\.C\.|National Team)$/i, '')
        .replace(/\s+\([^)]+\)$/, '')
        .replace(/\s+-\s+.+$/, '');
    
    normalized = normalized
        .replace(/^(Bayer\s+)/i, 'Bayer ')
        .replace(/^(Borussia\s+)/i, 'Borussia ')
        .replace(/^(Paris\s+)/i, 'Paris ')
        .replace(/^(Olympique\s+)/i, 'Olympique ');
    
    normalized = normalized
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s\-]/g, '')
        .trim();
    
    if (TEAM_NAME_NORMALIZE[normalized]) {
        return TEAM_NAME_NORMALIZE[normalized];
    }
    
    const lowerCleaned = normalized.toLowerCase();
    for (const [key, value] of Object.entries(TEAM_NAME_NORMALIZE)) {
        if (key.toLowerCase() === lowerCleaned) {
            return value;
        }
    }
    
    const commonSimplifications = {
        'manchester utd': 'Manchester United',
        'man utd': 'Manchester United',
        'man united': 'Manchester United',
        'man city': 'Manchester City',
        'tottenham': 'Tottenham Hotspur',
        'newcastle': 'Newcastle United',
        'leicester': 'Leicester City',
        'west ham': 'West Ham United',
        'wolves': 'Wolverhampton Wanderers',
        'brighton': 'Brighton',
        'bayern': 'Bayern Munich',
        'dortmund': 'Borussia Dortmund',
        'leipzig': 'RB Leipzig',
        'frankfurt': 'Eintracht Frankfurt',
        'inter': 'Inter Milan',
        'milan': 'AC Milan',
        'juventus': 'Juventus',
        'napoli': 'Napoli',
        'roma': 'Roma',
        'lazio': 'Lazio',
        'psg': 'Paris Saint-Germain',
        'marseille': 'Marseille',
        'lyon': 'Lyon',
        'monaco': 'Monaco',
        'ajax': 'Ajax',
        'porto': 'Porto',
        'benfica': 'Benfica'
    };
    
    if (commonSimplifications[lowerCleaned]) {
        return commonSimplifications[lowerCleaned];
    }
    
    return normalized;
}

function getTeamLogo(teamName) {
    if (!teamName) return '/uploads/teams/default.png';
    
    const normalizedName = normalizeTeamName(teamName);
    const lowerName = normalizedName.toLowerCase();
    
    if (TEAM_LOGO_MAP[lowerName]) {
        return TEAM_LOGO_MAP[lowerName];
    }
    
    const cleanName = lowerName.replace(/ fc$/, '').replace(/ afc$/, '').replace(/ football club$/, '').trim();
    if (TEAM_LOGO_MAP[cleanName]) {
        return TEAM_LOGO_MAP[cleanName];
    }
    
    return '/uploads/teams/default.png';
}

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

async function isMatchExists(match) {
    const homeTeam = normalizeTeamName(match.home_team);
    const awayTeam = normalizeTeamName(match.away_team);
    const isoTime = toUTCISOString(match.match_time_utc);
    
    if (!isoTime) return false;
    
    if (isProduction) {
        const result = await query(`
            SELECT id FROM matches 
            WHERE home_team = $1 AND away_team = $2 AND DATE(match_time) = DATE($3)
            LIMIT 1
        `, [homeTeam, awayTeam, isoTime]);
        return result && result.length > 0;
    } else {
        const db = getDb();
        const existing = db.prepare(`
            SELECT id FROM matches 
            WHERE home_team = ? AND away_team = ? AND date(match_time) = date(?)
        `).get(homeTeam, awayTeam, isoTime);
        return !!existing;
    }
}

async function insertIntoMatchPool(match) {
    const homeTeam = normalizeTeamName(match.home_team);
    const awayTeam = normalizeTeamName(match.away_team);
    const isoTime = toUTCISOString(match.match_time_utc);
    
    if (!isoTime) return false;
    
    const matchDate = isoTime.split('T')[0];
    const matchTime = isoTime.split('T')[1]?.replace('.000Z', '') || '00:00:00';
    
    try {
        if (isProduction) {
            const existing = await query(`
                SELECT id FROM match_pool 
                WHERE home_team = $1 AND away_team = $2 AND DATE(match_datetime) = DATE($3)
                LIMIT 1
            `, [homeTeam, awayTeam, isoTime]);
            
            if (existing && existing.length > 0) return false;
            
            await query(`
                INSERT INTO match_pool 
                (league, home_team, away_team, match_date, match_time, match_datetime, status, weight) 
                VALUES ($1, $2, $3, $4, $5, $6, 'upcoming', 100)
            `, [match.league || 'Unknown', homeTeam, awayTeam, matchDate, matchTime, isoTime]);
            return true;
        } else {
            const db = getDb();
            const existing = db.prepare(`
                SELECT id FROM match_pool 
                WHERE home_team = ? AND away_team = ? AND date(match_datetime) = date(?)
            `).get(homeTeam, awayTeam, isoTime);
            
            if (existing) return false;
            
            const result = db.prepare(`
                INSERT INTO match_pool 
                (league, home_team, away_team, match_date, match_time, match_datetime, status, weight) 
                VALUES (?, ?, ?, ?, ?, ?, 'upcoming', 100)
            `).run(match.league || 'Unknown', homeTeam, awayTeam, matchDate, matchTime, isoTime);
            return result.changes > 0;
        }
    } catch (err) {
        logger.error(`插入 match_pool 失败: ${homeTeam} vs ${awayTeam}`, err.message);
        return false;
    }
}

async function insertIntoMatches(match) {
    const homeTeam = normalizeTeamName(match.home_team);
    const awayTeam = normalizeTeamName(match.away_team);
    const isoTime = toUTCISOString(match.match_time_utc);
    
    if (!isoTime) return false;
    
    const existing = await isMatchExists(match);
    if (existing) return false;
    
    const finalHomeLogo = getTeamLogo(homeTeam);
    const finalAwayLogo = getTeamLogo(awayTeam);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const matchId = `${homeTeam.substring(0, 3)}${awayTeam.substring(0, 3)}_${timestamp}_${random}`.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    
    try {
        if (isProduction) {
            await query(`
                INSERT INTO matches 
                (match_id, home_team, away_team, league, home_logo, away_logo, match_time, cutoff_time, status, is_active, source, execution_rate, min_authorization, match_limit) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'upcoming', 1, 'auto-deepseek', 30, 100, 500)
            `, [matchId, homeTeam, awayTeam, match.league || 'Unknown', finalHomeLogo, finalAwayLogo, isoTime]);
            return true;
        } else {
            const db = getDb();
            const result = db.prepare(`
                INSERT INTO matches 
                (match_id, home_team, away_team, league, home_logo, away_logo, match_time, cutoff_time, status, is_active, source, execution_rate, min_authorization, match_limit) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', 1, 'auto-deepseek', 30, 100, 500)
            `).run(matchId, homeTeam, awayTeam, match.league || 'Unknown', finalHomeLogo, finalAwayLogo, isoTime, isoTime);
            return result.changes > 0;
        }
    } catch (err) {
        logger.error(`插入 matches 失败: ${homeTeam} vs ${awayTeam}`, err.message);
        return false;
    }
}

export async function autoFetchAndInsertMatches() {
    const results = { 
        total: 0, 
        newToPool: 0, 
        newToMatches: 0, 
        skipped: 0, 
        errors: 0, 
        matches: [],
        duplicates: []
    };
    
    try {
        logger.info('🔄 开始自动获取比赛数据...');
        const matches = await fetchUpcomingMatches();
        
        if (!matches || !Array.isArray(matches) || matches.length === 0) {
            logger.warn('未获取到比赛数据或数据格式错误');
            return results;
        }
        
        results.total = matches.length;
        logger.info(`📋 获取到 ${matches.length} 场比赛`);
        
        const processedMatches = new Set();
        
        for (const match of matches) {
            try {
                if (!match.home_team || !match.away_team || !match.match_time_utc) {
                    results.errors++;
                    continue;
                }
                
                const normalizedHome = normalizeTeamName(match.home_team);
                const normalizedAway = normalizeTeamName(match.away_team);
                const isoTime = toUTCISOString(match.match_time_utc);
                
                if (!isoTime) {
                    results.errors++;
                    continue;
                }
                
                const dedupeKey = `${normalizedHome}|${normalizedAway}|${isoTime.split('T')[0]}`;
                if (processedMatches.has(dedupeKey)) {
                    results.duplicates.push({ home: normalizedHome, away: normalizedAway, time: isoTime });
                    results.skipped++;
                    continue;
                }
                processedMatches.add(dedupeKey);
                
                const normalizedMatch = {
                    ...match,
                    home_team: normalizedHome,
                    away_team: normalizedAway
                };
                
                if (await isMatchExists(normalizedMatch)) {
                    results.skipped++;
                    continue;
                }
                
                const poolInserted = await insertIntoMatchPool(normalizedMatch);
                if (poolInserted) results.newToPool++;
                
                const matchesInserted = await insertIntoMatches(normalizedMatch);
                if (matchesInserted) results.newToMatches++;
                
                results.matches.push({ 
                    home_team: normalizedHome, 
                    away_team: normalizedAway, 
                    match_time: match.match_time_utc
                });
                
                logger.debug(`✅ 成功录入比赛: ${normalizedHome} vs ${normalizedAway}`);
                
            } catch (err) {
                results.errors++;
                logger.error(`录入失败 ${match.home_team} vs ${match.away_team}:`, err.message);
            }
        }
        
        logger.info(`📊 自动录入完成: 总计 ${results.total}, 新增 match_pool ${results.newToPool}, 新增 matches ${results.newToMatches}, 跳过 ${results.skipped}, 错误 ${results.errors}`);
        
        return results;
        
    } catch (error) {
        logger.error('自动录入失败:', error);
        results.errors++;
        return results;
    }
}

export async function manualFetchAndInsert() {
    logger.info('👤 管理员手动触发比赛数据同步');
    return autoFetchAndInsertMatches();
}

export async function cleanupDuplicateMatches() {
    const results = { poolCleaned: 0, matchesCleaned: 0, errors: 0 };
    
    try {
        logger.info('🧹 开始清理重复比赛数据...');
        
        if (isProduction) {
            const poolResult = await query(`
                DELETE FROM match_pool 
                WHERE id NOT IN (
                    SELECT MIN(id) FROM match_pool
                    GROUP BY home_team, away_team, DATE(match_datetime)
                )
            `);
            results.poolCleaned = poolResult?.rowCount || 0;
            
            const matchesResult = await query(`
                DELETE FROM matches 
                WHERE id NOT IN (
                    SELECT MIN(id) FROM matches
                    GROUP BY home_team, away_team, DATE(match_time)
                )
            `);
            results.matchesCleaned = matchesResult?.rowCount || 0;
        } else {
            const db = getDb();
            const poolResult = db.prepare(`
                DELETE FROM match_pool 
                WHERE id NOT IN (
                    SELECT MIN(id) FROM match_pool
                    GROUP BY home_team, away_team, date(match_datetime)
                )
            `).run();
            results.poolCleaned = poolResult.changes;
            
            const matchesResult = db.prepare(`
                DELETE FROM matches 
                WHERE id NOT IN (
                    SELECT MIN(id) FROM matches
                    GROUP BY home_team, away_team, date(match_time)
                )
            `).run();
            results.matchesCleaned = matchesResult.changes;
        }
        
        logger.info(`🧹 清理完成: match_pool 删除 ${results.poolCleaned} 条重复, matches 删除 ${results.matchesCleaned} 条重复`);
        
        return results;
        
    } catch (error) {
        logger.error('清理重复数据失败:', error);
        results.errors++;
        return results;
    }
}

export default {
    autoFetchAndInsertMatches,
    manualFetchAndInsert,
    cleanupDuplicateMatches,
    normalizeTeamName,
    getTeamLogo
};