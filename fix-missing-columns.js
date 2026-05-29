// fix-missing-columns.js
// 用于创建缺失的 user_notifications 表

import pg from 'pg';

const { Pool } = pg;

// 你的 Render PostgreSQL 连接串
const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function createUserNotificationsTable() {
    console.log('🔍 正在连接数据库...');
    
    try {
        // 测试连接
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        // 创建 user_notifications 表
        console.log('📋 正在创建 user_notifications 表...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT,
                data TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                read_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ user_notifications 表创建成功');
        
        // 创建索引
        console.log('📋 正在创建索引...');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id 
            ON user_notifications(user_id)
        `);
        console.log('✅ 索引 idx_user_notifications_user_id 创建成功');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read 
            ON user_notifications(is_read)
        `);
        console.log('✅ 索引 idx_user_notifications_is_read 创建成功');
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at 
            ON user_notifications(created_at)
        `);
        console.log('✅ 索引 idx_user_notifications_created_at 创建成功');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ user_notifications 表及索引创建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 验证表是否创建成功
        const result = await pool.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = 'user_notifications'
        `);
        
        if (result.rows[0].count > 0) {
            console.log('✅ 验证通过：user_notifications 表已存在');
        } else {
            console.log('❌ 验证失败：user_notifications 表不存在');
        }
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
        console.error('详细信息:', error);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

// 运行脚本
createUserNotificationsTable();