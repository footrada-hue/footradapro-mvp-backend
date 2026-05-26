-- Migration: 011_simplify_authorizations.sql
-- Description: 简化 authorizations 表，删除 VIP、赔率、预测字段

-- 备份现有数据（如果有重要数据）
CREATE TABLE IF NOT EXISTS authorizations_backup AS SELECT * FROM authorizations;

-- 删除旧表
DROP TABLE IF EXISTS authorizations;

-- 创建新表（极简版）
CREATE TABLE authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    executed_amount REAL NOT NULL,
    profit REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settled_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
);

-- 创建索引
CREATE INDEX idx_authorizations_user ON authorizations(user_id);
CREATE INDEX idx_authorizations_match ON authorizations(match_id);
CREATE INDEX idx_authorizations_status ON authorizations(status);

-- 如果有备份数据，可以恢复基本字段（可选）
-- INSERT INTO authorizations (auth_id, user_id, match_id, amount, executed_amount, profit, status, created_at, settled_at)
-- SELECT auth_id, user_id, match_id, user_amount, actual_amount, profit, status, created_at, settled_at FROM authorizations_backup;

-- 记录迁移
INSERT INTO migrations (name, applied_at) VALUES ('011_simplify_authorizations.sql', datetime('now'));