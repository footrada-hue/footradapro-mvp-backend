/**
 * FOOTRADAPRO - Intelligent Multi-Source Data Sync Service
 * Fully automated match scheduling: Mid-week small leagues + Weekend major leagues
 * 
 * Data Sources:
 * - football-data.org: European top leagues + Champions League (free tier, requires API key)
 * - TheSportsDB: Global football matches (completely free, no API key required)
 * - OpenLigadata: German leagues (Bundesliga, 2. Bundesliga, 3. Liga) (completely free, no API key required)
 * 
 * Time Standard: All match_time stored in UTC ISO 8601 format
 * 
 * @version 3.0.0
 * @since 2026-03-28
 */
import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import { getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

class DataSyncService {
    constructor() {
        this.footballDataKey = process.env.FOOTBALL_API_KEY;
        this.apiFootballKey = process.env.API_FOOTBALL_KEY;
        this.sportmonksKey = process.env.SPORTMONKS_KEY;
        
        /**
         * League priority configuration (lower value = higher priority)
         */
        this.leaguePriority = {
            // Top-tier leagues
            'UEFA Champions League': 1,
            'UEFA Europa League': 2,
            'UEFA Europa Conference League': 3,
            'Premier League': 4,
            'La Liga': 5,
            'Serie A': 6,
            'Bundesliga': 7,
            'Ligue 1': 8,
            'Eredivisie': 9,
            'Primeira Liga': 10,
            'Russian Premier League': 11,
            'Turkish Süper Lig': 12,
            // Secondary leagues
            'Championship': 20,
            'Liga Portugal 2': 21,
            'Serie B': 22,
            '2. Bundesliga': 23,
            'Ligue 2': 24,
            'EFL League One': 25,
            'EFL League Two': 26,
            'Primera Nacional': 27,
            // Other European leagues
            'Belgian Pro League': 30,
            'Scottish Premiership': 31,
            'Swiss Super League': 32,
            'Austrian Bundesliga': 33,
            'Czech First League': 34,
            'Greek Super League': 35,
            'Croatian League': 36,
            'Polish Ekstraklasa': 37,
            'Danish Superliga': 38,
            // South American leagues
            'Campeonato Brasileiro Série A': 40,
            'Primera División Argentina': 41,
            'Primera División Chile': 42,
            'Liga MX': 43,
            'Uruguayan Primera División': 44,
            // Asian leagues
            'J1 League': 50,
            'K League 1': 51,
            'Chinese Super League': 52,
            'A-League': 53,
            'Saudi Pro League': 54,
            // Cups
            'FA Cup': 60,
            'Coppa Italia': 61,
            'Copa del Rey': 62,
            'DFB Pokal': 63,
            'Coupe de France': 64,
            'EFL Cup': 65,
            // Default
            'default': 100
        };
        
        /**
         * Timezone offset mapping for major leagues (minutes)
         * Used to convert local match times to UTC
         */
        this.leagueTimezoneMap = {
            // UK (GMT/BST)
            'Premier League': 0,
            'Championship': 0,
            'EFL League One': 0,
            'EFL League Two': 0,
            'EFL Cup': 0,
            'FA Cup': 0,
            // Western Europe (CET/CEST)
            'La Liga': 60,
            'Primera División': 60,
            'Serie A': 60,
            'Bundesliga': 60,
            '2. Bundesliga': 60,
            '3. Liga': 60,
            'Ligue 1': 60,
            'Ligue 2': 60,
            'Eredivisie': 60,
            'Belgian Pro League': 60,
            'Swiss Super League': 60,
            'Austrian Bundesliga': 60,
            'DFB Pokal': 60,
            'Coppa Italia': 60,
            'Copa del Rey': 60,
            'Coupe de France': 60,
            // Eastern Europe (EET/EEST)
            'Russian Premier League': 180,
            'Turkish Süper Lig': 180,
            'Greek Super League': 180,
            // Portugal (WET/WEST)
            'Primeira Liga': 0,
            'Liga Portugal 2': 0,
            // Brazil (BRT/BRST)
            'Campeonato Brasileiro Série A': -180,
            // Argentina (ART)
            'Primera División Argentina': -180,
            // Mexico (CST/CDT)
            'Liga MX': -360,
            // Japan (JST)
            'J1 League': 540,
            // Korea (KST)
            'K League 1': 540,
            // China (CST)
            'Chinese Super League': 480,
            // Australia (AEST/AEDT)
            'A-League': 660,
            // Default offset
            'default': 0
        };
    }

    /**
     * Convert local time to UTC ISO string
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {string} timeStr - Time in HH:MM format (local time)
     * @param {string} leagueName - League name for timezone detection
     * @returns {string} UTC ISO string
     */
    convertLocalToUTC(dateStr, timeStr, leagueName = 'default') {
        if (!dateStr) return new Date().toISOString();
        
        try {
            const [year, month, day] = dateStr.split('-').map(Number);
            let hour = 12, minute = 0;
            
            if (timeStr) {
                const timeParts = timeStr.split(':');
                hour = parseInt(timeParts[0]);
                minute = parseInt(timeParts[1]);
            }
            
            // Get timezone offset for the league (minutes from UTC)
            let offsetMinutes = this.leagueTimezoneMap[leagueName] || this.leagueTimezoneMap.default;
            
            // If offset is not specified, try to infer from league name pattern
            if (offsetMinutes === 0 && leagueName !== 'default') {
                const lowerLeague = leagueName.toLowerCase();
                if (lowerLeague.includes('brazil') || lowerLeague.includes('brasileiro')) {
                    offsetMinutes = -180;
                } else if (lowerLeague.includes('japan') || lowerLeague.includes('j1')) {
                    offsetMinutes = 540;
                } else if (lowerLeague.includes('korea') || lowerLeague.includes('k league')) {
                    offsetMinutes = 540;
                } else if (lowerLeague.includes('china') || lowerLeague.includes('中超')) {
                    offsetMinutes = 480;
                } else if (lowerLeague.includes('australia') || lowerLeague.includes('a-league')) {
                    offsetMinutes = 660;
                } else if (lowerLeague.includes('mexico') || lowerLeague.includes('liga mx')) {
                    offsetMinutes = -360;
                } else if (lowerLeague.includes('argentina')) {
                    offsetMinutes = -180;
                } else if (lowerLeague.includes('russia')) {
                    offsetMinutes = 180;
                } else if (lowerLeague.includes('turkey')) {
                    offsetMinutes = 180;
                } else if (lowerLeague.includes('spain') || lowerLeague.includes('la liga')) {
                    offsetMinutes = 60;
                } else if (lowerLeague.includes('italy') || lowerLeague.includes('serie a')) {
                    offsetMinutes = 60;
                } else if (lowerLeague.includes('germany') || lowerLeague.includes('bundesliga')) {
                    offsetMinutes = 60;
                } else if (lowerLeague.includes('france') || lowerLeague.includes('ligue')) {
                    offsetMinutes = 60;
                } else if (lowerLeague.includes('netherlands') || lowerLeague.includes('eredivisie')) {
                    offsetMinutes = 60;
                } else if (lowerLeague.includes('portugal')) {
                    offsetMinutes = 0;
                }
            }
            
            // Create UTC date with offset applied
            const utcDate = new Date(Date.UTC(year, month - 1, day, hour - Math.floor(offsetMinutes / 60), minute - (offsetMinutes % 60)));
            
            if (isNaN(utcDate.getTime())) {
                throw new Error('Invalid date');
            }
            
            return utcDate.toISOString();
        } catch (err) {
            logger.warn(`Failed to convert local time to UTC: ${dateStr} ${timeStr}`, err.message);
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() + 1);
            fallbackDate.setUTCHours(12, 0, 0, 0);
            return fallbackDate.toISOString();
        }
    }

    /**
     * Validate and normalize UTC time string
     * @param {string} timeStr - Time string to validate
     * @returns {string} Valid UTC ISO string or null
     */
    normalizeUTCString(timeStr) {
        if (!timeStr) return null;
        
        try {
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) {
                logger.warn(`Invalid time string: ${timeStr}`);
                return null;
            }
            return date.toISOString();
        } catch (err) {
            logger.warn(`Failed to normalize time: ${timeStr}`, err.message);
            return null;
        }
    }

    /**
     * Main sync entry point - Fetch matches from all sources
     */
    async syncAllMatches() {
        logger.info('🔄 Starting intelligent multi-source match data sync...');
        const startTime = Date.now();

        try {
            // Parallel fetch from all enabled data sources
            const [footballData, theSportsDB, openLigadata] = await Promise.allSettled([
                this.fetchFootballDataOrg(),
                this.fetchTheSportsDB(),
                this.fetchOpenLigadata()
            ]);

            const allMatches = [];
            
            if (footballData.status === 'fulfilled' && footballData.value) {
                allMatches.push(...footballData.value);
                logger.info(`📊 football-data.org: ${footballData.value.length} matches`);
            }
            if (theSportsDB.status === 'fulfilled' && theSportsDB.value) {
                allMatches.push(...theSportsDB.value);
                logger.info(`📊 TheSportsDB: ${theSportsDB.value.length} matches`);
            }
            if (openLigadata.status === 'fulfilled' && openLigadata.value) {
                allMatches.push(...openLigadata.value);
                logger.info(`📊 OpenLigadata: ${openLigadata.value.length} matches`);
            }

            logger.info(`📊 Raw data total: ${allMatches.length} matches`);

            // Deduplication and merge
            const merged = this.mergeMatches(allMatches);
            logger.info(`📦 After deduplication: ${merged.length} matches`);

            // Sort by priority
            const sorted = this.sortByPriority(merged);
            
            // Save to database
            const result = await this.saveMatches(sorted);
            
            // Calculate daily match distribution
            const dailyStats = this.getDailyStats(sorted);
            logger.info(`📅 Next 14 days match distribution: ${JSON.stringify(dailyStats)}`);
            
            logger.info(`✅ Sync completed: ${result.added} added, ${result.updated} updated, duration ${Date.now() - startTime}ms`);
            return { success: true, ...result, dailyStats };
        } catch (error) {
            logger.error('Sync failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fetch matches from football-data.org (European top leagues)
     * Requires API key from https://www.football-data.org/
     * Returns matches with UTC time already (API returns utcDate)
     */
    async fetchFootballDataOrg() {
        if (!this.footballDataKey) {
            logger.warn('FOOTBALL_API_KEY not configured, skipping football-data.org');
            return [];
        }
        
        const competitions = [
            'PL', 'PD', 'SA', 'BL1', 'FL1',  // Top 5 leagues
            'CL', 'EL', 'EC',                 // European competitions
            'ELC', 'EL1', 'EL2',              // English lower leagues
            'DED', 'PPL', 'BEL',              // Netherlands, Portugal, Belgium
            'RPL', 'TUR', 'AUT', 'SUI', 'CZE', // Other European
            'BSA', 'AGP'                      // Brazil, Argentina
        ];
        
        const matches = [];
        const today = new Date();
        const future = new Date();
        future.setDate(today.getDate() + 14);
        const dateFrom = today.toISOString().split('T')[0];
        const dateTo = future.toISOString().split('T')[0];

        for (const comp of competitions) {
            const url = `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
            try {
                const res = await fetch(url, {
                    headers: { 'X-Auth-Token': this.footballDataKey }
                });
                if (!res.ok) {
                    logger.debug(`football-data ${comp} returned ${res.status}`);
                    continue;
                }
                const data = await res.json();
                if (data.matches && data.matches.length > 0) {
                    for (const m of data.matches) {
                        const normalized = this.normalizeFootballData(m);
                        if (normalized && normalized.match_time) {
                            matches.push(normalized);
                        }
                    }
                }
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                logger.debug(`football-data ${comp} error:`, err.message);
            }
        }
        return matches;
    }

    /**
     * Fetch matches from TheSportsDB (global football, completely free)
     * No API key required
     * URL: https://www.thesportsdb.com/
     * 
     * Note: TheSportsDB returns local match times, need to convert to UTC
     */
    async fetchTheSportsDB() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        // Get today's football matches (s=4328 is football/soccer sport ID)
        const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=4328`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) {
                logger.debug(`TheSportsDB returned ${res.status}`);
                return [];
            }
            const data = await res.json();
            
            if (!data.events || data.events.length === 0) {
                return [];
            }
            
            const todayStart = new Date();
            todayStart.setUTCHours(0, 0, 0, 0);
            
            // Filter to only keep football matches from today or future
            const footballEvents = data.events.filter(e => {
                // Filter out past dates
                if (e.dateEvent) {
                    const eventDate = new Date(e.dateEvent);
                    if (eventDate < todayStart) return false;
                }
                
                const sport = (e.strSport || '').toLowerCase();
                const league = (e.strLeague || '').toLowerCase();
                
                // Non-football sports to exclude
                const nonFootball = ['basketball', 'baseball', 'american', 'rugby', 'tennis', 'golf', 'hockey', 'cricket', 'volleyball'];
                
                if (sport === 'soccer' || sport === 'football') return true;
                if (league.includes('soccer') || league.includes('football')) return true;
                if (nonFootball.some(exclude => sport.includes(exclude) || league.includes(exclude))) return false;
                return true;
            });
            
            if (footballEvents.length > 0) {
                logger.info(`📊 TheSportsDB: Found ${footballEvents.length} football matches today`);
            }
            
            const normalizedMatches = [];
            for (const e of footballEvents) {
                const normalized = this.normalizeTheSportsDB(e);
                if (normalized && normalized.match_time) {
                    normalizedMatches.push(normalized);
                }
            }
            
            return normalizedMatches;
        } catch (err) {
            logger.error('TheSportsDB sync failed:', err.message);
            return [];
        }
    }

    /**
     * Fetch matches from OpenLigadata (German leagues, completely free)
     * No API key required
     * Covers: Bundesliga, 2. Bundesliga, 3. Liga
     * URL: https://www.openligadata.de/
     */
    async fetchOpenLigadata() {
        const matches = [];
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        // German leagues to fetch
        const leagues = [
            { id: 1, name: 'Bundesliga' },
            { id: 2, name: '2. Bundesliga' },
            { id: 3, name: '3. Liga' }
        ];
        
        for (const league of leagues) {
            const url = `https://www.openligadata.de/api/v1/sportsoccer/leagues/${league.id}/matches/${dateStr}`;
            
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    logger.debug(`OpenLigadata ${league.name} returned ${res.status}`);
                    continue;
                }
                const data = await res.json();
                
                if (data && data.matches && data.matches.length > 0) {
                    for (const m of data.matches) {
                        const normalized = this.normalizeOpenLigadata(m, league.name);
                        if (normalized && normalized.match_time) {
                            matches.push(normalized);
                        }
                    }
                    logger.info(`📊 OpenLigadata ${league.name}: ${data.matches.length} matches`);
                }
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err) {
                logger.debug(`OpenLigadata ${league.name} fetch failed:`, err.message);
            }
        }
        
        return matches;
    }

    /**
     * Normalize OpenLigadata match data
     */
    normalizeOpenLigadata(m, leagueName) {
        try {
            let matchTimeUTC = null;
            
            if (m.matchDateTime) {
                // OpenLigadata returns ISO strings in CET/CEST
                matchTimeUTC = this.normalizeUTCString(m.matchDateTime);
                
                // If normalization fails, try to convert from local time
                if (!matchTimeUTC && m.matchDateTime) {
                    const dateMatch = m.matchDateTime.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
                    if (dateMatch) {
                        matchTimeUTC = this.convertLocalToUTC(
                            `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
                            `${dateMatch[4]}:${dateMatch[5]}`,
                            leagueName
                        );
                    }
                }
            }
            
            if (!matchTimeUTC) {
                logger.warn(`OpenLigadata: No valid match time for ${m.team1?.name} vs ${m.team2?.name}`);
                return null;
            }
            
            return {
                external_id: m.matchID ? String(m.matchID) : null,
                source: 'openligadata',
                home_team: m.team1?.name || null,
                away_team: m.team2?.name || null,
                league: leagueName,
                match_time: matchTimeUTC,
                home_logo: null,
                away_logo: null,
                status: this.mapOpenLigadataStatus(m.matchStatus),
                home_score: m.goals?.team1 !== undefined ? m.goals.team1 : null,
                away_score: m.goals?.team2 !== undefined ? m.goals.team2 : null
            };
        } catch (err) {
            logger.warn(`OpenLigadata normalization failed:`, err.message);
            return null;
        }
    }

    /**
     * Normalize TheSportsDB match data
     * Converts local match time to UTC
     */
    normalizeTheSportsDB(e) {
        try {
            let matchTimeUTC = null;
            
            if (e.dateEvent) {
                const dateStr = e.dateEvent;
                let timeStr = '12:00';
                if (e.strTime && e.strTime !== '') {
                    timeStr = e.strTime;
                }
                
                const leagueName = e.strLeague || e.strSport || 'default';
                matchTimeUTC = this.convertLocalToUTC(dateStr, timeStr, leagueName);
            }
            
            if (!matchTimeUTC) {
                logger.warn(`TheSportsDB: No valid match time for ${e.strHomeTeam} vs ${e.strAwayTeam}`);
                return null;
            }
            
            return {
                external_id: e.idEvent ? String(e.idEvent) : null,
                source: 'thesportsdb',
                home_team: e.strHomeTeam || null,
                away_team: e.strAwayTeam || null,
                league: e.strLeague || e.strSport || 'International',
                match_time: matchTimeUTC,
                home_logo: e.strHomeTeamBadge || null,
                away_logo: e.strAwayTeamBadge || null,
                status: this.mapTheSportsDBStatus(e.strStatus),
                home_score: e.intHomeScore ? parseInt(e.intHomeScore) : null,
                away_score: e.intAwayScore ? parseInt(e.intAwayScore) : null
            };
        } catch (err) {
            logger.warn(`TheSportsDB normalization failed:`, err.message);
            return null;
        }
    }

    /**
     * Map TheSportsDB match status
     */
    mapTheSportsDBStatus(status) {
        const statusMap = {
            'NS': 'upcoming',
            '1H': 'live',
            '2H': 'live',
            'HT': 'live',
            'FT': 'finished',
            'AET': 'finished',
            'PEN': 'finished',
            'CANC': 'cancelled',
            'PST': 'postponed'
        };
        return statusMap[status] || 'upcoming';
    }

    /**
     * Map OpenLigadata match status
     */
    mapOpenLigadataStatus(status) {
        const statusMap = {
            'SCHEDULED': 'upcoming',
            'LIVE': 'live',
            'HALFTIME': 'live',
            'FULLTIME': 'finished',
            'FINISHED': 'finished',
            'CANCELED': 'cancelled',
            'POSTPONED': 'postponed'
        };
        return statusMap[status] || 'upcoming';
    }

    /**
     * Normalize football-data.org match data
     * API returns UTC time directly (utcDate field)
     */
    normalizeFootballData(m) {
        try {
            let matchTimeUTC = null;
            
            if (m.utcDate) {
                matchTimeUTC = this.normalizeUTCString(m.utcDate);
            }
            
            if (!matchTimeUTC) {
                logger.warn(`Football-data: No valid match time for ${m.homeTeam?.name} vs ${m.awayTeam?.name}`);
                return null;
            }
            
            return {
                external_id: m.id ? String(m.id) : null,
                source: 'football-data',
                home_team: m.homeTeam?.name || null,
                away_team: m.awayTeam?.name || null,
                league: m.competition?.name || 'Unknown',
                match_time: matchTimeUTC,
                home_logo: m.homeTeam?.crest || null,
                away_logo: m.awayTeam?.crest || null,
                status: this.mapStatus(m.status),
                home_score: m.score?.fullTime?.home !== undefined ? m.score.fullTime.home : null,
                away_score: m.score?.fullTime?.away !== undefined ? m.score.fullTime.away : null
            };
        } catch (err) {
            logger.warn(`Football-data normalization failed:`, err.message);
            return null;
        }
    }

    /**
     * Sort matches by priority
     */
    sortByPriority(matches) {
        return matches.sort((a, b) => {
            const aPriority = this.leaguePriority[a.league] || this.leaguePriority.default;
            const bPriority = this.leaguePriority[b.league] || this.leaguePriority.default;
            if (aPriority === bPriority) {
                try {
                    return new Date(a.match_time) - new Date(b.match_time);
                } catch {
                    return 0;
                }
            }
            return aPriority - bPriority;
        });
    }

    /**
     * Get daily match distribution statistics
     */
    getDailyStats(matches) {
        const stats = {};
        for (const match of matches) {
            if (match.match_time) {
                const date = match.match_time.split('T')[0];
                stats[date] = (stats[date] || 0) + 1;
            }
        }
        return stats;
    }

    /**
     * Map generic match status
     */
    mapStatus(status) {
        const statusMap = {
            'SCHEDULED': 'upcoming',
            'TIMED': 'upcoming',
            'TBD': 'upcoming',
            'NS': 'upcoming',
            'IN_PLAY': 'live',
            'PAUSED': 'live',
            'LIVE': 'live',
            '1H': 'live',
            '2H': 'live',
            'HT': 'live',
            'FT': 'finished',
            'AET': 'finished',
            'PEN': 'finished',
            'FINISHED': 'finished'
        };
        return statusMap[status] || 'upcoming';
    }

    /**
     * Merge and deduplicate matches from multiple sources
     */
    mergeMatches(matches) {
        const map = new Map();
        for (const m of matches) {
            if (!m || !m.home_team || !m.away_team || !m.match_time) continue;
            
            // Use home_team, away_team, and match date for deduplication key
            const matchDate = m.match_time.split('T')[0];
            const key = `${m.home_team}_${m.away_team}_${matchDate}`;
            
            if (!map.has(key)) {
                map.set(key, m);
            } else {
                const existing = map.get(key);
                // Merge with priority: keep the one with higher priority league
                const existingPriority = this.leaguePriority[existing.league] || this.leaguePriority.default;
                const newPriority = this.leaguePriority[m.league] || this.leaguePriority.default;
                
                if (newPriority < existingPriority) {
                    // New match has higher priority, replace
                    map.set(key, {
                        ...m,
                        home_logo: m.home_logo || existing.home_logo,
                        away_logo: m.away_logo || existing.away_logo,
                        source: `${m.source},${existing.source}`
                    });
                } else {
                    // Keep existing, merge additional info
                    map.set(key, {
                        ...existing,
                        home_score: m.home_score ?? existing.home_score,
                        away_score: m.away_score ?? existing.away_score,
                        home_logo: m.home_logo || existing.home_logo,
                        away_logo: m.away_logo || existing.away_logo,
                        source: `${existing.source},${m.source}`
                    });
                }
            }
        }
        return Array.from(map.values());
    }

    /**
     * Save matches to database (upsert)
     * All match_time values are already in UTC ISO format
     */
    async saveMatches(matches) {
        const db = getDb();
        let added = 0, updated = 0;

        const stmt = db.prepare(`
            INSERT INTO matches (
                match_id, home_team, away_team, league, match_time,
                cutoff_time, execution_rate, min_authorization, match_limit,
                home_logo, away_logo, status, home_score, away_score,
                external_id, source, last_sync, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                home_team = excluded.home_team,
                away_team = excluded.away_team,
                league = excluded.league,
                match_time = excluded.match_time,
                home_logo = excluded.home_logo,
                away_logo = excluded.away_logo,
                status = excluded.status,
                home_score = excluded.home_score,
                away_score = excluded.away_score,
                external_id = excluded.external_id,
                source = excluded.source,
                last_sync = excluded.last_sync,
                updated_at = CURRENT_TIMESTAMP
        `);

        for (const m of matches) {
            if (!m.match_time) {
                logger.warn(`Skipping match without match_time: ${m.home_team} vs ${m.away_team}`);
                continue;
            }
            
            // Generate match_id
            const matchId = m.external_id ? `ext_${m.external_id}` : `gen_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            
            // Calculate cutoff time (5 minutes before match start)
            let cutoffTime;
            try {
                const matchDate = new Date(m.match_time);
                if (isNaN(matchDate.getTime())) {
                    // Fallback: set cutoff to 1 day from now
                    const fallbackDate = new Date();
                    fallbackDate.setDate(fallbackDate.getDate() + 1);
                    cutoffTime = new Date(fallbackDate.getTime() - 5 * 60 * 1000).toISOString();
                } else {
                    cutoffTime = new Date(matchDate.getTime() - 5 * 60 * 1000).toISOString();
                }
            } catch (err) {
                const fallbackDate = new Date();
                fallbackDate.setDate(fallbackDate.getDate() + 1);
                cutoffTime = new Date(fallbackDate.getTime() - 5 * 60 * 1000).toISOString();
            }
            
            try {
                stmt.run(
                    matchId,
                    m.home_team,
                    m.away_team,
                    m.league || 'International',
                    m.match_time,
                    cutoffTime,
                    30,      // Default execution rate
                    100,     // Default minimum authorization amount (USDT)
                    500,     // Default match limit (USDT)
                    m.home_logo || null,
                    m.away_logo || null,
                    m.status || 'upcoming',
                    m.home_score !== undefined && m.home_score !== null ? m.home_score : null,
                    m.away_score !== undefined && m.away_score !== null ? m.away_score : null,
                    m.external_id || null,
                    m.source || 'football-data',
                    new Date().toISOString(),
                    1        // Active by default
                );
                added++;
            } catch (err) {
                logger.error(`Failed to save match: ${m.home_team} vs ${m.away_team}`, err.message);
            }
        }
        
        return { added, updated };
    }

    /**
     * Disabled: API-Football (free tier only supports 2022-2024 seasons)
     */
    async fetchAPIFootballAllLeagues() {
        logger.info('⚠️ API-Football free tier does not support 2026 season, temporarily disabled');
        return [];
    }

    /**
     * Disabled: Sportmonks (v2 deprecated, v3 requires payment)
     */
    async fetchSportmonks() {
        logger.info('⚠️ Sportmonks API v2 deprecated, temporarily disabled');
        return [];
    }
}

// Export singleton instance
export default new DataSyncService();