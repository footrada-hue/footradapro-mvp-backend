    /**
     * 修改比賽執行比例
     * 運行: node update-match-rate.cjs
     */

    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');

    const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
    const db = new sqlite3.Database(dbPath);

    // 要修改的比賽ID和新的執行比例
    const matchId = 65;
    const newRate = 50; // 改為 40%，可以修改這裡測試不同值

    console.log(`🔧 修改比賽 ID ${matchId} 的執行比例為 ${newRate}%\n`);

    // 先查看當前值
    db.get('SELECT id, home_team, away_team, execution_rate, status FROM matches WHERE id = ?', [matchId], (err, match) => {
        if (err) {
            console.error('❌ 查詢失敗:', err.message);
            db.close();
            return;
        }

        if (!match) {
            console.error(`❌ 找不到比賽 ID ${matchId}`);
            db.close();
            return;
        }

        console.log('📋 當前比賽信息:');
        console.log(`   ID: ${match.id}`);
        console.log(`   比賽: ${match.home_team} vs ${match.away_team}`);
        console.log(`   當前執行比例: ${match.execution_rate}%`);
        console.log(`   狀態: ${match.status}`);

        // 更新執行比例
        db.run('UPDATE matches SET execution_rate = ? WHERE id = ?', [newRate, matchId], function(err) {
            if (err) {
                console.error('❌ 更新失敗:', err.message);
            } else {
                console.log(`\n✅ 已將執行比例從 ${match.execution_rate}% 修改為 ${newRate}%`);
                
                // 顯示更新後的值
                db.get('SELECT execution_rate FROM matches WHERE id = ?', [matchId], (err, updated) => {
                    console.log(`   更新後執行比例: ${updated.execution_rate}%`);
                    console.log('\n現在可以到清算頁面測試了！');
                    db.close();
                });
            }
        });
    });