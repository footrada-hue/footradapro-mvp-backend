/**
 * FOOTRADAPRO - 動態消息管理路由 V2
 * @description 管理跑馬燈動態消息的生成、編輯和刪除 (全英文版本，含生成歷史記錄)
 * @version 2.0 - 新增本地比賽池、批量生成、系統配置
 */

import express from 'express';
import { getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// 所有路由需要管理員認證
router.use(adminAuth);

// ==================== 工具函數 ====================

/**
 * 獲取當前 UTC 時間
 */
const getUTCNow = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000);
};

/**
 * 格式化金額（千位分隔符）
 */
const formatAmount = (amount) => {
    return Number(amount).toLocaleString('en-US');
};

/**
 * 生成用戶ID（U型）
 * 格式：U + 9位數字 + 1位大寫字母（排除O、I）
 */
const generateUserId = () => {
    const digits = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letter = letters[Math.floor(Math.random() * letters.length)];
    return `U${digits}${letter}`;
};

/**
 * 掩碼用戶ID（顯示用）
 * 格式：前2位 + *** + 後3位
 */
const maskUserId = (userId) => {
    if (!userId || userId.length < 5) return userId;
    return userId.substring(0, 2) + '***' + userId.substring(userId.length - 3);
};

/**
 * 安全獲取數值
 */
const safeInt = (value, defaultValue) => {
    const num = parseInt(value);
    return isNaN(num) ? defaultValue : num;
};

