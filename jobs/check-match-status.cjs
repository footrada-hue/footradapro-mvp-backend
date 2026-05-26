/**
 * 比賽狀態檢查任務 - 每分鐘執行
 * 根據 UTC 時間自動更新比賽狀態
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

function checkMatchStatus() {
  const now = new Date().toISOString(); // UTC 時間
  console.log(`[${now}] 檢查比賽狀態...`);

  // 1. 將已到比賽時間的 upcoming 比賽改為 live
  db.run(`
    UPDATE matches 
    SET status = 'live' 
    WHERE status = 'upcoming' 
      AND datetime(match_time) <= datetime(?)
  `, [now], function(err) {
    if (err) {
      console.error('❌ 更新 live 狀態失敗:', err);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} 場比賽已開始 (live)`);
    }
  });

  // 2. 將比賽時間超過 2 小時的 live 比賽改為 finished
  // 假設比賽進行時間約 2 小時
  db.run(`
    UPDATE matches 
    SET status = 'finished' 
    WHERE status = 'live' 
      AND datetime(match_time, '+2 hours') <= datetime(?)
  `, [now], function(err) {
    if (err) {
      console.error('❌ 更新 finished 狀態失敗:', err);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} 場比賽已結束 (finished)`);
    }
  });
}

// 立即執行一次
checkMatchStatus();

// 每分鐘執行一次
setInterval(checkMatchStatus, 60 * 1000);

// 優雅退出
process.on('SIGINT', () => {
  console.log('\n👋 關閉狀態檢查任務');
  db.close();
  process.exit();
});