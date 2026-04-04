/**
 * 查看最近比賽列表
 * 運行: node check-matches-list.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('\n📋 最近5場比賽:\n');

db.all('SELECT id, home_team, away_team, execution_rate, status FROM matches ORDER BY id DESC LIMIT 5', (err, rows) => {
    if (err) {
        console.error('❌ 查詢失敗:', err.message);
    } else {
        rows.forEach(r => {
            console.log(`   ID: ${r.id}, ${r.home_team} vs ${r.away_team}, 比例: ${r.execution_rate}%, 狀態: ${r.status}`);
        });
    }
    db.close();
});