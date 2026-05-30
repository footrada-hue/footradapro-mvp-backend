// create-network-config-table.js
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
        
        // 创建 network_config 表
        console.log('📋 正在创建 network_config 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS network_config (
                id SERIAL PRIMARY KEY,
                network VARCHAR(50) NOT NULL UNIQUE,
                deposit_address TEXT NOT NULL,
                withdraw_fee DECIMAL DEFAULT 1.00,
                min_withdraw DECIMAL DEFAULT 10.00,
                max_withdraw DECIMAL DEFAULT 10000.00,
                confirmations INTEGER DEFAULT 12,
                is_active BOOLEAN DEFAULT TRUE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER
            )
        `);
        console.log('✅ network_config 表创建成功');
        
        // 创建索引
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_network_config_network 
            ON network_config(network)
        `);
        console.log('✅ 索引创建成功');
        
        // 插入默认数据（如果表为空）
        const result = await pool.query('SELECT COUNT(*) as count FROM network_config');
        if (parseInt(result.rows[0].count) === 0) {
            console.log('📋 插入默认网络配置...');
            
            await pool.query(`
                INSERT INTO network_config (network, deposit_address, withdraw_fee, min_withdraw, max_withdraw, confirmations, is_active, notes)
                VALUES 
                    ('TRC20', 'TDefaultAddress1234567890ABCDEFGHIJKLMN', 1.00, 10.00, 10000.00, 12, true, 'TRC20 (Tron) - Recommended'),
                    ('ERC20', '0xDefaultAddress1234567890ABCDEFGHIJKLMNOPQR', 1.00, 10.00, 10000.00, 12, true, 'ERC20 (Ethereum) - Higher gas fees'),
                    ('BEP20', '0xDefaultAddress1234567890ABCDEFGHIJKLMNOPQR', 1.00, 10.00, 10000.00, 12, true, 'BEP20 (BSC) - Fast and cheap')
            `);
            console.log('✅ 默认数据插入成功');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ network_config 表创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

createTable();