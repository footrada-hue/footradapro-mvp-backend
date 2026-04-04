-- 015_add_match_fields.sql
-- 為 matches 表添加 external_id 和 is_active 字段

-- 添加 external_id 字段（用於存儲 API 的比賽 ID）
ALTER TABLE matches ADD COLUMN external_id TEXT;

-- 添加 is_active 字段（用於控制前台顯示，0=隱藏，1=顯示）
ALTER TABLE matches ADD COLUMN is_active INTEGER DEFAULT 0;

-- 添加 last_sync 字段（記錄最後同步時間）
ALTER TABLE matches ADD COLUMN last_sync TIMESTAMP;

-- 添加 league_logo 字段（可選，聯賽標誌）
ALTER TABLE matches ADD COLUMN league_logo TEXT;

-- 為 external_id 創建索引，提高查詢效率
CREATE INDEX IF NOT EXISTS idx_matches_external_id ON matches(external_id);

-- 為 is_active 創建索引
CREATE INDEX IF NOT EXISTS idx_matches_is_active ON matches(is_active);

-- 為 match_time 創建索引（用於排序和過濾）
CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches(match_time);

-- 更新現有數據，設置默認值
UPDATE matches SET is_active = 0 WHERE is_active IS NULL;

-- 輸出確認信息
SELECT '✅ matches 表結構更新完成' as result;
SELECT '📊 總比賽數: ' || COUNT(*) as info FROM matches;
SELECT '🔍 新增字段: external_id, is_active, last_sync, league_logo' as info;