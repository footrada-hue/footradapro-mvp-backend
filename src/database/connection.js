/**
 * FOOTRADAPRO MVP - Database Connection
 * @description SQLite3数据库连接和基础初始化
 */

import sqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../config/index.js';
import logger from '../utils/logger.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保数据库目录存在
const DB_PATH = config.DB_PATH;
const DB_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// 数据库实例
let db = null;

// 遷移記錄表名
const MIGRATIONS_TABLE = 'migrations_log';

/**
 * 確保遷移記錄表存在
 */
const ensureMigrationsTable = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum TEXT,
            execution_time INTEGER
        )
    `);
    logger.info('[Migration] Migrations table ready');
};

/**
 * 獲取已執行的遷移
 */
const getAppliedMigrations = () => {
    const stmt = db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`);
    return stmt.all().map(row => row.name);
};

/**
 * 計算文件校驗和
 */
const calculateChecksum = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
    }
    return hash.toString(16);
};

/**
 * 執行遷移文件
 */
const runMigration = (migrationFile) => {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
        logger.warn(`[Migration] File not found: ${migrationFile}`);
        return false;
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const checksum = calculateChecksum(migrationPath);
    const startTime = Date.now();
    
    logger.info(`[Migration] Running: ${migrationFile}`);
    
    try {
        // 分割 SQL 語句
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        // 開始事務
        db.exec('BEGIN TRANSACTION');
        
        // 執行每條語句
        let successCount = 0;
        let skipCount = 0;
        
        for (const stmt of statements) {
            try {
                db.exec(stmt);
                successCount++;
            } catch (err) {
                // 可忽略的錯誤列表
                const ignorableErrors = [
                    'duplicate column name',
                    'already exists',
                    'no such table',
                    'duplicate key',
                    'has no column'
                ];
                
                const shouldIgnore = ignorableErrors.some(msg => err.message.includes(msg));
                
                if (shouldIgnore) {
                    skipCount++;
                    logger.debug(`[Migration] Skipping statement: ${err.message}`);
                } else {
                    throw err;
                }
            }
        }
        
        // 檢查是否已經執行過（根據校驗和）
        const existing = db.prepare(`
            SELECT id FROM ${MIGRATIONS_TABLE} 
            WHERE name = ? AND checksum = ?
        `).get(migrationFile, checksum);
        
        if (!existing) {
            // 記錄遷移
            const insertStmt = db.prepare(`
                INSERT INTO ${MIGRATIONS_TABLE} (name, checksum, execution_time)
                VALUES (?, ?, ?)
            `);
            insertStmt.run(migrationFile, checksum, Date.now() - startTime);
        }
        
        // 提交事務
        db.exec('COMMIT');
        
        logger.info(`[Migration] Completed: ${migrationFile} (${successCount}成功, ${skipCount}跳過, ${Date.now() - startTime}ms)`);
        return true;
        
    } catch (err) {
        // 回滾事務
        db.exec('ROLLBACK');
        logger.error(`[Migration] Failed: ${migrationFile}`, err);
        return false;
    }
};

/**
 * 執行所有待執行的遷移
 */
const runPendingMigrations = () => {
    const migrationsDir = path.join(__dirname, 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
        logger.info('[Migration] Migrations directory created');
        return;
    }
    
    // 獲取所有遷移文件（按文件名排序）
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql') && f !== 'run.js')
        .sort((a, b) => {
            // 提取數字前綴進行排序
            const numA = parseInt(a.split('_')[0]) || 0;
            const numB = parseInt(b.split('_')[0]) || 0;
            return numA - numB;
        });
    
    if (files.length === 0) {
        logger.info('[Migration] No migration files found');
        return;
    }
    
    // 確保遷移記錄表存在
    ensureMigrationsTable();
    
    // 獲取已執行的遷移
    const applied = getAppliedMigrations();
    
    logger.info(`[Migration] Found ${files.length} migration files, ${applied.length} applied`);
    
    // 執行未執行的遷移
    let hasError = false;
    
    for (const file of files) {
        if (!applied.includes(file)) {
            logger.info(`[Migration] Pending: ${file}`);
            const success = runMigration(file);
            if (!success) {
                logger.error(`[Migration] Failed to apply: ${file}`);
                hasError = true;
                // 繼續執行其他遷移，不中斷
            }
        } else {
            logger.debug(`[Migration] Already applied: ${file}`);
        }
    }
    
    if (hasError) {
        logger.warn('[Migration] Some migrations failed, but continuing...');
    }
};

/**
 * 初始化数据库连接和基础表
 */
