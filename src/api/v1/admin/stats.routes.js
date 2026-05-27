import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// ==================== 所有路由需要管理员认证 ====================
router.use(adminAuth);

// ==================== 辅助函数：获取模式过滤条件 ====================
function getModeFilter(mode) {
    if (mode === 'test') {
        return isProduction ? 'AND is_test = true' : 'AND is_test = 1';
    } else if (mode === 'live') {
        return isProduction ? 'AND is_test = false' : 'AND is_test = 0';
    }
    return ''; // 全部
}

// ==================== 根路径处理 ====================
router.get('/', adminAuth, async (req, res) => {
    try {
        let totalUsers, totalMatches, totalAuthorizations, todayUsers;
        
        if (isProduction) {
            const totalUsersRes = await query('SELECT COUNT(*) as count FROM users');
            const totalMatchesRes = await query('SELECT COUNT(*) as count FROM matches');
            const totalAuthsRes = await query('SELECT COUNT(*) as count FROM authorizations');
            const todayUsersRes = await query(`SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURRENT_DATE`);
            
            totalUsers = totalUsersRes[0]?.count || 0;
            totalMatches = totalMatchesRes[0]?.count || 0;
            totalAuthorizations = totalAuthsRes[0]?.count || 0;
            todayUsers = todayUsersRes[0]?.count || 0;
        } else {
            const db = getDb();
            totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
            totalMatches = db.prepare('SELECT COUNT(*) as count FROM matches').get();
            totalAuthorizations = db.prepare('SELECT COUNT(*) as count FROM authorizations').get();
            todayUsers = db.prepare(`SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')`).get();
        }
        
        res.json({
            success: true,
            data: {
                total_users: totalUsers?.count || 0,
                total_matches: totalMatches?.count || 0,
                total_authorizations: totalAuthorizations?.count || 0,
                today_new_users: todayUsers?.count || 0,
                mode: 'all'
            }
        });
    } catch (error) {
        logger.error('Stats root endpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch statistics'
        });
    }
});

