/**
 * FOOTRADAPRO - 動態消息管理路由 V2
 * @description 管理跑馬燈動態消息的生成、編輯和刪除 (全英文版本，含生成歷史記錄)
 * @version 2.1.0 - 支持 PostgreSQL 和 SQLite
 */

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

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
 */
const generateUserId = () => {
    const digits = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letter = letters[Math.floor(Math.random() * letters.length)];
    return `U${digits}${letter}`;
};

/**
 * 掩碼用戶ID（顯示用）
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
const ensureTables = async () => {
    try {
        if (isProduction) {
            await query(`
                CREATE TABLE IF NOT EXISTS ticker_generation_log (
                    id SERIAL PRIMARY KEY,
                    admin_id INTEGER,
                    admin_name TEXT,
                    generated_count INTEGER,
                    auth_count INTEGER DEFAULT 0,
                    profit_count INTEGER DEFAULT 0,
                    system_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await query(`
                CREATE INDEX IF NOT EXISTS idx_generation_log_created 
                ON ticker_generation_log(created_at DESC)
            `);
        } else {
            const db = getDb();
            db.exec(`
                CREATE TABLE IF NOT EXISTS ticker_generation_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER,
                    admin_name TEXT,
                    generated_count INTEGER,
                    auth_count INTEGER DEFAULT 0,
                    profit_count INTEGER DEFAULT 0,
                    system_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_generation_log_created 
                ON ticker_generation_log(created_at DESC)
            `);
        }
    } catch (err) {
        console.log('确保表存在时出错:', err.message);
    }
};

// ==================== 比赛实时状态计算 ====================
function calculateMatchStatus(matchDateTime) {
    const now = new Date();
    const matchTime = new Date(matchDateTime);
    const endTime = new Date(matchTime.getTime() + 110 * 60 * 1000);
    
    if (now < matchTime) return 'upcoming';
    if (now >= matchTime && now < endTime) return 'ongoing';
    return 'finished';
}

// ==================== 比賽池管理接口 ====================

/**
 * 獲取比賽池列表
 * GET /admin/ticker-manager/matches/pool
 */
