/**
 * FOOTRADAPRO - Database Connection
 * @description 支持 SQLite(本地开发) 和 PostgreSQL(Render生产) 双数据库
 */

import sqlite3 from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../utils/logger.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 环境判断 ====================
const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL;

// ==================== 实例变量 ====================
let db = null;           // SQLite 实例
let pgPool = null;       // PostgreSQL 连接池

// ==================== 通用查询接口 ====================
export const query = async (sql, params = []) => {
    if (isProduction && pgPool) {
        const result = await pgPool.query(sql, params);
        return result.rows;
    } else if (db) {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    }
    throw new Error('Database not initialized');
};

export const queryOne = async (sql, params = []) => {
    const rows = await query(sql, params);
    return rows?.[0] || null;
};

export const execute = async (sql, params = []) => {
    if (isProduction && pgPool) {
        const result = await pgPool.query(sql, params);
        return result;
    } else if (db) {
        const stmt = db.prepare(sql);
        return stmt.run(...params);
    }
    throw new Error('Database not initialized');
};

// ==================== 事务支持 ====================
export const transaction = async (callback) => {
    if (isProduction && pgPool) {
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } else if (db) {
        return db.transaction(callback)();
    }
    throw new Error('Database not initialized');
};

// ==================== 初始化数据库 ====================
export const initDatabase = async () => {
    try {
        if (isProduction && DATABASE_URL) {
            // ========== PostgreSQL 生产环境 ==========
            logger.info('[Database] 🚀 Connecting to PostgreSQL (Render production)...');
            
            pgPool = new Pool({
                connectionString: DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                max: 10,
                idleTimeoutMillis: 30000,
            });
            
            // 测试连接
            await pgPool.query('SELECT NOW()');
            logger.info('[Database] ✅ PostgreSQL connected successfully');
            
            // 创建表结构
            await createTablesPostgres();
            
            logger.info('[Database] ✅ PostgreSQL initialization complete');
            db = pgPool; // 兼容旧接口
            
        } else {
            // ========== SQLite 本地开发 ==========
            const DB_PATH = process.env.DB_PATH || './src/database/data/footradapro.sqlite';
            const DB_DIR = path.dirname(DB_PATH);
            
            if (!fs.existsSync(DB_DIR)) {
                fs.mkdirSync(DB_DIR, { recursive: true });
            }
            
            db = sqlite3(DB_PATH);
            logger.info(`[Database] 📁 SQLite connected to ${DB_PATH}`);
            
            db.pragma('foreign_keys = ON');
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000');
            
            createTablesSqlite();
            runPendingMigrations();
            
            logger.info('[Database] ✅ SQLite initialization complete');
        }
        
        return db;
        
    } catch (error) {
        logger.error('[Database] ❌ Init error:', error);
        throw error;
    }
};

