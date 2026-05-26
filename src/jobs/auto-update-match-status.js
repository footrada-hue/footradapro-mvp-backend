import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

async function updateMatchStatus() {
    try {
        const { query, getDb, initDatabase } = await import('../database/connection.js');
        
        // 确保数据库已初始化
        await initDatabase();
        
        const now = new Date().toISOString();
        
        let liveChanges = 0;
        let finishedChanges = 0;
        
        if (isProduction) {
            // PostgreSQL 版本
            // 1. 将已开始的比赛从 upcoming 改为 live
            const toLive = await query(`
                UPDATE matches 
                SET status = 'live', updated_at = NOW()
                WHERE status = 'upcoming' 
                AND match_time <= $1::timestamp
                RETURNING id
            `, [now]);
            liveChanges = toLive?.length || 0;
            
            // 2. 将已结束的比赛从 live 改为 finished
            const toFinished = await query(`
                UPDATE matches 
                SET status = 'finished', updated_at = NOW()
                WHERE status = 'live' 
                AND match_time + INTERVAL '110 minutes' <= $1::timestamp
                RETURNING id
            `, [now]);
            finishedChanges = toFinished?.length || 0;
            
        } else {
            // SQLite 版本
            const db = getDb();
            
            const toLive = db.prepare(`
                UPDATE matches 
                SET status = 'live', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'upcoming' 
                AND datetime(match_time) <= datetime(?)
            `).run(now);
            liveChanges = toLive.changes;
            
            const toFinished = db.prepare(`
                UPDATE matches 
                SET status = 'finished', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'live' 
                AND datetime(match_time, '+110 minutes') <= datetime(?)
            `).run(now);
            finishedChanges = toFinished.changes;
        }
        
        if (liveChanges > 0) {
            logger.info(`⏰ 已将 ${liveChanges} 场比赛状态更新为 live`);
        }
        
        if (finishedChanges > 0) {
            logger.info(`✅ 已将 ${finishedChanges} 场比赛状态更新为 finished`);
        }
        
    } catch (error) {
        logger.error('更新比赛状态失败:', error);
    }
}

// 延迟执行，等待数据库初始化
setTimeout(() => {
    updateMatchStatus();
}, 3000);

// 每 5 分钟执行一次
setInterval(updateMatchStatus, 5 * 60 * 1000);

export { updateMatchStatus };