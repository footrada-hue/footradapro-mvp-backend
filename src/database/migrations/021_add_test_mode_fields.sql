-- ======================================================
-- FOOTRADA - 添加測試模式相關字段
-- Version: 021
-- Description: 為測試模式添加必要的字段和表
-- ======================================================

-- 1. 修改 users 表，添加測試模式字段
ALTER TABLE users ADD COLUMN is_test_mode INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN test_balance REAL DEFAULT 10000;
ALTER TABLE users ADD COLUMN last_mode_switch DATETIME;

-- 2. 創建模式切換日誌表
CREATE TABLE IF NOT EXISTS mode_switch_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_mode INTEGER NOT NULL,
    to_mode INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. 修改 authorizations 表，添加測試標記（先檢查是否存在）
CREATE TABLE IF NOT EXISTS authorizations_temp AS SELECT * FROM authorizations;
DROP TABLE authorizations;
CREATE TABLE authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    amount REAL NOT NULL,
    executed_amount REAL,
    deployed_amount REAL,
    reserved_amount REAL,
    status TEXT DEFAULT 'pending',
    is_test INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settled_at DATETIME,
    profit REAL DEFAULT 0,
    user_profit REAL DEFAULT 0,
    platform_fee REAL DEFAULT 0,
    profit_rate INTEGER,
    settlement_type TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (match_id) REFERENCES matches(match_id)
);
INSERT INTO authorizations (
    id, auth_id, user_id, match_id, amount, 
    executed_amount, deployed_amount, reserved_amount,
    status, created_at, settled_at, profit, 
    user_profit, platform_fee, profit_rate, settlement_type
)
SELECT 
    id, auth_id, user_id, match_id, amount,
    executed_amount, deployed_amount, reserved_amount,
    status, created_at, settled_at, profit,
    user_profit, platform_fee, profit_rate, settlement_type
FROM authorizations_temp;
DROP TABLE authorizations_temp;

-- 4. 修改 settlements 表，添加測試標記
CREATE TABLE IF NOT EXISTS settlements_temp AS SELECT * FROM settlements;
DROP TABLE settlements;
CREATE TABLE settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    auth_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    amount REAL NOT NULL,
    profit REAL DEFAULT 0,
    is_test INTEGER DEFAULT 0,
    settled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (auth_id) REFERENCES authorizations(auth_id),
    FOREIGN KEY (match_id) REFERENCES matches(match_id)
);
INSERT INTO settlements (
    id, user_id, auth_id, match_id, amount, profit, settled_at
)
SELECT 
    id, user_id, auth_id, match_id, amount, profit, settled_at
FROM settlements_temp;
DROP TABLE settlements_temp;

-- 5. 修改 reports 表，添加測試標記
ALTER TABLE reports ADD COLUMN is_test INTEGER DEFAULT 0;

-- 6. 創建測試資金變動日誌表
CREATE TABLE IF NOT EXISTS test_balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    type TEXT NOT NULL,
    reference_id INTEGER,
    match_id TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 7. 創建測試資金重置記錄表
CREATE TABLE IF NOT EXISTS test_reset_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    previous_balance REAL NOT NULL,
    new_balance REAL NOT NULL,
    reset_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 8. 創建索引
CREATE INDEX IF NOT EXISTS idx_users_is_test_mode ON users(is_test_mode);
CREATE INDEX IF NOT EXISTS idx_authorizations_is_test ON authorizations(is_test);
CREATE INDEX IF NOT EXISTS idx_settlements_is_test ON settlements(is_test);
CREATE INDEX IF NOT EXISTS idx_reports_is_test ON reports(is_test);
CREATE INDEX IF NOT EXISTS idx_mode_switch_logs_user_id ON mode_switch_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_test_balance_logs_user_id ON test_balance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_test_reset_logs_user_id ON test_reset_logs(user_id);

-- 9. 更新現有用戶的默認值
UPDATE users SET is_test_mode = 1 WHERE is_test_mode IS NULL;
UPDATE users SET test_balance = 10000 WHERE test_balance IS NULL;

-- 10. 記錄遷移完成
INSERT OR IGNORE INTO migrations_log (name, checksum, execution_time)
VALUES ('021_add_test_mode_fields.sql', 'fixed_version', 0);