// ==================== PostgreSQL 建表 ====================
const createTablesPostgres = async () => {
    const client = await pgPool.connect();
    
    try {
        // 用户表
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                uid TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                balance DECIMAL DEFAULT 0,
                test_balance DECIMAL DEFAULT 10000,
                is_test_mode BOOLEAN DEFAULT FALSE,
                role TEXT DEFAULT 'user',
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_new_user BOOLEAN DEFAULT TRUE,
                has_claimed_bonus BOOLEAN DEFAULT FALSE,
                completed_steps INTEGER DEFAULT 0,
                first_deposit_at TIMESTAMP,
                first_auth_at TIMESTAMP,
                bonus_claimed_at TIMESTAMP,
                vip_level INTEGER DEFAULT 0,
                total_authorized DECIMAL DEFAULT 0,
                last_active_at TIMESTAMP,
                last_mode_switch TIMESTAMP
            )
        `);
        
        // 比赛表
        await client.query(`
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                match_id TEXT UNIQUE NOT NULL,
                external_id TEXT,
                home_team TEXT NOT NULL,
                away_team TEXT NOT NULL,
                league TEXT,
                league_logo TEXT,
                match_time TIMESTAMP NOT NULL,
                cutoff_time TIMESTAMP NOT NULL,
                odds_home DECIMAL,
                odds_draw DECIMAL,
                odds_away DECIMAL,
                execution_rate INTEGER DEFAULT 30,
                min_authorization DECIMAL DEFAULT 100,
                match_limit DECIMAL DEFAULT 500,
                status TEXT DEFAULT 'upcoming',
                result TEXT,
                report TEXT,
                is_active INTEGER DEFAULT 0,
                last_sync TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 授权表
        await client.query(`
            CREATE TABLE IF NOT EXISTS authorizations (
                id SERIAL PRIMARY KEY,
                auth_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                match_id TEXT NOT NULL REFERENCES matches(match_id),
                amount DECIMAL NOT NULL,
                status TEXT DEFAULT 'pending',
                is_test BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                settled_at TIMESTAMP,
                profit DECIMAL DEFAULT 0,
                user_profit DECIMAL DEFAULT 0,
                platform_fee DECIMAL DEFAULT 0,
                deployed_amount DECIMAL,
                reserved_amount DECIMAL,
                profit_rate INTEGER,
                settlement_type TEXT
            )
        `);
        
        // 管理员表
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 动态消息表
        await client.query(`
            CREATE TABLE IF NOT EXISTS ticker_messages (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                match_id TEXT,
                display_name TEXT,
                amount DECIMAL,
                profit DECIMAL,
                weight INTEGER DEFAULT 100,
                is_active INTEGER DEFAULT 1,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP,
                expires_at TIMESTAMP
            )
        `);
        
        // 余额变动日志表
        await client.query(`
            CREATE TABLE IF NOT EXISTS balance_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount DECIMAL NOT NULL,
                balance_before DECIMAL NOT NULL,
                balance_after DECIMAL NOT NULL,
                type TEXT NOT NULL,
                reason TEXT,
                admin_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 充值请求表
        await client.query(`
            CREATE TABLE IF NOT EXISTS deposit_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount DECIMAL NOT NULL,
                txid TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);
        
        // 提现请求表
        await client.query(`
            CREATE TABLE IF NOT EXISTS withdraw_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount DECIMAL NOT NULL,
                address TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);
        
        // 报告表
        await client.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                match_id TEXT NOT NULL UNIQUE REFERENCES matches(match_id),
                content TEXT,
                prediction_data TEXT,
                evidence_chain TEXT,
                ai_deepdive TEXT,
                status TEXT DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_at TIMESTAMP
            )
        `);
        
        // 测试余额日志表
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_balance_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                amount DECIMAL NOT NULL,
                balance_before DECIMAL NOT NULL,
                balance_after DECIMAL NOT NULL,
                type TEXT NOT NULL,
                reference_id TEXT,
                match_id TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 测试重置日志表
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_reset_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                previous_balance DECIMAL NOT NULL,
                new_balance DECIMAL NOT NULL,
                reset_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 模式切换日志表
        await client.query(`
            CREATE TABLE IF NOT EXISTS mode_switch_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                from_mode BOOLEAN,
                to_mode BOOLEAN,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 迁移记录表
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations_log (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT,
                execution_time INTEGER
            )
        `);
        
        // 创建索引
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches(match_time)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_authorizations_match_id ON authorizations(match_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_authorizations_status ON authorizations(status)`);
        
        logger.info('[Database] PostgreSQL tables created/verified');
        
    } finally {
        client.release();
    }
};

// ==================== SQLite 建表（原有逻辑） ====================
const createTablesSqlite = () => {
    // 用户表
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance REAL DEFAULT 0,
            test_balance REAL DEFAULT 10000,
            is_test_mode INTEGER DEFAULT 0,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_new_user INTEGER DEFAULT 1,
            has_claimed_bonus INTEGER DEFAULT 0,
            completed_steps INTEGER DEFAULT 0,
            first_deposit_at DATETIME,
            first_auth_at DATETIME,
            bonus_claimed_at DATETIME,
            vip_level INTEGER DEFAULT 0,
            total_authorized REAL DEFAULT 0,
            last_active_at DATETIME,
            last_mode_switch DATETIME
        )
    `);

    // 比赛表
    db.exec(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id TEXT UNIQUE NOT NULL,
            external_id TEXT,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            league TEXT,
            league_logo TEXT,
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
            is_active INTEGER DEFAULT 0,
            last_sync TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 授权表
    db.exec(`
        CREATE TABLE IF NOT EXISTS authorizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            is_test INTEGER DEFAULT 0,
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

    // 管理员表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 动态消息表
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

    // 余额变动日志表
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

    // 充值请求表
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

    // 提现请求表
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

    // 报告表
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
    
    // 测试相关表
    db.exec(`
        CREATE TABLE IF NOT EXISTS test_balance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            balance_before REAL NOT NULL,
            balance_after REAL NOT NULL,
            type TEXT NOT NULL,
            reference_id TEXT,
            match_id TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS test_reset_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            previous_balance REAL NOT NULL,
            new_balance REAL NOT NULL,
            reset_count INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS mode_switch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_mode INTEGER,
            to_mode INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches(match_time)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_authorizations_match_id ON authorizations(match_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_authorizations_status ON authorizations(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ticker_type ON ticker_messages(type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ticker_active ON ticker_messages(is_active)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_balance_logs_user_id ON balance_logs(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user_id ON withdraw_requests(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_match_id ON reports(match_id)`);

    logger.info('[Database] SQLite tables created/verified');
};

// ==================== SQLite 迁移功能（保留原有） ====================
const MIGRATIONS_TABLE_SQLITE = 'migrations_log';

const ensureMigrationsTable = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_SQLITE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum TEXT,
            execution_time INTEGER
        )
    `);
};

const getAppliedMigrations = () => {
    const stmt = db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE_SQLITE}`);
    return stmt.all().map(row => row.name);
};

const calculateChecksum = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
    }
    return hash.toString(16);
};

const runMigration = (migrationFile) => {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
        logger.warn(`[Migration] File not found: ${migrationFile}`);
        return false;
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const checksum = calculateChecksum(migrationPath);
    const startTime = Date.now();
    
    try {
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
        
        db.exec('BEGIN TRANSACTION');
        
        for (const stmt of statements) {
            try {
                db.exec(stmt);
            } catch (err) {
                const ignorableErrors = ['duplicate column name', 'already exists', 'no such table', 'duplicate key', 'has no column'];
                const shouldIgnore = ignorableErrors.some(msg => err.message.includes(msg));
                if (!shouldIgnore) throw err;
            }
        }
        
        const existing = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE_SQLITE} WHERE name = ? AND checksum = ?`).get(migrationFile, checksum);
        if (!existing) {
            db.prepare(`INSERT INTO ${MIGRATIONS_TABLE_SQLITE} (name, checksum, execution_time) VALUES (?, ?, ?)`).run(migrationFile, checksum, Date.now() - startTime);
        }
        
        db.exec('COMMIT');
        logger.info(`[Migration] Completed: ${migrationFile}`);
        return true;
    } catch (err) {
        db.exec('ROLLBACK');
        logger.error(`[Migration] Failed: ${migrationFile}`, err);
        return false;
    }
};

const runPendingMigrations = () => {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
        return;
    }
    
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql') && f !== 'run.js').sort();
    if (files.length === 0) return;
    
    ensureMigrationsTable();
    const applied = getAppliedMigrations();
    
    for (const file of files) {
        if (!applied.includes(file)) {
            runMigration(file);
        }
    }
};

// ==================== 兼容原有接口 ====================
export const getDb = () => {
    if (!db) throw new Error('Database not initialized');
    return db;
};

export const closeDatabase = async () => {
    if (isProduction && pgPool) {
        await pgPool.end();
        logger.info('[Database] PostgreSQL connection closed');
    } else if (db && db.close) {
        db.close();
        logger.info('[Database] SQLite connection closed');
    }
    db = null;
};

export const isUserTestMode = (userId) => {
    const dbInstance = getDb();
    if (isProduction && pgPool) {
        // PostgreSQL 版本需要异步，这里保持同步兼容
        // 实际使用建议改为异步
        return false;
    } else {
        const result = dbInstance.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(userId);
        return result ? result.is_test_mode === 1 : false;
    }
};

// ==================== 统一导出 ====================
export default {
    init: initDatabase,
    get: getDb,
    close: closeDatabase,
    query,
    queryOne,
    execute,
    transaction,
    isUserTestMode
};