router.get('/matches/pool', async (req, res) => {
    try {
        const { status, date } = req.query;
        let matches = [];
        
        if (isProduction) {
            let sql = 'SELECT * FROM match_pool WHERE 1=1';
            const params = [];
            
            if (status) {
                sql += ' AND status = $' + (params.length + 1);
                params.push(status);
            }
            if (date) {
                sql += ' AND match_date = $' + (params.length + 1);
                params.push(date);
            }
            sql += ' ORDER BY match_datetime ASC';
            
            const result = await query(sql, params);
            matches = result || [];
        } else {
            const db = getDb();
            let sql = 'SELECT * FROM match_pool WHERE 1=1';
            const params = [];
            
            if (status) {
                sql += ' AND status = ?';
                params.push(status);
            }
            if (date) {
                sql += ' AND match_date = ?';
                params.push(date);
            }
            sql += ' ORDER BY match_datetime ASC';
            
            matches = db.prepare(sql).all(...params);
        }
        
        const matchesWithStatus = matches.map(match => ({
            ...match,
            calculated_status: calculateMatchStatus(match.match_datetime),
            match_time_utc: match.match_datetime,
            is_authorizable: new Date() < new Date(match.match_datetime)
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
router.post('/matches/pool', async (req, res) => {
    const { league, home_team, away_team, match_date, match_time, weight } = req.body;
    
    if (!league || !home_team || !away_team || !match_date || !match_time) {
        return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS' });
    }
    
    try {
        const match_datetime = `${match_date} ${match_time}`;
        let newId = null;
        
        if (isProduction) {
            const result = await query(`
                INSERT INTO match_pool (league, home_team, away_team, match_date, match_time, match_datetime, weight)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [league, home_team, away_team, match_date, match_time, match_datetime, weight || 100]);
            newId = result?.[0]?.id;
        } else {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT INTO match_pool (league, home_team, away_team, match_date, match_time, match_datetime, weight)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(league, home_team, away_team, match_date, match_time, match_datetime, weight || 100);
            newId = result.lastInsertRowid;
        }
        
        logger.info(`Admin ${req.session?.adminId} added match: ${home_team} vs ${away_team}`);
        res.json({ success: true, data: { id: newId } });
    } catch (error) {
        logger.error('Failed to add match:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

/**
 * 更新比賽
 * PUT /admin/ticker-manager/matches/pool/:id
 */
router.put('/matches/pool/:id', async (req, res) => {
    const { id } = req.params;
    const { league, home_team, away_team, match_date, match_time, status, weight } = req.body;
    
    try {
        const match_datetime = match_date && match_time ? `${match_date} ${match_time}` : undefined;
        const updates = [];
        const values = [];
        
        if (league !== undefined) { updates.push('league = ?'); values.push(league); }
        if (home_team !== undefined) { updates.push('home_team = ?'); values.push(home_team); }
        if (away_team !== undefined) { updates.push('away_team = ?'); values.push(away_team); }
        if (match_date !== undefined) { updates.push('match_date = ?'); values.push(match_date); }
        if (match_time !== undefined) { updates.push('match_time = ?'); values.push(match_time); }
        if (match_datetime !== undefined) { updates.push('match_datetime = ?'); values.push(match_datetime); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (weight !== undefined) { updates.push('weight = ?'); values.push(weight); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'NO_FIELDS_TO_UPDATE' });
        }
        
        values.push(id);
        
        if (isProduction) {
            const placeholders = updates.map((_, i) => `${updates[i].replace('?', `$${i + 1}`)}`).join(', ');
            await query(`UPDATE match_pool SET ${placeholders}, updated_at = NOW() WHERE id = $${values.length}`, values);
        } else {
            const db = getDb();
            const stmt = db.prepare(`UPDATE match_pool SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
            const result = stmt.run(...values);
            
            if (result.changes === 0) {
                return res.status(404).json({ success: false, error: 'MATCH_NOT_FOUND' });
            }
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
router.delete('/matches/pool/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query('DELETE FROM match_pool WHERE id = $1', [id]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare('DELETE FROM match_pool WHERE id = ?').run(id);
            changes = result.changes;
        }
        
        if (changes === 0) {
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
router.get('/config', async (req, res) => {
    try {
        let configs = [];
        
        if (isProduction) {
            const result = await query('SELECT config_key, config_value FROM ticker_config');
            configs = result || [];
        } else {
            const db = getDb();
            configs = db.prepare('SELECT config_key, config_value FROM ticker_config').all();
        }
        
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
router.put('/config', async (req, res) => {
    const { total_volume, daily_auth, yesterday_profit, active_users } = req.body;
    
    try {
        if (isProduction) {
            if (total_volume !== undefined) {
                await query(`
                    INSERT INTO ticker_config (config_key, config_value, updated_at)
                    VALUES ('total_volume', $1, NOW())
                    ON CONFLICT (config_key) DO UPDATE SET config_value = $1, updated_at = NOW()
                `, [String(total_volume)]);
            }
            if (daily_auth !== undefined) {
                await query(`
                    INSERT INTO ticker_config (config_key, config_value, updated_at)
                    VALUES ('daily_auth', $1, NOW())
                    ON CONFLICT (config_key) DO UPDATE SET config_value = $1, updated_at = NOW()
                `, [String(daily_auth)]);
            }
            if (yesterday_profit !== undefined) {
                await query(`
                    INSERT INTO ticker_config (config_key, config_value, updated_at)
                    VALUES ('yesterday_profit', $1, NOW())
                    ON CONFLICT (config_key) DO UPDATE SET config_value = $1, updated_at = NOW()
                `, [String(yesterday_profit)]);
            }
            if (active_users !== undefined) {
                await query(`
                    INSERT INTO ticker_config (config_key, config_value, updated_at)
                    VALUES ('active_users', $1, NOW())
                    ON CONFLICT (config_key) DO UPDATE SET config_value = $1, updated_at = NOW()
                `, [String(active_users)]);
            }
        } else {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO ticker_config (config_key, config_value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);
            
            if (total_volume !== undefined) stmt.run('total_volume', String(total_volume));
            if (daily_auth !== undefined) stmt.run('daily_auth', String(daily_auth));
            if (yesterday_profit !== undefined) stmt.run('yesterday_profit', String(yesterday_profit));
            if (active_users !== undefined) stmt.run('active_users', String(active_users));
        }
        
        logger.info(`Admin ${req.session?.adminId} updated ticker config`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update config:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量生成消息 ====================
router.post('/batch-generate', async (req, res) => {
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
    
    const genCount = Math.min(Math.max(safeInt(count, 100), 1), 5000);
    const authPercent = safeInt(authRatio, 55);
    const authMinVal = safeInt(authMin, 100);
    const authMaxVal = Math.max(safeInt(authMax, 50000), authMinVal);
    const profitMinVal = safeInt(profitMin, 50);
    const profitMaxVal = Math.max(safeInt(profitMax, 25000), profitMinVal);
    const rateMinVal = safeInt(profitRateMin, 15);
    const rateMaxVal = Math.max(safeInt(profitRateMax, 350), rateMinVal);
    
    try {
        let matches = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT * FROM match_pool 
                WHERE status IN ('upcoming', 'ongoing')
                ORDER BY weight DESC
            `);
            matches = result || [];
        } else {
            const db = getDb();
            matches = db.prepare(`
                SELECT * FROM match_pool 
                WHERE status IN ('upcoming', 'ongoing')
                ORDER BY weight DESC
            `).all();
        }
        
        if (matches.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'NO_MATCHES_AVAILABLE',
                message: '請先添加比賽數據到比賽池'
            });
        }
        
        let configs = [];
        if (isProduction) {
            const result = await query('SELECT config_key, config_value FROM ticker_config');
            configs = result || [];
        } else {
            const db = getDb();
            configs = db.prepare('SELECT config_key, config_value FROM ticker_config').all();
        }
        
        const sysConfig = {};
        configs.forEach(c => { sysConfig[c.config_key] = c.config_value; });
        
        const messages = [];
        let authCount = 0;
        let profitCount = 0;
        let systemCount = 0;
        
        const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        
        const generateRandomSystemStats = () => {
            const totalVolume = Math.floor(Math.random() * (10000000 - 1000000) + 1000000);
            const dailyAuth = Math.floor(totalVolume * (Math.random() * 0.12 + 0.03));
            const yesterdayProfit = Math.floor(dailyAuth * (Math.random() * 0.3 + 0.2));
            const activeUsers = Math.floor(Math.random() * (100000 - 5000) + 5000);
            return { totalVolume, dailyAuth, yesterdayProfit, activeUsers };
        };
        
        const systemMessageCount = Math.floor(genCount * 0.1);
        
        for (let i = 0; i < systemMessageCount; i++) {
            const stats = generateRandomSystemStats();
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
        
        const userMessageCount = genCount - systemMessageCount;
        const authTargetCount = Math.floor(userMessageCount * authPercent / 100);
        const profitTargetCount = userMessageCount - authTargetCount;
        
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
        
        for (let i = messages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [messages[i], messages[j]] = [messages[j], messages[i]];
        }
        
        if (isProduction) {
            for (const msg of messages) {
                await query(`
                    INSERT INTO ticker_messages (type, message, weight, created_by, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                `, [msg.type, msg.message, msg.weight, adminId, msg.created_at]);
            }
        } else {
            const db = getDb();
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
        }
        
        await ensureTables();
        
        if (isProduction) {
            await query(`
                INSERT INTO ticker_generation_log (admin_id, admin_name, generated_count, auth_count, profit_count, system_count)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [adminId, adminName, messages.length, authCount, profitCount, systemCount]);
        } else {
            const db = getDb();
            const historyStmt = db.prepare(`
                INSERT INTO ticker_generation_log (admin_id, admin_name, generated_count, auth_count, profit_count, system_count)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            historyStmt.run(adminId, adminName, messages.length, authCount, profitCount, systemCount);
        }
        
        logger.info(`Admin ${adminName} batch generated ${messages.length} messages`);
        
        res.json({
            success: true,
            data: {
                total: messages.length,
                auth_count: authCount,
                profit_count: profitCount,
                system_count: systemCount,
                messages: messages.slice(0, 50)
            }
        });
        
    } catch (error) {
        logger.error('Failed to batch generate:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取統計數據 ====================
router.get('/stats', async (req, res) => {
    try {
        let stats = {};
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN type = 'auth' THEN 1 ELSE 0 END) as auth_count,
                    SUM(CASE WHEN type = 'profit' THEN 1 ELSE 0 END) as profit_count,
                    SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) as system_count
                FROM ticker_messages
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN type = 'auth' THEN 1 ELSE 0 END) as auth_count,
                    SUM(CASE WHEN type = 'profit' THEN 1 ELSE 0 END) as profit_count,
                    SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) as system_count
                FROM ticker_messages
            `).get();
        }
        
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

// ==================== 獲取實時統計數據 ====================
router.get('/live-stats', async (req, res) => {
    try {
        let totalVolume = 0, dailyAuth = 0, yesterdayProfit = 0, activeUsers = 0, hotMatch = null;
        
        if (isProduction) {
            const totalVolumeRes = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM authorizations WHERE status = 'settled'`);
            totalVolume = parseFloat(totalVolumeRes?.[0]?.total || 0);
            
            const dailyAuthRes = await query(`SELECT COALESCE(SUM(amount), 0) as total FROM authorizations WHERE created_at > NOW() - INTERVAL '1 day'`);
            dailyAuth = parseFloat(dailyAuthRes?.[0]?.total || 0);
            
            const yesterdayProfitRes = await query(`SELECT COALESCE(SUM(profit), 0) as total FROM authorizations WHERE status = 'settled' AND settled_at > NOW() - INTERVAL '1 day'`);
            yesterdayProfit = parseFloat(yesterdayProfitRes?.[0]?.total || 0);
            
            const activeUsersRes = await query(`SELECT COUNT(DISTINCT user_id) as count FROM authorizations WHERE created_at > NOW() - INTERVAL '7 days'`);
            activeUsers = parseInt(activeUsersRes?.[0]?.count || 0);
            
            const hotMatchRes = await query(`
                SELECT m.home_team || ' vs ' || m.away_team as match_name
                FROM authorizations a
                JOIN matches m ON a.match_id = m.match_id
                WHERE a.created_at > NOW() - INTERVAL '3 days'
                GROUP BY a.match_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
            `);
            hotMatch = hotMatchRes?.[0];
        } else {
            const db = getDb();
            const totalVolumeRes = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM authorizations WHERE status = 'settled'`).get();
            totalVolume = totalVolumeRes.total || 0;
            
            const dailyAuthRes = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM authorizations WHERE created_at > datetime('now', '-1 day')`).get();
            dailyAuth = dailyAuthRes.total || 0;
            
            const yesterdayProfitRes = db.prepare(`SELECT COALESCE(SUM(profit), 0) as total FROM authorizations WHERE status = 'settled' AND settled_at > date('now', '-1 day')`).get();
            yesterdayProfit = yesterdayProfitRes.total || 0;
            
            const activeUsersRes = db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM authorizations WHERE created_at > datetime('now', '-7 days')`).get();
            activeUsers = activeUsersRes.count || 0;
            
            const hotMatchRes = db.prepare(`
                SELECT m.home_team || ' vs ' || m.away_team as match_name
                FROM authorizations a
                JOIN matches m ON a.match_id = m.match_id
                WHERE a.created_at > datetime('now', '-3 days')
                GROUP BY a.match_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
            `).get();
            hotMatch = hotMatchRes;
        }
        
        res.json({
            success: true,
            data: {
                totalVolume: totalVolume,
                dailyAuth: dailyAuth,
                yesterdayProfit: yesterdayProfit,
                activeUsers: activeUsers,
                hotMatch: hotMatch ? hotMatch.match_name : 'None'
            }
        });
    } catch (error) {
        logger.error('Failed to get live stats:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 獲取智能推薦 ====================
router.get('/recommendations', async (req, res) => {
    try {
        let stats = {};
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COALESCE(SUM(amount), 0) as total_volume,
                    COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN amount ELSE 0 END), 0) as daily_auth,
                    COALESCE(SUM(CASE WHEN status = 'settled' AND settled_at > NOW() - INTERVAL '1 day' THEN profit ELSE 0 END), 0) as daily_profit,
                    COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN user_id END) as weekly_active
                FROM authorizations
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
                SELECT 
                    COALESCE(SUM(amount), 0) as total_volume,
                    COALESCE(SUM(CASE WHEN created_at > datetime('now', '-1 day') THEN amount ELSE 0 END), 0) as daily_auth,
                    COALESCE(SUM(CASE WHEN status = 'settled' AND settled_at > date('now', '-1 day') THEN profit ELSE 0 END), 0) as daily_profit,
                    COUNT(DISTINCT CASE WHEN created_at > datetime('now', '-7 days') THEN user_id END) as weekly_active
                FROM authorizations
            `).get();
        }
        
        let hotMatches = [];
        if (isProduction) {
            const result = await query(`
                SELECT m.home_team, m.away_team, COUNT(*) as auth_count
                FROM authorizations a
                JOIN matches m ON a.match_id = m.match_id
                WHERE a.created_at > NOW() - INTERVAL '3 days'
                GROUP BY a.match_id
                ORDER BY auth_count DESC
                LIMIT 3
            `);
            hotMatches = result || [];
        } else {
            const db = getDb();
            hotMatches = db.prepare(`
                SELECT m.home_team, m.away_team, COUNT(*) as auth_count
                FROM authorizations a
                JOIN matches m ON a.match_id = m.match_id
                WHERE a.created_at > datetime('now', '-3 days')
                GROUP BY a.match_id
                ORDER BY auth_count DESC
                LIMIT 3
            `).all();
        }
        
        const recommendations = [];
        
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

// ==================== 獲取生成歷史記錄 ====================
router.get('/generation-history', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    try {
        await ensureTables();
        
        let totalCount = { count: 0 };
        let history = [];
        
        if (isProduction) {
            const totalResult = await query('SELECT COUNT(*) as count FROM ticker_generation_log');
            totalCount = totalResult?.[0] || { count: 0 };
            
            const result = await query(`
                SELECT 
                    id,
                    admin_name,
                    generated_count,
                    auth_count,
                    profit_count,
                    system_count,
                    created_at
                FROM ticker_generation_log
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            history = result || [];
        } else {
            const db = getDb();
            totalCount = db.prepare('SELECT COUNT(*) as count FROM ticker_generation_log').get();
            history = db.prepare(`
                SELECT 
                    id,
                    admin_name,
                    generated_count,
                    auth_count,
                    profit_count,
                    system_count,
                    created_at
                FROM ticker_generation_log
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(limit, offset);
        }
        
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

// ==================== 獲取今日生成統計 ====================
router.get('/today-stats', async (req, res) => {
    try {
        await ensureTables();
        
        let stats = {};
        
        if (isProduction) {
            const result = await query(`
                SELECT 
                    COUNT(*) as generation_count,
                    COALESCE(SUM(generated_count), 0) as total_generated,
                    COALESCE(SUM(auth_count), 0) as total_auth,
                    COALESCE(SUM(profit_count), 0) as total_profit,
                    COALESCE(SUM(system_count), 0) as total_system
                FROM ticker_generation_log
                WHERE DATE(created_at) = CURRENT_DATE
            `);
            stats = result?.[0] || {};
        } else {
            const db = getDb();
            stats = db.prepare(`
                SELECT 
                    COUNT(*) as generation_count,
                    COALESCE(SUM(generated_count), 0) as total_generated,
                    COALESCE(SUM(auth_count), 0) as total_auth,
                    COALESCE(SUM(profit_count), 0) as total_profit,
                    COALESCE(SUM(system_count), 0) as total_system
                FROM ticker_generation_log
                WHERE date(created_at) = date('now')
            `).get();
        }
        
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

// ==================== 獲取所有動態（分頁）====================
router.get('/messages', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type;
    const search = req.query.search;
    
    try {
        let messages = [];
        let totalCount = { count: 0 };
        
        if (isProduction) {
            let sql = 'SELECT * FROM ticker_messages';
            let countSql = 'SELECT COUNT(*) as total FROM ticker_messages';
            const params = [];
            
            if (type && type !== 'all') {
                sql += ' WHERE type = $1';
                countSql += ' WHERE type = $1';
                params.push(type);
            }
            if (search) {
                const condition = params.length > 0 ? ' AND' : ' WHERE';
                sql += `${condition} message LIKE $${params.length + 1}`;
                countSql += `${condition} message LIKE $${params.length + 1}`;
                params.push(`%${search}%`);
            }
            
            sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            
            const totalResult = await query(countSql, params);
            totalCount = totalResult?.[0] || { count: 0 };
            
            const result = await query(sql, [...params, limit, offset]);
            messages = result || [];
        } else {
            const db = getDb();
            let sql = 'SELECT * FROM ticker_messages';
            let countSql = 'SELECT COUNT(*) as total FROM ticker_messages';
            const params = [];
            
            if (type && type !== 'all') {
                sql += ' WHERE type = ?';
                countSql += ' WHERE type = ?';
                params.push(type);
            }
            if (search) {
                const condition = params.length > 0 ? ' AND' : ' WHERE';
                sql += `${condition} message LIKE ?`;
                countSql += `${condition} message LIKE ?`;
                params.push(`%${search}%`);
            }
            
            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            
            totalCount = db.prepare(countSql).get(...params);
            messages = db.prepare(sql).all(...params, limit, offset);
        }
        
        res.json({
            success: true,
            data: messages,
            pagination: {
                page,
                limit,
                total: totalCount.count,
                pages: Math.ceil(totalCount.count / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to get messages:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 更新單條動態 ====================
router.put('/message/:id', async (req, res) => {
    const { id } = req.params;
    const { message, weight } = req.body;
    
    try {
        if (isProduction) {
            await query(`
                UPDATE ticker_messages 
                SET message = $1, weight = $2, updated_at = NOW()
                WHERE id = $3
            `, [message, weight, id]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE ticker_messages 
                SET message = ?, weight = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(message, weight, id);
        }
        
        logger.info(`Admin ${req.session?.adminId} updated message ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update message:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 刪除單條動態 ====================
router.delete('/message/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        if (isProduction) {
            await query('DELETE FROM ticker_messages WHERE id = $1', [id]);
        } else {
            const db = getDb();
            db.prepare('DELETE FROM ticker_messages WHERE id = ?').run(id);
        }
        
        logger.info(`Admin ${req.session?.adminId} deleted message ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete message:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 清空所有動態 ====================
router.delete('/clear', async (req, res) => {
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query('DELETE FROM ticker_messages');
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare('DELETE FROM ticker_messages').run();
            changes = result.changes;
        }
        
        logger.info(`Admin ${req.session?.adminId} cleared ${changes} messages`);
        res.json({ success: true, data: { deleted: changes } });
    } catch (error) {
        logger.error('Failed to clear messages:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;