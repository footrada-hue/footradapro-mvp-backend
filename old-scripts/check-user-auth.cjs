/**
 * 檢查用戶 9991 的授權記錄
 * 運行: node check-user-auth.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📊 用戶 9991 的授權記錄查詢\n');

db.all(`
    SELECT a.*, m.home_team, m.away_team 
    FROM authorizations a
    JOIN matches m ON a.match_id = m.match_id
    WHERE a.user_id = 9991
`, (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        if (rows.length === 0) {
            console.log('   沒有找到任何記錄');
        } else {
            rows.forEach(r => {
                console.log(`ID: ${r.id}`);
                console.log(`   比賽: ${r.home_team} vs ${r.away_team}`);
                console.log(`   金額: ${r.amount} USDT`);
                console.log(`   狀態: ${r.status}`);
                console.log(`   match_id: ${r.match_id}`);
                console.log('---');
            });
        }
    }
    db.close();
});