// network.routes.js - 网络配置管理路由（修复版）
import express from 'express';
const router = express.Router();

import { getDb } from '../../../database/connection.js';
import { adminAuth, hasRole, logAdminAction } from '../../../middlewares/admin.middleware.js';
import logger from '../../../utils/logger.js';

// =====================================================
// 管理员接口 - 需要 super_admin 或 finance_admin 角色
// =====================================================

// 获取所有网络配置
router.get('/networks', adminAuth, hasRole(['super_admin', 'finance_admin']), (req, res) => {
    try {
        const db = getDb();
        
        const networks = db.prepare(`
            SELECT 
                id,
                network,
                deposit_address,
                withdraw_fee,
                min_withdraw,
                max_withdraw,
                confirmations,
                is_active,
                notes,
                created_at,
                updated_at,
                updated_by
            FROM network_config 
            ORDER BY 
                CASE network 
                    WHEN 'TRC20' THEN 1 
                    WHEN 'ERC20' THEN 2 
                    WHEN 'BEP20' THEN 3 
                    ELSE 4
                END
        `).all();
        
        console.log('获取网络配置成功，数量:', networks.length);
        
        res.json({ success: true, data: networks });
    } catch (err) {
        console.error('获取网络配置失败:', err);
        logger.error('获取网络配置失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 获取单个网络配置
router.get('/networks/:network', adminAuth, hasRole(['super_admin', 'finance_admin']), (req, res) => {
    try {
        const db = getDb();
        
        const network = db.prepare(`
            SELECT 
                id,
                network,
                deposit_address,
                withdraw_fee,
                min_withdraw,
                max_withdraw,
                confirmations,
                is_active,
                notes,
                created_at,
                updated_at,
                updated_by
            FROM network_config 
            WHERE network = ?
        `).get(req.params.network);
        
        if (!network) {
            return res.status(404).json({ success: false, message: '网络不存在' });
        }
        
        res.json({ success: true, data: network });
    } catch (err) {
        console.error('获取网络配置失败:', err);
        logger.error('获取网络配置失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 更新网络配置
router.post('/networks/:network', adminAuth, hasRole(['super_admin', 'finance_admin']), async (req, res) => {
    const { network } = req.params;
    const { 
        deposit_address, 
        withdraw_fee, 
        min_withdraw, 
        max_withdraw, 
        confirmations, 
        is_active,
        notes 
    } = req.body;
    
    if (!deposit_address) {
        return res.status(400).json({ success: false, message: '充值地址不能为空' });
    }
    
    try {
        const db = getDb();
        
        // 获取修改前的数据（用于日志）
        const oldConfig = db.prepare('SELECT * FROM network_config WHERE network = ?').get(network);
        
        // 检查网络是否存在
        const exists = db.prepare("SELECT id FROM network_config WHERE network = ?").get(network);
        
        if (exists) {
            // 更新
            db.prepare(`
                UPDATE network_config 
                SET deposit_address = ?,
                    withdraw_fee = ?,
                    min_withdraw = ?,
                    max_withdraw = ?,
                    confirmations = ?,
                    is_active = ?,
                    notes = ?,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = ?
                WHERE network = ?
            `).run(
                deposit_address,
                withdraw_fee !== undefined ? withdraw_fee : 1,
                min_withdraw !== undefined ? min_withdraw : 10,
                max_withdraw !== undefined ? max_withdraw : 10000,
                confirmations !== undefined ? confirmations : 12,
                is_active !== undefined ? (is_active ? 1 : 0) : 1,
                notes || '',
                req.admin.id,
                network
            );
        } else {
            // 插入
            db.prepare(`
                INSERT INTO network_config (
                    network, deposit_address, withdraw_fee, min_withdraw, 
                    max_withdraw, confirmations, is_active, notes, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                network,
                deposit_address,
                withdraw_fee !== undefined ? withdraw_fee : 1,
                min_withdraw !== undefined ? min_withdraw : 10,
                max_withdraw !== undefined ? max_withdraw : 10000,
                confirmations !== undefined ? confirmations : 12,
                is_active !== undefined ? (is_active ? 1 : 0) : 1,
                notes || '',
                req.admin.id
            );
        }
        
        // 记录操作日志
        try {
            await logAdminAction(req, 'update_network_address', {
                network,
                old_address: oldConfig?.deposit_address,
                new_address: deposit_address,
                old_status: oldConfig?.is_active,
                new_status: is_active
            }, 'network_config', network);
        } catch (logErr) {
            console.error('记录日志失败:', logErr);
        }
        
        logger.warn(`⚠️ 安全操作: 管理员 ${req.admin.id} 修改了 ${network} 充值地址: ${oldConfig?.deposit_address} -> ${deposit_address}`);
        
        res.json({ 
            success: true, 
            message: '配置已更新',
            data: {
                network,
                address: deposit_address,
                updated_by: req.admin.id,
                updated_at: new Date().toISOString()
            }
        });
        
    } catch (err) {
        console.error('更新网络配置失败:', err);
        logger.error('更新网络配置失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 地址格式验证辅助函数
function isValidAddress(address, network) {
    if (!address || address.length < 10) return true; // 简单验证，生产环境可加强
    
    if (network === 'TRC20') {
        return /^T[A-Za-z0-9]{33}$/.test(address);
    }
    if (network === 'ERC20' || network === 'BEP20') {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return true;
}

// =====================================================
// 用户端接口 - 只读，无修改权限
// =====================================================

// 获取充值地址（用户端）
router.get('/user/addresses', (req, res) => {
    try {
        const db = getDb();
        
        const addresses = db.prepare(`
            SELECT 
                network,
                deposit_address as address,
                notes as note
            FROM network_config 
            WHERE is_active = 1
            ORDER BY 
                CASE network 
                    WHEN 'TRC20' THEN 1 
                    WHEN 'ERC20' THEN 2 
                    WHEN 'BEP20' THEN 3 
                    ELSE 4
                END
        `).all();
        
        const result = {};
        addresses.forEach(addr => {
            result[addr.network] = {
                address: addr.address,
                note: addr.note || getDefaultNote(addr.network)
            };
        });
        
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('获取充值地址失败:', err);
        logger.error('获取充值地址失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 获取单个网络地址（用户端）
router.get('/user/addresses/:network', (req, res) => {
    const { network } = req.params;
    
    try {
        const db = getDb();
        
        const address = db.prepare(`
            SELECT 
                deposit_address as address,
                notes as note
            FROM network_config 
            WHERE network = ? AND is_active = 1
        `).get(network);
        
        if (!address) {
            return res.status(404).json({ 
                success: false, 
                message: '该网络暂不支持充值' 
            });
        }
        
        res.json({ success: true, data: address });
    } catch (err) {
        console.error('获取充值地址失败:', err);
        logger.error('获取充值地址失败:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

function getDefaultNote(network) {
    const notes = {
        'TRC20': 'TRC20 (Tron) - Recommended, fast and low-cost',
        'ERC20': 'ERC20 (Ethereum) - Higher gas fees',
        'BEP20': 'BEP20 (BSC) - Fast and cheap'
    };
    return notes[network] || `${network} network`;
}

export default router;