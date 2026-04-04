-- 用户余额变动记录表
CREATE TABLE IF NOT EXISTS balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    tx_hash TEXT,
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_balance_logs_user_id ON balance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_logs_created_at ON balance_logs(created_at);
