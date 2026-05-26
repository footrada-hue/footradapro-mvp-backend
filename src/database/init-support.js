import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data/footradapro.sqlite');
const sqlFile = path.join(__dirname, 'migrations/026_support_system.sql');

console.log('📁 数据库路径:', dbPath);
console.log('📄 SQL 文件:', sqlFile);

// 检查文件
if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
    console.error('❌ SQL 文件不存在:', sqlFile);
    process.exit(1);
}

// 读取 SQL 文件
const sql = fs.readFileSync(sqlFile, 'utf8');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err);
        process.exit(1);
    }
    console.log('✅ 数据库连接成功\n');
    
    // 执行 SQL
    db.exec(sql, (err) => {
        if (err) {
            console.error('❌ 执行失败:', err.message);
            db.close();
            process.exit(1);
        }
        
        console.log('✅ SQL 执行成功！\n');
        
        // 查询创建的表
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'support_%' ORDER BY name", (err, tables) => {
            if (!err && tables && tables.length > 0) {
                console.log('📊 创建的客服相关表:');
                tables.forEach(table => {
                    console.log(`  ✓ ${table.name}`);
                });
                console.log(`\n共创建 ${tables.length} 个表`);
            } else {
                console.log('⚠️  未找到客服相关表');
            }
            
            // 查询索引
            db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name LIKE 'support_%' ORDER BY name", (err, indexes) => {
                if (!err && indexes && indexes.length > 0) {
                    console.log('\n📈 创建的索引:');
                    indexes.forEach(idx => {
                        console.log(`  ✓ ${idx.name}`);
                    });
                }
                
                db.close();
                console.log('\n✅ 客服系统数据库初始化完成！');
            });
        });
    });
});