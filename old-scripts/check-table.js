// check-table.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'src', 'database', 'data', 'footradapro.sqlite');
const db = new Database(dbPath);

console.log('🔍 开始检查数据库表结构...\n');

try {
    // 1. 检查 authorizations 表是否存在
    const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='authorizations'
    `).get();

    if (!tableExists) {
        console.log('❌ authorizations 表不存在！');
        process.exit(1);
    }

    console.log('✅ authorizations 表存在\n');

    // 2. 查看表结构
    console.log('📊 authorizations 表结构：');
    const columns = db.prepare("PRAGMA table_info(authorizations)").all();
    
    const expectedColumns = [
        { name: 'id', type: 'INTEGER' },
        { name: 'auth_id', type: 'TEXT' },
        { name: 'user_id', type: 'INTEGER' },
        { name: 'match_id', type: 'INTEGER' },
        { name: 'amount', type: 'REAL' },
        { name: 'executed_amount', type: 'REAL' },
        { name: 'profit', type: 'REAL' },
        { name: 'status', type: 'TEXT' },
        { name: 'created_at', type: 'DATETIME' },
        { name: 'settled_at', type: 'DATETIME' }
    ];

    let allCorrect = true;

    columns.forEach(col => {
        console.log(`   ${col.name.padEnd(15)} ${col.type}`);
        
        // 检查字段是否正确
        const expected = expectedColumns.find(e => e.name === col.name);
        if (!expected) {
            console.log(`   ⚠️  多余字段: ${col.name}`);
            allCorrect = false;
        }
    });

    // 检查是否有缺失字段
    expectedColumns.forEach(expected => {
        const found = columns.find(c => c.name === expected.name);
        if (!found) {
            console.log(`   ❌ 缺失字段: ${expected.name} ${expected.type}`);
            allCorrect = false;
        }
    });

    console.log('\n');

    // 3. 检查索引
    console.log('📌 索引列表：');
    const indexes = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='index' AND tbl_name='authorizations'
    `).all();

    const expectedIndexes = [
        'idx_authorizations_user',
        'idx_authorizations_match',
        'idx_authorizations_status'
    ];

    if (indexes.length === 0) {
        console.log('   ⚠️  没有找到索引');
        allCorrect = false;
    } else {
        indexes.forEach(idx => {
            console.log(`   - ${idx.name}`);
        });

        // 检查是否缺少预期索引
        expectedIndexes.forEach(expected => {
            const found = indexes.find(i => i.name === expected);
            if (!found) {
                console.log(`   ❌ 缺失索引: ${expected}`);
                allCorrect = false;
            }
        });
    }

    console.log('\n');

    // 4. 检查外键约束
    console.log('🔗 外键约束：');
    const foreignKeys = db.prepare("PRAGMA foreign_key_list(authorizations)").all();
    
    if (foreignKeys.length === 0) {
        console.log('   ⚠️  没有外键约束');
        allCorrect = false;
    } else {
        foreignKeys.forEach(fk => {
            console.log(`   - ${fk.table}(${fk.from}) -> ${fk.table}(${fk.to})`);
        });
    }

    console.log('\n');

    // 5. 统计表数据
    const count = db.prepare("SELECT COUNT(*) as count FROM authorizations").get();
    console.log(`📈 当前数据量：${count.count} 条记录`);

    console.log('\n');

    // 6. 最终结果
    if (allCorrect) {
        console.log('✅✅✅ 表结构完全正确！');
    } else {
        console.log('⚠️  表结构有问题，请修复');
    }

} catch (error) {
    console.error('❌ 检查失败:', error.message);
} finally {
    db.close();
}