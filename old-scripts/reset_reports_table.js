import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'src/database/data/footradapro.sqlite');
console.log('📁 数据库路径:', dbPath);

const db = new Database(dbPath);

console.log('\n🚀 开始重建 reports 表...\n');

// 第1步：删除旧表
try {
    console.log('📌 步骤1: 删除旧表...');
    db.exec('DROP TABLE IF EXISTS reports');
    console.log('✅ 旧表已删除');
} catch (err) {
    console.error('❌ 删除失败:', err.message);
}

// 第2步：创建新表
try {
    console.log('\n📌 步骤2: 创建新表...');
    db.exec(`
    CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL UNIQUE,
        match_time DATETIME NOT NULL,
        league TEXT,
        
        -- 球队信息
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_logo TEXT,
        away_logo TEXT,
        
        -- 比赛结果
        home_score INTEGER DEFAULT 0,
        away_score INTEGER DEFAULT 0,
        
        -- AI赛前预测数据（JSON存储）
        prediction_data TEXT,
        
        -- 关键证据链（JSON数组）
        evidence_chain TEXT,
        
        -- AI深度解析
        ai_deepdive TEXT,
        
        -- 元数据
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        published_at DATETIME,
        status TEXT DEFAULT 'draft',
        
        FOREIGN KEY (match_id) REFERENCES matches(match_id),
        FOREIGN KEY (created_by) REFERENCES admins(id)
    );
    `);
    console.log('✅ 新表创建成功');
} catch (err) {
    console.error('❌ 创建表失败:', err.message);
    db.close();
    process.exit(1);
}

// 第3步：创建索引
try {
    console.log('\n📌 步骤3: 创建索引...');
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reports_match_id ON reports(match_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_published_at ON reports(published_at);
    `);
    console.log('✅ 索引创建成功');
} catch (err) {
    console.error('❌ 创建索引失败:', err.message);
}

// 第4步：验证新表结构
console.log('\n📌 步骤4: 验证新表结构...');
const columns = db.prepare("PRAGMA table_info(reports)").all();
console.log('\n📋 新表结构:');
columns.forEach(col => {
    console.log(`   ${col.name} (${col.type})`);
});

// 检查是否包含新字段
const expectedFields = ['match_time', 'league', 'home_team', 'away_team', 'home_logo', 'away_logo', 'prediction_data', 'evidence_chain', 'ai_deepdive'];
const missingFields = expectedFields.filter(field => !columns.some(col => col.name === field));

if (missingFields.length === 0) {
    console.log('\n🎉 新表创建成功！所有字段都正确！');
} else {
    console.log('\n❌ 缺少字段:', missingFields.join(', '));
}

db.close();
console.log('\n✨ 完成！');