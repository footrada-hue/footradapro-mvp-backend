/**
 * FOOTRADAPRO - 系统配置管理API
 * @description 管理全局配置参数
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite
 */

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { adminAuth } from '../../../middlewares/admin.middleware.js';
import { hasPermission } from '../../../middlewares/permission.middleware.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(adminAuth);

// ==================== 获取清算配置 ====================
router.get('/settlement', hasPermission('system.config'), async (req, res) => {
    try {
        let rows = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT config_key, config_value, description 
                FROM global_config 
                WHERE config_key IN ('platform_fee_rate', 'platform_loss_rate', 'default_execution_rate')
            `);
            rows = result || [];
        } else {
            const db = getDb();
            rows = db.prepare(`
                SELECT config_key, config_value, description 
                FROM global_config 
                WHERE config_key IN ('platform_fee_rate', 'platform_loss_rate', 'default_execution_rate')
            `).all();
        }
        
        const config = {
            platform_fee_rate: 0.2,
            platform_loss_rate: 0.4,
            default_execution_rate: 30
        };
        
        rows.forEach(row => {
            config[row.config_key] = parseFloat(row.config_value);
        });
        
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('获取清算配置失败:', error);
        logger.error('获取清算配置失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 更新清算配置 ====================
router.put('/settlement', hasPermission('system.config'), async (req, res) => {
    const { platform_fee_rate, platform_loss_rate, default_execution_rate } = req.body;
    
    try {
        if (isProduction) {
            // PostgreSQL 版本
            if (platform_fee_rate !== undefined) {
                await query(`
                    UPDATE global_config 
                    SET config_value = $1, updated_at = NOW() 
                    WHERE config_key = 'platform_fee_rate'
                `, [String(platform_fee_rate)]);
            }
            if (platform_loss_rate !== undefined) {
                await query(`
                    UPDATE global_config 
                    SET config_value = $1, updated_at = NOW() 
                    WHERE config_key = 'platform_loss_rate'
                `, [String(platform_loss_rate)]);
            }
            if (default_execution_rate !== undefined) {
                await query(`
                    UPDATE global_config 
                    SET config_value = $1, updated_at = NOW() 
                    WHERE config_key = 'default_execution_rate'
                `, [String(default_execution_rate)]);
            }
        } else {
            // SQLite 版本
            const db = getDb();
            const updateStmt = db.prepare(`
                UPDATE global_config 
                SET config_value = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE config_key = ?
            `);
            
            if (platform_fee_rate !== undefined) {
                updateStmt.run(String(platform_fee_rate), 'platform_fee_rate');
            }
            if (platform_loss_rate !== undefined) {
                updateStmt.run(String(platform_loss_rate), 'platform_loss_rate');
            }
            if (default_execution_rate !== undefined) {
                updateStmt.run(String(default_execution_rate), 'default_execution_rate');
            }
        }
        
        logger.info(`管理员 ${req.session?.adminId} 更新了清算配置`);
        
        res.json({
            success: true,
            message: '清算配置已更新'
        });
    } catch (error) {
        console.error('更新清算配置失败:', error);
        logger.error('更新清算配置失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

export default router;