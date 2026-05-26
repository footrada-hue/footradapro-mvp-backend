-- =====================================================
-- 支付密碼功能遷移 - 最小必要版本
-- =====================================================

-- 只添加 missing 的 has_paypassword 字段
ALTER TABLE users ADD COLUMN has_paypassword INTEGER DEFAULT 0;

-- 為現有用戶設置默認值
UPDATE users SET has_paypassword = 0 WHERE has_paypassword IS NULL;

-- 只添加必要的索引
CREATE INDEX IF NOT EXISTS idx_users_has_paypassword ON users(has_paypassword);