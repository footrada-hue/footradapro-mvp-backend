/**
 * deposit.routes.js - 用户充值路由
 * 修復：正確獲取數據庫實例，解決 db.prepare is not a function 錯誤
 * 新增：測試模式支持
 * 修改：同时写入 deposit_requests 和 balance_logs 表，匹配后台解析格式
 * 新增：Telegram 通知
 */

import express from 'express';
const router = express.Router();

import { getDb } from '../../../database/connection.js';
import { auth, requireLiveMode, requireTestMode } from '../../../middlewares/auth.middleware.js';
import logger from '../../../utils/logger.js';
import { createUploadMiddleware, deleteUploadFile } from '../../../utils/upload.js';
import telegramService from '../../../services/telegram.service.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ======================================================
 * 真實充值（需要審核）
 * ======================================================
 */

// 基礎充值提交（不帶截圖）- 僅限真實模式
router.post('/submit', auth, requireLiveMode, async (req, res) => {
    try {
        const { amount, network, txHash } = req.body;
        const userId = req.user.id;
        
        // 驗證
        if (!amount || amount < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum deposit amount is 10 USDT' 
            });
        }
        
        if (!network || !['TRC20', 'ERC20', 'BEP20'].includes(network)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please select a valid network' 
            });
        }
        
        // txHash 改为可选，不强制验证
        const finalTxHash = txHash && txHash.length >= 10 ? txHash : `pending_${Date.now()}_${userId}`;
        
        // 獲取數據庫實例
        const db = getDb();
        
        // 獲取用戶當前餘額
        const user = db.prepare('SELECT id, balance, is_test_mode, username, email, uid FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // 再次確認不是測試模式
        if (user.is_test_mode) {
            return res.status(403).json({
                success: false,
                message: 'Please switch to Live mode for real deposits'
            });
        }
        
        // 保存充值記錄到 deposit_requests 表
        const result = db.prepare(`
            INSERT INTO deposit_requests (
                user_id, amount, txid, status, admin_notes, created_at
            ) VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
        `).run(
            userId, 
            amount, 
            finalTxHash,
            `网络: ${network} | 金额: ${amount} USDT | 无截图`
        );
        
        // 同時記錄到 balance_logs 表（匹配后台解析格式）
        const reason = `充值申请: ${amount} USDT, 网络: ${network}, TxID: ${finalTxHash} (pending)`;
        
        db.prepare(`
            INSERT INTO balance_logs (
                user_id, amount, balance_before, balance_after, type, reason, created_at
            ) VALUES (?, ?, ?, ?, 'deposit', ?, CURRENT_TIMESTAMP)
        `).run(
            userId, 
            amount, 
            user.balance, 
            user.balance,
            reason
        );
        
        logger.info(`User ${userId} submitted deposit request: ${amount} USDT`);
        
        // 发送 Telegram 通知
        try {
            await telegramService.notifyDepositRequest(
                { 
                    username: user.username || 'User', 
                    email: user.email || '', 
                    uid: user.uid || userId, 
                    id: userId 
                },
                amount,
                network,
                null,
                finalTxHash
            );
            logger.info(`Telegram notification sent for deposit request from user ${userId}`);
        } catch (telegramErr) {
            logger.error('Telegram notification failed:', telegramErr);
        }

        res.json({ 
            success: true, 
            message: 'Deposit request submitted',
            data: {
                depositId: result.lastInsertRowid,
                amount,
                network,
                txHash: finalTxHash,
                status: 'pending',
                mode: 'live',
                createdAt: new Date().toISOString()
            }
        });
        
    } catch (err) {
        logger.error('Deposit submission failed:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error, please try again later' 
        });
    }
});

