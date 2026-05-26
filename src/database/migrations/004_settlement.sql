-- 清算记录表
CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    settled_by INTEGER NOT NULL,
    result TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    settled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed',
    FOREIGN KEY (match_id) REFERENCES matches(match_id),
    FOREIGN KEY (settled_by) REFERENCES admins(id)
);

-- 授权结算明细表
CREATE TABLE IF NOT EXISTS settlement_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_id INTEGER NOT NULL,
    auth_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_amount REAL NOT NULL,
    actual_amount REAL NOT NULL,
    vip_level INTEGER NOT NULL,
    prediction TEXT NOT NULL,
    odds REAL NOT NULL,
    profit REAL DEFAULT 0,
    commission REAL DEFAULT 0,
    user_profit REAL DEFAULT 0,
    return_amount REAL DEFAULT 0,
    FOREIGN KEY (settlement_id) REFERENCES settlements(id),
    FOREIGN KEY (auth_id) REFERENCES authorizations(auth_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
