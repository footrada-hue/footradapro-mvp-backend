// create-table.mjs
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📦 正在创建 authorizations 表...');

// 确保数据库文件存在
const dbPath = path.join(__dirname, 'src', 'database', 'data', 'footradapro.sqlite');

if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

const sql = `
CREATE TABLE IF NOT EXISTS authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    executed_amount REAL NOT NULL,
    profit REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settled_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
);

CREATE INDEX IF NOT EXISTS idx_authorizations_user ON authorizations(user_id);
CREATE INDEX IF NOT EXISTS idx_authorizations_match ON authorizations(match_id);
CREATE INDEX IF NOT EXISTS idx_authorizations_status ON authorizations(status);
`;

db.exec(sql, function(err) {
    if (err) {
        console.error('❌ 创建表失败:', err.message);
    } else {
        console.log('✅ authorizations 表创建成功！');
        
        // 验证表结构
        db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='authorizations'", function(err, rows) {
            if (err) {
                console.error('验证失败:', err.message);
            } else {
                if (rows.length > 0) {
                    console.log('📊 表结构:');
                    console.log(rows[0].sql);
                } else {
                    console.log('❌ 表未找到');
                }
            }
            db.close();
        });
    }
});