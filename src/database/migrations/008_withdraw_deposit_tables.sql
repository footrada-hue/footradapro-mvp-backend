-- 008_withdraw_deposit_tables.sql
-- 为 transactions 表添加提现/充值所需的字段

-- 先备份现有数据（生产环境必须）
CREATE TABLE transactions_backup AS SELECT * FROM transactions;

-- 添加新字段（如果不存在）
ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed';
ALTER TABLE transactions ADD COLUMN network TEXT;
ALTER TABLE transactions ADD COLUMN to_address TEXT;
ALTER TABLE transactions ADD COLUMN tx_hash TEXT;
ALTER TABLE transactions ADD COLUMN admin_note TEXT;
ALTER TABLE transactions ADD COLUMN processed_at DATETIME;
ALTER TABLE transactions ADD COLUMN from_address TEXT;  -- 充值用
ALTER TABLE transactions ADD COLUMN confirmations INTEGER DEFAULT 0;

-- 创建索引提高查询性能
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type_status ON transactions(type, status);
CREATE INDEX idx_transactions_user_id_status ON transactions(user_id, status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- 更新现有记录的状态（历史记录全部标记为已完成）
UPDATE transactions SET status = 'completed' WHERE type IN ('deposit', 'withdraw');
UPDATE transactions SET processed_at = created_at WHERE type IN ('deposit', 'withdraw') AND processed_at IS NULL;

-- 创建提现审核专用视图（方便查询）
CREATE VIEW IF NOT EXISTS v_withdraw_pending AS
SELECT 
    t.*,
    u.username,
    u.uid,
    u.balance as user_current_balance
FROM transactions t
JOIN users u ON t.user_id = u.id
WHERE t.type = 'withdraw' 
  AND t.status = 'pending'
ORDER BY t.created_at DESC;

-- 创建充值确认专用视图
CREATE VIEW IF NOT EXISTS v_deposit_pending AS
SELECT 
    t.*,
    u.username,
    u.uid,
    u.balance as user_current_balance
FROM transactions t
JOIN users u ON t.user_id = u.id
WHERE t.type = 'deposit' 
  AND t.status = 'pending'
ORDER BY t.created_at DESC;

-- 验证迁移
SELECT '迁移完成' as message;