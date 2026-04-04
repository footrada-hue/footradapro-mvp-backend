/**
 * 檢查清算結果
 * 運行: node check-settlement.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

// 改為查詢比賽 ID 74
const matchId = 74;

console.log(`\n📊 比賽${matchId}清算結果:`);

// 1. 比賽狀態
db.get('SELECT id, status, result FROM matches WHERE id = ?', [matchId], (err, match) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        console.log('比賽狀態:', match || '找不到比賽');
    }
});

// 2. 授權清算明細
db.all('SELECT user_id, amount, status, profit, platform_fee FROM authorizations WHERE match_id = (SELECT match_id FROM matches WHERE id = ?)', [matchId], (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        console.log('\n📝 授權清算明細:');
        if (rows.length === 0) {
            console.log('   沒有找到授權記錄');
        } else {
            rows.forEach(r => {
                console.log(`   用戶 ${r.user_id}: ${r.amount} USDT, 狀態: ${r.status}, 收益: ${r.profit}, 平台抽成: ${r.platform_fee}`);
            });
        }
    }
});

// 3. 餘額變動記錄
db.all('SELECT user_id, amount, balance_before, balance_after, type FROM balance_logs WHERE type = \'settlement\' ORDER BY created_at DESC LIMIT 10', (err, rows) => {
    if (err) {
        console.error('❌ 錯誤:', err.message);
    } else {
        console.log('\n💰 餘額變動記錄:');
        if (rows.length === 0) {
            console.log('   沒有找到餘額變動記錄');
        } else {
            rows.forEach(r => {
                console.log(`   用戶 ${r.user_id}: ${r.amount} USDT (餘額: ${r.balance_before} → ${r.balance_after})`);
            });
        }
    }
    
    // 4. 用戶最終餘額
    setTimeout(() => {
        db.all('SELECT id, username, balance FROM users WHERE id IN (9991,9992,9993,9994)', (err, users) => {
            console.log('\n💵 用戶最終餘額:');
            if (users && users.length > 0) {
                users.forEach(u => {
                    console.log(`   ${u.username} (ID:${u.id}): ${u.balance} USDT`);
                });
            } else {
                console.log('   沒有找到測試用戶');
            }
            db.close();
        });
    }, 500);
});