// ==================== 確保表存在 ====================
const ensureTables = (db) => {
    // 生成記錄表
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticker_generation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            admin_name TEXT,
            generated_count INTEGER,
            auth_count INTEGER DEFAULT 0,
            profit_count INTEGER DEFAULT 0,
            system_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES admins(id)
        )
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_generation_log_created 
        ON ticker_generation_log(created_at DESC)
    `);
};

// ==================== 比賽池管理接口 ====================

/**
 * 獲取比賽池列表
 * GET /admin/ticker-manager/matches/pool
 */
// 计算比赛实时状态（基于 UTC 时间，110分钟规则）
function calculateMatchStatus(matchDateTime) {
    const now = new Date();
    const matchTime = new Date(matchDateTime);
    const endTime = new Date(matchTime.getTime() + 110 * 60 * 1000); // 110分钟
    
    if (now < matchTime) return 'upcoming';
    if (now >= matchTime && now < endTime) return 'ongoing';
    return 'finished';
}

router.get('/matches/pool', (req, res) => {
    const db = getDb();
    
    try {
        const { status, date } = req.query;
        let query = 'SELECT * FROM match_pool WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (date) {
            query += ' AND match_date = ?';
            params.push(date);
        }
        
        query += ' ORDER BY match_datetime ASC';
        
        const matches = db.prepare(query).all(...params);
        
        // 为每场比赛计算实时状态
        const matchesWithStatus = matches.map(match => ({
            ...match,
            calculated_status: calculateMatchStatus(match.match_datetime),
            // 同时返回可读的时间字段
            match_time_utc: match.match_datetime,
            is_authorizable: new Date() < new Date(match.match_datetime) // 是否可授权
        }));
        
        res.json({
            success: true,
            data: matchesWithStatus
        });
    } catch (error) {
        logger.error('Failed to get match pool:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

/**
 * 新增比賽
 * POST /admin/ticker-manager/matches/pool
 */
router.post('/matches/pool', (req, res) => {
    const db = getDb();
    const { league, home_team, away_team, match_date, match_time, weight } = req.body;
    
    if (!league || !home_team || !away_team || !match_date || !match_time) {
        return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS' });
    }
    
    try {
        const match_datetime = `${match_date} ${match_time}`;
        const stmt = db.prepare(`
            INSERT INTO match_pool (league, home_team, away_team, match_date, match_time, match_datetime, weight)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(league, home_team, away_team, match_date, match_time, match_datetime, weight || 100);
        
        logger.info(`Admin ${req.session?.adminId} added match: ${home_team} vs ${away_team}`);
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (error) {
        logger.error('Failed to add match:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

/**
 * 更新比賽
 * PUT /admin/ticker-manager/matches/pool/:id
 */
router.put('/matches/pool/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { league, home_team, away_team, match_date, match_time, status, weight } = req.body;
    
    try {
        const match_datetime = match_date && match_time ? `${match_date} ${match_time}` : undefined;
        let query = 'UPDATE match_pool SET updated_at = CURRENT_TIMESTAMP';
        const params = [];
        
        if (league) { query += ', league = ?'; params.push(league); }
        if (home_team) { query += ', home_team = ?'; params.push(home_team); }
        if (away_team) { query += ', away_team = ?'; params.push(away_team); }
        if (match_date) { query += ', match_date = ?'; params.push(match_date); }
        if (match_time) { query += ', match_time = ?'; params.push(match_time); }
        if (match_datetime) { query += ', match_datetime = ?'; params.push(match_datetime); }
        if (status) { query += ', status = ?'; params.push(status); }
        if (weight) { query += ', weight = ?'; params.push(weight); }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }
        
        logger.info(`Admin ${req.session?.adminId} updated match ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update match:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

/**
 * 刪除比賽
 * DELETE /admin/ticker-manager/matches/pool/:id
 */
router.delete('/matches/pool/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    
    try {
        const stmt = db.prepare('DELETE FROM match_pool WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
        }
        
        logger.info(`Admin ${req.session?.adminId} deleted match ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete match:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 系統配置接口 ====================

/**
 * 獲取系統配置
 * GET /admin/ticker-manager/config
 */
router.get('/config', (req, res) => {
    const db = getDb();
    
    try {
        const configs = db.prepare('SELECT config_key, config_value FROM ticker_config').all();
        const result = {};
        configs.forEach(c => { result[c.config_key] = c.config_value; });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Failed to get config:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

/**
 * 更新系統配置
 * PUT /admin/ticker-manager/config
 */
router.put('/config', (req, res) => {
    const db = getDb();
    const { total_volume, daily_auth, yesterday_profit, active_users } = req.body;
    
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO ticker_config (config_key, config_value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        
        if (total_volume !== undefined) stmt.run('total_volume', String(total_volume));
        if (daily_auth !== undefined) stmt.run('daily_auth', String(daily_auth));
        if (yesterday_profit !== undefined) stmt.run('yesterday_profit', String(yesterday_profit));
        if (active_users !== undefined) stmt.run('active_users', String(active_users));
        
        logger.info(`Admin ${req.session?.adminId} updated ticker config`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update config:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量生成消息（核心新功能）====================

/**
 * 批量生成消息
 * POST /admin/ticker-manager/batch-generate
 * 
 * Body:
 * {
 *   count: 100,           // 生成数量
 *   authRatio: 55,        // 授权比例 (%)
 *   authMin: 100,         // 授权最小金额
 *   authMax: 50000,       // 授权最大金额
 *   profitMin: 50,        // 收益最小金额
 *   profitMax: 25000,     // 收益最大金额
 *   profitRateMin: 15,    // 最小收益率
 *   profitRateMax: 350    // 最大收益率
 * }
 */
router.post('/batch-generate', (req, res) => {
    const db = getDb();
    const adminId = req.session?.adminId;
    const adminName = req.session?.adminName || 'Admin';
    
    const {
        count = 100,
        authRatio = 55,
        authMin = 100,
        authMax = 50000,
        profitMin = 50,
        profitMax = 25000,
        profitRateMin = 15,
        profitRateMax = 350
    } = req.body;
    
    // 參數驗證
    const genCount = Math.min(Math.max(safeInt(count, 100), 1), 5000);
    const authPercent = safeInt(authRatio, 55);
    const authMinVal = safeInt(authMin, 100);
    const authMaxVal = Math.max(safeInt(authMax, 50000), authMinVal);
    const profitMinVal = safeInt(profitMin, 50);
    const profitMaxVal = Math.max(safeInt(profitMax, 25000), profitMinVal);
    const rateMinVal = safeInt(profitRateMin, 15);
    const rateMaxVal = Math.max(safeInt(profitRateMax, 350), rateMinVal);
    
    try {
        // 獲取可用比賽（狀態為 upcoming 或 ongoing）
        const now = getUTCNow();
        const matches = db.prepare(`
            SELECT * FROM match_pool 
            WHERE status IN ('upcoming', 'ongoing')
            ORDER BY weight DESC
        `).all();
        
        if (matches.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'NO_MATCHES_AVAILABLE',
                message: '請先添加比賽數據到比賽池'
            });
        }
        
        // 獲取系統配置
        const configs = db.prepare('SELECT config_key, config_value FROM ticker_config').all();
        const sysConfig = {};
        configs.forEach(c => { sysConfig[c.config_key] = c.config_value; });
        
        const messages = [];
        let authCount = 0;
        let profitCount = 0;
        let systemCount = 0;
        
        // ==================== 随机生成系统消息数值 ====================
function generateRandomSystemStats() {
    // 总授权量：100万 - 1000万
    const totalVolume = Math.floor(Math.random() * (10000000 - 1000000) + 1000000);
    
    // 24h授权量：总授权量的 3% - 15%
    const dailyAuth = Math.floor(totalVolume * (Math.random() * 0.12 + 0.03));
    
    // 昨日收益：24h授权量的 20% - 50%
    const yesterdayProfit = Math.floor(dailyAuth * (Math.random() * 0.3 + 0.2));
    
    // 活跃用户：5000 - 100000
    const activeUsers = Math.floor(Math.random() * (100000 - 5000) + 5000);
    
    return { totalVolume, dailyAuth, yesterdayProfit, activeUsers };
}

// 生成系統消息（固定比例 10%）
const systemMessageCount = Math.floor(genCount * 0.1);

// 为每条系统消息独立生成随机数值，让消息看起来更真实
for (let i = 0; i < systemMessageCount; i++) {
    // 每次循环都生成新的随机数值
    const stats = generateRandomSystemStats();
    
    // 轮流使用不同的模板
    const templateIndex = i % 4;
    let message = '';
    
    switch (templateIndex) {
        case 0:
            message = `🎉 Total authorization volume exceeds ${formatAmount(stats.totalVolume)} USDT`;
            break;
        case 1:
            message = `⚡ Last 24h authorization volume ${formatAmount(stats.dailyAuth)} USDT`;
            break;
        case 2:
            message = `💰 Yesterday user profit ${formatAmount(stats.yesterdayProfit)} USDT`;
            break;
        case 3:
            message = `👥 Active users exceed ${formatAmount(stats.activeUsers)}`;
            break;
    }
    
    messages.push({
        type: 'system',
        message: message,
        weight: 80,
        created_at: new Date().toISOString()
    });
    systemCount++;
}
        
        // 生成用戶消息
        const userMessageCount = genCount - systemMessageCount;
        const authTargetCount = Math.floor(userMessageCount * authPercent / 100);
        const profitTargetCount = userMessageCount - authTargetCount;
        
        // 隨機函數
        const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        
        // 生成授權消息
        for (let i = 0; i < authTargetCount; i++) {
            const match = matches[Math.floor(Math.random() * matches.length)];
            const userId = generateUserId();
            const maskedUserId = maskUserId(userId);
            const amount = random(authMinVal, authMaxVal);
            const matchName = `${match.home_team} vs ${match.away_team}`;
            
            messages.push({
                type: 'auth',
                message: `⚡ User ${maskedUserId} authorized ${formatAmount(amount)} USDT on [${matchName}]`,
                weight: random(80, 200),
                amount: amount,
                match_id: match.id,
                match_name: matchName,
                user_id: userId,
                display_user_id: maskedUserId,
                created_at: new Date().toISOString()
            });
            authCount++;
        }
        
        // 生成收益消息
        for (let i = 0; i < profitTargetCount; i++) {
            const match = matches[Math.floor(Math.random() * matches.length)];
            const userId = generateUserId();
            const maskedUserId = maskUserId(userId);
            const amount = random(profitMinVal, profitMaxVal);
            const profitRate = random(rateMinVal, rateMaxVal);
            const matchName = `${match.home_team} vs ${match.away_team}`;
            
            messages.push({
                type: 'profit',
                message: `💰 User ${maskedUserId} earned ${formatAmount(amount)} USDT (+${profitRate}%) from [${matchName}]`,
                weight: random(80, 200),
                amount: amount,
                profit_rate: profitRate,
                match_id: match.id,
                match_name: matchName,
                user_id: userId,
                display_user_id: maskedUserId,
                created_at: new Date().toISOString()
            });
            profitCount++;
        }
        
        // 打亂消息順序
        for (let i = messages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [messages[i], messages[j]] = [messages[j], messages[i]];
        }
        
        // 存入數據庫
        const insertStmt = db.prepare(`
            INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const insertMany = db.transaction((msgs) => {
            for (const msg of msgs) {
                insertStmt.run(msg.type, msg.message, msg.weight, adminId, msg.created_at);
            }
        });
        
        insertMany(messages);
        
        // 記錄生成歷史
        ensureTables(db);
        const historyStmt = db.prepare(`
            INSERT INTO ticker_generation_log (admin_id, admin_name, generated_count, auth_count, profit_count, system_count)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        historyStmt.run(adminId, adminName, messages.length, authCount, profitCount, systemCount);
        
        logger.info(`Admin ${adminName} batch generated ${messages.length} messages (Auth:${authCount}, Profit:${profitCount}, System:${systemCount})`);
        
        res.json({
            success: true,
            data: {
                total: messages.length,
                auth_count: authCount,
                profit_count: profitCount,
                system_count: systemCount,
                messages: messages.slice(0, 50) // 返回前50條用於預覽
            }
        });
        
    } catch (error) {
        logger.error('Failed to batch generate:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 以下為原有接口（保持兼容）====================

// 獲取統計數據
router.get('/stats', (req, res) => {
    const db = getDb();
    
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN type = 'auth' THEN 1 ELSE 0 END) as auth_count,
                SUM(CASE WHEN type = 'profit' THEN 1 ELSE 0 END) as profit_count,
                SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) as system_count
            FROM ticker_messages
        `).get();

        res.json({
            success: true,
            data: {
                total: stats.total || 0,
                auth_count: stats.auth_count || 0,
                profit_count: stats.profit_count || 0,
                system_count: stats.system_count || 0
            }
        });
    } catch (error) {
        logger.error('Failed to get stats:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取實時統計數據
router.get('/live-stats', (req, res) => {
    const db = getDb();
    
    try {
        const totalVolume = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM authorizations 
            WHERE status = 'settled'
        `).get();
        
        const dailyAuth = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM authorizations 
            WHERE created_at > datetime('now', '-1 day')
        `).get();
        
        const yesterdayProfit = db.prepare(`
            SELECT COALESCE(SUM(profit), 0) as total 
            FROM authorizations 
            WHERE status = 'settled' 
            AND settled_at > date('now', '-1 day')
        `).get();
        
        const activeUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count 
            FROM authorizations 
            WHERE created_at > datetime('now', '-7 days')
        `).get();
        
        const hotMatch = db.prepare(`
            SELECT m.home_team || ' vs ' || m.away_team as match_name
            FROM authorizations a
            JOIN matches m ON a.match_id = m.match_id
            WHERE a.created_at > datetime('now', '-3 days')
            GROUP BY a.match_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        `).get();
        
        res.json({
            success: true,
            data: {
                totalVolume: totalVolume.total || 0,
                dailyAuth: dailyAuth.total || 0,
                yesterdayProfit: yesterdayProfit.total || 0,
                activeUsers: activeUsers.count || 0,
                hotMatch: hotMatch ? hotMatch.match_name : 'None'
            }
        });
    } catch (error) {
        logger.error('Failed to get live stats:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取智能推薦
router.get('/recommendations', (req, res) => {
    const db = getDb();
    
    try {
        const recommendations = [];
        
        const stats = db.prepare(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(SUM(CASE WHEN created_at > datetime('now', '-1 day') THEN amount ELSE 0 END), 0) as daily_auth,
                COALESCE(SUM(CASE WHEN status = 'settled' AND settled_at > date('now', '-1 day') THEN profit ELSE 0 END), 0) as daily_profit,
                COUNT(DISTINCT CASE WHEN created_at > datetime('now', '-7 days') THEN user_id END) as weekly_active
            FROM authorizations
        `).get();
        
        const hotMatches = db.prepare(`
            SELECT m.home_team, m.away_team, COUNT(*) as auth_count
            FROM authorizations a
            JOIN matches m ON a.match_id = m.match_id
            WHERE a.created_at > datetime('now', '-3 days')
            GROUP BY a.match_id
            ORDER BY auth_count DESC
            LIMIT 3
        `).all();
        
        if (stats.total_volume > 1000) {
            recommendations.push({
                type: 'system',
                message: `🎉 Total platform volume exceeds ${stats.total_volume.toLocaleString()} USDT`
            });
        }
        
        if (stats.daily_auth > 100) {
            recommendations.push({
                type: 'system',
                message: `⚡ Last 24h authorization volume ${stats.daily_auth.toLocaleString()} USDT`
            });
        }
        
        if (stats.daily_profit > 50) {
            recommendations.push({
                type: 'system',
                message: `💰 Yesterday user profit ${stats.daily_profit.toLocaleString()} USDT`
            });
        }
        
        if (stats.weekly_active > 10) {
            recommendations.push({
                type: 'system',
                message: `👥 Active users exceed ${stats.weekly_active}`
            });
        }
        
        hotMatches.forEach(match => {
            recommendations.push({
                type: 'system',
                message: `🎯 Hot match: ${match.home_team} vs ${match.away_team} (${match.auth_count} authorizations)`
            });
        });
        
        res.json({
            success: true,
            data: recommendations.slice(0, 10)
        });
    } catch (error) {
        logger.error('Failed to get recommendations:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取生成歷史記錄
router.get('/generation-history', (req, res) => {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    try {
        ensureTables(db);
        
        const totalCount = db.prepare(`
            SELECT COUNT(*) as count FROM ticker_generation_log
        `).get();
        
        const history = db.prepare(`
            SELECT 
                id,
                admin_name,
                generated_count,
                auth_count,
                profit_count,
                system_count,
                datetime(created_at, 'localtime') as created_at
            FROM ticker_generation_log
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
        
        res.json({
            success: true,
            data: history,
            pagination: {
                page,
                limit,
                total: totalCount.count,
                pages: Math.ceil(totalCount.count / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to get generation history:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取今日生成統計
router.get('/today-stats', (req, res) => {
    const db = getDb();
    
    try {
        ensureTables(db);
        
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as generation_count,
                COALESCE(SUM(generated_count), 0) as total_generated,
                COALESCE(SUM(auth_count), 0) as total_auth,
                COALESCE(SUM(profit_count), 0) as total_profit,
                COALESCE(SUM(system_count), 0) as total_system
            FROM ticker_generation_log
            WHERE date(created_at) = date('now')
        `).get();
        
        res.json({
            success: true,
            data: {
                generation_count: stats.generation_count || 0,
                total_generated: stats.total_generated || 0,
                total_auth: stats.total_auth || 0,
                total_profit: stats.total_profit || 0,
                total_system: stats.total_system || 0
            }
        });
    } catch (error) {
        logger.error('Failed to get today stats:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 生成推薦動態（修改為使用本地比賽池）
router.post('/generate-recommended', (req, res) => {
    const db = getDb();
    const adminId = req.session?.adminId;
    const adminName = req.session?.adminName || 'Admin';
    
    try {
        ensureTables(db);
        
        // 獲取本地比賽池
        const matches = db.prepare(`
            SELECT * FROM match_pool 
            WHERE status IN ('upcoming', 'ongoing')
            LIMIT 5
        `).all();
        
        // 獲取系統配置
        const configs = db.prepare('SELECT config_key, config_value FROM ticker_config').all();
        const sysConfig = {};
        configs.forEach(c => { sysConfig[c.config_key] = c.config_value; });
        
        let generated = 0;
        let authCount = 0;
        let profitCount = 0;
        let systemCount = 0;
        
        // 生成系統消息
        if (sysConfig.total_volume) {
            db.prepare(`
                INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(
                'system',
                `🎉 Total authorization volume exceeds ${formatAmount(parseInt(sysConfig.total_volume))} USDT`,
                80,
                adminId
            );
            generated++;
            systemCount++;
        }
        
        if (sysConfig.daily_auth) {
            db.prepare(`
                INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(
                'system',
                `⚡ Last 24h authorization volume ${formatAmount(parseInt(sysConfig.daily_auth))} USDT`,
                90,
                adminId
            );
            generated++;
            systemCount++;
        }
        
        if (sysConfig.yesterday_profit) {
            db.prepare(`
                INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(
                'system',
                `💰 Yesterday user profit ${formatAmount(parseInt(sysConfig.yesterday_profit))} USDT`,
                85,
                adminId
            );
            generated++;
            systemCount++;
        }
        
        if (sysConfig.active_users) {
            db.prepare(`
                INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(
                'system',
                `👥 Active users exceed ${sysConfig.active_users}`,
                70,
                adminId
            );
            generated++;
            systemCount++;
        }
        
        // 生成比賽相關消息
        matches.forEach(match => {
            const userId = generateUserId();
            const maskedUserId = maskUserId(userId);
            const amount = Math.floor(Math.random() * 50000) + 100;
            const matchName = `${match.home_team} vs ${match.away_team}`;
            
            db.prepare(`
                INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(
                'auth',
                `⚡ User ${maskedUserId} authorized ${formatAmount(amount)} USDT on [${matchName}]`,
                100,
                adminId
            );
            generated++;
            authCount++;
        });
        
        // 記錄生成歷史
        db.prepare(`
            INSERT INTO ticker_generation_log (
                admin_id, admin_name, generated_count, auth_count, profit_count, system_count
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(adminId, adminName, generated, authCount, profitCount, systemCount);
        
        logger.info(`Admin ${adminName} generated ${generated} recommended messages`);
        res.json({ success: true, data: { generated } });
        
    } catch (error) {
        logger.error('Failed to generate recommendations:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 獲取所有動態（分頁）
router.get('/messages', (req, res) => {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type;
    const search = req.query.search;
    
    try {
        let query = 'SELECT * FROM ticker_messages';
        let countQuery = 'SELECT COUNT(*) as total FROM ticker_messages';
        const params = [];
        const conditions = [];
        
        if (type && type !== 'all') {
            conditions.push('type = ?');
            params.push(type);
        }
        
        if (search) {
            conditions.push('message LIKE ?');
            params.push(`%${search}%`);
        }
        
        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        
        const { total } = db.prepare(countQuery).get(...params);
        const messages = db.prepare(query).all(...params, limit, offset);
        
        res.json({
            success: true,
            data: messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to get messages:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 更新單條動態
router.put('/message/:id', (req, res) => {
    const { id } = req.params;
    const { message, weight } = req.body;
    const db = getDb();
    
    try {
        db.prepare(`
            UPDATE ticker_messages 
            SET message = ?, weight = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(message, weight, id);
        
        logger.info(`Admin ${req.session?.adminId} updated message ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update message:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 刪除單條動態
router.delete('/message/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    try {
        db.prepare('DELETE FROM ticker_messages WHERE id = ?').run(id);
        logger.info(`Admin ${req.session?.adminId} deleted message ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete message:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// 清空所有動態
router.delete('/clear', (req, res) => {
    const db = getDb();
    
    try {
        const result = db.prepare('DELETE FROM ticker_messages').run();
        logger.info(`Admin ${req.session?.adminId} cleared ${result.changes} messages`);
        res.json({ success: true, data: { deleted: result.changes } });
    } catch (error) {
        logger.error('Failed to clear messages:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;