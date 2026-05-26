/**
 * 手動更新現有比賽的隊徽
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

const API_KEY = process.env.FOOTBALL_API_KEY || process.env.FOOTBALL_DATA_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

async function updateTeamLogos() {
  console.log('🔄 開始更新隊徽...');
  
  // 獲取所有有 external_id 但沒有隊徽的比賽
  db.all(`
    SELECT id, external_id, home_team, away_team 
    FROM matches 
    WHERE external_id IS NOT NULL 
      AND (home_logo IS NULL OR away_logo IS NULL)
  `, async (err, matches) => {
    if (err) {
      console.error('❌ 查詢失敗:', err);
      return;
    }

    console.log(`📊 找到 ${matches.length} 場需要更新隊徽的比賽`);

    for (const match of matches) {
      try {
        // 通過 external_id 獲取比賽詳情
        const response = await axios.get(`${BASE_URL}/matches/${match.external_id}`, {
          headers: { 'X-Auth-Token': API_KEY }
        });

        const matchData = response.data;
        const homeLogo = matchData.match?.homeTeam?.crest || null;
        const awayLogo = matchData.match?.awayTeam?.crest || null;

        if (homeLogo || awayLogo) {
          db.run(`
            UPDATE matches SET 
              home_logo = ?,
              away_logo = ?,
              last_sync = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [homeLogo, awayLogo, match.id], function(err) {
            if (err) {
              console.error(`❌ 更新比賽 ${match.id} 失敗:`, err);
            } else {
              console.log(`✅ 比賽 ${match.id}: ${match.home_team} vs ${match.away_team} 隊徽已更新`);
            }
          });
        }

        // 避免限流
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ 獲取比賽 ${match.external_id} 失敗:`, error.message);
      }
    }

    console.log('\n✅ 隊徽更新完成');
    db.close();
  });
}

updateTeamLogos();