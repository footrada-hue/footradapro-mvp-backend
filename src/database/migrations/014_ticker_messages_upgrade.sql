-- =====================================================
-- Migration: 014_ticker_messages_upgrade.sql
-- Description: 升級 ticker_messages 表，支持智能推薦和編輯功能
-- =====================================================

-- 創建 ticker_messages 表（如果不存在）
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
);

-- 添加新字段（使用多個 ALTER 語句，每個字段單獨添加）
ALTER TABLE ticker_messages ADD COLUMN match_id TEXT;
ALTER TABLE ticker_messages ADD COLUMN display_name TEXT;
ALTER TABLE ticker_messages ADD COLUMN amount REAL;
ALTER TABLE ticker_messages ADD COLUMN profit REAL;
ALTER TABLE ticker_messages ADD COLUMN weight INTEGER DEFAULT 100;
ALTER TABLE ticker_messages ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE ticker_messages ADD COLUMN created_by INTEGER;
ALTER TABLE ticker_messages ADD COLUMN updated_at DATETIME;
ALTER TABLE ticker_messages ADD COLUMN expires_at DATETIME;

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_ticker_type ON ticker_messages(type);
CREATE INDEX IF NOT EXISTS idx_ticker_weight ON ticker_messages(weight);
CREATE INDEX IF NOT EXISTS idx_ticker_created ON ticker_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ticker_match ON ticker_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_ticker_active ON ticker_messages(is_active);

-- 更新現有數據
UPDATE ticker_messages SET weight = 100 WHERE weight IS NULL;
UPDATE ticker_messages SET is_active = 1 WHERE is_active IS NULL;
UPDATE ticker_messages SET updated_at = created_at WHERE updated_at IS NULL;