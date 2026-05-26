-- =====================================================
-- Migration: 013_settlement_new_fields.sql
-- Description: 為清算系統添加新字段，支持執行比例、平台抽成等
-- =====================================================

-- 1. 檢查並為 matches 表添加字段（如果不存在）
ALTER TABLE matches ADD COLUMN execution_rate INTEGER DEFAULT 30;
ALTER TABLE matches ADD COLUMN min_authorization REAL DEFAULT 100;
ALTER TABLE matches ADD COLUMN match_limit REAL DEFAULT 500;

-- 2. 為 authorizations 表添加新字段（用於記錄清算詳情）
ALTER TABLE authorizations ADD COLUMN deployed_amount REAL;      -- 實際部署金額
ALTER TABLE authorizations ADD COLUMN reserved_amount REAL;      -- 策略儲備金額
ALTER TABLE authorizations ADD COLUMN platform_fee REAL;         -- 平台抽成
ALTER TABLE authorizations ADD COLUMN profit_rate INTEGER;       -- 收益率（如40或-100）
ALTER TABLE authorizations ADD COLUMN settlement_type TEXT;      -- 'win' 或 'loss'

-- 3. 為 users 表添加統計字段（如果不存在）
ALTER TABLE users ADD COLUMN total_profit REAL DEFAULT 0;        -- 總收益
ALTER TABLE users ADD COLUMN total_settled INTEGER DEFAULT 0;    -- 總結算次數

-- 4. 創建 reports 表（如果不存在）
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL UNIQUE,
    content TEXT,
    prediction_data TEXT,      -- JSON格式存儲賽前預測數據
    evidence_chain TEXT,       -- JSON格式存儲證據鏈
    ai_deepdive TEXT,          -- AI深度解析
    status TEXT DEFAULT 'draft',  -- draft, pending, published
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    FOREIGN KEY (match_id) REFERENCES matches(match_id)
);

-- 5. 創建索引
CREATE INDEX IF NOT EXISTS idx_authorizations_settlement ON authorizations(status, match_id);
CREATE INDEX IF NOT EXISTS idx_authorizations_settled_at ON authorizations(settled_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_match ON reports(match_id);
CREATE INDEX IF NOT EXISTS idx_users_stats ON users(total_profit, total_settled);

-- 6. 更新現有數據（設置默認值）
UPDATE matches SET execution_rate = 30 WHERE execution_rate IS NULL;
UPDATE users SET total_profit = 0 WHERE total_profit IS NULL;
UPDATE users SET total_settled = 0 WHERE total_settled IS NULL;

-- 7. 為 balance_logs 表添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_balance_logs_user_type ON balance_logs(user_id, type);
CREATE INDEX IF NOT EXISTS idx_balance_logs_created ON balance_logs(created_at);

-- 8. 驗證表結構
SELECT 'matches 表字段:' as check_point;
PRAGMA table_info(matches);

SELECT 'authorizations 表字段:' as check_point;
PRAGMA table_info(authorizations);

SELECT 'users 表字段:' as check_point;
PRAGMA table_info(users);

SELECT 'reports 表狀態:' as check_point;
SELECT name FROM sqlite_master WHERE type='table' AND name='reports';