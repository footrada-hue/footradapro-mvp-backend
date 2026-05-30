// create-match-pool-table.js
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
        
        console.log('📋 正在创建 match_pool 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS match_pool (
                id SERIAL PRIMARY KEY,
                match_id TEXT UNIQUE,
                home_team TEXT NOT NULL,
                away_team TEXT NOT NULL,
                league TEXT,
                match_time TIMESTAMP NOT NULL,
                source VARCHAR(50) DEFAULT 'deepseek',
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ match_pool 表创建成功');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_match_pool_home_team ON match_pool(home_team)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_match_pool_away_team ON match_pool(away_team)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_match_pool_match_time ON match_pool(match_time)
        `);
        console.log('✅ 索引创建成功');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ match_pool 表创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

createTable();