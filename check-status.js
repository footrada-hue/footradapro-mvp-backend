// check-status.js
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        // 查看所有比赛的 status 分布
        const statusStats = await pool.query(`
            SELECT status, COUNT(*) as count FROM matches GROUP BY status
        `);
        console.log('📊 数据库中的状态分布:');
        statusStats.rows.forEach(s => {
            console.log(`   ${s.status}: ${s.count}`);
        });
        
        // 查看已过期的比赛 status 是什么
        const expiredStatus = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM matches 
            WHERE match_time < NOW() 
            GROUP BY status
        `);
        console.log('\n📊 已过期比赛的状态分布:');
        expiredStatus.rows.forEach(s => {
            console.log(`   ${s.status}: ${s.count}`);
        });
        
        // 查看清算系统需要的 finished 状态有多少
        const finishedCount = await pool.query(`
            SELECT COUNT(*) as count FROM matches WHERE status = 'finished'
        `);
        console.log(`\n📊 status = 'finished' 的比赛: ${finishedCount.rows[0].count} 场`);
        
    } catch (err) {
        console.error('错误:', err.message);
    } finally {
        await pool.end();
    }
}

check();