// 帶截圖充值提交 - 同时写入 balance_logs 和 deposit_requests
router.post('/submit-with-screenshot', auth, requireLiveMode, (req, res) => {
    const upload = createUploadMiddleware('screenshot', 'screenshot');
    
    upload(req, res, async (err) => {
        try {
            if (err) {
                logger.error('File upload error:', err);
                return res.status(400).json({ 
                    success: false, 
                    message: err.message || 'File upload failed' 
                });
            }
            
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Please upload transaction screenshot' 
                });
            }
            
            const { amount, network } = req.body;
            const userId = req.user.id;
            
            console.log('=== 充值申请详情 ===');
            console.log('用户ID:', userId);
            console.log('金额:', amount);
            console.log('网络:', network);
            console.log('截图文件:', req.file ? req.file.filename : '无');
            
            // 驗證金額
            if (!amount || parseFloat(amount) < 10) {
                deleteUploadFile(req.file.path);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Minimum deposit amount is 10 USDT' 
                });
            }
            
            // 驗證網絡
            if (!network || !['TRC20', 'ERC20', 'BEP20'].includes(network)) {
                deleteUploadFile(req.file.path);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Please select a valid network' 
                });
            }
            
            // 获取数据库实例
            const db = getDb();
            
            // 获取用户信息
            const user = db.prepare('SELECT id, balance, is_test_mode, username, email, uid FROM users WHERE id = ?').get(userId);
            if (!user) {
                deleteUploadFile(req.file.path);
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            // 确认不是测试模式
            if (user.is_test_mode) {
                deleteUploadFile(req.file.path);
                return res.status(403).json({
                    success: false,
                    message: 'Please switch to Live mode for real deposits'
                });
            }
            
            // 保存截图路径
            const screenshotPath = '/uploads/screenshots/' + path.basename(req.file.path);
            
            // 生成临时交易ID
            const tempTxid = `pending_${Date.now()}_${userId}`;
            
            // ========== 1. 写入 deposit_requests 表 ==========
            const result = db.prepare(`
                INSERT INTO deposit_requests (
                    user_id, 
                    amount, 
                    txid, 
                    screenshot_url, 
                    status, 
                    admin_notes,
                    created_at
                ) VALUES (?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
            `).run(
                userId, 
                parseFloat(amount), 
                tempTxid, 
                screenshotPath,
                `网络: ${network} | 金额: ${amount} USDT | 待审核`
            );
            
            console.log('deposit_requests 写入成功, ID:', result.lastInsertRowid);
            
            // ========== 2. 写入 balance_logs 表（匹配后台解析格式） ==========
            // 后台 API 通过 reason 字段解析 network, txHash, screenshot
            const reason = `充值申请: ${amount} USDT, 网络: ${network}, TxID: ${tempTxid}, 截图: ${screenshotPath} (pending)`;
            
            db.prepare(`
                INSERT INTO balance_logs (
                    user_id, amount, balance_before, balance_after, type, reason, created_at
                ) VALUES (?, ?, ?, ?, 'deposit', ?, CURRENT_TIMESTAMP)
            `).run(
                userId, 
                parseFloat(amount), 
                user.balance, 
                user.balance,
                reason
            );
            
            console.log('balance_logs 写入成功');
            
            logger.info(`User ${userId} submitted deposit request with screenshot: ${amount} USDT`);
            
            // ========== 3. 发送 Telegram 通知 ==========
            try {
                await telegramService.notifyDepositRequest(
                    { 
                        username: user.username || 'User', 
                        email: user.email || '', 
                        uid: user.uid || userId, 
                        id: userId 
                    },
                    amount,
                    network,
                    screenshotPath,
                    tempTxid
                );
                console.log('Telegram notification sent for deposit request');
            } catch (telegramErr) {
                console.error('Telegram notification failed:', telegramErr);
                // 不影响主流程
            }

            res.json({ 
                success: true, 
                message: 'Deposit request submitted, pending approval',
                data: {
                    depositId: result.lastInsertRowid,
                    amount: parseFloat(amount),
                    network,
                    txHash: tempTxid,
                    screenshot: screenshotPath,
                    status: 'pending',
                    mode: 'live',
                    createdAt: new Date().toISOString()
                }
            });
            
        } catch (err) {
            console.error('充值提交错误:', err);
            logger.error('Deposit submission failed:', err);
            if (req.file) {
                try { deleteUploadFile(req.file.path); } catch(e) {}
            }
            res.status(500).json({ 
                success: false, 
                message: err.message || 'Server error, please try again later'
            });
        }
    });
});

/**
 * ======================================================
 * 測試充值（模擬，即時到賬）
 * ======================================================
 */

