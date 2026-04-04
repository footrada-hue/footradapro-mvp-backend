/**
 * 重置測試數據 - 一鍵重建比賽和授權
 * 運行: node reset-test-data.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🚀 開始重置測試數據...\n');

// 開始事務
db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. 清理舊的測試數據
    console.log('🧹 清理舊數據...');
    
    // 刪除比賽60的授權
    db.run(`DELETE FROM authorizations WHERE match_id = (SELECT match_id FROM matches WHERE id = 60)`, function(err) {
        if (err) console.log('❌ 刪除授權失敗:', err.message);
        else console.log(`   ✅ 已刪除 ${this.changes} 條授權`);
    });

    // 刪除比賽60
    db.run(`DELETE FROM matches WHERE id = 60`, function(err) {
        if (err) console.log('❌ 刪除比賽失敗:', err.message);
        else console.log(`   ✅ 已刪除比賽 ID 60`);
    });

    // 2. 創建新的測試比賽
    console.log('\n📅 創建測試比賽...');
    
    const matchId = 'match_' + Date.now();
    const matchTime = new Date();
    matchTime.setDate(matchTime.getDate() - 1); // 昨天
    const matchTimeStr = matchTime.toISOString();
    
    db.run(`
        INSERT INTO matches (
            match_id, home_team, away_team, league,
            match_time, cutoff_time, status,
            execution_rate, min_authorization, match_limit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        matchId,
        'FC Barcelona',
        'Newcastle United FC',
        'Champions League',
        matchTimeStr,
        matchTimeStr,
        'finished',
        30,
        100,
        500
    ], function(err) {
        if (err) {
            console.log('❌ 創建比賽失敗:', err.message);
        } else {
            const newMatchId = this.lastID;
            console.log(`   ✅ 創建比賽成功 ID: ${newMatchId}, match_id: ${matchId}`);
            
            // 3. 創建測試用戶（如果不存在）
            console.log('\n👤 創建測試用戶...');
            
            const users = [
                { id: 9991, username: '清算測試A', balance: 1000 },
                { id: 9992, username: '清算測試B', balance: 2000 },
                { id: 9993, username: '清算測試C', balance: 500 },
                { id: 9994, username: '清算測試D', balance: 3000 }
            ];

            users.forEach(user => {
                db.run(`
                    INSERT OR IGNORE INTO users (
                        id, uid, username, password, balance, role, status,
                        created_at, updated_at, is_new_user, has_claimed_bonus,
                        completed_steps, vip_level, total_authorized, total_profit,
                        account_status, total_settled
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    user.id,
                    'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
                    user.username,
                    'password123',
                    user.balance,
                    'user',
                    'active',
                    1,  // is_new_user
                    0,  // has_claimed_bonus
                    0,  // completed_steps
                    0,  // vip_level
                    0,  // total_authorized
                    0,  // total_profit
                    'active',  // account_status
                    0   // total_settled
                ], function(err) {
                    if (err) {
                        console.log(`   ❌ 創建用戶 ${user.username} 失敗:`, err.message);
                    } else if (this.changes > 0) {
                        console.log(`   ✅ 創建用戶: ${user.username} (ID:${user.id}) 餘額: ${user.balance} USDT`);
                    }
                });
            });

            // 4. 創建測試授權
            console.log('\n📝 創建測試授權...');

            const authorizations = [
                { user_id: 9991, amount: 100, prediction: 'home' },
                { user_id: 9992, amount: 200, prediction: 'away' },
                { user_id: 9993, amount: 150, prediction: 'draw' },
                { user_id: 9994, amount: 300, prediction: 'home' },
                { user_id: 9991, amount: 250, prediction: 'away' }
            ];

            let authCount = 0;
            authorizations.forEach((auth, index) => {
                const authId = 'test_' + Date.now() + '_' + index;
                const executedAmount = auth.amount * 0.3; // 30% 執行比例

                db.run(`
                    INSERT INTO authorizations (
                        auth_id, user_id, match_id, amount, executed_amount,
                        status, created_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                `, [
                    authId,
                    auth.user_id,
                    matchId,
                    auth.amount,
                    executedAmount
                ], function(err) {
                    if (err) {
                        console.log(`   ❌ 授權失敗: 用戶 ${auth.user_id} ${auth.amount} USDT -`, err.message);
                    } else {
                        authCount++;
                        console.log(`   ✅ 用戶 ${auth.user_id} 授權 ${auth.amount} USDT (執行比例 30%)`);
                    }
                });
            });

            // 提交事務
            setTimeout(() => {
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.log('❌ 提交事務失敗:', err.message);
                    } else {
                        console.log('\n📊 測試數據統計:');
                        console.log(`   🏆 比賽: FC Barcelona vs Newcastle United FC (ID: ${newMatchId})`);
                        console.log(`   👥 用戶: 4 個測試用戶`);
                        console.log(`   📝 授權: ${authCount} 條授權記錄`);
                        console.log(`   💰 總授權金額: ${authorizations.reduce((sum, a) => sum + a.amount, 0)} USDT`);
                        
                        console.log('\n✅ 測試數據重置完成！');
                        console.log('現在可以到後台清算頁面查看待結算比賽');
                    }
                    db.close();
                });
            }, 500);
        }
    });
});