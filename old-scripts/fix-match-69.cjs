/**
 * 修復比賽69的授權狀態
 * 運行: node fix-match-69.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

const matchId = 69;

console.log('🔧 開始修復比賽69的授權狀態...\n');

// 獲取比賽信息
db.get('SELECT execution_rate FROM matches WHERE id = ?', [matchId], (err, match) => {
    if (err) {
        console.error('❌ 獲取比賽信息失敗:', err.message);
        db.close();
        return;
    }

    const executionRate = match.execution_rate;
    console.log(`比賽執行比例: ${executionRate}%\n`);

    // 獲取所有待結算授權
    db.all('SELECT * FROM authorizations WHERE match_id = (SELECT match_id FROM matches WHERE id = ?) AND status = \'pending\'', [matchId], (err, auths) => {
        if (err) {
            console.error('❌ 查詢授權失敗:', err.message);
            db.close();
            return;
        }

        console.log(`找到 ${auths.length} 條待結算授權\n`);

        let completed = 0;
        auths.forEach(auth => {
            const deployedAmount = auth.amount * (executionRate / 100);
            const profit = -deployedAmount; // 虧損收益為負

            // 更新授權狀態
            db.run(`
                UPDATE authorizations SET
                    status = 'lost',
                    profit = ?,
                    deployed_amount = ?,
                    reserved_amount = ?,
                    profit_rate = -100,
                    settlement_type = 'loss',
                    settled_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                profit,
                deployedAmount,
                auth.amount - deployedAmount,
                auth.id
            ], function(err) {
                if (err) {
                    console.log(`❌ 授權 ${auth.id} 更新失敗:`, err.message);
                } else {
                    console.log(`✅ 授權 ${auth.id} 更新成功: 用戶 ${auth.user_id} ${auth.amount} USDT, 收益: ${profit}`);
                }

                completed++;
                if (completed === auths.length) {
                    console.log('\n📊 修復完成！');
                    
                    // 顯示修復後的狀態
                    db.all('SELECT id, user_id, amount, status, profit FROM authorizations WHERE match_id = (SELECT match_id FROM matches WHERE id = ?)', [matchId], (err, rows) => {
                        console.log('\n📝 修復後授權明細:');
                        rows.forEach(r => {
                            console.log(`   用戶 ${r.user_id}: ${r.amount} USDT, 狀態: ${r.status}, 收益: ${r.profit}`);
                        });
                        db.close();
                    });
                }
            });
        });
    });
});