// ==================== 获取今日统计数据 ====================
router.get('/today', hasPermission('stats.view'), async (req, res) => {
    const { mode = 'all' } = req.query;
    const modeFilter = getModeFilter(mode);
    
    try {
        let newUsers, activeUsers, totalUsers, deposit, withdraw, bet, settlement, betUsers;
        
        if (isProduction) {
            const newUsersRes = await query(`SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURRENT_DATE`);
            const activeUsersRes = await query(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM authorizations 
                WHERE DATE(created_at) = CURRENT_DATE ${modeFilter}
            `);
            const totalUsersRes = await query('SELECT COUNT(*) as count FROM users');
            
            newUsers = newUsersRes[0]?.count || 0;
            activeUsers = activeUsersRes[0]?.count || 0;
            totalUsers = totalUsersRes[0]?.count || 0;
            
            let depositRes = { rows: [{ total: 0 }] };
            if (mode === 'all' || mode === 'live') {
                depositRes = await query(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM balance_logs 
                    WHERE type = 'deposit' AND DATE(created_at) = CURRENT_DATE
                `);
            }
            deposit = depositRes.rows[0]?.total || 0;
            
            let withdrawRes = { rows: [{ total: 0 }] };
            if (mode === 'all' || mode === 'live') {
                withdrawRes = await query(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM withdraw_requests 
                    WHERE status = 'completed' AND DATE(updated_at) = CURRENT_DATE
                `);
            }
            withdraw = withdrawRes.rows[0]?.total || 0;
            
            const betRes = await query(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM authorizations 
                WHERE DATE(created_at) = CURRENT_DATE ${modeFilter}
            `);
            bet = betRes.rows[0]?.total || 0;
            
            const settlementRes = await query(`
                SELECT COALESCE(SUM(profit), 0) as total 
                FROM settlements 
                WHERE DATE(settled_at) = CURRENT_DATE ${modeFilter}
            `);
            settlement = settlementRes.rows[0]?.total || 0;
            
            const betUsersRes = await query(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM authorizations 
                WHERE DATE(created_at) = CURRENT_DATE ${modeFilter}
            `);
            betUsers = betUsersRes[0]?.count || 0;
        } else {
            const db = getDb();
            newUsers = db.prepare(`SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')`).get();
            activeUsers = db.prepare(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM authorizations 
                WHERE date(created_at) = date('now') ${modeFilter}
            `).get();
            totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
            
            let depositRes = { total: 0 };
            if (mode === 'all' || mode === 'live') {
                depositRes = db.prepare(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM balance_logs 
                    WHERE type = 'deposit' AND date(created_at) = date('now')
                `).get();
            }
            deposit = depositRes.total || 0;
            
            let withdrawRes = { total: 0 };
            if (mode === 'all' || mode === 'live') {
                withdrawRes = db.prepare(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM withdraw_requests 
                    WHERE status = 'completed' AND date(updated_at) = date('now')
                `).get();
            }
            withdraw = withdrawRes.total || 0;
            
            const betRes = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM authorizations 
                WHERE date(created_at) = date('now') ${modeFilter}
            `).get();
            bet = betRes.total || 0;
            
            const settlementRes = db.prepare(`
                SELECT COALESCE(SUM(profit), 0) as total 
                FROM settlements 
                WHERE date(settled_at) = date('now') ${modeFilter}
            `).get();
            settlement = settlementRes.total || 0;
            
            const betUsersRes = db.prepare(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM authorizations 
                WHERE date(created_at) = date('now') ${modeFilter}
            `).get();
            betUsers = betUsersRes.count || 0;
        }
        
        const participationRate = activeUsers > 0 
            ? Math.round((betUsers / activeUsers) * 100) 
            : 0;
        
        res.json({
            success: true,
            data: {
                active_users: activeUsers || 0,
                new_users: newUsers?.count || 0,
                total_users: totalUsers?.count || 0,
                volume: bet + settlement,
                deposit: deposit,
                withdraw: Math.abs(withdraw),
                bet: bet || 0,
                settlement: settlement || 0,
                participation_rate: participationRate,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取今日统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 统计卡片数据 ====================
router.get('/cards', hasPermission('stats.view'), async (req, res) => {
    const { mode = 'all', range = 'week' } = req.query;
    const modeFilter = getModeFilter(mode);
    
    try {
        let totalUsers, totalVolume, totalAuths, finishedMatches;
        
        if (isProduction) {
            const totalUsersRes = await query('SELECT COUNT(*) as count FROM users');
            totalUsers = totalUsersRes[0]?.count || 0;
            
            const volumeRes = await query(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE 1=1 ${modeFilter}`);
            totalVolume = parseFloat(volumeRes[0]?.total || 0);
            
            const authsRes = await query(`SELECT COUNT(*) as count FROM authorizations WHERE 1=1 ${modeFilter}`);
            totalAuths = parseInt(authsRes[0]?.count || 0);
            
            const matchesRes = await query(`SELECT COUNT(*) as count FROM matches WHERE status = 'finished'`);
            finishedMatches = matchesRes[0]?.count || 0;
        } else {
            const db = getDb();
            totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
            totalVolume = db.prepare(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE 1=1 ${modeFilter}`).get().total || 0;
            totalAuths = db.prepare(`SELECT COUNT(*) as count FROM authorizations WHERE 1=1 ${modeFilter}`).get().count || 0;
            finishedMatches = db.prepare('SELECT COUNT(*) as count FROM matches WHERE status = "finished"').get().count || 0;
        }
        
        res.json({
            success: true,
            data: {
                total_users: totalUsers?.count || totalUsers,
                total_volume: totalVolume,
                total_authorizations: totalAuths,
                finished_matches: finishedMatches,
                user_change: 0,
                volume_change: 0,
                auth_change: 0,
                match_change: 0,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取统计卡片失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 收入趋势数据 ====================
router.get('/trend', hasPermission('stats.view'), async (req, res) => {
    const { range = 'week', mode = 'all' } = req.query;
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
            
            if (isProduction) {
                let deposit = 0;
                if (mode === 'all' || mode === 'live') {
                    const d = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM balance_logs WHERE type = 'deposit' AND DATE(created_at) = $1`, [dateStr]);
                    deposit = parseFloat(d[0]?.total || 0);
                }
                deposits.push(deposit);
                
                let settlement = 0;
                const s = await query(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE DATE(settled_at) = $1 ${modeFilter}`, [dateStr]);
                settlement = parseFloat(s[0]?.total || 0);
                settlements.push(settlement);
                
                let withdraw = 0;
                if (mode === 'all' || mode === 'live') {
                    const w = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_requests WHERE status = 'completed' AND DATE(updated_at) = $1`, [dateStr]);
                    withdraw = parseFloat(w[0]?.total || 0);
                }
                withdraws.push(withdraw);
            } else {
                const db = getDb();
                let deposit = 0;
                if (mode === 'all' || mode === 'live') {
                    const d = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM balance_logs WHERE type = 'deposit' AND date(created_at) = ?`).get(dateStr);
                    deposit = d.total || 0;
                }
                deposits.push(deposit);
                
                let settlement = 0;
                const s = db.prepare(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE date(settled_at) = ? ${modeFilter}`).get(dateStr);
                settlement = s.total || 0;
                settlements.push(settlement);
                
                let withdraw = 0;
                if (mode === 'all' || mode === 'live') {
                    const w = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_requests WHERE status = 'completed' AND date(updated_at) = ?`).get(dateStr);
                    withdraw = w.total || 0;
                }
                withdraws.push(withdraw);
            }
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
router.get('/matches', hasPermission('stats.view'), async (req, res) => {
    try {
        let upcoming, live, finished;
        
        if (isProduction) {
            const upcomingRes = await query(`SELECT COUNT(*) as count FROM matches WHERE status = 'upcoming' AND match_time > NOW()`);
            const liveRes = await query(`SELECT COUNT(*) as count FROM matches WHERE status = 'live'`);
            const finishedRes = await query(`SELECT COUNT(*) as count FROM matches WHERE status = 'finished'`);
            
            upcoming = upcomingRes[0]?.count || 0;
            live = liveRes[0]?.count || 0;
            finished = finishedRes[0]?.count || 0;
        } else {
            const db = getDb();
            upcoming = db.prepare(`SELECT COUNT(*) as count FROM matches WHERE status = 'upcoming' AND datetime(match_time) > datetime('now')`).get();
            live = db.prepare(`SELECT COUNT(*) as count FROM matches WHERE status = 'live'`).get();
            finished = db.prepare(`SELECT COUNT(*) as count FROM matches WHERE status = 'finished'`).get();
        }

        res.json({
            success: true,
            data: {
                labels: ['未开始', '进行中', '已结束'],
                upcoming: upcoming?.count || upcoming || 0,
                live: live?.count || live || 0,
                finished: finished?.count || finished || 0
            }
        });
    } catch (error) {
        logger.error('获取比赛统计失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 用户活跃度统计 ====================
router.get('/activity', hasPermission('stats.view'), async (req, res) => {
    const { mode = 'all' } = req.query;
    const modeFilter = getModeFilter(mode);
    
    try {
        let active, total;
        
        if (isProduction) {
            const activeRes = await query(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM authorizations 
                WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' ${modeFilter}
            `);
            const totalRes = await query('SELECT COUNT(*) as count FROM users');
            
            active = activeRes[0]?.count || 0;
            total = totalRes[0]?.count || 0;
        } else {
            const db = getDb();
            active = db.prepare(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM authorizations 
                WHERE date(created_at) >= date('now', '-7 days') ${modeFilter}
            `).get();
            total = db.prepare('SELECT COUNT(*) as count FROM users').get();
        }
        
        const inactive = (total?.count || total || 0) - (active?.count || active || 0);

        res.json({
            success: true,
            data: {
                active: active?.count || active || 0,
                inactive: inactive,
                total: total?.count || total || 0,
                mode: mode
            }
        });
    } catch (error) {
        logger.error('获取用户活跃度失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 测试/真实模式分布 ====================
router.get('/mode-distribution', hasPermission('stats.view'), async (req, res) => {
    try {
        let testMode, liveMode;
        
        if (isProduction) {
            const testRes = await query(`SELECT COUNT(*) as count FROM users WHERE is_test_mode = true`);
            const liveRes = await query(`SELECT COUNT(*) as count FROM users WHERE is_test_mode = false`);
            testMode = testRes[0]?.count || 0;
            liveMode = liveRes[0]?.count || 0;
        } else {
            const db = getDb();
            testMode = db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_test_mode = 1`).get();
            liveMode = db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_test_mode = 0`).get();
        }

        res.json({
            success: true,
            data: {
                test_mode: testMode?.count || testMode || 0,
                live_mode: liveMode?.count || liveMode || 0
            }
        });
    } catch (error) {
        logger.error('获取模式分布失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== VIP分布统计 ====================
router.get('/vip-distribution', hasPermission('stats.view'), async (req, res) => {
    try {
        let vips;
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    vip_level,
                    COUNT(*) as count
                FROM users
                GROUP BY vip_level
                ORDER BY vip_level
            `);
            vips = result || [];
        } else {
            const db = getDb();
            vips = db.prepare(`
                SELECT 
                    vip_level,
                    COUNT(*) as count
                FROM users
                GROUP BY vip_level
                ORDER BY vip_level
            `).all();
        }

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

// ==================== 最近授权记录 ====================
router.get('/authorizations/recent', hasPermission('stats.view'), async (req, res) => {
    const { limit = 10, mode = 'all' } = req.query;
    const modeFilter = getModeFilter(mode);
    
    try {
        let authorizations;
        
        if (isProduction) {
            const result = await query(`
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
                LIMIT $1
            `, [limit]);
            authorizations = result || [];
        } else {
            const db = getDb();
            authorizations = db.prepare(`
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
        }

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
router.get('/trend/7days', hasPermission('stats.view'), async (req, res) => {
    const { mode = 'all' } = req.query;
    const modeFilter = getModeFilter(mode);
    
    try {
        const labels = [];
        const deposits = [];
        const withdraws = [];
        const settlements = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            
            if (isProduction) {
                let deposit = 0;
                if (mode === 'all' || mode === 'live') {
                    const d = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM balance_logs WHERE type = 'deposit' AND DATE(created_at) = $1`, [dateStr]);
                    deposit = parseFloat(d[0]?.total || 0);
                }
                deposits.push(deposit);
                
                let settlement = 0;
                const s = await query(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE DATE(settled_at) = $1 ${modeFilter}`, [dateStr]);
                settlement = parseFloat(s[0]?.total || 0);
                settlements.push(settlement);
                
                let withdraw = 0;
                if (mode === 'all' || mode === 'live') {
                    const w = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_requests WHERE status = 'completed' AND DATE(updated_at) = $1`, [dateStr]);
                    withdraw = parseFloat(w[0]?.total || 0);
                }
                withdraws.push(withdraw);
            } else {
                const db = getDb();
                let deposit = 0;
                if (mode === 'all' || mode === 'live') {
                    const d = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM balance_logs WHERE type = 'deposit' AND date(created_at) = ?`).get(dateStr);
                    deposit = d.total || 0;
                }
                deposits.push(deposit);
                
                let settlement = 0;
                const s = db.prepare(`SELECT COALESCE(SUM(profit), 0) as total FROM settlements WHERE date(settled_at) = ? ${modeFilter}`).get(dateStr);
                settlement = s.total || 0;
                settlements.push(settlement);
                
                let withdraw = 0;
                if (mode === 'all' || mode === 'live') {
                    const w = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_requests WHERE status = 'completed' AND date(updated_at) = ?`).get(dateStr);
                    withdraw = w.total || 0;
                }
                withdraws.push(withdraw);
            }
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
router.get('/retention', hasPermission('stats.view'), async (req, res) => {
    try {
        let retention;
        
        if (isProduction) {
            retention = await query(`
                SELECT 
                    DATE(created_at) as reg_date,
                    COUNT(*) as reg_count,
                    COUNT(CASE WHEN DATE(created_at) <= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as day1,
                    COUNT(CASE WHEN DATE(created_at) <= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as day7
                FROM users
                WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '14 days'
                GROUP BY DATE(created_at)
                ORDER BY reg_date DESC
                LIMIT 7
            `);
        } else {
            const db = getDb();
            retention = db.prepare(`
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
        }
        
        const data = (retention || []).map(r => ({
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