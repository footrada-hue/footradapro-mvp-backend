/**
 * Auto Fetch Matches Cron Job
 * @description 每周从 DeepSeek API 获取比赛数据并录入（优化版）
 * @version 2.1.0
 * @since 2026-04-01
 * 
 * 优化说明：
 * - 执行频率：每周一 UTC 00:30
 * - 一次获取覆盖未来 7 天比赛
 * - 大幅减少 API 调用次数
 */

import cron from 'node-cron';
import { autoFetchAndInsertMatches } from '../services/match-auto-fetch.service.js';
import logger from '../utils/logger.js';

// 每周一 UTC 00:30 执行（北京时间 08:30）
// 格式: 分 时 日 月 周
// 30 0 * * 1 = 每周一 00:30 UTC
const CRON_SCHEDULE = '30 0 * * 1';

let isRunning = false;

/**
 * 计算下次执行时间（用于日志显示）
 * @returns {string} 格式化的时间字符串
 */
function getNextExecutionTime() {
    const now = new Date();
    const currentDay = now.getUTCDay(); // 0=周日, 1=周一, ...
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    let daysUntilMonday = (1 - currentDay + 7) % 7;
    if (daysUntilMonday === 0) {
        // 如果今天是周一，检查是否已经过了 00:30
        if (currentHour > 0 || (currentHour === 0 && currentMinute >= 30)) {
            daysUntilMonday = 7; // 下周一
        }
    }
    
    const nextDate = new Date(now);
    nextDate.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextDate.setUTCHours(0, 30, 0, 0);
    
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
        logger.info('⏰ 定时任务触发：开始自动获取比赛数据（每周更新）');
        const startTime = Date.now();
        const results = await autoFetchAndInsertMatches();
        const duration = Date.now() - startTime;
        
        // 输出统计信息
        logger.info(`
📊 比赛数据更新完成:
   - 总计获取: ${results.total} 场比赛
   - 新增 match_pool: ${results.newToPool}
   - 新增 matches: ${results.newToMatches}
   - 跳过已存在: ${results.skipped}
   - 错误: ${results.errors}
   - 耗时: ${duration}ms
        `);
        
        // 发送通知（可选）
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
    // 检查 API Key 是否配置
    if (!process.env.DEEPSEEK_API_KEY) {
        logger.warn('⚠️ DEEPSEEK_API_KEY 未配置，自动获取比赛任务不会启动');
        logger.warn('   请在 .env 文件中添加: DEEPSEEK_API_KEY=your_api_key');
        return;
    }
    
    // 检查是否为周一，如果是则启动时立即执行一次（可选）
    const today = new Date();
    const currentDay = today.getUTCDay(); // 0=周日, 1=周一
    const currentHour = today.getUTCHours();
    const currentMinute = today.getUTCMinutes();
    const isMonday = currentDay === 1;
    const isAfterDeadline = currentHour > 0 || (currentHour === 0 && currentMinute >= 30);
    
    if (isMonday && !isAfterDeadline) {
        // 周一且未过 00:30，启动时立即执行
        setTimeout(() => {
            logger.info('🚀 检测到周一且未过执行时间，启动时执行一次比赛数据获取');
            runJob();
        }, 5000); // 延迟5秒，等待数据库初始化完成
    } else if (isMonday && isAfterDeadline) {
        logger.info('📅 已过周一执行时间，等待下周一执行');
    } else {
        logger.info('📅 非周一，跳过启动时执行，等待定时任务');
    }
    
    // 定时执行
    cron.schedule(CRON_SCHEDULE, runJob);
    
    // 计算下次执行时间
    const nextTime = getNextExecutionTime();
    logger.info(`⏰ 自动获取比赛任务已启动，执行时间: 每周一 00:30 (UTC)`);
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