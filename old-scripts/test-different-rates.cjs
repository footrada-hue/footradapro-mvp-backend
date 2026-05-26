/**
 * 測試不同執行比例
 * 運行: node test-different-rates.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { exec } = require('child_process');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

// 要測試的不同執行比例
const testRates = [20, 30, 40, 50, 60];
let currentIndex = 0;

const matchId = 64;

function testNextRate() {
    if (currentIndex >= testRates.length) {
        console.log('\n✅ 所有測試完成！');
        db.close();
        return;
    }

    const rate = testRates[currentIndex];
    console.log(`\n🔧 測試執行比例: ${rate}%`);

    // 更新執行比例
    db.run('UPDATE matches SET execution_rate = ? WHERE id = ?', [rate, matchId], function(err) {
        if (err) {
            console.error('❌ 更新失敗:', err.message);
        } else {
            console.log(`✅ 已設置為 ${rate}%`);
            console.log('請到清算頁面手動測試，完成後按回車繼續...');
            
            // 等待用戶確認
            process.stdin.once('data', () => {
                currentIndex++;
                testNextRate();
            });
        }
    });
}

// 先查看比賽信息
db.get('SELECT id, home_team, away_team FROM matches WHERE id = ?', [matchId], (err, match) => {
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

    console.log('🎯 開始測試不同執行比例\n');
    console.log(`比賽: ${match.home_team} vs ${match.away_team}\n`);
    
    testNextRate();
});