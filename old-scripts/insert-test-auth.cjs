/**
 * 手動插入測試授權
 * 運行: node insert-test-auth.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 開始插入測試授權...\n');

// 先獲取比賽60的match_id
db.get('SELECT id, match_id, home_team, away_team FROM matches WHERE id = 60', (err, row) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
        db.close();
        return;
    }

    if (!row) {
        console.error('❌ 找不到比賽 ID 60');
        db.close();
        return;
    }

    const matchId = row.match_id;
    console.log(`✅ 找到比賽: ${row.home_team} vs ${row.away_team}`);
    console.log(`   match_id: ${matchId}`);
    console.log('');

    // 開始事務
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 檢查用戶是否存在，不存在則創建
        const users = [
            { id: 9991, name: '測試用戶A', balance: 1000 },
            { id: 9992, name: '測試用戶B', balance: 2000 },
            { id: 9993, name: '測試用戶C', balance: 500 },
            { id: 9994, name: '測試用戶D', balance: 3000 }
        ];

        console.log('👤 創建/檢查用戶:');
        users.forEach(user => {
            db.run(`
                INSERT OR IGNORE INTO users (id, username, email, password, balance, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [user.id, user.name, `${user.name}@test.com`, 'password123', user.balance], function(err) {
                if (!err && this.changes > 0) {
                    console.log(`   ✅ 創建用戶: ${user.name} (ID: ${user.id})`);
                }
            });
        });

        // 等待一下確保用戶創建完成
        setTimeout(() => {
            console.log('\n📝 插入授權記錄:');

            // 插入授權記錄
            const authorizations = [
                { auth_id: 'test_auth_1', user_id: 9991, amount: 100 },
                { auth_id: 'test_auth_2', user_id: 9992, amount: 200 },
                { auth_id: 'test_auth_3', user_id: 9993, amount: 150 },
                { auth_id: 'test_auth_4', user_id: 9994, amount: 300 },
                { auth_id: 'test_auth_5', user_id: 9991, amount: 250 }
            ];

            let successCount = 0;
            let totalAmount = 0;

            authorizations.forEach(auth => {
                db.run(`
                    INSERT INTO authorizations (auth_id, user_id, match_id, amount, status, created_at)
                    VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                `, [auth.auth_id, auth.user_id, matchId, auth.amount], function(err) {
                    if (err) {
                        console.error(`   ❌ 插入授權 ${auth.auth_id} 失敗:`, err.message);
                    } else {
                        successCount++;
                        totalAmount += auth.amount;
                        console.log(`   ✅ 用戶 ${auth.user_id} 授權 ${auth.amount} USDT`);
                    }
                });
            });

            // 提交事務
            setTimeout(() => {
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('❌ 提交事務失敗:', err);
                    } else {
                        console.log(`\n📊 統計結果:`);
                        console.log(`   成功插入: ${successCount} 條授權`);
                        console.log(`   總金額: ${totalAmount} USDT`);
                        
                        // 顯示最終統計
                        db.all(`
                            SELECT 
                                COUNT(*) as total,
                                SUM(amount) as total_amount
                            FROM authorizations 
                            WHERE match_id = ?
                        `, [matchId], (err, rows) => {
                            if (!err) {
                                console.log(`\n📈 比賽 ${matchId} 授權統計:`);
                                console.log(`   總授權數: ${rows[0].total}`);
                                console.log(`   總金額: ${rows[0].total_amount} USDT`);
                            }
                            
                            console.log('\n✅ 測試數據準備完成！');
                            console.log('現在可以到後台清算頁面查看待結算比賽');
                            db.close();
                        });
                    }
                });
            }, 500);
        }, 500);
    });
});