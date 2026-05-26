/**
 * 清算服務 - 新規則（基於執行比例）
 * @description 處理比賽清算、收益計算、用戶餘額更新
 */

/**
 * 計算單筆授權的清算結果
 * @param {Object} auth - 授權記錄 { id, user_id, amount, execution_rate? }
 * @param {Object} match - 比賽信息 { home_team, away_team, execution_rate }
 * @param {string} result - 'win' 或 'loss'
 * @param {number} profitRate - 盈利百分比（盈利時如40，虧損時固定0）
 * @param {number} platformFeeRate - 平台抽成率（預設0.2 = 20%）
 * @returns {Object} 清算結果
 */
export function calculateSettlement(auth, match, result, profitRate, platformFeeRate = 0.2) {
    // 使用比賽的執行比例，如果沒有則使用授權自帶的或默認30%
    const executionRate = match.execution_rate || auth.execution_rate || 30;
    
    // 計算部署金額和策略儲備
    const deployedAmount = auth.amount * (executionRate / 100);
    const reservedAmount = auth.amount - deployedAmount;
    
    let profit = 0;
    let platformFee = 0;
    let userProfit = 0;
    let returnAmount = 0;
    
    if (result === 'win') {
        // 盈利：部署資金產生收益
        profit = deployedAmount * (profitRate / 100);
        platformFee = profit * platformFeeRate;
        userProfit = profit - platformFee;
        returnAmount = deployedAmount + reservedAmount + userProfit;
    } else {
        // 虧損：只損失部署資金
        profit = -deployedAmount;
        platformFee = 0;
        userProfit = -deployedAmount;
        returnAmount = reservedAmount;
    }
    
    return {
        auth_id: auth.id,
        user_id: auth.user_id,
        amount: auth.amount,
        execution_rate: executionRate,
        deployed_amount: deployedAmount,
        reserved_amount: reservedAmount,
        result: result,
        profit_rate: result === 'win' ? profitRate : 0,
        profit: profit,
        platform_fee: platformFee,
        user_profit: userProfit,
        return_amount: returnAmount,
        status: result === 'win' ? 'won' : 'lost'
    };
}

/**
 * 批量清算比賽的所有授權
 * @param {Array} authorizations - 授權記錄列表
 * @param {Object} match - 比賽信息
 * @param {string} result - 'win' 或 'loss'
 * @param {number} profitRate - 盈利百分比
 * @returns {Object} 清算統計
 */
export function batchSettle(authorizations, match, result, profitRate) {
    const details = [];
    let totalAmount = 0;
    let totalDeployed = 0;
    let totalReserved = 0;
    let totalProfit = 0;
    let totalPlatformFee = 0;
    let totalUserProfit = 0;
    let totalReturn = 0;
    
    for (const auth of authorizations) {
        const detail = calculateSettlement(auth, match, result, profitRate);
        details.push(detail);
        
        totalAmount += detail.amount;
        totalDeployed += detail.deployed_amount;
        totalReserved += detail.reserved_amount;
        totalProfit += detail.profit;
        totalPlatformFee += detail.platform_fee;
        totalUserProfit += detail.user_profit;
        totalReturn += detail.return_amount;
    }
    
    return {
        details,
        summary: {
            match_id: match.id,
            match_name: `${match.home_team} vs ${match.away_team}`,
            execution_rate: match.execution_rate || 30,
            result: result,
            profit_rate: profitRate,
            total_authorizations: authorizations.length,
            total_amount: totalAmount,
            total_deployed: totalDeployed,
            total_reserved: totalReserved,
            total_profit: totalProfit,
            total_platform_fee: totalPlatformFee,
            total_user_profit: totalUserProfit,
            total_return: totalReturn
        }
    };
}

/**
 * 獲取清算預覽數據（不寫入數據庫）
 * @param {Array} authorizations - 授權記錄列表
 * @param {Object} match - 比賽信息
 * @param {string} result - 'win' 或 'loss'
 * @param {number} profitRate - 盈利百分比
 * @returns {Object} 預覽結果
 */
export function previewSettlement(authorizations, match, result, profitRate) {
    return batchSettle(authorizations, match, result, profitRate);
}

/**
 * 驗證清算參數
 * @param {string} result - 'win' 或 'loss'
 * @param {number} profitRate - 盈利百分比
 * @returns {Object} 驗證結果 { valid, error }
 */
export function validateSettlementParams(result, profitRate) {
    if (result !== 'win' && result !== 'loss') {
        return { valid: false, error: '清算結果必須是 win 或 loss' };
    }
    
    if (result === 'win') {
        if (!profitRate || profitRate <= 0) {
            return { valid: false, error: '盈利時必須設置大於0的收益率' };
        }
        if (profitRate > 1000) {
            return { valid: false, error: '收益率不能超過1000%' };
        }
    }
    
    return { valid: true };
}