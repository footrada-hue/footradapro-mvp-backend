/**
 * 檢查真實用戶
 * 運行: node check-real-users.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📋 真實用戶列表:\n');

db.all('SELECT id, username, email, is_test_mode FROM users WHERE is_test_mode = 0 OR is_test_mode IS NULL LIMIT 10', (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        if (rows.length === 0) {
            console.log('   沒有找到真實用戶');
        } else {
            rows.forEach(r => {
                console.log(`ID: ${r.id}`);
                console.log(`   用戶名: ${r.username || '無'}`);
                console.log(`   email: ${r.email || '無'}`);
                console.log(`   測試模式: ${r.is_test_mode ? '是' : '否'}`);
                console.log('---');
            });
        }
    }
    db.close();
});