export const initDatabase = () => {
    try {
        db = sqlite3(DB_PATH);
        logger.info(`[Database] Connected to ${DB_PATH}`);

        // 启用外键约束
        db.pragma('foreign_keys = ON');

        // 啟用 WAL 模式（提升並發性能）
        db.pragma('journal_mode = WAL');
        
        // 設置超時
        db.pragma('busy_timeout = 5000');

        // 創建基礎表
        createTables();
        
        // 執行遷移
        runPendingMigrations();

        logger.info('[Database] Initialization complete');
        return db;
    } catch (error) {
        logger.error('[Database] Init error:', error);
        throw error;
    }
};

/**
 * 创建所有表（MVP版本简化版）
 */
const createTables = () => {
    // 用戶表
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance REAL DEFAULT 0,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_new_user BOOLEAN DEFAULT 1,
            has_claimed_bonus BOOLEAN DEFAULT 0,
            completed_steps INTEGER DEFAULT 0,
            first_deposit_at DATETIME,
            first_auth_at DATETIME,
            bonus_claimed_at DATETIME,
            vip_level INTEGER DEFAULT 0,
            total_authorized REAL DEFAULT 0,
            last_active_at DATETIME
        )
    `);

    // 比賽表
    db.exec(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id TEXT UNIQUE NOT NULL,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            league TEXT,
            match_time DATETIME NOT NULL,
            cutoff_time DATETIME NOT NULL,
            odds_home REAL,
            odds_draw REAL,
            odds_away REAL,
            execution_rate INTEGER DEFAULT 30,
            min_authorization REAL DEFAULT 100,
            match_limit REAL DEFAULT 500,
            status TEXT DEFAULT 'upcoming',
            result TEXT,
            report TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 授權表
    db.exec(`
        CREATE TABLE IF NOT EXISTS authorizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            settled_at DATETIME,
            profit REAL DEFAULT 0,
            user_profit REAL DEFAULT 0,
            platform_fee REAL DEFAULT 0,
            deployed_amount REAL,
            reserved_amount REAL,
            profit_rate INTEGER,
            settlement_type TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (match_id) REFERENCES matches(match_id)
        )
    `);

    // 管理員表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 動態消息表
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticker_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            match_id TEXT,
            display_name TEXT,
            amount REAL,
            profit REAL,
            weight INTEGER DEFAULT 100,
            is_active INTEGER DEFAULT 1,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            expires_at DATETIME
        )
    `);

    // 餘額變動日誌表
    db.exec(`
        CREATE TABLE IF NOT EXISTS balance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            balance_before REAL NOT NULL,
            balance_after REAL NOT NULL,
            type TEXT NOT NULL,
            reason TEXT,
            admin_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (admin_id) REFERENCES admins(id)
        )
    `);

    // 充值請求表
    db.exec(`
        CREATE TABLE IF NOT EXISTS deposit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            txid TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 提現請求表
    db.exec(`
        CREATE TABLE IF NOT EXISTS withdraw_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            address TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 報告表
    db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id TEXT NOT NULL UNIQUE,
            content TEXT,
            prediction_data TEXT,
            evidence_chain TEXT,
            ai_deepdive TEXT,
            status TEXT DEFAULT 'draft',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            published_at DATETIME,
            FOREIGN KEY (match_id) REFERENCES matches(match_id)
        )
    `);

    // 創建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
        CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches(match_time);
        CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id);
        CREATE INDEX IF NOT EXISTS idx_authorizations_match_id ON authorizations(match_id);
        CREATE INDEX IF NOT EXISTS idx_authorizations_status ON authorizations(status);
        CREATE INDEX IF NOT EXISTS idx_ticker_type ON ticker_messages(type);
        CREATE INDEX IF NOT EXISTS idx_ticker_weight ON ticker_messages(weight);
        CREATE INDEX IF NOT EXISTS idx_ticker_created ON ticker_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_ticker_active ON ticker_messages(is_active);
        CREATE INDEX IF NOT EXISTS idx_balance_logs_user_id ON balance_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_balance_logs_created ON balance_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
        CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user_id ON withdraw_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
        CREATE INDEX IF NOT EXISTS idx_reports_match_id ON reports(match_id);
        CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    `);

    logger.info('[Database] Tables created/verified');
};

/**
 * 获取数据库实例
 */
export const getDb = () => {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
};

/**
 * 关闭数据库连接
 */
export const closeDatabase = () => {
    if (db) {
        db.close();
        logger.info('[Database] Connection closed');
        db = null;
    }
};

/**
 * ======================================================
 * 測試模式相關輔助函數
 * ======================================================
 */

