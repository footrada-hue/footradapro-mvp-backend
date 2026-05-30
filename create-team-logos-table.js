// create-team-logos-table.js
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function createTable() {
    console.log('🔍 正在连接数据库...');
    
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        console.log('📋 正在创建 team_logos 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS team_logos (
                id SERIAL PRIMARY KEY,
                team_name TEXT UNIQUE NOT NULL,
                logo_url TEXT,
                logo_status TEXT DEFAULT 'missing',
                involved_matches INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ team_logos 表创建成功');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_team_logos_team_name ON team_logos(team_name)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_team_logos_status ON team_logos(logo_status)
        `);
        console.log('✅ 索引创建成功');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ team_logos 表创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

createTable();