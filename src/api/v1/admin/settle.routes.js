/**
 * FOOTRADAPRO - 清算管理API路由
 * @description 支持新清算規則：執行比例、盈利/虧損狀態切換、平台抽成20%
 * @fix 修復授權明細查詢：移除不存在的 execution_rate 字段
 * @feature 支援沙盒用戶 (is_test_mode)，測試用戶體驗完整清算流程
 * @update 2026-04-11 优化亏损逻辑，支持按利率结算，平台承担比例可配置
 * @update 2026-04-11 修复测试模式余额日志记录
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';
import { createNotification } from '../user/notifications.routes.js';

const router = express.Router();

router.use(adminAuth);

// ==================== 获取清算配置 ====================
const getSettlementConfig = (db) => {
    const rows = db.prepare(`
        SELECT config_key, config_value FROM global_config 
        WHERE config_key IN ('platform_fee_rate', 'platform_loss_rate', 'default_execution_rate')
    `).all();
    
    const config = {
        platform_fee_rate: 0.2,
        platform_loss_rate: 0.4,
        default_execution_rate: 30
    };
    
    rows.forEach(row => {
        config[row.config_key] = parseFloat(row.config_value);
    });
    return config;
};

// ==================== 获取待结算比赛列表 ====================
router.get('/pending', hasPermission('matches.settle'), (req, res) => {
    const db = getDb();
    
    try {
        console.log('=== 获取待结算比赛 ===');
        
const matches = db.prepare(`
SELECT 
    m.id,
    m.match_id,
    m.home_team,
    m.away_team,
    m.league,
    m.match_time,
    m.status,
    m.execution_rate,
    m.home_score,
    m.away_score,
    COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as auth_count,
    COALESCE(SUM(CASE WHEN a.status = 'pending' THEN a.amount ELSE 0 END), 0) as total_amount,
    SUM(CASE WHEN a.is_test = 1 AND a.status = 'pending' THEN 1 ELSE 0 END) > 0 as has_test_auth,
    SUM(CASE WHEN a.is_test = 0 AND a.status = 'pending' THEN 1 ELSE 0 END) > 0 as has_live_auth
FROM matches m
LEFT JOIN authorizations a ON a.match_id = m.match_id
WHERE m.status = 'finished'
GROUP BY m.id
ORDER BY m.match_time DESC
`).all();
        
        console.log(`✅ 找到 ${matches.length} 场待结算比赛`);
        
        res.json({
            success: true,
            data: matches
        });
    } catch (error) {
        console.error('❌ 获取待结算比赛失败:', error);
        logger.error('获取待结算比赛失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取清算历史 ====================
router.get('/history', hasPermission('matches.settle'), (req, res) => {
    const db = getDb();
    
    try {
        console.log('=== 获取清算历史 ===');
        
        // 获取今日清算数量
        const todayCount = db.prepare(`
            SELECT COUNT(*) as count
            FROM matches 
            WHERE status = 'settled' 
            AND date(updated_at) = date('now')
        `).get();
        
        // 获取清算历史列表
        const matches = db.prepare(`
            SELECT 
                m.id,
                m.match_id,
                m.home_team,
                m.away_team,
                m.league,
                m.match_time,
                m.result,
                m.updated_at as settled_at,
                COUNT(a.id) as auth_count,
                COALESCE(SUM(a.amount), 0) as total_amount,
                COALESCE(SUM(a.profit), 0) as total_profit,
                COALESCE(SUM(a.platform_fee), 0) as total_platform_fee,
                MAX(a.profit_rate) as profit_rate
            FROM matches m
            LEFT JOIN authorizations a ON a.match_id = m.match_id
            WHERE m.status = 'settled'
            GROUP BY m.id
            ORDER BY m.updated_at DESC
            LIMIT 100
        `).all();
        
        // 计算总清算金额
        const totalAmount = matches.reduce((sum, m) => sum + (m.total_amount || 0), 0);
        
        console.log(`✅ 找到 ${matches.length} 条清算历史，今日清算: ${todayCount?.count || 0} 场`);
        
        res.json({
            success: true,
            data: matches,
            stats: {
                today_count: todayCount?.count || 0,
                total_count: matches.length,
                total_amount: totalAmount
            }
        });
    } catch (error) {
        console.error('❌ 获取清算历史失败:', error);
        logger.error('获取清算历史失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取清算预览数据 ====================
router.get('/preview/:matchId', hasPermission('matches.settle'), (req, res) => {
    const { matchId } = req.params;
    const db = getDb();
    
    try {
        console.log(`=== 獲取清算預覽: matchId=${matchId} ===`);
        
        // 獲取比賽信息
        const match = db.prepare(`
            SELECT 
                id,
                match_id,
                home_team,
                away_team,
                league,
                match_time,
                execution_rate,
                status
            FROM matches 
            WHERE match_id = ? OR id = ?
        `).get(matchId, matchId);
        
        if (!match) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }

        console.log(`比賽信息: ${match.home_team} vs ${match.away_team}, match_id: ${match.match_id}`);
        
        // 獲取該比賽的所有待結算授權
        let authorizations = [];
        try {
            const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='authorizations'").get();
            if (tableCheck) {
authorizations = db.prepare(`
    SELECT 
        a.id,
        a.user_id,
        a.amount,
        a.created_at,
        u.username,
        u.balance as user_balance,
        u.test_balance,
        u.is_test_mode
    FROM authorizations a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.match_id = ? AND a.status = 'pending'
`).all(match.match_id);
                
                console.log(`找到 ${authorizations.length} 條授權記錄`);
            }
        } catch (err) {
            console.error('查詢授權失敗:', err.message);
            authorizations = [];
        }
        
        const total_amount = authorizations.reduce((sum, a) => sum + (a.amount || 0), 0);
        const executionRate = match.execution_rate || 30;
        const total_deployed = Number((total_amount * (executionRate / 100)).toFixed(2));
        const total_reserved = Number((total_amount - total_deployed).toFixed(2));
        
        let sampleAuth = 100;
        if (authorizations.length > 0) {
            sampleAuth = authorizations[0].amount;
        }
        
        const deployedSample = Number((sampleAuth * (executionRate / 100)).toFixed(2));
        const reservedSample = Number((sampleAuth - deployedSample).toFixed(2));
        
const formattedAuthorizations = authorizations.map(auth => ({
    id: auth.id,
    user_id: auth.user_id,
    username: auth.username || `用户${auth.user_id}`,
    amount: auth.amount || 0,
    created_at: auth.created_at,
    is_test_mode: auth.is_test_mode || false
}));
        
        res.json({
            success: true,
            data: {
                id: match.id,
                match_id: match.match_id,
                home_team: match.home_team,
                away_team: match.away_team,
                league: match.league,
                match_time: match.match_time,
                execution_rate: match.execution_rate,
                status: match.status,
                authorizations: formattedAuthorizations,
                auth_count: formattedAuthorizations.length,
                total_amount: total_amount,
                total_deployed: total_deployed,
                total_reserved: total_reserved,
                sample_auth: sampleAuth,
                deployed_sample: deployedSample,
                reserved_sample: reservedSample
            }
        });
    } catch (error) {
        console.error('❌ 獲取清算預覽失敗:', error);
        logger.error('獲取清算預覽失敗:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

// ==================== 执行清算 ====================
router.post('/execute', hasPermission('matches.settle'), (req, res) => {
    console.log('=== 执行清算 ===');
    
    const { matchId, status, profitRate } = req.body;
    const adminId = req.session?.adminId;
    
    if (!matchId || !status || profitRate === undefined) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }
    
    if (status !== 'win' && status !== 'loss') {
        return res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    }
    
    const finalProfitRate = status === 'loss' ? profitRate : profitRate;
    const db = getDb();
    
    try {
        // 获取清算配置
        const config = getSettlementConfig(db);
        console.log(`📋 清算配置: 平台抽成=${config.platform_fee_rate * 100}%, 平台承担亏损=${config.platform_loss_rate * 100}%`);
        
        const transaction = db.transaction(() => {
            // 获取比赛信息
            const match = db.prepare(`
                SELECT * FROM matches WHERE match_id = ? OR id = ?
            `).get(matchId, matchId);
            
            if (!match) throw new Error('MATCH_NOT_FOUND');
            if (match.status !== 'finished') throw new Error('MATCH_NOT_FINISHED');
            
            // 获取该比赛的所有待结算授权
            const authorizations = db.prepare(`
                SELECT * FROM authorizations 
                WHERE match_id = ? AND status = 'pending'
            `).all(match.match_id);
            
            console.log(`找到 ${authorizations.length} 条待结算授权`);
            
            // 更新比赛状态
            const matchResult = status === 'win' ? 'win' : 'loss';
            db.prepare(`
                UPDATE matches SET 
                    result = ?,
                    status = 'settled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(matchResult, match.id);
            
            // 处理每个授权
            for (const auth of authorizations) {
                const executionRate = match.execution_rate || config.default_execution_rate;
                const deployedAmount = Number((auth.amount * (executionRate / 100)).toFixed(2));
                const reservedAmount = Number((auth.amount - deployedAmount).toFixed(2));
                
                let profit = 0;
                let platformFee = 0;
                let userProfit = 0;
                let returnAmount = 0;
                let authStatus = '';
                
                if (status === 'win') {
                    // 盈利逻辑
                    authStatus = 'won';
                    profit = Number((deployedAmount * (finalProfitRate / 100)).toFixed(2));
                    platformFee = Number((profit * config.platform_fee_rate).toFixed(2));
                    userProfit = Number((profit - platformFee).toFixed(2));
                    returnAmount = Number((deployedAmount + reservedAmount + userProfit).toFixed(2));
                    
                    console.log(`💰 盈利结算: 用户=${auth.user_id}, 部署=${deployedAmount}, 盈利=${profit}, 平台费=${platformFee}, 用户盈利=${userProfit}, 返还=${returnAmount}`);
                } else {
                    // 亏损逻辑 - 按利率结算，平台承担部分亏损
                    authStatus = 'lost';
                    
                    const lossRate = Math.abs(finalProfitRate);
                    const lossAmount = Number((deployedAmount * (lossRate / 100)).toFixed(2));
                    
                    const platformShare = Number((lossAmount * config.platform_loss_rate).toFixed(2));
                    const userLoss = Number((lossAmount * (1 - config.platform_loss_rate)).toFixed(2));
                    
                    profit = -lossAmount;
                    platformFee = platformShare;
                    userProfit = -userLoss;
                    returnAmount = Number((deployedAmount - userLoss + reservedAmount).toFixed(2));
                    
                    console.log(`📉 亏损结算: 用户=${auth.user_id}, 部署=${deployedAmount}, 亏损率=${lossRate}%, 亏损额=${lossAmount}, 平台承担=${platformShare}, 用户亏损=${userLoss}, 返还=${returnAmount}`);
                }
                
                // 获取用户信息（包括测试余额）
                const user = db.prepare(`
                    SELECT id, balance, test_balance FROM users WHERE id = ?
                `).get(auth.user_id);
                
                if (!user) throw new Error(`USER_NOT_FOUND: ${auth.user_id}`);
                
                const isTestAuth = auth.is_test === 1;
                
                if (isTestAuth) {
                    // ========== 测试模式：更新 test_balance 和 test_balance_logs ==========
                    const oldBalance = user.test_balance;
                    const newBalance = Number((oldBalance + returnAmount).toFixed(2));
                    
                    console.log(`🧪 测试模式结算: 用户=${auth.user_id}, 旧余额=${oldBalance}, 返还=${returnAmount}, 新余额=${newBalance}`);
                    
                    // 更新用户测试余额
                    db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(newBalance, auth.user_id);
                    
                    // 记录测试余额变动日志
                    db.prepare(`
                        INSERT INTO test_balance_logs (
                            user_id, amount, balance_before, balance_after,
                            type, description
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    `).run(
                        auth.user_id, returnAmount, oldBalance, newBalance,
                        'settlement',
                        `Match settlement: ${match.home_team} vs ${match.away_team} (${status === 'win' ? 'WIN' : 'LOSS'})`
                    );
                } else {
                    // ========== 真实模式：更新 balance 和 balance_logs ==========
                    const oldBalance = user.balance;
                    const newBalance = Number((oldBalance + returnAmount).toFixed(2));
                    
                    console.log(`💰 真实模式结算: 用户=${auth.user_id}, 旧余额=${oldBalance}, 返还=${returnAmount}, 新余额=${newBalance}`);
                    
                    // 更新用户真实余额
                    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, auth.user_id);
                    
                    // 记录真实余额变动日志
                    db.prepare(`
                        INSERT INTO balance_logs (
                            user_id, amount, balance_before, balance_after,
                            type, reason, admin_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        auth.user_id, returnAmount, oldBalance, newBalance,
                        'settlement',
                        `Match settlement: ${match.home_team} vs ${match.away_team} (${status === 'win' ? 'WIN' : 'LOSS'})`,
                        adminId
                    );
                }
                
                // 更新授权状态
                const tableInfo = db.prepare("PRAGMA table_info(authorizations)").all();
                const columnNames = tableInfo.map(col => col.name);
                
                const updateFields = [];
                const updateValues = [];
                
                if (columnNames.includes('status')) {
                    updateFields.push('status = ?');
                    updateValues.push(authStatus);
                }
                if (columnNames.includes('profit')) {
                    updateFields.push('profit = ?');
                    updateValues.push(profit);
                }
                if (columnNames.includes('platform_fee')) {
                    updateFields.push('platform_fee = ?');
                    updateValues.push(platformFee);
                }
                if (columnNames.includes('deployed_amount')) {
                    updateFields.push('deployed_amount = ?');
                    updateValues.push(deployedAmount);
                }
                if (columnNames.includes('reserved_amount')) {
                    updateFields.push('reserved_amount = ?');
                    updateValues.push(reservedAmount);
                }
                if (columnNames.includes('profit_rate')) {
                    updateFields.push('profit_rate = ?');
                    updateValues.push(finalProfitRate);
                }
                if (columnNames.includes('settlement_type')) {
                    updateFields.push('settlement_type = ?');
                    updateValues.push(status);
                }
                if (columnNames.includes('settled_at')) {
                    updateFields.push('settled_at = CURRENT_TIMESTAMP');
                }
                
                if (updateFields.length > 0) {
                    updateValues.push(auth.id);
                    db.prepare(`UPDATE authorizations SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);
                }
                
             
// 插入 settlements 记录
db.prepare(`
    INSERT INTO settlements (
        auth_id, user_id, match_id, amount, profit, is_test, settled_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`).run(
    auth.auth_id,
    auth.user_id,
    match.match_id,
    auth.amount,
    profit,
    auth.is_test || 0
);
// ========== 添加通知 ==========
if (profit !== 0) {
    const isWin = profit > 0;
    const profitAbs = Math.abs(profit).toFixed(2);
    const matchName = `${match.home_team} vs ${match.away_team}`;
    
    let title = '';
    let content = '';
    let notificationType = '';
    
    if (isWin) {
        title = '🎉 比赛结算完成';
        content = `${matchName} 盈利 ${profitAbs} USDT`;
        notificationType = 'settlement_win';
    } else {
        title = '📉 比赛结算完成';
        content = `${matchName} 亏损 ${profitAbs} USDT`;
        notificationType = 'settlement_loss';
    }
    
    try {
        createNotification(
            auth.user_id,
            notificationType,
            title,
            content,
            {
                match_id: match.match_id,
                match_name: matchName,
                profit: profit,
                amount: auth.amount,
                status: status
            }
        );
        console.log(`📧 已发送通知给用户 ${auth.user_id}: ${title}`);
    } catch (notifyErr) {
        console.error('发送通知失败:', notifyErr);
    }
}
            }

            
            // 调试：输出清算时的比分
            console.log(`📊 清算时比分: ${match.home_team} ${match.home_score} : ${match.away_score} ${match.away_team}`);
            // 创建报告草稿
            try {
                const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reports'").get();
                if (tables) {
                    const existingReport = db.prepare('SELECT id FROM reports WHERE match_id = ?').get(match.match_id);
                    if (!existingReport) {
                        const reportTableInfo = db.prepare("PRAGMA table_info(reports)").all();
                        const reportColumns = reportTableInfo.map(col => col.name);
                        
                        const insertFields = ['match_id', 'status', 'created_at', 'updated_at'];
                        const insertPlaceholders = ['?', '?', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP'];
                        const insertValues = [match.match_id, 'pending'];
                        
                        if (reportColumns.includes('match_time')) {
                            insertFields.push('match_time');
                            insertPlaceholders.push('?');
                            insertValues.push(match.match_time);
                        }
                        if (reportColumns.includes('home_team')) {
                            insertFields.push('home_team');
                            insertPlaceholders.push('?');
                            insertValues.push(match.home_team);
                        }
                        if (reportColumns.includes('away_team')) {
                            insertFields.push('away_team');
                            insertPlaceholders.push('?');
                            insertValues.push(match.away_team);
                        }
                        if (reportColumns.includes('league')) {
                            insertFields.push('league');
                            insertPlaceholders.push('?');
                            insertValues.push(match.league);
                        }
                        // ✅ 新增：写入比分
                        if (reportColumns.includes('home_score')) {
                            insertFields.push('home_score');
                            insertPlaceholders.push('?');
                            insertValues.push(match.home_score || null);
                        }
                        if (reportColumns.includes('away_score')) {
                            insertFields.push('away_score');
                            insertPlaceholders.push('?');
                            insertValues.push(match.away_score || null);
                        }
                        
                        db.prepare(`INSERT INTO reports (${insertFields.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`).run(...insertValues);
                        console.log(`✅ 已创建报告草稿: ${match.match_id}`);
                    }
                }
            } catch (err) {
                console.log('⚠️ 報告草稿創建失敗:', err.message);
            }
        });
        
        transaction();
        
        logger.info(`管理员 ${adminId} 完成清算: ${matchId}, ${status}, 利率=${profitRate}%`);
        
        res.json({
            success: true,
            message: '清算完成',
            data: { matchId, status, profitRate: finalProfitRate }
        });
        
    } catch (error) {
        console.error('❌ 执行清算失败:', error);
        
        if (error.message === 'MATCH_NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }
        if (error.message === 'MATCH_NOT_FINISHED') {
            return res.status(400).json({ success: false, error: 'MATCH_NOT_FINISHED' });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: error.message 
        });
    }
});

export default router;