/**
 * FOOTRADAPRO - 用户通知API路由
 * @description 支持多语言（中文/英文），根据用户语言偏好返回对应语言的通知内容
 * @version 2.0.0 - i18n支持：所有文案标记为多语言，后期可扩展更多语言
 */

import express from 'express';
import { query, getDb } from '../../../database/connection.js';
import { auth } from '../../../middlewares/auth.middleware.js';
import { updateLastActive } from '../../../middlewares/updateActivity.middleware.js';
import { getIO } from '../../../socket/index.js';
import logger from '../../../utils/logger.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(auth);

// ============================================================
// i18n 多语言配置
// ============================================================

/**
 * 支持的语言列表
 */
const SUPPORTED_LANGUAGES = {
  zh: 'zh-CN',
  en: 'en-US'
};

/**
 * 通知类型对应的多语言模板
 */
const NOTIFICATION_TEMPLATES = {
  // 结算相关
  settlement_win: {
    zh: { title: '🎉 比赛结算完成', content: '{match_name} 盈利 {amount} USDT' },
    en: { title: '🎉 Match Settlement Completed', content: '{match_name} Profit {amount} USDT' }
  },
  settlement_loss: {
    zh: { title: '📉 比赛结算完成', content: '{match_name} 亏损 {amount} USDT' },
    en: { title: '📉 Match Settlement Completed', content: '{match_name} Loss {amount} USDT' }
  },
  // 充值相关
  deposit_success: {
    zh: { title: '✅ 充值成功', content: '您已成功充值 {amount} USDT' },
    en: { title: '✅ Deposit Successful', content: 'You have successfully deposited {amount} USDT' }
  },
  deposit_failed: {
    zh: { title: '❌ 充值失败', content: '充值 {amount} USDT 失败，请稍后重试' },
    en: { title: '❌ Deposit Failed', content: 'Deposit of {amount} USDT failed, please try again later' }
  },
  // 提现相关
  withdraw_success: {
    zh: { title: '✅ 提现成功', content: '您已成功提现 {amount} USDT' },
    en: { title: '✅ Withdrawal Successful', content: 'You have successfully withdrawn {amount} USDT' }
  },
  withdraw_failed: {
    zh: { title: '❌ 提现失败', content: '提现 {amount} USDT 失败，请稍后重试' },
    en: { title: '❌ Withdrawal Failed', content: 'Withdrawal of {amount} USDT failed, please try again later' }
  },
  // 系统消息
  system: {
    zh: { title: '📢 系统通知', content: '{message}' },
    en: { title: '📢 System Notification', content: '{message}' }
  },
  // 欢迎消息
  welcome: {
    zh: { title: '🎉 欢迎加入', content: '欢迎来到 FootRadaPro！开始您的交易之旅吧。' },
    en: { title: '🎉 Welcome Aboard', content: 'Welcome to FootRadaPro! Start your trading journey.' }
  }
};

/**
 * 根据语言和模板渲染通知内容
 * @param {string} type - 通知类型
 * @param {string} lang - 语言代码 ('zh' 或 'en')
 * @param {Object} variables - 模板变量
 * @returns {Object} { title, content }
 */
function renderNotification(type, lang, variables = {}) {
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template) {
    // 默认使用系统通知模板
    return renderNotification('system', lang, { message: variables.message || 'Notification' });
  }
  
  const tpl = template[lang] || template.en;
  let title = tpl.title;
  let content = tpl.content;
  
  // 替换模板变量
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    title = title.replace(placeholder, value);
    content = content.replace(placeholder, value);
  });
  
  return { title, content };
}

/**
 * 获取用户语言偏好
 * @param {number} userId - 用户ID
 * @returns {Promise<string>} - 'zh' 或 'en'
 */
