// scripts/clear-remote-matches.js
// 清空 Render PostgreSQL 数据库中的比赛数据

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function clearMatches() {
    console.log('🗑️ 开始清空比赛数据...\n');
    
    try {
        // 查看清空前数量
        const beforeMatches = await pool.query('SELECT COUNT(*) FROM matches');
        const beforeMatchPool = await pool.query('SELECT COUNT(*) FROM match_pool');
        const beforeAuth = await pool.query('SELECT COUNT(*) FROM authorizations');
        
        console.log('📊 清空前数量:');
        console.log(`   matches: ${beforeMatches.rows[0].count}`);
        console.log(`   match_pool: ${beforeMatchPool.rows[0].count}`);
        console.log(`   authorizations: ${beforeAuth.rows[0].count}`);
        
        console.log('\n🗑️ 执行清空...');
        
        // 清空表
        await pool.query('DELETE FROM user_notifications');
        await pool.query('DELETE FROM settlements');
        await pool.query('DELETE FROM authorizations');
        await pool.query('DELETE FROM match_pool');
        await pool.query('DELETE FROM matches');
        
        // 重置用户余额
        await pool.query('UPDATE users SET balance = 0, test_balance = 10000, is_test_mode = true WHERE id = 1');
        
        console.log('   ✅ matches 已清空');
        console.log('   ✅ match_pool 已清空');
        console.log('   ✅ authorizations 已清空');
        console.log('   ✅ settlements 已清空');
        console.log('   ✅ user_notifications 已清空');
        console.log('   ✅ 用户1余额已重置');
        
        // 验证清空后数量
        const afterMatches = await pool.query('SELECT COUNT(*) FROM matches');
        const afterMatchPool = await pool.query('SELECT COUNT(*) FROM match_pool');
        
        console.log('\n📊 清空后数量:');
        console.log(`   matches: ${afterMatches.rows[0].count}`);
        console.log(`   match_pool: ${afterMatchPool.rows[0].count}`);
        
        console.log('\n🎉 清空完成！');
        
    } catch (err) {
        console.error('❌ 清空失败:', err.message);
    } finally {
        await pool.end();
    }
}

clearMatches();