/**
 * VIP等级配置
 */

export const VIP_CONFIG = {
    0: {
        name: 'VIP 0 - 试用',
        tradingShare: 0.1,      // 10% 交易份额
        commissionRate: 0.5,     // 50% 佣金
        threshold: 0,
        nextThreshold: 100,
        description: '新用户试用'
    },
    1: {
        name: 'VIP 1 - 青铜',
        tradingShare: 0.25,      // 25% 交易份额
        commissionRate: 0.4,     // 40% 佣金
        threshold: 100,
        nextThreshold: 500,
        description: '优先客服'
    },
    2: {
        name: 'VIP 2 - 白银',
        tradingShare: 0.4,       // 40% 交易份额
        commissionRate: 0.3,     // 30% 佣金
        threshold: 500,
        nextThreshold: 2000,
        description: '专属分析报告'
    },
    3: {
        name: 'VIP 3 - 黄金',
        tradingShare: 0.6,       // 60% 交易份额
        commissionRate: 0.2,     // 20% 佣金
        threshold: 2000,
        nextThreshold: 10000,
        description: '1对1策略顾问'
    },
    4: {
        name: 'VIP 4 - 钻石',
        tradingShare: 0.8,       // 80% 交易份额
        commissionRate: 0.15,    // 15% 佣金
        threshold: 10000,
        nextThreshold: null,
        description: '私人分析师'
    }
};

/**
 * 根据累计授权额获取VIP等级
 */
export function getVipLevel(totalAuthorized) {
    if (totalAuthorized >= 10000) return 4;
    if (totalAuthorized >= 2000) return 3;
    if (totalAuthorized >= 500) return 2;
    if (totalAuthorized >= 100) return 1;
    return 0;
}

/**
 * 获取下一级进度
 */
export function getVipProgress(totalAuthorized) {
    const currentLevel = getVipLevel(totalAuthorized);
    if (currentLevel === 4) return { progress: 100, next: null, need: 0 };
    
    const nextThreshold = VIP_CONFIG[currentLevel].nextThreshold;
    const currentThreshold = VIP_CONFIG[currentLevel].threshold;
    const progress = ((totalAuthorized - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    
    return {
        progress: Math.min(progress, 100),
        next: nextThreshold,
        need: Math.max(0, nextThreshold - totalAuthorized)
    };
}
