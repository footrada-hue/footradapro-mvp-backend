// scripts/cleanup-matches.js
import { getDb, initDatabase } from '../src/database/connection.js';
import logger from '../src/utils/logger.js';

// 球队名称标准化函数（与主服务保持一致）
function normalizeTeamName(teamName) {
    if (!teamName || typeof teamName !== 'string') return teamName;
    
    const TEAM_NAME_NORMALIZE = {
        'Arsenal': 'Arsenal', 'Arsenal FC': 'Arsenal', 'Arsenal Football Club': 'Arsenal',
        'Chelsea': 'Chelsea', 'Chelsea FC': 'Chelsea', 'Chelsea Football Club': 'Chelsea',
        'Manchester United': 'Manchester United', 'Manchester United FC': 'Manchester United',
        'Manchester City': 'Manchester City', 'Manchester City FC': 'Manchester City',
        'Liverpool': 'Liverpool', 'Liverpool FC': 'Liverpool',
        'Tottenham Hotspur': 'Tottenham Hotspur', 'Tottenham': 'Tottenham Hotspur',
        'FC Barcelona': 'Barcelona', 'Barcelona FC': 'Barcelona', 'Barcelona': 'Barcelona',
        'Real Madrid CF': 'Real Madrid', 'Real Madrid': 'Real Madrid',
        'Atletico Madrid': 'Atletico Madrid', 'Atlético Madrid': 'Atletico Madrid',
        'Bayern Munich': 'Bayern Munich', 'FC Bayern Munich': 'Bayern Munich',
        'Borussia Dortmund': 'Borussia Dortmund', 'Dortmund': 'Borussia Dortmund',
        'Inter Milan': 'Inter Milan', 'FC Internazionale Milano': 'Inter Milan',
        'AC Milan': 'AC Milan', 'Milan AC': 'AC Milan',
        'Juventus': 'Juventus', 'Juventus FC': 'Juventus',
        'Paris Saint-Germain': 'Paris Saint-Germain', 'PSG': 'Paris Saint-Germain'
    };
    
    if (TEAM_NAME_NORMALIZE[teamName]) return TEAM_NAME_NORMALIZE[teamName];
    
    let cleaned = teamName
        .replace(/^(FC|AFC|SC)\s+/i, '')
        .replace(/\s+(FC|AFC|SC|Football Club|F\.C\.)$/i, '')
        .trim();
    
    if (TEAM_NAME_NORMALIZE[cleaned]) return TEAM_NAME_NORMALIZE[cleaned];
    
    return cleaned;
}

