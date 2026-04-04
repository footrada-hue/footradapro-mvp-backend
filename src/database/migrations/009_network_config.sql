-- 009_network_config.sql - 网络配置表
CREATE TABLE IF NOT EXISTS network_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    network TEXT NOT NULL UNIQUE,              -- TRC20, ERC20, BEP20
    deposit_address TEXT NOT NULL,              -- 充值地址
    withdraw_fee REAL DEFAULT 1,                -- 提现手续费
    min_withdraw REAL DEFAULT 10,                -- 最小提现
    max_withdraw REAL DEFAULT 10000,             -- 最大提现
    confirmations INTEGER DEFAULT 12,            -- 确认块数
    is_active BOOLEAN DEFAULT 1,                 -- 是否启用
    notes TEXT,                                   -- 备注说明
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,                          -- 最后修改的管理员ID
    FOREIGN KEY (updated_by) REFERENCES admins(id)
);

-- 插入默认数据
INSERT OR IGNORE INTO network_config (network, deposit_address, notes) VALUES 
('TRC20', 'TXez8vPf1AbC3xYz7pQr2LmN9kHj5FgDsW', 'Tron网络 - 推荐使用'),
('ERC20', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', '以太坊网络 - Gas费较高'),
('BEP20', '0x8F3a91cA1d2Bc9E7F3d5aB8c4D6eF9a0b1c2d3e4', 'BSC网络 - 快速便宜');

-- 创建全局配置表
CREATE TABLE IF NOT EXISTS global_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES admins(id)
);

-- 插入全局默认配置
INSERT OR IGNORE INTO global_config (config_key, config_value, description) VALUES 
('fee_type', 'fixed', '手续费类型: fixed/percentage'),
('global_min_withdraw', '10', '全局最低提现金额'),
('process_time', '24', '提现处理时间(小时)'),
('auto_approve_threshold', '1000', '自动审核金额阈值'),
('withdraw_fee', '1', '全局提现手续费');