// create-global-config-table.js
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
        
        console.log('📋 正在创建 global_config 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_config (
                id SERIAL PRIMARY KEY,
                config_key VARCHAR(100) NOT NULL UNIQUE,
                config_value TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ global_config 表创建成功');
        
        console.log('📋 正在插入默认配置...');
        
        await pool.query(`
            INSERT INTO global_config (config_key, config_value, description) VALUES
            ('platform_fee_rate', '0.2', '平台抽成比例（0-1之间）'),
            ('platform_loss_rate', '0.4', '平台承担亏损比例（0-1之间）'),
            ('default_execution_rate', '30', '默认执行率（百分比）')
            ON CONFLICT (config_key) DO UPDATE SET 
                config_value = EXCLUDED.config_value,
                updated_at = CURRENT_TIMESTAMP
        `);
        console.log('✅ 默认配置插入成功');
        
        // 验证
        const result = await pool.query(`SELECT * FROM global_config`);
        console.log(`📊 当前配置:`, result.rows);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ global_config 表创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

createTable();