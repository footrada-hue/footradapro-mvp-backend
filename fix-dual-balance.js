// fix-dual-balance.js
// 添加双余额系统所需的字段

import pg from 'pg';

const { Pool } = pg;

// 你的 Render PostgreSQL 连接串
const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addDualBalanceFields() {
    console.log('🔍 正在连接数据库...');
    
    try {
        // 测试连接
        await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接成功');
        
        // 1. 添加 users 表的 test_balance 字段
        console.log('\n📋 正在添加 users.test_balance...');
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS test_balance DECIMAL(20,2) DEFAULT 0
        `);
        console.log('✅ users.test_balance 添加成功');
        
        // 2. 添加 users 表的 real_balance 字段
        console.log('\n📋 正在添加 users.real_balance...');
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS real_balance DECIMAL(20,2) DEFAULT 0
        `);
        console.log('✅ users.real_balance 添加成功');
        
        // 3. 初始化现有用户的 real_balance（将 balance 复制过去）
        console.log('\n📋 正在初始化现有用户的 real_balance...');
        const updateResult = await pool.query(`
            UPDATE users 
            SET real_balance = COALESCE(real_balance, balance)
            WHERE real_balance IS NULL OR real_balance = 0
        `);
        console.log(`✅ 已更新 ${updateResult.rowCount} 个用户的 real_balance`);
        
        // 4. 添加 balance_logs 表的 mode 字段
        console.log('\n📋 正在添加 balance_logs.mode...');
        await pool.query(`
            ALTER TABLE balance_logs ADD COLUMN IF NOT EXISTS mode VARCHAR(10) DEFAULT 'real'
        `);
        console.log('✅ balance_logs.mode 添加成功');
        
        // 5. 检查 withdraw_requests 表是否存在，如果存在则添加 mode 字段
        console.log('\n📋 正在检查 withdraw_requests 表...');
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'withdraw_requests'
            ) as exists
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('📋 正在添加 withdraw_requests.mode...');
            await pool.query(`
                ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS mode VARCHAR(10) DEFAULT 'real'
            `);
            console.log('✅ withdraw_requests.mode 添加成功');
        } else {
            console.log('⚠️ withdraw_requests 表不存在，跳过');
        }
        
        // 6. 验证所有字段是否添加成功
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 验证迁移结果...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const verifyResult = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'test_balance') as users_test,
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'real_balance') as users_real,
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'balance_logs' AND column_name = 'mode') as logs_mode,
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'withdraw_requests' AND column_name = 'mode') as withdraw_mode
        `);
        
        console.log(`   users.test_balance: ${verifyResult.rows[0].users_test > 0 ? '✅' : '❌'}`);
        console.log(`   users.real_balance: ${verifyResult.rows[0].users_real > 0 ? '✅' : '❌'}`);
        console.log(`   balance_logs.mode: ${verifyResult.rows[0].logs_mode > 0 ? '✅' : '❌'}`);
        console.log(`   withdraw_requests.mode: ${verifyResult.rows[0].withdraw_mode > 0 ? '✅' : '❌'}`);
        
        // 7. 显示统计数据
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 当前余额统计...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const balanceResult = await pool.query(`
            SELECT 
                COALESCE(SUM(test_balance), 0) as total_test_balance,
                COALESCE(SUM(real_balance), 0) as total_real_balance,
                COALESCE(SUM(balance), 0) as total_old_balance
            FROM users
        `);
        
        console.log(`   🧪 测试模式总余额: ${balanceResult.rows[0].total_test_balance} USDT`);
        console.log(`   💰 真实模式总余额: ${balanceResult.rows[0].total_real_balance} USDT`);
        console.log(`   📊 原始 balance 总余额: ${balanceResult.rows[0].total_old_balance} USDT`);
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ 双余额系统数据库迁移完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 迁移失败:', error.message);
        console.error('详细信息:', error);
    } finally {
        await pool.end();
        console.log('\n🔌 数据库连接已关闭');
    }
}

// 运行脚本
addDualBalanceFields();