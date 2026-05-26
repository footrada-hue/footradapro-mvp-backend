/**
 * 最終版 - 根據實際表結構插入測試授權
 * 運行: node insert-test-auth-final.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 開始插入測試授權（最終版）...\n');

// 先獲取比賽信息
db.get('SELECT id, match_id, home_team, away_team, execution_rate FROM matches WHERE id = 60', (err, match) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
        db.close();
        return;
    }

    if (!match) {
        console.error('❌ 找不到比賽 ID 60');
        db.close();
        return;
    }

    const matchId = match.match_id;
    const executionRate = match.execution_rate || 30;
    
    console.log(`✅ 找到比賽: ${match.home_team} vs ${match.away_team}`);
    console.log(`   match_id: ${matchId}`);
    console.log(`   執行比例: ${executionRate}%`);
    console.log('');

    // 開始事務
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 創建測試用戶（如果不存在）
        const users = [
            { id: 9991, username: '清算測試A', balance: 1000 },
            { id: 9992, username: '清算測試B', balance: 2000 },
            { id: 9993, username: '清算測試C', balance: 500 },
            { id: 9994, username: '清算測試D', balance: 3000 }
        ];

        console.log('👤 創建/檢查用戶:');
        users.forEach(user => {
            db.run(`
                INSERT OR IGNORE INTO users (id, username, email, password, balance, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [user.id, user.username, `${user.username}@test.com`, 'password123', user.balance], function(err) {
                if (!err && this.changes > 0) {
                    console.log(`   ✅ 創建用戶: ${user.username} (ID: ${user.id})`);
                }
            });
        });

        // 等待用戶創建完成
        setTimeout(() => {
            console.log('\n📝 插入授權記錄:');

            // 授權數據
            const authorizations = [
                { user_id: 9991, amount: 100 },
                { user_id: 9992, amount: 200 },
                { user_id: 9993, amount: 150 },
                { user_id: 9994, amount: 300 },
                { user_id: 9991, amount: 250 }
            ];

            let successCount = 0;
            let totalAmount = 0;

            authorizations.forEach((auth, index) => {
                const authId = `test_${Date.now()}_${index}`;
                const executedAmount = auth.amount * (executionRate / 100);
                
                db.run(`
                    INSERT INTO authorizations (
                        auth_id, 
                        user_id, 
                        match_id, 
                        amount, 
                        executed_amount, 
                        status, 
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                `, [
                    authId,
                    auth.user_id,
                    matchId,
                    auth.amount,
                    executedAmount
                ], function(err) {
                    if (err) {
                        console.error(`   ❌ 用戶 ${auth.user_id} 授權 ${auth.amount} USDT 失敗:`, err.message);
                    } else {
                        successCount++;
                        totalAmount += auth.amount;
                        console.log(`   ✅ 用戶 ${auth.user_id} 授權 ${auth.amount} USDT (部署: ${executedAmount.toFixed(2)} USDT)`);
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
                                SUM(amount) as total_amount,
                                SUM(executed_amount) as total_executed
                            FROM authorizations 
                            WHERE match_id = ?
                        `, [matchId], (err, rows) => {
                            if (!err && rows[0]) {
                                console.log(`\n📈 比賽 ${matchId} 授權統計:`);
                                console.log(`   總授權數: ${rows[0].total}`);
                                console.log(`   總金額: ${rows[0].total_amount} USDT`);
                                console.log(`   總部署金額: ${rows[0].total_executed.toFixed(2)} USDT`);
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