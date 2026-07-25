// scripts/fix-matches.js
// 检查和修复世界杯比赛数据

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixMatches() {
    console.log('🏆 检查世界杯比赛数据...\n');
    
    // 1. 查看所有世界杯比赛
    console.log('📋 所有世界杯比赛:');
    const allMatches = await pool.query(`
        SELECT id, home_team, away_team, match_time 
        FROM matches 
        WHERE league = 'FIFA World Cup 2026' 
        ORDER BY match_time ASC
    `);
    
    console.log(`共 ${allMatches.rows.length} 场比赛:\n`);
    allMatches.rows.forEach(row => {
        const date = new Date(row.match_time).toLocaleString('zh-CN');
        console.log(`   ${date} | ${row.home_team} vs ${row.away_team}`);
    });
    
    // 2. 检查空值
    console.log('\n🔍 检查空球队名称...');
    const emptyTeams = await pool.query(`
        SELECT id, home_team, away_team, match_time 
        FROM matches 
        WHERE home_team IS NULL OR away_team IS NULL 
           OR home_team = '' OR away_team = ''
           OR home_team = 'TBD' OR away_team = 'TBD'
    `);
    
    if (emptyTeams.rows.length > 0) {
        console.log(`⚠️ 发现 ${emptyTeams.rows.length} 场比赛有空值或占位符:`);
        emptyTeams.rows.forEach(row => {
            console.log(`   ID: ${row.id} | ${row.home_team || 'NULL'} vs ${row.away_team || 'NULL'}`);
        });
        
        // 删除有问题的比赛
        console.log('\n🗑️ 删除有问题的比赛...');
        await pool.query(`
            DELETE FROM matches 
            WHERE home_team IS NULL OR away_team IS NULL 
               OR home_team = '' OR away_team = ''
               OR home_team = 'TBD' OR away_team = 'TBD'
        `);
        console.log(`   ✅ 已删除 ${emptyTeams.rows.length} 场问题比赛`);
    } else {
        console.log('   ✅ 没有发现空值或占位符');
    }
    
    // 3. 检查6月17日的比赛
    console.log('\n📅 2026年6月17日的比赛:');
    const june17 = await pool.query(`
        SELECT id, home_team, away_team, match_time 
        FROM matches 
        WHERE match_time >= '2026-06-17' AND match_time < '2026-06-18'
        ORDER BY match_time
    `);
    
    if (june17.rows.length === 0) {
        console.log('   ⚠️ 没有找到6月17日的比赛');
    } else {
        june17.rows.forEach(row => {
            console.log(`   ${row.match_time} | ${row.home_team} vs ${row.away_team}`);
        });
    }
    
    // 4. 检查6月18日的比赛
    console.log('\n📅 2026年6月18日的比赛:');
    const june18 = await pool.query(`
        SELECT id, home_team, away_team, match_time 
        FROM matches 
        WHERE match_time >= '2026-06-18' AND match_time < '2026-06-19'
        ORDER BY match_time
    `);
    
    if (june18.rows.length === 0) {
        console.log('   ⚠️ 没有找到6月18日的比赛');
    } else {
        june18.rows.forEach(row => {
            console.log(`   ${row.match_time} | ${row.home_team} vs ${row.away_team}`);
        });
    }
    
    // 5. 显示统计
    const stats = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN match_time >= '2026-06-11' AND match_time < '2026-06-18' THEN 1 END) as week1,
            COUNT(CASE WHEN match_time >= '2026-06-18' AND match_time < '2026-06-25' THEN 1 END) as week2,
            COUNT(CASE WHEN match_time >= '2026-06-25' THEN 1 END) as week3
        FROM matches 
        WHERE league = 'FIFA World Cup 2026'
    `);
    
    console.log('\n📊 统计:');
    console.log(`   总比赛数: ${stats.rows[0].total}`);
    console.log(`   第一周 (6/11-6/17): ${stats.rows[0].week1}`);
    console.log(`   第二周 (6/18-6/24): ${stats.rows[0].week2}`);
    console.log(`   第三周 (6/25-6/28): ${stats.rows[0].week3}`);
    
    await pool.end();
    
    console.log('\n✅ 检查完成！');
}

fixMatches().catch(err => {
    console.error('❌ 执行失败:', err);
    process.exit(1);
});