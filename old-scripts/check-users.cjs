/**
 * 檢查 users 表結構
 * 運行: node check-users.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📋 users 表結構查詢\n');

db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        console.log('字段列表:');
        rows.forEach(col => {
            console.log(`   ${col.name.padEnd(20)} ${col.type.padEnd(10)} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
        });
    }
    db.close();
});