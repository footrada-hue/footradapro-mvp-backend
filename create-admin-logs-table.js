// create-admin-logs-table.js
// 创建 admin_logs 表

import pg from 'pg';

const { Pool } = pg;

// 你的 Render PostgreSQL 连接串
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
        
        // 创建 admin_logs 表
        console.log('📋 正在创建 admin_logs 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                details TEXT,
                ip TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ admin_logs 表创建成功');
        
        // 创建索引
        console.log('📋 正在创建索引...');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id 
            ON admin_logs(admin_id)
        `);
        console.log('✅ 索引 idx_admin_logs_admin_id 创建成功');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at 
            ON admin_logs(created_at)
        `);
        console.log('✅ 索引 idx_admin_logs_created_at 创建成功');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ admin_logs 表及索引创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

createTable();