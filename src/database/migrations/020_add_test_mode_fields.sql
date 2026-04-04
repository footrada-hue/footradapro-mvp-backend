-- =====================================================
-- 測試模式功能 - 添加測試餘額和切換記錄
-- =====================================================

-- 第一步：先添加所有字段
ALTER TABLE users ADD COLUMN test_balance DECIMAL DEFAULT 10000;
ALTER TABLE users ADD COLUMN test_mode_activated_at DATETIME;
ALTER TABLE users ADD COLUMN test_mode_deactivated_at DATETIME;

-- 第二步：再更新數據（這時候字段已經存在）
UPDATE users SET test_balance = 10000 WHERE test_balance IS NULL;

-- 第三步：創建索引
CREATE INDEX IF NOT EXISTS idx_users_test_mode ON users(is_test_mode);
CREATE INDEX IF NOT EXISTS idx_users_test_balance ON users(test_balance);