// 測試充值 - 僅限測試模式
router.post('/test/submit', auth, requireTestMode, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;
        
        // 驗證
        if (!amount || amount < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum test deposit amount is 10 tUSDT' 
            });
        }

        if (amount > 100000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum test deposit amount is 100,000 tUSDT' 
            });
        }
        
        // 獲取數據庫實例
        const db = getDb();
        
        // 開始事務
        db.exec('BEGIN TRANSACTION');
        
        // 獲取用戶當前測試餘額
        const user = db.prepare('SELECT id, test_balance, is_test_mode FROM users WHERE id = ?').get(userId);
        if (!user) {
            db.exec('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // 再次確認是測試模式
        if (!user.is_test_mode) {
            db.exec('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Test deposits are only available in Test mode'
            });
        }
        
        // 增加測試資金
        const oldBalance = user.test_balance || 10000;
        const newBalance = oldBalance + parseFloat(amount);
        
        db.prepare('UPDATE users SET test_balance = ? WHERE id = ?').run(newBalance, userId);
        
        // 記錄到 test_balance_logs
        db.prepare(`
            INSERT INTO test_balance_logs (
                user_id, amount, balance_before, balance_after, 
                type, description, created_at
            ) VALUES (?, ?, ?, ?, 'deposit', ?, CURRENT_TIMESTAMP)
        `).run(
            userId,
            parseFloat(amount),
            oldBalance,
            newBalance,
            `Test deposit: +${amount} tUSDT`
        );
        
        db.exec('COMMIT');
        
        logger.info(`User ${userId} completed test deposit: +${amount} tUSDT`);
        
        res.json({ 
            success: true, 
            message: 'Test deposit completed successfully',
            data: {
                amount: parseFloat(amount),
                new_balance: newBalance,
                mode: 'test',
                createdAt: new Date().toISOString()
            }
        });
        
    } catch (err) {
        logger.error('Test deposit failed:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error, please try again later' 
        });
    }
});

