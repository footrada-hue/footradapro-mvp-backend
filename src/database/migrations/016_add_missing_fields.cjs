/**
 * 添加 matches 表缺失的所有字段
 * 包括 home_logo, away_logo 等
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 數據庫路徑
const dbPath = path.resolve(__dirname, '../data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 開始添加缺失字段...');
console.log('📁 數據庫路徑:', dbPath);

// 獲取當前表結構
db.all("PRAGMA table_info(matches)", [], (err, columns) => {
  if (err) {
    console.error('❌ 獲取字段信息失敗:', err);
    return;
  }
  
  const columnNames = columns.map(col => col.name);
  console.log('📊 當前字段:', columnNames.join(', '));
  
  // 需要添加的字段列表
  const fieldsToAdd = [
    { name: 'home_logo', type: 'TEXT', default: null },
    { name: 'away_logo', type: 'TEXT', default: null },
    { name: 'external_id', type: 'TEXT', default: null },
    { name: 'is_active', type: 'INTEGER', default: 0 },
    { name: 'last_sync', type: 'TIMESTAMP', default: null },
    { name: 'league_logo', type: 'TEXT', default: null }
  ];
  
  let pending = fieldsToAdd.length;
  
  fieldsToAdd.forEach(field => {
    if (!columnNames.includes(field.name)) {
      console.log(`➕ 添加字段: ${field.name} (${field.type})`);
      
      let sql = `ALTER TABLE matches ADD COLUMN ${field.name} ${field.type}`;
      if (field.default !== null) {
        sql += ` DEFAULT ${field.default}`;
      }
      
      db.run(sql, function(err) {
        if (err) {
          console.error(`❌ 添加 ${field.name} 失敗:`, err.message);
        } else {
          console.log(`✅ ${field.name} 添加成功`);
        }
        
        pending--;
        if (pending === 0) {
          createIndexes();
        }
      });
    } else {
      console.log(`✅ ${field.name} 字段已存在`);
      pending--;
      if (pending === 0) {
        createIndexes();
      }
    }
  });
});

function createIndexes() {
  console.log('\n🔨 創建索引...');
  
  db.run("CREATE INDEX IF NOT EXISTS idx_matches_external_id ON matches(external_id)", (err) => {
    if (err) {
      console.error('❌ 創建 external_id 索引失敗:', err.message);
    } else {
      console.log('✅ external_id 索引創建成功');
    }
  });
  
  db.run("CREATE INDEX IF NOT EXISTS idx_matches_is_active ON matches(is_active)", (err) => {
    if (err) {
      console.error('❌ 創建 is_active 索引失敗:', err.message);
    } else {
      console.log('✅ is_active 索引創建成功');
    }
  });
  
  // 更新默認值
  db.run("UPDATE matches SET is_active = 0 WHERE is_active IS NULL", (err) => {
    if (err) {
      console.error('❌ 更新 is_active 默認值失敗:', err.message);
    } else {
      console.log('✅ is_active 默認值設置成功');
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
      
      const required = ['home_logo', 'away_logo', 'external_id', 'is_active'];
      const missing = required.filter(f => !newColumnNames.includes(f));
      
      if (missing.length === 0) {
        console.log('\n✅ 所有必要字段已添加成功！');
        console.log('🎉 現在可以運行同步腳本了');
      } else {
        console.log('\n⚠️ 缺少字段:', missing.join(', '));
      }
      
      db.close();
    });
  }, 1000);
}


