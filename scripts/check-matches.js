import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkMatches() {
    console.log('📋 查看世界杯比赛...\n');
    
    // 查询所有世界杯比赛
    const result = await pool.query(`
        SELECT id, home_team, away_team, match_time 
        FROM matches 
        WHERE league = 'FIFA World Cup 2026' 
        ORDER BY match_time ASC
    `);
    
    console.log(`共 ${result.rows.length} 场比赛:\n`);
    result.rows.forEach(row => {
        console.log(`   ${row.match_time} | ${row.home_team} vs ${row.away_team}`);
    });
    
    // 删除 TBD 比赛
    const deleteResult = await pool.query(`
        DELETE FROM matches WHERE home_team = 'TBD' OR away_team = 'TBD'
    `);
    
    if (deleteResult.rowCount > 0) {
        console.log(`\n✅ 删除了 ${deleteResult.rowCount} 场 TBD 比赛`);
    } else {
        console.log(`\n✅ 没有 TBD 比赛需要删除`);
    }
    
    await pool.end();
}

checkMatches().catch(console.error);