// create-auth-table.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 开始创建 authorizations 表...');

// 数据库路径
const dbPath = path.join(__dirname, 'src', 'database', 'data', 'footradapro.sqlite');

// 检查数据库文件是否存在
if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
}

// 连接数据库
const db = new Database(dbPath);

try {
    // 开始事务
    db.exec('BEGIN TRANSACTION');

    // 删除旧表（如果存在）
    db.exec(`DROP TABLE IF EXISTS authorizations;`);
    console.log('✓ 旧表已删除');

    // 创建新表
    db.exec(`
        CREATE TABLE authorizations (
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
    `);
    console.log('✓ 新表创建成功');

    // 创建索引
    db.exec(`
        CREATE INDEX idx_authorizations_user ON authorizations(user_id);
        CREATE INDEX idx_authorizations_match ON authorizations(match_id);
        CREATE INDEX idx_authorizations_status ON authorizations(status);
    `);
    console.log('✓ 索引创建成功');

    // 提交事务
    db.exec('COMMIT');

    // 验证表结构
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='authorizations'").get();
    console.log('\n📊 表结构:');
    console.log(tableInfo.sql);

    // 列出所有表
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log('\n📋 数据库中的表:');
    tables.forEach(t => console.log(`   - ${t.name}`));

} catch (error) {
    // 出错时回滚
    db.exec('ROLLBACK');
    console.error('❌ 创建表失败:', error.message);
} finally {
    db.close();
}