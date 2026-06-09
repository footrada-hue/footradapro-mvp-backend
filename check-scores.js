// check-scores.js
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkScores() {
    try {
        // 查看 finished 比赛的比分情况
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN home_score IS NULL OR away_score IS NULL THEN 1 END) as missing_score,
                COUNT(CASE WHEN home_score IS NOT NULL AND away_score IS NOT NULL THEN 1 END) as has_score
            FROM matches 
            WHERE status = 'finished'
        `);
        
        console.log(`📊 finished 比赛统计:`);
        console.log(`   总数: ${result.rows[0].total}`);
        console.log(`   缺少比分: ${result.rows[0].missing_score}`);
        console.log(`   已有比分: ${result.rows[0].has_score}`);
        
        // 显示缺少比分的比赛示例
        const missing = await pool.query(`
            SELECT match_id, home_team, away_team, match_time, home_score, away_score
            FROM matches 
            WHERE status = 'finished' 
            AND (home_score IS NULL OR away_score IS NULL)
            LIMIT 10
        `);
        
        if (missing.rows.length > 0) {
            console.log(`\n📋 缺少比分的比赛示例:`);
            missing.rows.forEach(m => {
                console.log(`   ${m.home_team} vs ${m.away_team}`);
                console.log(`   比赛时间: ${m.match_time}`);
                console.log(`   当前比分: ${m.home_score || '?'} : ${m.away_score || '?'}`);
                console.log(`   ---`);
            });
        }
        
    } catch (err) {
        console.error('错误:', err.message);
    } finally {
        await pool.end();
    }
}

checkScores();