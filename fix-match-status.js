// fix-match-status.js
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixMatchStatus() {
    try {
        // 查看当前状态分布
        const statusResult = await pool.query(`
            SELECT status, COUNT(*) as count FROM matches GROUP BY status
        `);
        console.log('📊 当前比赛状态分布:');
        statusResult.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count} 场`);
        });
        
        // 更新已过期的比赛为 finished
        const updateResult = await pool.query(`
            UPDATE matches 
            SET status = 'finished' 
            WHERE match_time < NOW() AND status = 'upcoming'
        `);
        console.log(`\n✅ 已将 ${updateResult.rowCount} 场过期比赛状态更新为 'finished'`);
        
        // 再次查看状态分布
        const newStatusResult = await pool.query(`
            SELECT status, COUNT(*) as count FROM matches GROUP BY status
        `);
        console.log('\n📊 更新后比赛状态分布:');
        newStatusResult.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count} 场`);
        });
        
    } catch (err) {
        console.error('错误:', err.message);
    } finally {
        await pool.end();
    }
}

fixMatchStatus();