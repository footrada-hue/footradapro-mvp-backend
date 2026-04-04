/**
 * 檢查比賽76的狀態
 * 運行: node check-matches-76.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📋 最近5場比賽:\n');

db.all('SELECT id, match_id, home_team, away_team, status FROM matches ORDER BY id DESC LIMIT 5', (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        rows.forEach(r => {
            console.log(`ID: ${r.id}, ${r.home_team} vs ${r.away_team}`);
            console.log(`   狀態: ${r.status}, match_id: ${r.match_id}`);
            console.log('---');
        });
        
        // 特別檢查 ID 76
        const match76 = rows.find(r => r.id === 76);
        if (match76) {
            console.log('\n🎯 比賽76詳情:');
            console.log(`   ID: ${match76.id}`);
            console.log(`   match_id: ${match76.match_id}`);
            console.log(`   狀態: ${match76.status}`);
            console.log(`   比賽: ${match76.home_team} vs ${match76.away_team}`);
        } else {
            console.log('\n❌ 比賽76不在最近5場中');
        }
    }
    db.close();
});