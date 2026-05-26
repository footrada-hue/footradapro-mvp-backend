import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库路径 - 根据您的项目配置
const DB_PATH = path.join(__dirname, '../data/footradapro.sqlite');

async function runMigration(migrationFile) {
    let db = null;
    
    try {
        console.log('📁 数据库路径:', DB_PATH);
        
        // 检查数据库文件是否存在
        if (!fs.existsSync(DB_PATH)) {
            console.error('❌ 数据库文件不存在:', DB_PATH);
            console.log('💡 提示: 请先确保数据库文件存在');
            process.exit(1);
        }
        
        // 连接数据库 - 使用 sqlite3
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        
        console.log('✅ 数据库连接成功');
        
        // 读取迁移文件
        const migrationPath = path.join(__dirname, migrationFile);
        if (!fs.existsSync(migrationPath)) {
            console.error('❌ 迁移文件不存在:', migrationPath);
            process.exit(1);
        }
        
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('📄 迁移文件:', migrationFile);
        console.log('📏 SQL 长度:', sql.length, '字符');
        
        // 执行迁移
        console.log('🔄 开始执行迁移...');
        
        // 分割 SQL 语句（按分号分割，但要注意字符串中的分号）
        const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (statement && !statement.startsWith('--')) {
                try {
                    await db.exec(statement);
                    console.log(`  ✅ 执行语句 ${i + 1}/${statements.length}`);
                } catch (err) {
                    console.error(`  ❌ 执行语句 ${i + 1} 失败:`, err.message);
                    // 继续执行其他语句
                }
            }
        }
        
        console.log('✅ 迁移执行完成！');
        
        // 验证表是否创建成功
        const tables = await db.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name LIKE 'support_%'
            ORDER BY name
        `);
        
        if (tables.length > 0) {
            console.log('\n📊 创建的客服相关表:');
            tables.forEach(table => {
                console.log(`  ✓ ${table.name}`);
            });
        } else {
            console.log('\n⚠️  未找到客服相关表，请检查 SQL 文件');
        }
        
        // 显示统计信息
        const stats = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM support_conversations) as conversations,
                (SELECT COUNT(*) FROM support_messages) as messages
        `);
        
        console.log('\n📈 当前数据统计:');
        console.log(`  会话数量: ${stats.conversations || 0}`);
        console.log(`  消息数量: ${stats.messages || 0}`);
        
    } catch (error) {
        console.error('❌ 迁移失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        if (db) {
            await db.close();
            console.log('\n🔒 数据库连接已关闭');
        }
    }
}

// 获取命令行参数
const migrationFile = process.argv[2];
if (!migrationFile) {
    console.error('❌ 请指定迁移文件名');
    console.log('使用方法: node run_migration.js 026_support_system.sql');
    process.exit(1);
}

// 检查文件是否存在
if (!fs.existsSync(path.join(__dirname, migrationFile))) {
    console.error('❌ 迁移文件不存在:', migrationFile);
    process.exit(1);
}

runMigration(migrationFile);