async function getUserLanguage(userId) {
  try {
    let user = null;
    
    if (isProduction) {
      const result = await query(`
        SELECT language FROM users WHERE id = $1
      `, [userId]);
      user = result?.[0];
    } else {
      const db = getDb();
      user = db.prepare(`
        SELECT language FROM users WHERE id = ?
      `).get(userId);
    }
    
    // 默认英文（面向全球用户）
    const language = user?.language || 'en';
    return SUPPORTED_LANGUAGES[language] ? language : 'en';
  } catch (err) {
    logger.error('获取用户语言失败:', err.message);
    return 'en'; // 默认英文
  }
}

/**
 * 将旧数据中的中文内容转换为英文（用于兼容已有通知）
 * @param {string} text - 原始文本
 * @param {string} type - 'title' 或 'content'
 * @returns {string}
 */
function convertChineseToEnglish(text, type = 'content') {
  if (!text) return text;
  
  const mappings = {
    // 标题转换
    title: {
      '🎉 比赛结算完成': '🎉 Match Settlement Completed',
      '📉 比赛结算完成': '📉 Match Settlement Completed',
      '✅ 充值成功': '✅ Deposit Successful',
      '❌ 充值失败': '❌ Deposit Failed',
      '✅ 提现成功': '✅ Withdrawal Successful',
      '❌ 提现失败': '❌ Withdrawal Failed',
      '📢 系统通知': '📢 System Notification',
      '🎉 欢迎加入': '🎉 Welcome Aboard'
    },
    // 内容转换
    content: {
      '盈利': 'Profit',
      '亏损': 'Loss',
      '充值': 'Deposit',
      '提现': 'Withdrawal',
      '成功': 'Success',
      '失败': 'Failed',
      '系统通知': 'System Notification',
      '欢迎来到': 'Welcome to'
    }
  };
  
  let result = text;
  
  if (type === 'title') {
    for (const [cn, en] of Object.entries(mappings.title)) {
      if (result.includes(cn)) {
        result = result.replace(cn, en);
        break;
      }
    }
  }
  
  for (const [cn, en] of Object.entries(mappings.content)) {
    result = result.replace(new RegExp(cn, 'g'), en);
  }
  
  // 处理盈利/亏损格式
  result = result.replace(/(盈利|Profit)\s+([\d.]+)\s*(USDT)?/g, (_, p1, p2, p3) => `Profit ${p2} USDT`);
  result = result.replace(/(亏损|Loss)\s+([\d.]+)\s*(USDT)?/g, (_, p1, p2, p3) => `Loss ${p2} USDT`);
  
  return result;
}

// ============================================================
// API 路由
// ============================================================

