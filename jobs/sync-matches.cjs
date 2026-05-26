/**
 * FOOTRADAPRO - 比賽數據同步腳本 (CommonJS 版本)
 * 從 football-data.org 自動獲取比賽數據
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 數據庫連接
const dbPath = path.resolve(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

// API 配置
const API_KEY = process.env.FOOTBALL_API_KEY || process.env.FOOTBALL_DATA_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

// 要同步的聯賽 ID
const COMPETITIONS = [
  { id: 2021, name: 'Premier League' },      // 英超
  { id: 2014, name: 'La Liga' },             // 西甲
  { id: 2019, name: 'Serie A' },             // 意甲
  { id: 2002, name: 'Bundesliga' },          // 德甲
  { id: 2015, name: 'Ligue 1' },             // 法甲
  { id: 2001, name: 'Champions League' },     // 歐冠
  { id: 2146, name: 'Europa League' }         // 歐聯
];

// 獲取未來7天的比賽
async function fetchMatches(competitionId) {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  console.log(`📡 獲取聯賽 ${competitionId} 比賽: ${today} 至 ${nextWeek}`);
  
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
    
    console.log(`✅ 獲取到 ${response.data.matches?.length || 0} 場比賽`);
    return response.data.matches || [];
  } catch (error) {
    console.error(`❌ 獲取聯賽 ${competitionId} 失敗:`, error.response?.data || error.message);
    return [];
  }
}

// 同步到本地數據庫
async function syncMatches() {
  console.log('🔄 ===== 開始同步比賽數據 =====');
  console.log('🕒', new Date().toLocaleString());
  
  // 檢查數據庫中是否有 is_active 字段
  db.get("PRAGMA table_info(matches)", [], (err, rows) => {
    if (err) {
      console.error('❌ 檢查數據庫失敗:', err);
      return;
    }
  });
  
  for (const comp of COMPETITIONS) {
    console.log(`\n🏆 處理聯賽: ${comp.name}`);
    const matches = await fetchMatches(comp.id);
    
    for (const match of matches) {
      const externalId = match.id.toString();
      
      // 使用 Promise 包裝異步操作
      await new Promise((resolve, reject) => {
        db.get('SELECT id, is_active FROM matches WHERE external_id = ?', [externalId], (err, existing) => {
          if (err) {
            console.error(`❌ 查詢比賽失敗:`, err);
            reject(err);
            return;
          }
          
          const matchData = {
            external_id: externalId,
            league: comp.name,
            home_team: match.homeTeam.name,
            away_team: match.awayTeam.name,
            home_logo: null,
            away_logo: null,
            match_time: match.utcDate,
            status: 'upcoming',
            execution_rate: 30,
            is_active: existing ? existing.is_active : 0
          };
          
          if (existing) {
            // 更新現有比賽
            db.run(`
              UPDATE matches SET
                league = ?,
                home_team = ?,
                away_team = ?,
                match_time = ?,
                last_sync = CURRENT_TIMESTAMP
              WHERE external_id = ?
            `, [
              matchData.league,
              matchData.home_team,
              matchData.away_team,
              matchData.match_time,
              matchData.external_id
            ], function(err) {
              if (err) {
                console.error(`❌ 更新比賽失敗 ${matchData.home_team} vs ${matchData.away_team}:`, err);
                reject(err);
              } else {
                console.log(`🔄 更新比賽: ${matchData.home_team} vs ${matchData.away_team}`);
                resolve();
              }
            });
          } else {
            // 插入新比賽
            db.run(`
              INSERT INTO matches (
                external_id, league, home_team, away_team,
                home_logo, away_logo, match_time, status,
                execution_rate, is_active, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
              matchData.external_id,
              matchData.league,
              matchData.home_team,
              matchData.away_team,
              matchData.home_logo,
              matchData.away_logo,
              matchData.match_time,
              matchData.status,
              matchData.execution_rate,
              matchData.is_active
            ], function(err) {
              if (err) {
                console.error(`❌ 插入比賽失敗 ${matchData.home_team} vs ${matchData.away_team}:`, err);
                reject(err);
              } else {
                console.log(`✅ 新增比賽: ${matchData.home_team} vs ${matchData.away_team}`);
                resolve();
              }
            });
          }
        });
      });
    }
    
    // 避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ ===== 同步完成 =====');
}

// 定時任務：每天凌晨 3 點執行
cron.schedule('0 3 * * *', () => {
  console.log('⏰ 定時任務觸發：開始同步比賽數據');
  syncMatches().catch(console.error);
});

// 如果直接運行此文件，立即執行一次
if (require.main === module) {
  console.log('🚀 手動執行同步腳本');
  syncMatches().then(() => {
    console.log('👋 同步完成，關閉數據庫連接');
    db.close();
  }).catch(err => {
    console.error('❌ 同步失敗:', err);
    db.close();
  });
}

module.exports = { syncMatches };