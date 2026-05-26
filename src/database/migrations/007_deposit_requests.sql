-- =====================================================
-- Migration: 007_deposit_requests.sql
-- Description: 充值申請表（與當前表結構匹配）
-- =====================================================

-- 檢查表是否已存在，如果不存在則創建
CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    txid TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 添加可能缺失的字段（如果不存在）
-- 注意：使用多個 ALTER 語句，每個字段單獨添加
ALTER TABLE deposit_requests ADD COLUMN network TEXT;
ALTER TABLE deposit_requests ADD COLUMN from_address TEXT;
ALTER TABLE deposit_requests ADD COLUMN screenshot_url TEXT;
ALTER TABLE deposit_requests ADD COLUMN admin_notes TEXT;
ALTER TABLE deposit_requests ADD COLUMN processed_by INTEGER;
ALTER TABLE deposit_requests ADD COLUMN processed_at DATETIME;

-- 創建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_txid ON deposit_requests(txid);