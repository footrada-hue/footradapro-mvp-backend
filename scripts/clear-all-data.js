// scripts/clear-all-data.js
// 清空所有比赛相关数据

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function clearAllData() {
    console.log('🗑️ 开始清空数据库...\n');
    
    try {
        // 清空比赛相关表
        const tables = [
            'matches',
            'match_pool',
            'authorizations',
            'settlements',
            'user_notifications'
        ];
        
        for (const table of tables) {
            try {
                const result = await pool.query(`DELETE FROM ${table}`);
                console.log(`   ✅ ${table}: ${result.rowCount} 条记录已删除`);
            } catch (err) {
                console.log(`   ⚠️ ${table}: 跳过（${err.message}）`);
            }
        }
        
        // 重置用户余额
        await pool.query(`
            UPDATE users 
            SET balance = 0, 
                test_balance = 10000,
                is_test_mode = true
            WHERE id = 1
        `);
        console.log(`   ✅ 用户1 余额已重置`);
        
        // 验证
        console.log('\n📊 验证清空结果:');
        for (const table of tables) {
            const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
            console.log(`   ${table}: ${result.rows[0].count} 条记录`);
        }
        
        console.log('\n🎉 清空完成！');
        
    } catch (err) {
        console.error('❌ 清空失败:', err.message);
    } finally {
        await pool.end();
    }
}

clearAllData();