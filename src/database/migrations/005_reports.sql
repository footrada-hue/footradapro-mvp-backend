-- 复盘报告表
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    possession_home INTEGER,
    possession_away INTEGER,
    shots_home INTEGER,
    shots_away INTEGER,
    shots_ontarget_home INTEGER,
    shots_ontarget_away INTEGER,
    corners_home INTEGER,
    corners_away INTEGER,
    fouls_home INTEGER,
    fouls_away INTEGER,
    yellow_cards_home INTEGER,
    yellow_cards_away INTEGER,
    red_cards_home INTEGER,
    red_cards_away INTEGER,
    xg_home REAL,
    xg_away REAL,
    ai_conclusion TEXT,
    key_events TEXT, -- JSON格式存储关键事件
    player_stats TEXT, -- JSON格式存储球员数据
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    status TEXT DEFAULT 'draft',
    FOREIGN KEY (match_id) REFERENCES matches(match_id),
    FOREIGN KEY (created_by) REFERENCES admins(id)
);
