// network.routes.js - 用户端网络配置API
import express from 'express';
const router = express.Router();

import { getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';  // 改为 auth

// 获取所有启用的网络配置（供充值页面使用）
router.get('/deposit-addresses', auth, (req, res) => {
    try {
        const db = getDb();
        const networks = db.prepare(`
            SELECT 
                network,
                deposit_address,
                notes
            FROM network_config 
            WHERE is_active = 1
            ORDER BY 
                CASE network 
                    WHEN 'TRC20' THEN 1 
                    WHEN 'ERC20' THEN 2 
                    WHEN 'BEP20' THEN 3 
                END
        `).all();
        
        // 转换为键值对格式
        const addresses = {};
        networks.forEach(n => {
            addresses[n.network] = {
                address: n.deposit_address,
                note: n.notes
            };
        });
        
        res.json({ success: true, data: addresses });
    } catch (err) {
        console.error('获取充值地址失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取提现规则（供提现页面使用）
router.get('/withdraw-rules', auth, (req, res) => {
    try {
        const db = getDb();
        
        // 获取网络配置
        const networks = db.prepare(`
            SELECT 
                network,
                withdraw_fee,
                min_withdraw,
                max_withdraw,
                is_active
            FROM network_config 
            WHERE is_active = 1
        `).all();
        
        // 获取全局配置
        const globals = db.prepare("SELECT * FROM global_config").all();
        const globalConfig = {};
        globals.forEach(g => {
            globalConfig[g.config_key] = g.config_value;
        });
        
        res.json({ 
            success: true, 
            data: {
                networks,
                global: {
                    minWithdraw: globalConfig.global_min_withdraw || '10',
                    processTime: globalConfig.process_time || '24',
                    feeType: globalConfig.fee_type || 'fixed',
                    withdrawFee: globalConfig.withdraw_fee || '1'
                }
            }
        });
    } catch (err) {
        console.error('获取提现规则失败:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

export default router;