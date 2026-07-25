// update-notifications-to-english.js
// 将数据库中的中文通知更新为英文

import pg from 'pg';

const { Pool } = pg;

// Render PostgreSQL 数据库连接字符串
const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function updateNotificationsToEnglish() {
    console.log('🌐 开始将通知更新为英文...\n');
    
    try {
        // 1. 查看更新前的数据
        console.log('📋 更新前的通知数据:');
        const beforeResult = await pool.query(`
            SELECT id, type, title, content, created_at 
            FROM user_notifications 
            WHERE type IN ('settlement_win', 'settlement_loss')
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        if (beforeResult.rows.length === 0) {
            console.log('   ⚠️ 没有找到结算相关的通知记录');
        } else {
            beforeResult.rows.forEach(row => {
                console.log(`   ID: ${row.id} | Type: ${row.type}`);
                console.log(`   Title: ${row.title}`);
                console.log(`   Content: ${row.content}`);
                console.log('   ---');
            });
        }
        
        console.log('\n🔄 开始执行更新...\n');
        
        // 2. 更新标题 - 结算胜利
        const winTitleResult = await pool.query(`
            UPDATE user_notifications 
            SET title = '🎉 Match Settlement Completed' 
            WHERE title = '🎉 比赛结算完成' AND type = 'settlement_win'
        `);
        console.log(`   ✅ 更新结算胜利标题: ${winTitleResult.rowCount} 条`);
        
        // 3. 更新标题 - 结算失败
        const lossTitleResult = await pool.query(`
            UPDATE user_notifications 
            SET title = '📉 Match Settlement Completed' 
            WHERE title = '📉 比赛结算完成' AND type = 'settlement_loss'
        `);
        console.log(`   ✅ 更新结算失败标题: ${lossTitleResult.rowCount} 条`);
        
        // 4. 更新其他中文标题
        const otherTitlesResult = await pool.query(`
            UPDATE user_notifications 
            SET title = REPLACE(title, '比赛结算完成', 'Match Settlement Completed')
            WHERE title LIKE '%比赛结算完成%'
        `);
        console.log(`   ✅ 更新其他结算标题: ${otherTitlesResult.rowCount} 条`);
        
        // 5. 更新内容 - 替换关键词
        const profitResult = await pool.query(`
            UPDATE user_notifications 
            SET content = REPLACE(content, '盈利', 'Profit')
            WHERE content LIKE '%盈利%'
        `);
        console.log(`   ✅ 替换"盈利" -> "Profit": ${profitResult.rowCount} 条`);
        
        const lossResult = await pool.query(`
            UPDATE user_notifications 
            SET content = REPLACE(content, '亏损', 'Loss')
            WHERE content LIKE '%亏损%'
        `);
        console.log(`   ✅ 替换"亏损" -> "Loss": ${lossResult.rowCount} 条`);
        
        const profitSpaceResult = await pool.query(`
            UPDATE user_notifications 
            SET content = REPLACE(content, ' 盈利 ', ' Profit ')
            WHERE content LIKE '% 盈利 %'
        `);
        console.log(`   ✅ 替换" 盈利 " -> " Profit ": ${profitSpaceResult.rowCount} 条`);
        
        const lossSpaceResult = await pool.query(`
            UPDATE user_notifications 
            SET content = REPLACE(content, ' 亏损 ', ' Loss ')
            WHERE content LIKE '% 亏损 %'
        `);
        console.log(`   ✅ 替换" 亏损 " -> " Loss ": ${lossSpaceResult.rowCount} 条`);
        
        const settlementResult = await pool.query(`
            UPDATE user_notifications 
            SET content = REPLACE(content, '结算完成', 'Settlement Completed')
            WHERE content LIKE '%结算完成%'
        `);
        console.log(`   ✅ 替换"结算完成" -> "Settlement Completed": ${settlementResult.rowCount} 条`);
        
        // 6. 更新充值相关通知
        const depositResult = await pool.query(`
            UPDATE user_notifications 
            SET title = REPLACE(title, '充值成功', 'Deposit Successful')
            WHERE title LIKE '%充值成功%'
        `);
        console.log(`   ✅ 更新充值成功标题: ${depositResult.rowCount} 条`);
        
        // 7. 更新提现相关通知
        const withdrawResult = await pool.query(`
            UPDATE user_notifications 
            SET title = REPLACE(title, '提现成功', 'Withdrawal Successful')
            WHERE title LIKE '%提现成功%'
        `);
        console.log(`   ✅ 更新提现成功标题: ${withdrawResult.rowCount} 条`);
        
        console.log('\n📋 更新后的通知数据:');
        const afterResult = await pool.query(`
            SELECT id, type, title, content, created_at 
            FROM user_notifications 
            WHERE type IN ('settlement_win', 'settlement_loss')
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        if (afterResult.rows.length === 0) {
            console.log('   ⚠️ 没有找到结算相关的通知记录');
        } else {
            afterResult.rows.forEach(row => {
                console.log(`   ID: ${row.id} | Type: ${row.type}`);
                console.log(`   Title: ${row.title}`);
                console.log(`   Content: ${row.content}`);
                console.log('   ---');
            });
        }
        
        // 8. 统计更新结果
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN title LIKE '%Match Settlement Completed%' THEN 1 ELSE 0 END) as english_titles,
                SUM(CASE WHEN content LIKE '%Profit%' OR content LIKE '%Loss%' THEN 1 ELSE 0 END) as english_content
            FROM user_notifications 
            WHERE type IN ('settlement_win', 'settlement_loss')
        `);
        
        console.log('\n📊 更新统计:');
        console.log(`   总通知数: ${stats.rows[0].total}`);
        console.log(`   英文标题数: ${stats.rows[0].english_titles}`);
        console.log(`   英文内容数: ${stats.rows[0].english_content}`);
        
        console.log('\n🎉 通知更新完成！');
        console.log('📍 请刷新页面查看效果');
        
    } catch (err) {
        console.error('❌ 更新失败:', err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
    }
}

// 执行更新
updateNotificationsToEnglish();