/**
 * 創建測試用戶
 * 運行: node create-test-users.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

const users = [
    { id: 9991, username: '清算測試A', balance: 1000 },
    { id: 9992, username: '清算測試B', balance: 2000 },
    { id: 9993, username: '清算測試C', balance: 500 },
    { id: 9994, username: '清算測試D', balance: 3000 }
];

console.log('開始創建測試用戶...\n');

let completed = 0;
users.forEach(user => {
    db.run(
        `INSERT OR IGNORE INTO users (id, username, email, password, balance, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [user.id, user.username, user.username + '@test.com', 'password123', user.balance],
        function(err) {
            if (err) {
                console.log('❌ 失敗:', user.username, err.message);
            } else if (this.changes > 0) {
                console.log('✅ 創建用戶:', user.username, 'ID:', user.id, '餘額:', user.balance, 'USDT');
            } else {
                console.log('ℹ️ 用戶已存在:', user.username, 'ID:', user.id);
            }
            
            completed++;
            if (completed === users.length) {
                // 顯示所有用戶
                db.all('SELECT id, username, balance FROM users WHERE id IN (9991,9992,9993,9994)', (err, rows) => {
                    console.log('\n📊 當前用戶列表:');
                    rows.forEach(r => console.log(`   ID: ${r.id}, 用戶名: ${r.username}, 餘額: ${r.balance} USDT`));
                    db.close();
                });
            }
        }
    );
});