/**
 * 檢查用戶是否為測試模式
 */
export const isUserTestMode = (userId) => {
    const db = getDb();
    const result = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
    return result ? result.is_test_mode === 1 : false;
};

/**
 * 獲取用戶測試資金餘額
 */
export const getUserTestBalance = (userId) => {
    const db = getDb();
    const result = db.prepare('SELECT test_balance FROM users WHERE id = ?').get(userId);
    return result ? result.test_balance : 10000;
};

/**
 * 更新用戶測試資金
 */
export const updateUserTestBalance = (userId, amount, type, referenceId = null, matchId = null, description = '') => {
    const db = getDb();
    
    return db.transaction(() => {
        // 獲取當前餘額
        const user = db.prepare('SELECT test_balance FROM users WHERE id = ?').get(userId);
        if (!user) throw new Error('用戶不存在');
        
        const balanceBefore = user.test_balance;
        const balanceAfter = balanceBefore + amount;
        
        // 更新用戶餘額
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(balanceAfter, userId);
        
        // 記錄變動日誌
        db.prepare(`
            INSERT INTO test_balance_logs 
            (user_id, amount, balance_before, balance_after, type, reference_id, match_id, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, amount, balanceBefore, balanceAfter, type, referenceId, matchId, description);
        
        return {
            balanceBefore,
            balanceAfter,
            amount
        };
    })();
};

/**
 * 重置用戶測試資金
 */
export const resetUserTestBalance = (userId) => {
    const db = getDb();
    const DEFAULT_TEST_BALANCE = 10000;
    
    return db.transaction(() => {
        // 獲取當前餘額
        const user = db.prepare('SELECT test_balance FROM users WHERE id = ?').get(userId);
        const previousBalance = user?.test_balance || DEFAULT_TEST_BALANCE;
        
        // 更新為默認值
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(DEFAULT_TEST_BALANCE, userId);
        
        // 記錄重置日誌
        db.prepare(`
            INSERT INTO test_reset_logs (user_id, previous_balance, new_balance, reset_count)
            VALUES (?, ?, ?, COALESCE((SELECT COUNT(*) + 1 FROM test_reset_logs WHERE user_id = ?), 1))
        `).run(userId, previousBalance, DEFAULT_TEST_BALANCE, userId);
        
        // 記錄資金變動
        db.prepare(`
            INSERT INTO test_balance_logs 
            (user_id, amount, balance_before, balance_after, type, description)
            VALUES (?, ?, ?, ?, 'reset', 'Test funds reset')
        `).run(userId, DEFAULT_TEST_BALANCE - previousBalance, previousBalance, DEFAULT_TEST_BALANCE);
        
        return {
            previousBalance,
            newBalance: DEFAULT_TEST_BALANCE
        };
    })();
};

/**
 * 記錄模式切換
 */
export const logModeSwitch = (userId, fromMode, toMode, req) => {
    const db = getDb();
    
    db.prepare(`
        INSERT INTO mode_switch_logs (user_id, from_mode, to_mode, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        userId, 
        fromMode ? 1 : 0, 
        toMode ? 1 : 0,
        req?.ip || req?.connection?.remoteAddress || '',
        req?.get('User-Agent') || ''
    );
    
    // 更新用戶最後切換時間
    db.prepare('UPDATE users SET last_mode_switch = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
};

/**
 * 獲取用戶測試模式統計
 */
export const getUserTestStats = (userId) => {
    const db = getDb();
    
    const authorizations = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'settled' AND profit > 0 THEN 1 ELSE 0 END) as wins,
            SUM(amount) as total_amount,
            SUM(profit) as total_profit
        FROM authorizations 
        WHERE user_id = ? AND is_test = 1
    `).get(userId);
    
    const resets = db.prepare(`
        SELECT COUNT(*) as reset_count, MAX(created_at) as last_reset
        FROM test_reset_logs 
        WHERE user_id = ?
    `).get(userId);
    
    return {
        authorizations: authorizations.total || 0,
        wins: authorizations.wins || 0,
        winRate: authorizations.total > 0 ? Math.round((authorizations.wins / authorizations.total) * 100) : 0,
        totalAmount: authorizations.total_amount || 0,
        totalProfit: authorizations.total_profit || 0,
        resetCount: resets.reset_count || 0,
        lastReset: resets.last_reset || null
    };
};

// ==================== 統一導出 ====================
export default {
    init: initDatabase,
    get: getDb,
    close: closeDatabase,
    isUserTestMode,
    getUserTestBalance,
    updateUserTestBalance,
    resetUserTestBalance,
    logModeSwitch,
    getUserTestStats
};