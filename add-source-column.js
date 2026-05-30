// add-source-column.js
// 为 matches 表添加 source 列

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addSourceColumn() {
    console.log('🔍 正在连接数据库...');
    
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        // 添加 source 列
        console.log('📋 正在为 matches 表添加 source 列...');
        
        await pool.query(`
            ALTER TABLE matches ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual'
        `);
        console.log('✅ source 列添加成功');
        
        // 验证列是否添加成功
        const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'matches' AND column_name = 'source'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ 验证通过：source 列已存在');
        } else {
            console.log('❌ 验证失败：source 列不存在');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ source 列添加完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 添加列失败:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 数据库连接已关闭');
    }
}

addSourceColumn();