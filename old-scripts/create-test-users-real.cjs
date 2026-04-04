/**
 * 根據實際表結構創建測試用戶
 * 運行: node create-test-users-real.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

// 生成唯一 uid 的函數
function generateUid() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

const users = [
    { id: 9991, username: '清算測試A', balance: 1000 },
    { id: 9992, username: '清算測試B', balance: 2000 },
    { id: 9993, username: '清算測試C', balance: 500 },
    { id: 9994, username: '清算測試D', balance: 3000 }
];

console.log('開始創建測試用戶...\n');

let completed = 0;
users.forEach(user => {
    const uid = generateUid();
    
    db.run(
        `INSERT OR IGNORE INTO users (
            id, uid, username, password, balance, 
            role, status, created_at, updated_at,
            is_new_user, has_claimed_bonus, completed_steps,
            vip_level, total_authorized, total_profit,
            account_status, total_settled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            user.id,                    // id
            uid,                         // uid
            user.username,               // username
            'password123',               // password
            user.balance,                // balance
            'user',                      // role
            'active',                    // status
            1,                           // is_new_user
            0,                           // has_claimed_bonus
            0,                           // completed_steps
            0,                           // vip_level
            0,                           // total_authorized
            0,                           // total_profit
            'active',                    // account_status
            0                            // total_settled
        ],
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
                    if (rows.length === 0) {
                        console.log('   沒有找到用戶');
                    } else {
                        rows.forEach(r => console.log(`   ID: ${r.id}, 用戶名: ${r.username}, 餘額: ${r.balance} USDT`));
                    }
                    db.close();
                });
            }
        }
    );
});