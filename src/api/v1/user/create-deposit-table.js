// scripts/create-deposit-table.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('🚀 開始創建充值記錄表...');

    // 創建充值記錄表
    db.run(`
        CREATE TABLE IF NOT EXISTS deposit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            network TEXT NOT NULL,
            tx_hash TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            reviewed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, function(err) {
        if (err) {
            console.error('❌ 創建充值表失敗:', err);
        } else {
            console.log('✅ deposit_requests 表創建成功');
        }
    });

    // 創建索引
    db.run(`CREATE INDEX IF NOT EXISTS idx_deposit_user ON deposit_requests(user_id)`, function(err) {
        if (err) {
            console.error('❌ 創建索引失敗:', err);
        } else {
            console.log('✅ 索引創建成功');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_deposit_status ON deposit_requests(status)`, function(err) {
        if (err) {
            console.error('❌ 創建索引失敗:', err);
        } else {
            console.log('✅ 索引創建成功');
        }
    });

    setTimeout(() => {
        console.log('🎉 表結構創建完成！');
        db.close();
    }, 500);
});