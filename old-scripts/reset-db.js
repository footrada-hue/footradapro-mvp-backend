import { initDatabase, getDb } from './src/database/connection.js';
import bcrypt from 'bcrypt';
import fs from 'fs';

console.log('=== 重新初始化数据库 ===');

// 先删除旧数据库（如果存在）
const dbPath = './src/database/data/footradapro.sqlite';
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ 已删除旧数据库');
}

// 初始化数据库
initDatabase();
const db = getDb();

// 创建 balance_logs 表
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS balance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            balance_before REAL NOT NULL,
            balance_after REAL NOT NULL,
            type TEXT NOT NULL,
            reason TEXT,
            tx_hash TEXT,
            admin_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (admin_id) REFERENCES admins(id)
        )
    `);
    console.log('✅ balance_logs 表创建成功');
} catch (err) {
    console.log('❌ balance_logs 表创建失败:', err.message);
}

// 创建 deposit_requests 表
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS deposit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            network TEXT NOT NULL,
            tx_hash TEXT UNIQUE NOT NULL,
            from_address TEXT NOT NULL,
            screenshot_url TEXT,
            status TEXT DEFAULT 'pending',
            admin_notes TEXT,
            processed_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (processed_by) REFERENCES admins(id)
        )
    `);
    console.log('✅ deposit_requests 表创建成功');
} catch (err) {
    console.log('❌ deposit_requests 表创建失败:', err.message);
}

// 创建索引
try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_balance_logs_user_id ON balance_logs(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_balance_logs_created_at ON balance_logs(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deposit_requests_tx_hash ON deposit_requests(tx_hash)');
    console.log('✅ 索引创建成功');
} catch (err) {
    console.log('❌ 索引创建失败:', err.message);
}

// 检查并创建默认管理员
const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashedPassword);
    console.log('✅ 创建默认管理员: admin / admin123');
} else {
    console.log('⏭️ 管理员已存在');
}

console.log('=== 数据库初始化完成 ===');