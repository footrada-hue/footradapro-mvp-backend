// reset-match-pool.cjs
const pg = require('pg');

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetMatchPool() {
    console.log('🔍 正在连接数据库...');
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        // 删除旧表
        console.log('🗑️ 删除旧的 match_pool 表...');
        await pool.query('DROP TABLE IF EXISTS match_pool');
        console.log('✅ 旧表已删除');
        
        // 创建新表（简化版，避免时间格式问题）
        console.log('📋 创建新的 match_pool 表...');
        await pool.query(`
            CREATE TABLE match_pool (
                id SERIAL PRIMARY KEY,
                league VARCHAR(100),
                home_team VARCHAR(100) NOT NULL,
                away_team VARCHAR(100) NOT NULL,
                match_datetime TIMESTAMP,
                status VARCHAR(20) DEFAULT 'upcoming',
                weight INTEGER DEFAULT 100,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ match_pool 表已创建');
        
        // 插入测试数据（使用完整的 timestamp 格式）
        console.log('📝 插入测试比赛数据...');
        await pool.query(`
            INSERT INTO match_pool (home_team, away_team, league, match_datetime, status, weight)
            VALUES 
                ('Liverpool', 'Manchester City', 'Premier League', '2026-06-20 20:00:00', 'upcoming', 100),
                ('Real Madrid', 'Barcelona', 'La Liga', '2026-06-21 22:00:00', 'upcoming', 90),
                ('Bayern Munich', 'Borussia Dortmund', 'Bundesliga', '2026-06-22 19:30:00', 'upcoming', 95),
                ('Paris Saint-Germain', 'Olympique Marseille', 'Ligue 1', '2026-06-23 21:00:00', 'upcoming', 85),
                ('AC Milan', 'Inter Milan', 'Serie A', '2026-06-24 20:45:00', 'upcoming', 88)
        `);
        console.log('✅ 已插入 5 条测试比赛数据');
        
        // 验证数据
        const result = await pool.query('SELECT id, home_team, away_team, match_datetime, status FROM match_pool');
        console.log('\n📋 当前比赛数据:');
        result.rows.forEach(row => {
            console.log(`   ${row.id}. ${row.home_team} vs ${row.away_team} | ${row.match_datetime} | ${row.status}`);
        });
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ match_pool 表初始化完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 初始化失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

resetMatchPool();