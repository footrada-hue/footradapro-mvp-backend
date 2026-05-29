// add-withdraw-fields.js
// 为 withdraw_requests 和 users 表添加缺失字段

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addMissingFields() {
    console.log('🔍 正在连接数据库...');
    
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        // 为 withdraw_requests 表添加字段
        console.log('📋 正在为 withdraw_requests 表添加字段...');
        
        const withdrawFields = [
            { name: 'fee', type: 'DECIMAL DEFAULT 1.00' },
            { name: 'net_amount', type: 'DECIMAL' },
            { name: 'admin_note', type: 'TEXT' },
            { name: 'reviewed_by', type: 'INTEGER' },
            { name: 'reviewed_at', type: 'TIMESTAMP' }
        ];
        
        for (const field of withdrawFields) {
            try {
                await pool.query(`
                    ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}
                `);
                console.log(`✅ 添加字段: ${field.name}`);
            } catch (err) {
                console.log(`⚠️ 字段 ${field.name} 可能已存在:`, err.message);
            }
        }
        
        // 为 users 表添加 email 字段
        console.log('📋 正在为 users 表添加 email 字段...');
        
        try {
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)
            `);
            console.log('✅ 添加字段: email');
        } catch (err) {
            console.log('⚠️ email 字段可能已存在:', err.message);
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ 所有字段添加完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 添加字段失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

addMissingFields();