/**
 * Auto Fetch Matches Cron Job
 * @description 每天从 DeepSeek API 获取比赛数据并录入（优化版）
 * @version 3.0.0
 * @since 2026-04-01
 * 
 * 优化说明：
 * - 执行频率：每天 UTC 00:30
 * - 一次获取覆盖未来 7 天比赛
 * - 优先抓取世界杯比赛
 */

import cron from 'node-cron';
import { autoFetchAndInsertMatches } from '../services/match-auto-fetch.service.js';
import logger from '../utils/logger.js';

// 每天 UTC 00:30 执行（北京时间 08:30）
const CRON_SCHEDULE = '30 0 * * *';

let isRunning = false;

/**
 * 计算下次执行时间（用于日志显示）
 * @returns {string} 格式化的时间字符串
 */
function getNextExecutionTime() {
    const now = new Date();
    const nextDate = new Date(now);
    nextDate.setUTCHours(0, 30, 0, 0);
    if (now.getUTCHours() >= 0 && now.getUTCMinutes() >= 30) {
        nextDate.setUTCDate(now.getUTCDate() + 1);
    }
    return nextDate.toLocaleString();
}

/**
 * 执行任务
 */
async function runJob() {
    if (isRunning) {
        logger.warn('⏳ 上一个自动录入任务还在执行中，跳过本次');
        return;
    }
    
    isRunning = true;
    
    try {
        logger.info('⏰ 定时任务触发：开始自动获取比赛数据（每天更新）');
        const startTime = Date.now();
        const results = await autoFetchAndInsertMatches();
        const duration = Date.now() - startTime;
        
        logger.info(`
📊 比赛数据更新完成:
   - 总计获取: ${results.total} 场比赛
   - 新增 match_pool: ${results.newToPool}
   - 新增 matches: ${results.newToMatches}
   - 跳过已存在: ${results.skipped}
   - 错误: ${results.errors}
   - 耗时: ${duration}ms
        `);
        
        if (results.newToPool > 0) {
            logger.info(`📢 新增 ${results.newToPool} 场比赛，可用于动态消息生成`);
        }
        
    } catch (error) {
        logger.error('定时任务执行失败:', error);
    } finally {
        isRunning = false;
    }
}

/**
 * 启动定时任务
 */
export function startAutoFetchJob() {
    if (!process.env.DEEPSEEK_API_KEY) {
        logger.warn('⚠️ DEEPSEEK_API_KEY 未配置，自动获取比赛任务不会启动');
        logger.warn('   请在 .env 文件中添加: DEEPSEEK_API_KEY=your_api_key');
        return;
    }
    
    // 启动时立即执行一次
    setTimeout(() => {
        logger.info('🚀 启动时执行一次比赛数据获取');
        runJob();
    }, 5000);
    
    // 设置定时任务（每天执行）
    cron.schedule(CRON_SCHEDULE, runJob);
    
    const nextTime = getNextExecutionTime();
    logger.info(`⏰ 自动获取比赛任务已启动，执行时间: 每天 00:30 (UTC)`);
    logger.info(`📅 下次执行: ${nextTime}`);
}

/**
 * 手动触发任务（供 API 调用）
 * @returns {Promise<object>} 执行结果
 */
export async function triggerManually() {
    logger.info('👤 管理员手动触发比赛数据同步');
    return runJob();
}

export default {
    startAutoFetchJob,
    triggerManually
};