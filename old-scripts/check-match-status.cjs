/**
 * check-match-status.cjs
 * 檢查比賽狀態的腳本
 * 運行: node check-match-status.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📊 比賽狀態查詢\n');

// 1. 查看所有比賽的狀態分佈
db.all(`
    SELECT 
        status,
        COUNT(*) as count
    FROM matches
    GROUP BY status
`, (err, rows) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
    } else {
        console.log('📈 比賽狀態統計:');
        rows.forEach(row => {
            console.log(`   ${row.status || 'unknown'}: ${row.count} 場`);
        });
        console.log('');
    }
});

// 2. 查看最近的10場比賽
db.all(`
    SELECT 
        id,
        home_team,
        away_team,
        match_time,
        status,
        datetime(match_time) < datetime('now') as is_passed
    FROM matches
    ORDER BY match_time DESC
    LIMIT 10
`, (err, rows) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
    } else {
        console.log('📅 最近10場比賽:');
        rows.forEach((row, i) => {
            const passed = row.is_passed ? '⏰ 已過' : '🔮 未到';
            console.log(`${i+1}. ID: ${row.id} | ${row.home_team} vs ${row.away_team}`);
            console.log(`   時間: ${row.match_time} | 狀態: ${row.status} | ${passed}`);
            console.log('---');
        });
        console.log('');
    }
});

// 3. 查看已結束的比賽
db.all(`
    SELECT 
        id,
        home_team,
        away_team,
        match_time,
        status
    FROM matches
    WHERE status = 'finished' OR datetime(match_time) < datetime('now')
    ORDER BY match_time DESC
`, (err, rows) => {
    if (err) {
        console.error('❌ 查詢失敗:', err);
    } else {
        console.log('✅ 已結束或時間已過的比賽:');
        if (rows.length === 0) {
            console.log('   沒有找到已結束的比賽');
        } else {
            rows.forEach((row, i) => {
                console.log(`${i+1}. ID: ${row.id} | ${row.home_team} vs ${row.away_team}`);
                console.log(`   時間: ${row.match_time} | 當前狀態: ${row.status}`);
                console.log('---');
            });
        }
        console.log('');
    }
});

// 4. 查看授權記錄
db.all(`
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM authorizations
`, (err, rows) => {
    if (err) {
        console.error('❌ 查詢授權失敗:', err);
    } else {
        console.log('💰 授權記錄統計:');
        console.log(`   總授權數: ${rows[0]?.total || 0}`);
        console.log(`   待結算: ${rows[0]?.pending || 0}`);
    }
    
    db.close();
});