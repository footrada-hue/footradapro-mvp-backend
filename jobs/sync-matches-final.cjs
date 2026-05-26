/**
 * 最終版同步腳本 - 使用 UTC 時間
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

const API_KEY = process.env.FOOTBALL_API_KEY || process.env.FOOTBALL_DATA_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

const COMPETITIONS = [
  { id: 2021, name: 'Premier League' },
  { id: 2014, name: 'La Liga' },
  { id: 2019, name: 'Serie A' },
  { id: 2002, name: 'Bundesliga' },
  { id: 2015, name: 'Ligue 1' },
  { id: 2001, name: 'Champions League' }
];

async function fetchMatches(competitionId) {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    const response = await axios.get(`${BASE_URL}/competitions/${competitionId}/matches`, {
      params: {
        dateFrom: today,
        dateTo: nextWeek,
        status: 'SCHEDULED'
      },
      headers: {
        'X-Auth-Token': API_KEY
      }
    });
    
    return response.data.matches || [];
  } catch (error) {
    console.error(`❌ 獲取聯賽 ${competitionId} 失敗:`, error.response?.data || error.message);
    return [];
  }
}

async function syncMatches() {
  console.log('🚀 開始同步比賽數據 (UTC 時間)...');
  console.log('🕒 當前 UTC 時間:', new Date().toISOString());
  
  let totalAdded = 0;
  let totalUpdated = 0;

  for (const comp of COMPETITIONS) {
    console.log(`\n🏆 處理聯賽: ${comp.name}`);
    const matches = await fetchMatches(comp.id);
    
    for (const match of matches) {
      const externalId = match.id.toString();
      const matchId = `match_${match.id}`;
      
      // API 返回的時間已經是 UTC
      const matchTime = match.utcDate; // 例如: '2026-03-16T20:00:00Z'
      
      // 獲取隊徽 URL
      const homeLogo = match.homeTeam?.crest || null;
      const awayLogo = match.awayTeam?.crest || null;
      
      console.log(`⚽ ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      console.log(`   🕒 比賽時間 (UTC): ${matchTime}`);

      await new Promise((resolve) => {
        db.get('SELECT id FROM matches WHERE external_id = ?', [externalId], (err, existing) => {
          if (err) {
            console.error('❌ 查詢失敗:', err);
            resolve();
            return;
          }
          
          if (existing) {
            // 更新現有比賽
            db.run(`
              UPDATE matches SET
                home_team = ?,
                away_team = ?,
                league = ?,
                match_time = ?,
                home_logo = ?,
                away_logo = ?,
                last_sync = CURRENT_TIMESTAMP
              WHERE external_id = ?
            `, [
              match.homeTeam.name,
              match.awayTeam.name,
              comp.name,
              matchTime,  // 直接存 UTC 時間
              homeLogo,
              awayLogo,
              externalId
            ], function(err) {
              if (err) {
                console.error(`❌ 更新失敗:`, err);
              } else {
                totalUpdated++;
                console.log(`   ✅ 更新成功`);
              }
              resolve();
            });
          } else {
            // 插入新比賽
            db.run(`
              INSERT INTO matches (
                match_id, external_id, league, 
                home_team, away_team,
                home_logo, away_logo,
                match_time, cutoff_time,
                status, execution_rate, is_active,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
              matchId,
              externalId,
              comp.name,
              match.homeTeam.name,
              match.awayTeam.name,
              homeLogo,
              awayLogo,
              matchTime,  // 比賽時間 (UTC)
              matchTime,  // 截止時間 = 比賽時間 (UTC)
              'upcoming',
              30,
              0  // 默認隱藏
            ], function(err) {
              if (err) {
                console.error(`❌ 插入失敗:`, err);
              } else {
                totalAdded++;
                console.log(`   ✅ 新增成功`);
              }
              resolve();
            });
          }
        });
      });
    }
    
    // 避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ ===== 同步完成 =====');
  console.log(`📊 新增: ${totalAdded} 場, 更新: ${totalUpdated} 場`);
  
  db.close();
}

syncMatches();