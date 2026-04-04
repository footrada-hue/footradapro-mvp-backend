-- =====================================================
-- 迁移文件: 024_create_match_pool.sql
-- 描述: 创建比赛数据池表
-- =====================================================

-- 1. 创建比赛数据池表
CREATE TABLE IF NOT EXISTS match_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    match_date TEXT NOT NULL,
    match_time TEXT NOT NULL,
    match_datetime DATETIME NOT NULL,
    status TEXT DEFAULT 'upcoming',
    weight INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_match_pool_datetime ON match_pool(match_datetime);
CREATE INDEX IF NOT EXISTS idx_match_pool_status ON match_pool(status);
CREATE INDEX IF NOT EXISTS idx_match_pool_date ON match_pool(match_date);

-- 3. 插入示例数据
INSERT OR IGNORE INTO match_pool (league, home_team, away_team, match_date, match_time, match_datetime, status, weight) VALUES
    ('Premier League', 'Manchester City', 'Liverpool', '2026-04-01', '19:45:00', '2026-04-01 19:45:00', 'upcoming', 100),
    ('Premier League', 'Arsenal', 'Chelsea', '2026-04-01', '20:00:00', '2026-04-01 20:00:00', 'upcoming', 100),
    ('La Liga', 'Real Madrid', 'Barcelona', '2026-04-01', '21:00:00', '2026-04-01 21:00:00', 'upcoming', 100),
    ('Serie A', 'AC Milan', 'Inter Milan', '2026-04-01', '20:30:00', '2026-04-01 20:30:00', 'upcoming', 100),
    ('Bundesliga', 'Bayern Munich', 'Borussia Dortmund', '2026-04-01', '18:30:00', '2026-04-01 18:30:00', 'upcoming', 100);

-- 4. 创建系统配置表
CREATE TABLE IF NOT EXISTS ticker_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 初始化默认配置
INSERT OR IGNORE INTO ticker_config (config_key, config_value) VALUES 
    ('total_volume', '1234567'),
    ('daily_auth', '89234'),
    ('yesterday_profit', '12450'),
    ('active_users', '10000');