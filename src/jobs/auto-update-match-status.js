import { initDatabase, getDb } from '../database/connection.js';
import logger from '../utils/logger.js';

async function updateMatchStatus() {
    try {
        // 确保数据库已初始化
        await initDatabase();
        const db = getDb();
        
        const now = new Date().toISOString();
        
        // 1. 将已开始的比赛从 upcoming 改为 live
        const toLive = db.prepare(`
            UPDATE matches 
            SET status = 'live' 
            WHERE status = 'upcoming' 
            AND datetime(match_time) <= datetime(?)
        `).run(now);
        
        if (toLive.changes > 0) {
            logger.info(`⏰ 已将 ${toLive.changes} 场比赛状态更新为 live`);
        }
        
        // 2. 将已结束的比赛从 live 改为 finished
        const toFinished = db.prepare(`
            UPDATE matches 
            SET status = 'finished' 
            WHERE status = 'live' 
            AND datetime(match_time, '+110 minutes') <= datetime(?)
        `).run(now);
        
        if (toFinished.changes > 0) {
            logger.info(`✅ 已将 ${toFinished.changes} 场比赛状态更新为 finished`);
        }
        
    } catch (error) {
        logger.error('更新比赛状态失败:', error);
    }
}

// 立即执行一次
updateMatchStatus();

// 每 5 分钟执行一次
setInterval(updateMatchStatus, 5 * 60 * 1000);

export { updateMatchStatus };