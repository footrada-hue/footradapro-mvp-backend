import { initDatabase, getDb } from './src/database/connection.js';
import bcrypt from 'bcrypt';

console.log('=== 重新初始化数据库 ===');

// 初始化数据库（会自动创建表）
initDatabase();
const db = getDb();

try {
    // 检查表结构
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('已创建的表:', tables.map(t => t.name));

    // 添加 VIP 相关字段（如果表已创建但缺少字段）
    const columns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    
    const addColumnIfNotExists = (columnName, columnType) => {
        if (!columns.includes(columnName)) {
            db.exec(`ALTER TABLE users ADD COLUMN ${columnName} ${columnType}`);
            console.log(`✅ 添加字段: ${columnName}`);
        }
    };

    addColumnIfNotExists('vip_level', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('total_authorized', 'REAL DEFAULT 0');
    addColumnIfNotExists('total_profit', 'REAL DEFAULT 0');
    addColumnIfNotExists('is_new_user', 'BOOLEAN DEFAULT 1');
    addColumnIfNotExists('has_claimed_bonus', 'BOOLEAN DEFAULT 0');
    addColumnIfNotExists('bonus_claimed_at', 'DATETIME');
    addColumnIfNotExists('bonus_expires_at', 'DATETIME');
    addColumnIfNotExists('completed_steps', 'INTEGER DEFAULT 0');

    // 创建授权记录表（如果不存在）
    db.exec(`
        CREATE TABLE IF NOT EXISTS authorizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            user_amount REAL NOT NULL,
            actual_amount REAL NOT NULL,
            prediction TEXT NOT NULL,
            odds REAL NOT NULL,
            vip_level INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            profit REAL DEFAULT 0,
            commission REAL DEFAULT 0,
            user_profit REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            settled_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    console.log('✅ 确保 authorizations 表存在');

    // 创建管理员表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ 确保 admins 表存在');

    // 插入默认管理员（如果不存在）
    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashedPassword);
        console.log('✅ 创建默认管理员: admin / admin123');
    }

    console.log('\n✅ 数据库初始化完成！');
    console.log('现在可以重新注册用户测试体验金流程');

} catch (error) {
    console.error('初始化失败:', error);
}