// add-logo-base64-column.js
// 为 team_logos 表添加 logo_base64 字段

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addColumn() {
    console.log('🔍 正在连接数据库...');
    
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        console.log('📋 正在为 team_logos 表添加 logo_base64 字段...');
        
        await pool.query(`
            ALTER TABLE team_logos ADD COLUMN IF NOT EXISTS logo_base64 TEXT
        `);
        console.log('✅ logo_base64 字段添加成功');
        
        // 验证字段是否添加成功
        const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'team_logos' AND column_name = 'logo_base64'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ 验证通过：logo_base64 字段已存在');
        } else {
            console.log('❌ 验证失败：logo_base64 字段不存在');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ logo_base64 字段添加完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 添加字段失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

addColumn();