// 獲取測試充值歷史
router.get('/test/history', auth, requireTestMode, (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const db = getDb();
        
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='test_balance_logs'
        `).get();

        if (!tableExists) {
            return res.json({
                success: true,
                data: {
                    list: [],
                    mode: 'test',
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: 0,
                        pages: 0
                    }
                }
            });
        }
        
        const deposits = db.prepare(`
            SELECT 
                id,
                amount,
                balance_before,
                balance_after,
                description,
                datetime(created_at, 'localtime') as created_at
            FROM test_balance_logs
            WHERE user_id = ? AND type = 'deposit'
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(req.user.id, parseInt(limit), offset);
        
        const total = db.prepare(`
            SELECT COUNT(*) as count
            FROM test_balance_logs
            WHERE user_id = ? AND type = 'deposit'
        `).get(req.user.id);
        
        res.json({ 
            success: true, 
            data: {
                list: deposits,
                mode: 'test',
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total.count,
                    pages: Math.ceil(total.count / parseInt(limit))
                }
            }
        });
        
    } catch (err) {
        logger.error('Failed to get test deposit history:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * ======================================================
 * 共用路由
 * ======================================================
 */

// 獲取充值地址
router.get('/addresses', auth, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(req.user.id);
        const isTestMode = user?.is_test_mode || false;
        
        const addresses = {
            TRC20: isTestMode ? 'TEST_TXYZ1234567890abcdefghijklmnopqrstuvw' : 'TXYZ1234567890abcdefghijklmnopqrstuvw',
            ERC20: isTestMode ? '0xTEST1234567890abcdef1234567890abcdef12345678' : '0x1234567890abcdef1234567890abcdef12345678',
            BEP20: isTestMode ? '0xTESTabcdef1234567890abcdef1234567890abcdef12' : '0xabcdef1234567890abcdef1234567890abcdef12'
        };
        
        res.json({
            success: true,
            data: addresses,
            meta: {
                mode: isTestMode ? 'test' : 'live'
            }
        });
        
    } catch (err) {
        logger.error('Failed to get deposit addresses:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 獲取用戶的充值記錄
router.get('/history', auth, (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const db = getDb();
        
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(req.user.id);
        const isTestMode = user?.is_test_mode || false;

        if (isTestMode) {
            const testDeposits = db.prepare(`
                SELECT 
                    id,
                    amount,
                    balance_before,
                    balance_after,
                    description,
                    datetime(created_at, 'localtime') as created_at
                FROM test_balance_logs
                WHERE user_id = ? AND type = 'deposit'
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(req.user.id, parseInt(limit), offset);
            
            const testTotal = db.prepare(`
                SELECT COUNT(*) as count
                FROM test_balance_logs
                WHERE user_id = ? AND type = 'deposit'
            `).get(req.user.id);
            
            return res.json({ 
                success: true, 
                data: {
                    list: testDeposits,
                    mode: 'test',
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: testTotal.count,
                        pages: Math.ceil(testTotal.count / parseInt(limit))
                    }
                }
            });
        } else {
            // 从 balance_logs 获取充值记录（匹配后台格式）
            const deposits = db.prepare(`
                SELECT 
                    id,
                    amount,
                    reason,
                    datetime(created_at, 'localtime') as created_at
                FROM balance_logs
                WHERE user_id = ? AND type = 'deposit'
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(req.user.id, parseInt(limit), offset);
            
            const total = db.prepare(`
                SELECT COUNT(*) as count
                FROM balance_logs
                WHERE user_id = ? AND type = 'deposit'
            `).get(req.user.id);
            
            // 解析 reason 字段
            const formattedList = deposits.map(d => {
                const reason = d.reason || '';
                const amountMatch = reason.match(/[\d.]+/);
                const networkMatch = reason.match(/网络: ([^,]+)/);
                const txMatch = reason.match(/TxID: ([^,\s)]+)/);
                const screenshotMatch = reason.match(/截图: ([^\s]+)/);
                const statusMatch = reason.includes('pending') ? 'pending' : 
                                    reason.includes('completed') ? 'completed' : 
                                    reason.includes('rejected') ? 'rejected' : 'pending';
                
                return {
                    id: d.id,
                    amount: d.amount,
                    network: networkMatch ? networkMatch[1] : '',
                    txHash: txMatch ? txMatch[1] : '',
                    screenshot: screenshotMatch ? screenshotMatch[1] : '',
                    status: statusMatch,
                    created_at: d.created_at
                };
            });
            
            res.json({ 
                success: true, 
                data: {
                    list: formattedList,
                    mode: 'live',
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: total.count,
                        pages: Math.ceil(total.count / parseInt(limit))
                    }
                }
            });
        }
    } catch (err) {
        logger.error('Failed to get deposit history:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 獲取單條充值記錄詳情
router.get('/:id', auth, (req, res) => {
    try {
        const db = getDb();
        
        const user = db.prepare('SELECT is_test_mode FROM users WHERE id = ?').get(req.user.id);
        const isTestMode = user?.is_test_mode || false;

        if (isTestMode) {
            const deposit = db.prepare(`
                SELECT 
                    id,
                    amount,
                    balance_before,
                    balance_after,
                    description,
                    datetime(created_at, 'localtime') as created_at
                FROM test_balance_logs
                WHERE id = ? AND user_id = ? AND type = 'deposit'
            `).get(req.params.id, req.user.id);
            
            if (!deposit) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }
            
            return res.json({ 
                success: true, 
                data: {
                    ...deposit,
                    mode: 'test'
                }
            });
        } else {
            const deposit = db.prepare(`
                SELECT 
                    id,
                    amount,
                    reason,
                    datetime(created_at, 'localtime') as created_at
                FROM balance_logs
                WHERE id = ? AND user_id = ? AND type = 'deposit'
            `).get(req.params.id, req.user.id);
            
            if (!deposit) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }
            
            const reason = deposit.reason || '';
            const networkMatch = reason.match(/网络: ([^,]+)/);
            const txMatch = reason.match(/TxID: ([^,\s)]+)/);
            const screenshotMatch = reason.match(/截图: ([^\s]+)/);
            const statusMatch = reason.includes('pending') ? 'pending' : 
                                reason.includes('completed') ? 'completed' : 
                                reason.includes('rejected') ? 'rejected' : 'pending';
            
            res.json({ 
                success: true, 
                data: {
                    id: deposit.id,
                    amount: deposit.amount,
                    network: networkMatch ? networkMatch[1] : '',
                    txHash: txMatch ? txMatch[1] : '',
                    screenshot: screenshotMatch ? screenshotMatch[1] : '',
                    status: statusMatch,
                    mode: 'live',
                    created_at: deposit.created_at
                }
            });
        }
    } catch (err) {
        logger.error('Failed to get deposit details:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;