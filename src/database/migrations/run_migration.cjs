/**
 * 數據庫 migration 執行腳本 (CommonJS 版本)
 * 直接使用 SQLite 命令添加字段
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 數據庫路徑
const dbPath = path.resolve(__dirname, '../data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 開始執行數據庫 migration...');
console.log('📁 數據庫路徑:', dbPath);

// 序列執行 migration
db.serialize(() => {
  
  // 檢查字段是否已存在
  db.get("PRAGMA table_info(matches)", (err, rows) => {
    if (err) {
      console.error('❌ 檢查表結構失敗:', err);
      return;
    }
  });
  
  // 獲取所有字段
  db.all("PRAGMA table_info(matches)", [], (err, columns) => {
    if (err) {
      console.error('❌ 獲取字段信息失敗:', err);
      return;
    }
    
    const columnNames = columns.map(col => col.name);
    console.log('📊 當前字段:', columnNames.join(', '));
    
    // 添加 external_id 字段（如果不存在）
    if (!columnNames.includes('external_id')) {
      console.log('➕ 添加字段: external_id');
      db.run("ALTER TABLE matches ADD COLUMN external_id TEXT", (err) => {
        if (err) {
          console.error('❌ 添加 external_id 失敗:', err);
        } else {
          console.log('✅ external_id 添加成功');
        }
      });
    } else {
      console.log('✅ external_id 字段已存在');
    }
    
    // 添加 is_active 字段（如果不存在）
    if (!columnNames.includes('is_active')) {
      console.log('➕ 添加字段: is_active');
      db.run("ALTER TABLE matches ADD COLUMN is_active INTEGER DEFAULT 0", (err) => {
        if (err) {
          console.error('❌ 添加 is_active 失敗:', err);
        } else {
          console.log('✅ is_active 添加成功');
          
          // 更新默認值
          db.run("UPDATE matches SET is_active = 0 WHERE is_active IS NULL", (err) => {
            if (err) {
              console.error('❌ 更新 is_active 默認值失敗:', err);
            } else {
              console.log('✅ is_active 默認值設置成功');
            }
          });
        }
      });
    } else {
      console.log('✅ is_active 字段已存在');
    }
    
    // 添加 last_sync 字段（如果不存在）
    if (!columnNames.includes('last_sync')) {
      console.log('➕ 添加字段: last_sync');
      db.run("ALTER TABLE matches ADD COLUMN last_sync TIMESTAMP", (err) => {
        if (err) {
          console.error('❌ 添加 last_sync 失敗:', err);
        } else {
          console.log('✅ last_sync 添加成功');
        }
      });
    } else {
      console.log('✅ last_sync 字段已存在');
    }
    
    // 添加 league_logo 字段（如果不存在）
    if (!columnNames.includes('league_logo')) {
      console.log('➕ 添加字段: league_logo');
      db.run("ALTER TABLE matches ADD COLUMN league_logo TEXT", (err) => {
        if (err) {
          console.error('❌ 添加 league_logo 失敗:', err);
        } else {
          console.log('✅ league_logo 添加成功');
        }
      });
    } else {
      console.log('✅ league_logo 字段已存在');
    }
    
    // 創建索引（延遲一點執行，確保字段已添加）
    setTimeout(() => {
      console.log('\n🔨 創建索引...');
      
      db.run("CREATE INDEX IF NOT EXISTS idx_matches_external_id ON matches(external_id)", (err) => {
        if (err) {
          console.error('❌ 創建 external_id 索引失敗:', err);
        } else {
          console.log('✅ external_id 索引創建成功');
        }
      });
      
      db.run("CREATE INDEX IF NOT EXISTS idx_matches_is_active ON matches(is_active)", (err) => {
        if (err) {
          console.error('❌ 創建 is_active 索引失敗:', err);
        } else {
          console.log('✅ is_active 索引創建成功');
        }
      });
      
      db.run("CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches(match_time)", (err) => {
        if (err) {
          console.error('❌ 創建 match_time 索引失敗:', err);
        } else {
          console.log('✅ match_time 索引創建成功');
        }
      });
      
      // 最後驗證
      setTimeout(() => {
        db.all("PRAGMA table_info(matches)", [], (err, newColumns) => {
          if (err) {
            console.error('❌ 驗證失敗:', err);
            return;
          }
          
          const newColumnNames = newColumns.map(col => col.name);
          console.log('\n📊 更新後的字段:', newColumnNames.join(', '));
          
          const hasIsActive = newColumnNames.includes('is_active');
          const hasExternalId = newColumnNames.includes('external_id');
          
          if (hasIsActive && hasExternalId) {
            console.log('\n✅ 所有必要字段已添加成功！');
            console.log('🎉 現在可以運行同步腳本了');
          } else {
            console.log('\n⚠️ 部分字段可能未添加成功：');
            if (!hasIsActive) console.log('   - is_active 字段缺失');
            if (!hasExternalId) console.log('   - external_id 字段缺失');
          }
          
          // 關閉數據庫連接
          db.close();
        });
      }, 1000);
    }, 1000);
  });
});

console.log('⏳ 正在執行 migration，請稍候...');