// ==================== 获取当前用户的有效通知（未读）- 用于右上角下拉 ====================
router.get('/', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const userLang = await getUserLanguage(userId);
    
    try {
        let notifications = [];
        
        if (isProduction) {
            const result = await query(`
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = $1 AND is_read = false
                ORDER BY created_at DESC
                LIMIT 50
            `, [userId]);
            notifications = result || [];
        } else {
            const db = getDb();
            notifications = db.prepare(`
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = ? AND is_read = 0
                ORDER BY created_at DESC
                LIMIT 50
            `).all(userId);
        }
        
        // 解析 data 字段并根据用户语言转换内容
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
                } catch (e) {
                    n.data = null;
                }
            }
            
            // 如果用户语言是英文，将已有通知内容转换为英文
            if (userLang === 'en') {
                n.title = convertChineseToEnglish(n.title, 'title');
                n.content = convertChineseToEnglish(n.content, 'content');
            }
        });
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error('获取通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取用户通知列表（带分页）- 用于通知中心页面 ====================
router.get('/list', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const userLang = await getUserLanguage(userId);
    const { page = 1, limit = 20, unread_only = false } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let total, notifications, unreadCount;
        
        if (isProduction) {
            // PostgreSQL 版本
            let countQuery = 'SELECT COUNT(*) as count FROM user_notifications WHERE user_id = $1';
            let queryStr = `
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = $1
            `;
            
            if (unread_only === 'true') {
                countQuery += ' AND is_read = false';
                queryStr += ' AND is_read = false';
            }
            
            const totalResult = await query(countQuery, [userId]);
            total = totalResult?.[0] || { count: 0 };
            
            queryStr += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
            
            const result = await query(queryStr, [userId, parseInt(limit), offset]);
            notifications = result || [];
            
            const unreadResult = await query(`
                SELECT COUNT(*) as count FROM user_notifications 
                WHERE user_id = $1 AND is_read = false
            `, [userId]);
            unreadCount = unreadResult?.[0] || { count: 0 };
        } else {
            // SQLite 版本
            const db = getDb();
            let countQuery = 'SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?';
            let queryStr = `
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = ?
            `;
            
            if (unread_only === 'true') {
                countQuery += ' AND is_read = 0';
                queryStr += ' AND is_read = 0';
            }
            
            total = db.prepare(countQuery).get(userId);
            
            queryStr += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            notifications = db.prepare(queryStr).all(userId, parseInt(limit), offset);
            
            unreadCount = db.prepare(`
                SELECT COUNT(*) as count FROM user_notifications 
                WHERE user_id = ? AND is_read = 0
            `).get(userId);
        }
        
        // 解析 data 字段并根据用户语言转换内容
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
                } catch (e) {
                    n.data = null;
                }
            }
            
            // 如果用户语言是英文，将已有通知内容转换为英文
            if (userLang === 'en') {
                n.title = convertChineseToEnglish(n.title, 'title');
                n.content = convertChineseToEnglish(n.content, 'content');
            }
        });
        
        res.json({
            success: true,
            data: notifications,
            unread_count: unreadCount?.count || 0,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total?.count || 0,
                pages: Math.ceil((total?.count || 0) / limit)
            },
            language: userLang
        });
    } catch (error) {
        logger.error('获取通知列表失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取未读通知数量 ====================
router.get('/unread-count', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    
    try {
        let count = 0;
        
        if (isProduction) {
            const result = await query(`
                SELECT COUNT(*) as count FROM user_notifications 
                WHERE user_id = $1 AND is_read = false
            `, [userId]);
            count = result?.[0]?.count || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                SELECT COUNT(*) as count FROM user_notifications 
                WHERE user_id = ? AND is_read = 0
            `).get(userId);
            count = result?.count || 0;
        }
        
        res.json({ success: true, data: { unreadCount: count } });
    } catch (error) {
        logger.error('获取未读数量失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记单个通知为已读 ====================
router.put('/read/:id', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { id } = req.params;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                UPDATE user_notifications 
                SET is_read = true, read_at = NOW()
                WHERE id = $1 AND user_id = $2 AND is_read = false
            `, [id, userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                UPDATE user_notifications 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ? AND is_read = 0
            `).run(id, userId);
            changes = result.changes;
        }
        
        res.json({ success: true, marked: changes > 0 });
    } catch (error) {
        logger.error('标记通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== POST 方式标记单个通知为已读（兼容右上角组件）====================
router.post('/:id/read', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { id } = req.params;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                UPDATE user_notifications 
                SET is_read = true, read_at = NOW()
                WHERE id = $1 AND user_id = $2 AND is_read = false
            `, [id, userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                UPDATE user_notifications 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ? AND is_read = 0
            `).run(id, userId);
            changes = result.changes;
        }
        
        res.json({ success: true, marked: changes > 0 });
    } catch (error) {
        logger.error('标记通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 批量标记通知为已读 ====================
router.post('/batch-read', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ success: false, error: 'INVALID_NOTIFICATION_IDS' });
    }
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const placeholders = notificationIds.map((_, i) => `$${i + 1}`).join(',');
            const result = await query(`
                UPDATE user_notifications 
                SET is_read = true, read_at = NOW()
                WHERE id IN (${placeholders}) AND user_id = $${notificationIds.length + 1} AND is_read = false
            `, [...notificationIds, userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const placeholders = notificationIds.map(() => '?').join(',');
            const result = db.prepare(`
                UPDATE user_notifications 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE id IN (${placeholders}) AND user_id = ? AND is_read = 0
            `).run(...notificationIds, userId);
            changes = result.changes;
        }
        
        res.json({ success: true, markedCount: changes });
    } catch (error) {
        logger.error('批量标记已读失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 标记所有通知为已读 ====================
router.put('/read-all', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                UPDATE user_notifications 
                SET is_read = true, read_at = NOW()
                WHERE user_id = $1 AND is_read = false
            `, [userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                UPDATE user_notifications 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND is_read = 0
            `).run(userId);
            changes = result.changes;
        }
        
        res.json({ success: true, markedCount: changes });
    } catch (error) {
        logger.error('标记全部通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== POST 方式标记所有通知为已读（兼容右上角组件）====================
router.post('/read-all', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                UPDATE user_notifications 
                SET is_read = true, read_at = NOW()
                WHERE user_id = $1 AND is_read = false
            `, [userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                UPDATE user_notifications 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND is_read = 0
            `).run(userId);
            changes = result.changes;
        }
        
        res.json({ success: true, markedCount: changes });
    } catch (error) {
        logger.error('标记全部通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取通知历史（带分页）- 兼容旧API ====================
router.get('/history', updateLastActive, async (req, res) => {
    const userId = req.user?.id || req.session?.userId;
    const userLang = await getUserLanguage(userId);
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let total, notifications;
        
        if (isProduction) {
            const totalResult = await query('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = $1', [userId]);
            total = totalResult?.[0] || { count: 0 };
            
            const result = await query(`
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `, [userId, parseInt(limit), offset]);
            notifications = result || [];
        } else {
            const db = getDb();
            total = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?').get(userId);
            
            notifications = db.prepare(`
                SELECT id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(userId, parseInt(limit), offset);
        }
        
        notifications.forEach(n => {
            if (n.data) {
                try {
                    n.data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
                } catch (e) {
                    n.data = null;
                }
            }
            
            // 如果用户语言是英文，将已有通知内容转换为英文
            if (userLang === 'en') {
                n.title = convertChineseToEnglish(n.title, 'title');
                n.content = convertChineseToEnglish(n.content, 'content');
            }
        });
        
        res.json({ 
            success: true, 
            data: notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total?.count || 0,
                pages: Math.ceil((total?.count || 0) / limit)
            },
            language: userLang
        });
    } catch (error) {
        logger.error('获取通知历史失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 获取单条通知详情 ====================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    const userLang = await getUserLanguage(userId);
    
    try {
        let notification = null;
        
        if (isProduction) {
            const result = await query(`
                SELECT id, user_id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE id = $1 AND user_id = $2
            `, [id, userId]);
            notification = result?.[0];
        } else {
            const db = getDb();
            notification = db.prepare(`
                SELECT id, user_id, type, title, content, data, is_read, read_at, created_at
                FROM user_notifications
                WHERE id = ? AND user_id = ?
            `).get(id, userId);
        }
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        if (notification.data) {
            try {
                notification.data = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
            } catch (e) {
                notification.data = null;
            }
        }
        
        // 如果用户语言是英文，将通知内容转换为英文
        if (userLang === 'en') {
            notification.title = convertChineseToEnglish(notification.title, 'title');
            notification.content = convertChineseToEnglish(notification.content, 'content');
        }
        
        res.json({ success: true, data: notification, language: userLang });
    } catch (error) {
        console.error('获取通知详情失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 删除单条通知 ====================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    
    try {
        let changes = 0;
        
        if (isProduction) {
            const result = await query(`
                DELETE FROM user_notifications
                WHERE id = $1 AND user_id = $2
            `, [id, userId]);
            changes = result?.rowCount || 0;
        } else {
            const db = getDb();
            const result = db.prepare(`
                DELETE FROM user_notifications
                WHERE id = ? AND user_id = ?
            `).run(id, userId);
            changes = result.changes;
        }
        
        if (changes === 0) {
            return res.status(404).json({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
        }
        
        res.json({ success: true, message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('删除通知失败:', error);
        res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
});

// ==================== 创建通知（供其他模块调用）====================
// 面向全球用户，默认使用英文模板
export async function createNotification(userId, type, title, content, data = null) {
    try {
        // 获取用户语言偏好
        const userLang = await getUserLanguage(userId);
        
        let finalTitle = title;
        let finalContent = content;
        
        // 如果使用模板类型且有预定义模板，优先使用模板渲染
        if (NOTIFICATION_TEMPLATES[type] && data) {
            const rendered = renderNotification(type, userLang, {
                match_name: data.match_name || '',
                amount: data.profit ? Math.abs(data.profit).toFixed(2) : (data.amount || ''),
                message: content || ''
            });
            finalTitle = rendered.title;
            finalContent = rendered.content;
        } else if (userLang === 'en') {
            // 如果没有模板，尝试将传入的中文转换为英文
            finalTitle = convertChineseToEnglish(title, 'title');
            finalContent = convertChineseToEnglish(content, 'content');
        }
        
        logger.info(`📧 创建通知: userId=${userId}, type=${type}, lang=${userLang}, title=${finalTitle}`);
        
        if (isProduction) {
            await query(`
                INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
            `, [userId, type, finalTitle, finalContent, data ? JSON.stringify(data) : null]);
        } else {
            const db = getDb();
            db.prepare(`
                INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(userId, type, finalTitle, finalContent, data ? JSON.stringify(data) : null);
        }
        
        // 通过 WebSocket 推送实时通知
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('new-notification', {
                    type, 
                    title: finalTitle, 
                    content: finalContent, 
                    data,
                    created_at: new Date().toISOString()
                });
                logger.info(`📡 WebSocket 推送通知给用户 ${userId}: ${finalTitle}`);
            } else {
                logger.warn(`⚠️ WebSocket 未初始化，通知已保存但未推送: ${finalTitle}`);
            }
        } catch (wsErr) {
            logger.error('❌ WebSocket 推送失败:', wsErr.message);
        }
        
        return true;
    } catch (error) {
        logger.error('❌ 创建通知失败:', error);
        return false;
    }
}

// ==================== 批量创建通知（全局通知）====================
export async function createGlobalNotification(type, title, content, data = null) {
    try {
        let users = [];
        
        if (isProduction) {
            const result = await query('SELECT id, language FROM users WHERE status = $1', ['active']);
            users = result || [];
        } else {
            const db = getDb();
            users = db.prepare('SELECT id, language FROM users WHERE status = "active"').all();
        }
        
        if (isProduction) {
            for (const user of users) {
                const userLang = user.language || 'en';
                let finalTitle = title;
                let finalContent = content;
                
                if (userLang === 'en') {
                    finalTitle = convertChineseToEnglish(title, 'title');
                    finalContent = convertChineseToEnglish(content, 'content');
                }
                
                await query(`
                    INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                `, [user.id, type, finalTitle, finalContent, data ? JSON.stringify(data) : null]);
            }
        } else {
            const db = getDb();
            const insertStmt = db.prepare(`
                INSERT INTO user_notifications (user_id, type, title, content, data, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            const transaction = db.transaction((userList) => {
                for (const user of userList) {
                    const userLang = user.language || 'en';
                    let finalTitle = title;
                    let finalContent = content;
                    
                    if (userLang === 'en') {
                        finalTitle = convertChineseToEnglish(title, 'title');
                        finalContent = convertChineseToEnglish(content, 'content');
                    }
                    
                    insertStmt.run(user.id, type, finalTitle, finalContent, data ? JSON.stringify(data) : null);
                }
            });
            
            transaction(users);
        }
        
        logger.info(`📢 全局通知已发送: ${title}, 目标用户数: ${users.length}`);
        
        // WebSocket 推送（可选）
        try {
            const io = getIO();
            if (io) {
                io.emit('global-notification', {
                    type, title, content, data,
                    created_at: new Date().toISOString()
                });
            }
        } catch (wsErr) {
            logger.error('WebSocket 推送失败:', wsErr.message);
        }
        
        return { success: true, count: users.length };
    } catch (error) {
        logger.error('❌ 创建全局通知失败:', error);
        return { success: false, count: 0 };
    }
}

export { router as default };