async function cleanupDuplicates() {
    console.log('\n🔧 初始化数据库...');
    
    try {
        // 初始化数据库
        await initDatabase();
        console.log('✅ 数据库初始化成功\n');
    } catch (err) {
        console.error('❌ 数据库初始化失败:', err.message);
        process.exit(1);
    }
    
    const db = getDb();
    
    console.log('🔍 开始检查重复数据...\n');
    
    try {
        // ========== 1. 查询 match_pool 表中的重复数据 ==========
        console.log('📊 检查 match_pool 表重复数据...');
        
        const poolDuplicates = db.prepare(`
            SELECT 
                id,
                home_team,
                away_team,
                match_datetime,
                match_date
            FROM match_pool
            ORDER BY home_team, away_team, match_datetime
        `).all();
        
        // 手动分组查找重复
        const duplicateGroups = new Map();
        
        for (const row of poolDuplicates) {
            const normalizedHome = normalizeTeamName(row.home_team);
            const normalizedAway = normalizeTeamName(row.away_team);
            const dateKey = row.match_datetime ? row.match_datetime.split('T')[0] : row.match_date;
            const key = `${normalizedHome}|${normalizedAway}|${dateKey}`;
            
            if (!duplicateGroups.has(key)) {
                duplicateGroups.set(key, []);
            }
            duplicateGroups.get(key).push(row);
        }
        
        // 找出有重复的组
        const duplicatePoolRecords = [];
        for (const [key, records] of duplicateGroups) {
            if (records.length > 1) {
                duplicatePoolRecords.push(...records.slice(1)); // 保留第一个，其余为重复
            }
        }
        
        console.log(`   match_pool 总记录数: ${poolDuplicates.length}`);
        console.log(`   发现重复记录数: ${duplicatePoolRecords.length}`);
        
        if (duplicatePoolRecords.length > 0) {
            console.log('\n   重复记录详情:');
            for (const record of duplicatePoolRecords.slice(0, 10)) { // 只显示前10条
                console.log(`   - ID:${record.id} | ${record.home_team} vs ${record.away_team} | ${record.match_date}`);
            }
            if (duplicatePoolRecords.length > 10) {
                console.log(`   ... 还有 ${duplicatePoolRecords.length - 10} 条重复记录`);
            }
        }
        
        // ========== 2. 查询 matches 表中的重复数据 ==========
        console.log('\n📊 检查 matches 表重复数据...');
        
        const matchesDuplicates = db.prepare(`
            SELECT 
                id,
                match_id,
                home_team,
                away_team,
                match_time
            FROM matches
            ORDER BY home_team, away_team, match_time
        `).all();
        
        const matchDuplicateGroups = new Map();
        
        for (const row of matchesDuplicates) {
            const normalizedHome = normalizeTeamName(row.home_team);
            const normalizedAway = normalizeTeamName(row.away_team);
            const dateKey = row.match_time ? row.match_time.split('T')[0] : '';
            const key = `${normalizedHome}|${normalizedAway}|${dateKey}`;
            
            if (!matchDuplicateGroups.has(key)) {
                matchDuplicateGroups.set(key, []);
            }
            matchDuplicateGroups.get(key).push(row);
        }
        
        const duplicateMatchesRecords = [];
        for (const [key, records] of matchDuplicateGroups) {
            if (records.length > 1) {
                duplicateMatchesRecords.push(...records.slice(1));
            }
        }
        
        console.log(`   matches 总记录数: ${matchesDuplicates.length}`);
        console.log(`   发现重复记录数: ${duplicateMatchesRecords.length}`);
        
        if (duplicateMatchesRecords.length > 0) {
            console.log('\n   重复记录详情:');
            for (const record of duplicateMatchesRecords.slice(0, 10)) {
                console.log(`   - ID:${record.id} | ${record.home_team} vs ${record.away_team}`);
            }
            if (duplicateMatchesRecords.length > 10) {
                console.log(`   ... 还有 ${duplicateMatchesRecords.length - 10} 条重复记录`);
            }
        }
        
        // ========== 3. 如果没有重复数据，直接退出 ==========
        if (duplicatePoolRecords.length === 0 && duplicateMatchesRecords.length === 0) {
            console.log('\n✅ 没有发现重复数据！');
            
            // 仍然尝试创建唯一索引
            console.log('\n🔒 创建唯一索引防止未来重复...');
            try {
                db.prepare(`DROP INDEX IF EXISTS idx_match_pool_unique`).run();
                db.prepare(`DROP INDEX IF EXISTS idx_matches_unique`).run();
                
                db.prepare(`
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_match_pool_unique 
                    ON match_pool(home_team, away_team, date(match_datetime))
                `).run();
                console.log('   ✅ match_pool 唯一索引创建成功');
                
                db.prepare(`
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique 
                    ON matches(home_team, away_team, date(match_time))
                `).run();
                console.log('   ✅ matches 唯一索引创建成功');
            } catch (err) {
                console.log('   ⚠️  创建索引失败:', err.message);
            }
            
            return;
        }
        
        // ========== 4. 询问是否清理 ==========
        console.log('\n⚠️  准备清理重复数据...');
        
        // 自动清理（不询问，直接执行）
        console.log('🔧 开始自动清理...\n');
        
        // ========== 5. 删除重复数据 ==========
        if (duplicatePoolRecords.length > 0) {
            console.log('🗑️  清理 match_pool 重复数据...');
            
            // 先备份要删除的数据
            console.log(`   备份要删除的 ${duplicatePoolRecords.length} 条记录到 match_pool_deleted_backup`);
            db.prepare(`
                CREATE TABLE IF NOT EXISTS match_pool_deleted_backup AS 
                SELECT * FROM match_pool WHERE 0
            `).run();
            
            for (const record of duplicatePoolRecords) {
                db.prepare(`
                    INSERT INTO match_pool_deleted_backup 
                    SELECT * FROM match_pool WHERE id = ?
                `).run(record.id);
            }
            
            // 删除重复数据
            const deleteStmt = db.prepare(`DELETE FROM match_pool WHERE id = ?`);
            for (const record of duplicatePoolRecords) {
                deleteStmt.run(record.id);
            }
            
            console.log(`   ✅ 已删除 ${duplicatePoolRecords.length} 条重复记录`);
        }
        
        if (duplicateMatchesRecords.length > 0) {
            console.log('\n🗑️  清理 matches 重复数据...');
            
            // 备份
            db.prepare(`
                CREATE TABLE IF NOT EXISTS matches_deleted_backup AS 
                SELECT * FROM matches WHERE 0
            `).run();
            
            for (const record of duplicateMatchesRecords) {
                db.prepare(`
                    INSERT INTO matches_deleted_backup 
                    SELECT * FROM matches WHERE id = ?
                `).run(record.id);
            }
            
            // 删除
            const deleteStmt = db.prepare(`DELETE FROM matches WHERE id = ?`);
            for (const record of duplicateMatchesRecords) {
                deleteStmt.run(record.id);
            }
            
            console.log(`   ✅ 已删除 ${duplicateMatchesRecords.length} 条重复记录`);
        }
        
        // ========== 6. 更新球队名称为标准名称 ==========
        console.log('\n📝 更新球队名称为标准名称...');
        
        // 获取所有唯一的球队名称
        const allTeams = new Set();
        const poolTeams = db.prepare(`SELECT DISTINCT home_team as team FROM match_pool UNION SELECT DISTINCT away_team FROM match_pool`).all();
        const matchesTeams = db.prepare(`SELECT DISTINCT home_team as team FROM matches UNION SELECT DISTINCT away_team FROM matches`).all();
        
        [...poolTeams, ...matchesTeams].forEach(row => {
            if (row.team) allTeams.add(row.team);
        });
        
        const updates = [];
        for (const team of allTeams) {
            const normalized = normalizeTeamName(team);
            if (normalized !== team) {
                updates.push({ original: team, normalized });
                console.log(`   ${team} → ${normalized}`);
            }
        }
        
        if (updates.length > 0) {
            // 更新 match_pool
            for (const update of updates) {
                db.prepare(`UPDATE match_pool SET home_team = ? WHERE home_team = ?`).run(update.normalized, update.original);
                db.prepare(`UPDATE match_pool SET away_team = ? WHERE away_team = ?`).run(update.normalized, update.original);
                db.prepare(`UPDATE matches SET home_team = ? WHERE home_team = ?`).run(update.normalized, update.original);
                db.prepare(`UPDATE matches SET away_team = ? WHERE away_team = ?`).run(update.normalized, update.original);
            }
            console.log(`\n   ✅ 已更新 ${updates.length} 个球队名称`);
        } else {
            console.log(`   ✅ 所有球队名称已是标准格式`);
        }
        
        // ========== 7. 创建唯一索引防止未来重复 ==========
        console.log('\n🔒 创建唯一索引防止未来重复...');
        
        try {
            // 先删除可能存在的旧索引
            db.prepare(`DROP INDEX IF EXISTS idx_match_pool_unique`).run();
            db.prepare(`DROP INDEX IF EXISTS idx_matches_unique`).run();
            
            // 创建新索引
            db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_match_pool_unique 
                ON match_pool(home_team, away_team, date(match_datetime))
            `).run();
            console.log('   ✅ match_pool 唯一索引创建成功');
            
            db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique 
                ON matches(home_team, away_team, date(match_time))
            `).run();
            console.log('   ✅ matches 唯一索引创建成功');
            
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                console.log('   ⚠️  仍有重复数据存在，请先清理完成后再创建索引');
            } else {
                console.log('   ⚠️  创建索引失败:', err.message);
            }
        }
        
        // ========== 8. 输出清理结果 ==========
        console.log('\n' + '='.repeat(50));
        console.log('📊 清理完成统计:');
        console.log('='.repeat(50));
        console.log(`   match_pool 删除重复: ${duplicatePoolRecords.length} 条`);
        console.log(`   matches 删除重复: ${duplicateMatchesRecords.length} 条`);
        console.log(`   球队名称更新: ${updates.length} 个`);
        console.log('\n✅ 清理任务完成！');
        console.log('💡 备份表已创建: match_pool_deleted_backup, matches_deleted_backup');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('\n❌ 清理失败:', error.message);
        console.error(error.stack);
    }
}

// 执行清理
cleanupDuplicates().then(() => {
    console.log('\n✨ 脚本执行完毕');
    process.exit(0);
}).catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
});