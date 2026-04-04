const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📊 比賽數據統計：\n');

db.serialize(() => {
  // 總比賽數
  db.get('SELECT COUNT(*) as total FROM matches', (err, row) => {
    console.log(`📈 總比賽數: ${row.total}`);
  });

  // 按聯賽統計
  db.all(`
    SELECT league, COUNT(*) as count 
    FROM matches 
    GROUP BY league 
    ORDER BY count DESC
  `, (err, rows) => {
    console.log('\n🏆 按聯賽統計：');
    rows.forEach(row => {
      console.log(`   ${row.league}: ${row.count} 場`);
    });
  });

  // 最近 5 場比賽
  db.all(`
    SELECT 
      league,
      home_team,
      away_team,
      substr(match_time, 1, 16) as match_time,
      is_active
    FROM matches 
    ORDER BY match_time 
    LIMIT 5
  `, (err, rows) => {
    console.log('\n⏰ 最近 5 場比賽：');
    rows.forEach(row => {
      console.log(`   ${row.match_time} | ${row.league} | ${row.home_team} vs ${row.away_team} | 前台顯示: ${row.is_active ? '✅' : '❌'}`);
    });
  });

  // 檢查 is_active 默認值
  db.get('SELECT COUNT(*) as inactive FROM matches WHERE is_active = 0', (err, row) => {
    console.log(`\n🔘 默認隱藏 (is_active=0): ${row.inactive} 場`);
  });

  db.get('SELECT COUNT(*) as active FROM matches WHERE is_active = 1', (err, row) => {
    console.log(`👁️ 前台顯示 (is_active=1): ${row.active} 場`);
  });
});

setTimeout(() => db.close(), 1000);