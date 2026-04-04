/**
 * 查看隊徽數據腳本
 * 運行: node check-logos.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📊 比賽隊徽數據查詢結果：');
console.log('='.repeat(80));

db.all(`
    SELECT 
        id, 
        home_team, 
        home_logo, 
        away_team, 
        away_logo,
        CASE 
            WHEN home_logo IS NOT NULL AND home_logo != '' THEN '✅' 
            ELSE '❌' 
        END as home_has_logo,
        CASE 
            WHEN away_logo IS NOT NULL AND away_logo != '' THEN '✅' 
            ELSE '❌' 
        END as away_has_logo
    FROM matches 
    ORDER BY id 
    LIMIT 5
`, (err, rows) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
        return;
    }

    console.log('\n📝 前5場比賽隊徽情況：\n');
    
    rows.forEach((row, index) => {
        console.log(`【比賽 ${index + 1}】ID: ${row.id}`);
        console.log(`🏠 主隊: ${row.home_team}`);
        console.log(`   logo: ${row.home_has_logo} ${row.home_logo || '無'}`);
        console.log(`🚗 客隊: ${row.away_team}`);
        console.log(`   logo: ${row.away_has_logo} ${row.away_logo || '無'}`);
        console.log('-'.repeat(50));
    });

    // 統計總數
    db.get(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN home_logo IS NOT NULL AND home_logo != '' THEN 1 ELSE 0 END) as home_with_logo,
            SUM(CASE WHEN away_logo IS NOT NULL AND away_logo != '' THEN 1 ELSE 0 END) as away_with_logo
        FROM matches
    `, (err, stats) => {
        if (!err) {
            console.log('\n📊 統計信息：');
            console.log(`總比賽數: ${stats.total}`);
            console.log(`有主隊隊徽: ${stats.home_with_logo} 場 (${Math.round(stats.home_with_logo/stats.total*100)}%)`);
            console.log(`有客隊隊徽: ${stats.away_with_logo} 場 (${Math.round(stats.away_with_logo/stats.total*100)}%)`);
        }
        db.close();
    });
});