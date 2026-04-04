import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要管理员认证
router.use(adminAuth);

// ==================== 辅助函数：获取模式过滤条件 ====================
function getModeFilter(mode) {
    if (mode === 'test') {
        return 'AND is_test = 1';
    } else if (mode === 'live') {
        return 'AND is_test = 0';
    }
    return ''; // 全部
}

// ==================== 获取仪表盘基础数据（支持模式）====================
router.get('/', hasPermission('stats.view'), (req, res) => {
    const { mode = 'all' } = req.query; // all, test, live
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        // 总用户数
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        
        // 已领取体验金人数
        const claimedBonus = db.prepare('SELECT COUNT(*) as count FROM users WHERE has_claimed_bonus = 1').get();
        
        // 总交易额（从 settlements 表，根据模式过滤）
        let totalVolume = 0;
        try {
            const volume = db.prepare(`
                SELECT COALESCE(SUM(profit), 0) as total 
                FROM settlements 
                WHERE 1=1 ${modeFilter}
            `).get();
            totalVolume = volume.total || 0;
        } catch (err) {}
        
        // 进行中比赛
        let activeMatches = 0;
        try {
            const matches = db.prepare('SELECT COUNT(*) as count FROM matches WHERE status IN ("upcoming", "open", "pending")').get();
            activeMatches = matches.count || 0;
        } catch (err) {}
        
        res.json({
            success: true,
            data: {
                totalUsers: totalUsers.count,
                claimedBonus: claimedBonus.count,
                totalVolume: totalVolume,
                activeMatches: activeMatches,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取统计数据失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取今日统计数据（支持模式）====================
router.get('/today', hasPermission('stats.view'), (req, res) => {
    const { mode = 'all' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        // 今日新用户（不受模式影响）
        const newUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')
        `).get();
        
        // 今日活跃用户（有授权的用户）
        const activeUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count 
            FROM authorizations 
            WHERE date(created_at) = date('now') ${modeFilter}
        `).get();
        
        // 总用户数（不受模式影响）
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        
        // 今日充值（只有真实模式有充值）
        let deposit = 0;
        if (mode === 'all' || mode === 'live') {
            const d = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM balance_logs 
                WHERE type = 'deposit' AND date(created_at) = date('now')
            `).get();
            deposit = d.total || 0;
        }
        
        // 今日提现（只有真实模式有提现）
        let withdraw = 0;
        if (mode === 'all' || mode === 'live') {
            const w = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM withdraw_requests 
                WHERE status = 'completed' AND date(updated_at) = date('now')
            `).get();
            withdraw = w.total || 0;
        }
        
        // 今日授权金额（根据模式过滤）
        const bet = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM authorizations 
            WHERE date(created_at) = date('now') ${modeFilter}
        `).get();
        
        // 今日结算金额（根据模式过滤）
        const settlement = db.prepare(`
            SELECT COALESCE(SUM(profit), 0) as total 
            FROM settlements 
            WHERE date(settled_at) = date('now') ${modeFilter}
        `).get();
        
        // 计算比赛参与率
        const betUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM authorizations 
            WHERE date(created_at) = date('now') ${modeFilter}
        `).get();
        
        const participationRate = activeUsers.count > 0 
            ? Math.round((betUsers.count / activeUsers.count) * 100) 
            : 0;
        
        res.json({
            success: true,
            data: {
                active_users: activeUsers.count || 0,
                new_users: newUsers.count || 0,
                total_users: totalUsers.count || 0,
                volume: (bet.total || 0) + (settlement.total || 0),
                deposit: deposit,
                withdraw: Math.abs(withdraw),
                bet: bet.total || 0,
                settlement: settlement.total || 0,
                participation_rate: participationRate,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取今日统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 统计卡片数据（支持模式）====================
router.get('/cards', hasPermission('stats.view'), (req, res) => {
    const { mode = 'all', range = 'week' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        // 总用户数（不受模式影响）
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        
        // 总交易额（根据模式过滤）
        let totalVolume = 0;
        try {
            const volume = db.prepare(`
                SELECT COALESCE(SUM(profit), 0) as total 
                FROM settlements 
                WHERE 1=1 ${modeFilter}
            `).get();
            totalVolume = volume.total || 0;
        } catch (err) {}
        
        // 总授权数（根据模式过滤）
        let totalAuths = 0;
        try {
            const auths = db.prepare(`
                SELECT COUNT(*) as count 
                FROM authorizations 
                WHERE 1=1 ${modeFilter}
            `).get();
            totalAuths = auths.count || 0;
        } catch (err) {}
        
        // 已完成比赛数（不受模式影响）
        let finishedMatches = 0;
        try {
            const matches = db.prepare('SELECT COUNT(*) as count FROM matches WHERE status = "finished"').get();
            finishedMatches = matches.count || 0;
        } catch (err) {}

        // 计算变化率
        let authChange = 0;
        try {
            const lastWeek = db.prepare(`
                SELECT COUNT(*) as count FROM authorizations 
                WHERE date(created_at) BETWEEN date('now', '-14 days') AND date('now', '-7 days')
                ${modeFilter}
            `).get();
            if (lastWeek.count > 0 && totalAuths > 0) {
                authChange = ((totalAuths - lastWeek.count) / lastWeek.count * 100).toFixed(1);
            }
        } catch (err) {}

        res.json({
            success: true,
            data: {
                total_users: totalUsers.count,
                total_volume: totalVolume,
                total_authorizations: totalAuths,
                finished_matches: finishedMatches,
                user_change: 0,
                volume_change: 0,
                auth_change: parseFloat(authChange),
                match_change: 0,
                mode: mode
            }
        });
        
    } catch (error) {
        logger.error('获取统计卡片失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 收入趋势数据（支持模式）====================
router.get('/trend', hasPermission('stats.view'), (req, res) => {
    const { range = 'week', mode = 'all' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        let days = 7;
        if (range === 'today') days = 1;
        else if (range === 'week') days = 7;
        else if (range === 'month') days = 30;
        else if (range === 'year') days = 365;

        const labels = [];
        const deposits = [];
        const settlements = [];
        const withdraws = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            
            // 充值数据（只有真实模式）
            let deposit = 0;
            if (mode === 'all' || mode === 'live') {
                try {
                    const d = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) as total 
                        FROM balance_logs 
                        WHERE type = 'deposit' AND date(created_at) = ?
                    `).get(dateStr);
                    deposit = d.total || 0;
                } catch (err) {}
            }
            deposits.push(deposit);
            
            // 结算数据（根据模式过滤）
            let settlement = 0;
            try {
                const s = db.prepare(`
                    SELECT COALESCE(SUM(profit), 0) as total 
                    FROM settlements 
                    WHERE date(settled_at) = ? ${modeFilter}
                `).get(dateStr);
                settlement = s.total || 0;
            } catch (err) {}
            settlements.push(settlement);
            
            // 提现数据（只有真实模式）
            let withdraw = 0;
            if (mode === 'all' || mode === 'live') {
                try {
                    const w = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) as total 
                        FROM withdraw_requests 
                        WHERE status = 'completed' AND date(updated_at) = ?
                    `).get(dateStr);
                    withdraw = w.total || 0;
                } catch (err) {}
            }
            withdraws.push(withdraw);
        }

        res.json({
            success: true,
            data: {
                labels,
                deposits,
                settlements,
                withdraws,
                mode: mode
            }
        });
        
    } catch (error) {
        logger.error('获取收入趋势失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 比赛统计数据 ====================
router.get('/matches', hasPermission('stats.view'), (req, res) => {
    const db = getDb();

    try {
        const upcoming = db.prepare(`
            SELECT COUNT(*) as count FROM matches 
            WHERE (status = 'upcoming' OR status = 'pending') AND datetime(match_time) > datetime('now')
        `).get();
        
        const live = db.prepare(`
            SELECT COUNT(*) as count FROM matches 
            WHERE status = 'live'
        `).get();
        
        const finished = db.prepare(`
            SELECT COUNT(*) as count FROM matches 
            WHERE status = 'finished'
        `).get();

        res.json({
            success: true,
            data: {
                labels: ['未开始', '进行中', '已结束'],
                upcoming: upcoming.count || 0,
                live: live.count || 0,
                finished: finished.count || 0
            }
        });
        
    } catch (error) {
        logger.error('获取比赛统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 用户活跃度统计（支持模式）====================
router.get('/activity', hasPermission('stats.view'), (req, res) => {
    const { mode = 'all' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        // 最近7天有授权的用户算作活跃（根据模式过滤）
        const active = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count 
            FROM authorizations 
            WHERE date(created_at) >= date('now', '-7 days') ${modeFilter}
        `).get();
        
        const total = db.prepare('SELECT COUNT(*) as count FROM users').get();
        
        const inactive = (total.count || 0) - (active.count || 0);

        res.json({
            success: true,
            data: {
                active: active.count || 0,
                inactive: inactive,
                total: total.count || 0,
                mode: mode
            }
        });
        
    } catch (error) {
        logger.error('获取用户活跃度失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 测试/真实模式分布 ====================
router.get('/mode-distribution', hasPermission('stats.view'), (req, res) => {
    const db = getDb();

    try {
        const testMode = db.prepare(`
            SELECT COUNT(*) as count FROM users WHERE is_test_mode = 1
        `).get();
        
        const liveMode = db.prepare(`
            SELECT COUNT(*) as count FROM users WHERE is_test_mode = 0
        `).get();

        res.json({
            success: true,
            data: {
                test_mode: testMode.count || 0,
                live_mode: liveMode.count || 0
            }
        });
        
    } catch (error) {
        logger.error('获取模式分布失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== VIP分布统计 ====================
router.get('/vip-distribution', hasPermission('stats.view'), (req, res) => {
    const db = getDb();

    try {
        const vips = db.prepare(`
            SELECT 
                vip_level,
                COUNT(*) as count
            FROM users
            GROUP BY vip_level
            ORDER BY vip_level
        `).all();

        res.json({
            success: true,
            data: vips.map(v => ({
                vip_level: v.vip_level || 0,
                count: v.count
            }))
        });
        
    } catch (error) {
        logger.error('获取VIP分布失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 最近授权记录（支持模式）====================
router.get('/authorizations/recent', hasPermission('stats.view'), (req, res) => {
    const { limit = 10, mode = 'all' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        const authorizations = db.prepare(`
            SELECT 
                a.id,
                a.auth_id,
                a.user_id,
                a.amount,
                a.status,
                a.is_test,
                a.created_at,
                u.username,
                m.home_team,
                m.away_team
            FROM authorizations a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN matches m ON a.match_id = m.match_id
            WHERE 1=1 ${modeFilter}
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(limit);

        res.json({
            success: true,
            data: authorizations,
            meta: { mode: mode }
        });
        
    } catch (error) {
        logger.error('获取最近授权记录失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取7天收入趋势（兼容旧接口）====================
router.get('/trend/7days', hasPermission('stats.view'), (req, res) => {
    const { mode = 'all' } = req.query;
    const db = getDb();
    const modeFilter = getModeFilter(mode);
    
    try {
        let labels = [];
        let deposits = [];
        let withdraws = [];
        let settlements = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            
            // 充值数据（只有真实模式）
            let deposit = 0;
            if (mode === 'all' || mode === 'live') {
                try {
                    const d = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) as total 
                        FROM balance_logs 
                        WHERE type = 'deposit' AND date(created_at) = ?
                    `).get(dateStr);
                    deposit = d.total || 0;
                } catch (err) {}
            }
            deposits.push(deposit);
            
            // 结算数据（根据模式过滤）
            let settlement = 0;
            try {
                const s = db.prepare(`
                    SELECT COALESCE(SUM(profit), 0) as total 
                    FROM settlements 
                    WHERE date(settled_at) = ? ${modeFilter}
                `).get(dateStr);
                settlement = s.total || 0;
            } catch (err) {}
            settlements.push(settlement);
            
            // 提现数据（只有真实模式）
            let withdraw = 0;
            if (mode === 'all' || mode === 'live') {
                try {
                    const w = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) as total 
                        FROM withdraw_requests 
                        WHERE status = 'completed' AND date(updated_at) = ?
                    `).get(dateStr);
                    withdraw = w.total || 0;
                } catch (err) {}
            }
            withdraws.push(withdraw);
        }
        
        res.json({
            success: true,
            data: {
                labels,
                deposits,
                withdraws,
                settlements,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取7天趋势失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取用户留存率 ====================
router.get('/retention', hasPermission('stats.view'), (req, res) => {
    const db = getDb();
    
    try {
        const retention = db.prepare(`
            SELECT 
                date(created_at) as reg_date,
                COUNT(*) as reg_count,
                COUNT(CASE WHEN julianday('now') - julianday(created_at) >= 1 THEN 1 END) as day1,
                COUNT(CASE WHEN julianday('now') - julianday(created_at) >= 7 THEN 1 END) as day7
            FROM users
            WHERE date(created_at) >= date('now', '-14 days')
            GROUP BY date(created_at)
            ORDER BY reg_date DESC
            LIMIT 7
        `).all();
        
        const data = retention.map(r => ({
            date: r.reg_date,
            new_users: r.reg_count,
            day1: r.reg_count > 0 ? Math.round((r.day1 / r.reg_count) * 100) : 0,
            day7: r.reg_count > 0 ? Math.round((r.day7 / r.reg_count) * 100) : 0
        }));
        
        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error('获取留存率失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;