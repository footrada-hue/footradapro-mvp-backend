/**
 * 檢查 authorizations 表結構
 * 運行: node check-auth-table.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 檢查 authorizations 表結構...\n');

db.all("PRAGMA table_info(authorizations)", (err, columns) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
        db.close();
        return;
    }

    console.log('📋 authorizations 表字段:');
    console.log('='.repeat(60));
    columns.forEach(col => {
        const nullable = col.notnull ? 'NOT NULL' : 'NULL';
        const defaultValue = col.dflt_value ? `DEFAULT ${col.dflt_value}` : '';
        console.log(`${col.name.padEnd(20)} ${col.type.padEnd(10)} ${nullable.padEnd(10)} ${defaultValue}`);
    });
    console.log('='.repeat(60));

    db.close();
});