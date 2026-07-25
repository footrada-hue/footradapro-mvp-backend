/**
 * 脚本: 将已有通知从中文更新为英文
 * 执行: node scripts/update-notifications-to-english.js
 */

import { query, getDb } from '../src/database/connection.js';

const isProduction = process.env.NODE_ENV === 'production';

async function updateNotificationsToEnglish() {
  console.log('=== 开始更新通知为英文 ===\n');
  
  try {
    let updatedCount = 0;
    
    if (isProduction) {
      // PostgreSQL
      console.log('📦 使用 PostgreSQL 数据库');
      
      const result = await query(`
        UPDATE user_notifications 
        SET 
          title = CASE 
            WHEN title = '🎉 比赛结算完成' AND type = 'settlement_win' THEN '🎉 Match Settlement Completed'
            WHEN title = '📉 比赛结算完成' AND type = 'settlement_loss' THEN '📉 Match Settlement Completed'
            WHEN title LIKE '%充值成功%' THEN '✅ Deposit Successful'
            WHEN title LIKE '%充值失败%' THEN '❌ Deposit Failed'
            WHEN title LIKE '%提现成功%' THEN '✅ Withdrawal Successful'
            WHEN title LIKE '%提现失败%' THEN '❌ Withdrawal Failed'
            WHEN title LIKE '%系统通知%' THEN '📢 System Notification'
            WHEN title LIKE '%欢迎加入%' THEN '🎉 Welcome Aboard'
            ELSE title
          END,
          content = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(content, '盈利', 'Profit'), '亏损', 'Loss'),
            '充值', 'Deposit'), '提现', 'Withdrawal'),
            '成功', 'Success'), '失败', 'Failed'),
            '结算完成', 'Settlement Completed'),
            ' 盈利 ', ' Profit '),
            ' 亏损 ', ' Loss ')
        WHERE 
          title LIKE '%比赛结算完成%' 
          OR title LIKE '%充值%' 
          OR title LIKE '%提现%'
          OR content LIKE '%盈利%'
          OR content LIKE '%亏损%'
      `);
      
      updatedCount = result?.rowCount || 0;
      
    } else {
      // SQLite
      console.log('📦 使用 SQLite 数据库');
      const db = getDb();
      
      // 更新标题
      const titleUpdates = [
        { from: '🎉 比赛结算完成', to: '🎉 Match Settlement Completed', type: 'settlement_win' },
        { from: '📉 比赛结算完成', to: '📉 Match Settlement Completed', type: 'settlement_loss' }
      ];
      
      for (const update of titleUpdates) {
        const stmt = db.prepare(`
          UPDATE user_notifications 
          SET title = ? 
          WHERE title = ? AND type = ?
        `);
        const result = stmt.run(update.to, update.from, update.type);
        updatedCount += result.changes;
        console.log(`  更新标题: ${update.from} -> ${update.to} (${result.changes}条)`);
      }
      
      // 更新内容中的关键词
      const contentReplacements = [
        { from: '盈利', to: 'Profit' },
        { from: '亏损', to: 'Loss' },
        { from: '充值', to: 'Deposit' },
        { from: '提现', to: 'Withdrawal' },
        { from: '成功', to: 'Success' },
        { from: '失败', to: 'Failed' },
        { from: '结算完成', to: 'Settlement Completed' },
        { from: ' 盈利 ', to: ' Profit ' },
        { from: ' 亏损 ', to: ' Loss ' }
      ];
      
      for (const replace of contentReplacements) {
        const stmt = db.prepare(`
          UPDATE user_notifications 
          SET content = replace(content, ?, ?)
          WHERE content LIKE ?
        `);
        const result = stmt.run(replace.from, replace.to, `%${replace.from}%`);
        console.log(`  替换内容: "${replace.from}" -> "${replace.to}" (${result.changes}条)`);
        updatedCount += result.changes;
      }
    }
    
    console.log(`\n✅ 更新完成！共更新 ${updatedCount} 条通知记录`);
    
    // 验证结果
    console.log('\n📋 验证更新结果:');
    
    if (isProduction) {
      const verify = await query(`
        SELECT id, type, title, content, created_at 
        FROM user_notifications 
        WHERE type IN ('settlement_win', 'settlement_loss')
        ORDER BY created_at DESC
        LIMIT 5
      `);
      verify.forEach(n => {
        console.log(`  - [${n.type}] ${n.title}`);
        console.log(`    ${n.content.substring(0, 80)}...`);
      });
    } else {
      const db = getDb();
      const verify = db.prepare(`
        SELECT id, type, title, content, created_at 
        FROM user_notifications 
        WHERE type IN ('settlement_win', 'settlement_loss')
        ORDER BY created_at DESC
        LIMIT 5
      `).all();
      verify.forEach(n => {
        console.log(`  - [${n.type}] ${n.title}`);
        console.log(`    ${n.content.substring(0, 80)}...`);
      });
    }
    
  } catch (error) {
    console.error('❌ 更新失败:', error);
  }
}

// 执行脚本
updateNotificationsToEnglish();