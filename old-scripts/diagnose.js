// diagnose.js
import { initDatabase, getDb } from './src/database/connection.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function diagnose() {
    console.log('=== FOOTRADAPRO 诊断工具 ===\n');
    console.log('当前目录:', process.cwd());
    console.log('脚本目录:', __dirname);
    
    let db = null;
    
    try {
        // 1. 检查文件是否存在
        const connectionPath = path.join(process.cwd(), 'src', 'database', 'connection.js');
        console.log('\n📁 检查 connection.js:', connectionPath);
        
        if (fs.existsSync(connectionPath)) {
            console.log('✅ connection.js 存在');
        } else {
            console.log('❌ connection.js 不存在');
            return;
        }
        
        // 2. 检查数据库文件
        const dbPath = path.join(process.cwd(), 'src', 'database', 'data', 'footradapro.sqlite');
        console.log('\n📁 数据库路径:', dbPath);
        
        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            console.log('✅ 数据库文件存在');
            console.log(`   - 大小: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log(`   - 修改时间: ${stats.mtime}`);
        } else {
            console.log('❌ 数据库文件不存在');
        }
        
        // 3. 确保数据目录存在
        const dataDir = path.join(process.cwd(), 'src', 'database', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('✅ 创建数据目录');
        }
        
        // 4. 初始化数据库
        console.log('\n🔄 正在初始化数据库...');
        await initDatabase();
        console.log('✅ 数据库初始化成功');
        
        // 5. 获取数据库连接
        db = getDb();
        console.log('✅ 获取数据库连接成功');
        
        // 6. 检查 matches 表
        console.log('\n📊 检查 matches 表...');
        
        // 获取所有表
        const allTables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table'
        `).all();
        
        console.log('现有表:');
        allTables.forEach(t => console.log(`   - ${t.name}`));
        
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='matches'
        `).get();
        
        if (!tables) {
            console.log('❌ matches 表不存在，正在创建...');
            
            db.exec(`
                CREATE TABLE IF NOT EXISTS matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    home_team TEXT NOT NULL,
                    away_team TEXT NOT NULL,
                    league TEXT NOT NULL,
                    match_time DATETIME NOT NULL,
                    cutoff_time DATETIME,
                    odds_home REAL DEFAULT 1.0,
                    odds_draw REAL DEFAULT 1.0,
                    odds_away REAL DEFAULT 1.0,
                    home_score INTEGER DEFAULT NULL,
                    away_score INTEGER DEFAULT NULL,
                    status TEXT DEFAULT 'upcoming',
                    result TEXT,
                    report TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ matches 表创建成功');
        } else {
            console.log('✅ matches 表已存在');
        }
        
        // 7. 获取表结构
        const schema = db.prepare('PRAGMA table_info(matches)').all();
        console.log('\n📋 matches 表结构:');
        schema.forEach(col => {
            console.log(`   - ${col.name} (${col.type})`);
        });
        
        // 8. 检查数据
        const count = db.prepare('SELECT COUNT(*) as count FROM matches').get();
        console.log(`\n📊 当前数据数量: ${count.count} 条记录`);
        
        if (count.count === 0) {
            console.log('\n🔄 插入测试数据...');
            
            const now = new Date();
            
            // 生成唯一的 match_id
            const timestamp = Date.now();
            const matchId1 = 'M' + timestamp + '1';
            const matchId2 = 'M' + timestamp + '2';
            const matchId3 = 'M' + timestamp + '3';
            
            const testMatches = [
                {
                    match_id: matchId1,
                    home_team: '曼城',
                    away_team: '利物浦',
                    league: '英超',
                    match_time: new Date(now.getTime() + 2*24*60*60*1000).toISOString(),
                    cutoff_time: new Date(now.getTime() + 2*24*60*60*1000 - 3600000).toISOString(),
                    odds_home: 1.85,
                    odds_draw: 3.40,
                    odds_away: 3.80,
                    status: 'upcoming'
                },
                {
                    match_id: matchId2,
                    home_team: '皇马',
                    away_team: '巴萨',
                    league: '西甲',
                    match_time: new Date(now.getTime() + 3*24*60*60*1000).toISOString(),
                    cutoff_time: new Date(now.getTime() + 3*24*60*60*1000 - 3600000).toISOString(),
                    odds_home: 1.95,
                    odds_draw: 3.30,
                    odds_away: 3.50,
                    status: 'upcoming'
                },
                {
                    match_id: matchId3,
                    home_team: '拜仁',
                    away_team: '多特蒙德',
                    league: '德甲',
                    match_time: new Date(now.getTime() + 4*24*60*60*1000).toISOString(),
                    cutoff_time: new Date(now.getTime() + 4*24*60*60*1000 - 3600000).toISOString(),
                    odds_home: 1.75,
                    odds_draw: 3.60,
                    odds_away: 4.00,
                    status: 'upcoming'
                }
            ];
            
            // 使用事务插入数据
            const insertMatch = db.prepare(`
                INSERT INTO matches (
                    match_id, home_team, away_team, league, 
                    match_time, cutoff_time, odds_home, odds_draw, odds_away, 
                    status, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                    datetime('now'), datetime('now')
                )
            `);
            
            // 开始事务
            db.exec('BEGIN TRANSACTION');
            
            try {
                testMatches.forEach(match => {
                    insertMatch.run(
                        match.match_id,
                        match.home_team,
                        match.away_team,
                        match.league,
                        match.match_time,
                        match.cutoff_time,
                        match.odds_home,
                        match.odds_draw,
                        match.odds_away,
                        match.status
                    );
                });
                
                db.exec('COMMIT');
                console.log(`✅ 已插入 ${testMatches.length} 条测试数据`);
                
            } catch (insertError) {
                db.exec('ROLLBACK');
                console.error('❌ 插入失败:', insertError.message);
                throw insertError;
            }
        }
        
        // 9. 测试查询
        console.log('\n🔍 测试查询...');
        
        try {
            // 先检查数据是否真的插入了
            const afterInsertCount = db.prepare('SELECT COUNT(*) as count FROM matches').get();
            console.log(`插入后数据数量: ${afterInsertCount.count} 条记录`);
            
            const testQuery = db.prepare(`
                SELECT 
                    id,
                    match_id,
                    home_team,
                    away_team,
                    league,
                    match_time,
                    cutoff_time,
                    odds_home,
                    odds_draw,
                    odds_away,
                    status,
                    CASE 
                        WHEN datetime(cutoff_time) > datetime('now') THEN 1 
                        ELSE 0 
                    END as is_open
                FROM matches 
                WHERE status IN ('upcoming', 'open')
                ORDER BY match_time ASC
                LIMIT 5
            `).all();
            
            console.log(`✅ 查询成功，返回 ${testQuery.length} 条记录`);
            if (testQuery.length > 0) {
                console.log('\n📊 查询结果样例:');
                console.log(JSON.stringify(testQuery[0], null, 2));
                
                // 测试 API 会返回的数据格式
                console.log('\n📊 API 返回数据格式示例:');
                console.log(JSON.stringify({
                    success: true,
                    data: testQuery
                }, null, 2));
            } else {
                console.log('⚠️ 查询返回0条记录');
            }
            
        } catch (queryError) {
            console.error('❌ 查询失败:', queryError.message);
        }
        
        // 10. 测试单场比赛查询
        console.log('\n🔍 测试单场比赛查询...');
        
        try {
            const firstMatch = db.prepare('SELECT id FROM matches LIMIT 1').get();
            if (firstMatch) {
                const singleMatch = db.prepare(`
                    SELECT * FROM matches WHERE id = ?
                `).get(firstMatch.id);
                
                console.log(`✅ 查询单场比赛成功 (ID: ${firstMatch.id})`);
                console.log(JSON.stringify(singleMatch, null, 2));
            } else {
                console.log('⚠️ 没有找到比赛数据');
            }
            
        } catch (queryError) {
            console.error('❌ 查询单场比赛失败:', queryError.message);
        }
        
        // 11. 检查路由注册
        console.log('\n🌐 路由检查:');
        console.log('   前台比赛路由: /api/v1/front/matches');
        console.log('   管理员比赛路由: /api/v1/admin/matches');
        console.log('   当前注册路径: /api/v1/matches (在 app.js 中)');
        
        console.log('\n✅ 诊断完成！');
        console.log('\n💡 接下来请测试 API:');
        console.log('   1. 确保服务器正在运行: npm run dev');
        console.log('   2. 测试 API: curl http://localhost:3000/api/v1/matches');
        console.log('   3. 或在浏览器打开: http://localhost:3000/api/v1/matches');
        
    } catch (error) {
        console.error('\n❌ 诊断失败:');
        console.error(error);
        
        if (db) {
            try {
                db.exec('ROLLBACK');
            } catch (e) {
                // ignore
            }
        }
    }
}

// 运行诊断
diagnose();