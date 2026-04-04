/**
 * FOOTRADAPRO MVP - Match Service
 * @description 比赛相关的业务逻辑
 */

import logger from '../utils/logger.js';

class MatchService {
    /**
     * 检查授权窗口是否开放
     * @param {Object} match - 比赛对象
     * @returns {boolean}
     */
    isAuthorizationOpen(match) {
        if (!match) return false;
        
        // 已结束或已结算的比赛不能投注
        if (match.status === 'finished' || match.status === 'settled') return false;
        
        // 检查是否超过截止时间
        const now = new Date();
        const cutoff = new Date(match.cutoff_time);
        return now < cutoff;
    }

    /**
     * 检查比赛是否可结算
     * @param {Object} match - 比赛对象
     * @returns {boolean}
     */
    isSettlementAllowed(match) {
        if (!match) return false;
        
        // 比赛必须已结束且未结算
        return match.status === 'finished' && match.settled === 0;
    }

    /**
     * 获取前端显示状态
     * @param {Object} match - 比赛对象
     * @returns {string}
     */
    getDisplayStatus(match) {
        if (!match) return 'unknown';
        
        // 已发布结果
        if (match.published === 1) return 'published';
        
        // 已结算但未发布
        if (match.settled === 1) return 'settled';
        
        // 已结束但未结算
        if (match.status === 'finished') return 'settling';
        
        // 进行中
        if (match.status === 'live') return 'live';
        
        // 即将开始
        return match.status || 'upcoming';
    }

    /**
     * 验证客户端时间（防作弊）
     * @param {number} clientTime - 客户端时间戳
     * @param {number} toleranceMs - 允许误差（毫秒）
     * @returns {boolean}
     */
    validateClientTime(clientTime, toleranceMs = 5 * 60 * 1000) {
        const serverNow = Date.now();
        const clientTimeNum = parseInt(clientTime, 10);
        
        if (isNaN(clientTimeNum)) {
            logger.warn('客户端时间验证失败：非数字', { clientTime });
            return false;
        }
        
        const diff = Math.abs(serverNow - clientTimeNum);
        if (diff > toleranceMs) {
            logger.warn('客户端时间异常', { 
                serverTime: serverNow, 
                clientTime: clientTimeNum, 
                diff,
                tolerance: toleranceMs
            });
            return false;
        }
        
        return true;
    }

    /**
     * 计算投注盈亏
     * @param {Object} bet - 投注记录
     * @param {string} result - 比赛结果
     * @returns {number} 盈亏金额
     */
    calculateProfit(bet, result) {
        if (bet.selection === result) {
            // 赢了：利润 = 投注额 × (赔率 - 1)
            return bet.amount * (bet.odds - 1);
        } else {
            // 输了：亏损 = -投注额
            return -bet.amount;
        }
    }
}

export default new MatchService();