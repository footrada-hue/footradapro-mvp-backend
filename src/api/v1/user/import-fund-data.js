// scripts/import-fund-data.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('🚀 開始導入資金數據...');

    // 檢查 balance_logs 中的充值記錄（假設有充值記錄）
    db.all(`SELECT * FROM balance_logs WHERE amount > 0 AND type = 'deposit'`, (err, deposits) => {
        if (err) {
            console.error('查詢失敗:', err);
        } else {
            console.log(`找到 ${deposits.length} 條充值記錄`);
            
            deposits.forEach(d => {
                db.run(`
                    INSERT INTO deposit_requests (user_id, amount, network, status, created_at)
                    VALUES (?, ?, 'TRC20', 'completed', ?)
                `, [d.user_id, d.amount, d.created_at], function(err) {
                    if (!err) {
                        console.log(`✅ 導入充值記錄 ID: ${this.lastID}`);
                    }
                });
            });
        }
    });

    // 檢查 withdraw_requests 中已有的提現記錄
    db.all(`SELECT * FROM withdraw_requests WHERE status = 'completed'`, (err, withdraws) => {
        if (err) {
            console.error('查詢失敗:', err);
        } else {
            console.log(`找到 ${withdraws.length} 條提現記錄`);
        }
    });

    setTimeout(() => {
        console.log('🎉 導入完成！');
        db.close();
    }, 1000);
});