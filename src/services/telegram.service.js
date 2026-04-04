import TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';

class TelegramService {
    constructor() {
        this.bot = null;
        this.isEnabled = false;
        this.adminChatIds = [];
        this.init();
    }
    
    init() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!token) {
            logger.warn('[Telegram] TELEGRAM_BOT_TOKEN not set, Telegram notifications disabled');
            return;
        }
        
        try {
            this.bot = new TelegramBot(token, { polling: false });
            this.isEnabled = true;
            
            const chatIds = process.env.TELEGRAM_ADMIN_CHAT_IDS;
            if (chatIds) {
                this.adminChatIds = chatIds.split(',').map(id => id.trim());
            }
            
            logger.info('[Telegram] Telegram bot initialized successfully');
            logger.info(`[Telegram] Admin chat IDs: ${this.adminChatIds.join(', ')}`);
        } catch (error) {
            logger.error('[Telegram] Failed to initialize bot:', error);
        }
    }
    
    async sendToAdmins(message, options = {}) {
        if (!this.isEnabled) return false;
        
        let successCount = 0;
        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    ...options
                });
                successCount++;
                logger.info(`[Telegram] Message sent to ${chatId}`);
            } catch (error) {
                logger.error(`[Telegram] Failed to send to ${chatId}:`, error.message);
            }
        }
        return successCount > 0;
    }
    
    formatNewMessageNotification(userName, userEmail, message, convId, country = null) {
        const countryFlag = country ? `\n📍 Country: ${country}` : '';
        const userInfo = userEmail ? `\n📧 Email: ${userEmail}` : '';
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        
        return `
🔔 <b>New Customer Message</b>

👤 <b>User:</b> ${this.escapeHtml(userName)}${userInfo}
💬 <b>Message:</b> ${this.escapeHtml(message.substring(0, 200))}${message.length > 200 ? '...' : ''}${countryFlag}
🆔 <b>Conversation ID:</b> ${convId}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

<a href="${appUrl}/admin/support-admin.html">📬 Click here to reply</a>
        `.trim();
    }
    
    async notifyNewMessage(user, message, convId, country = null) {
        if (!this.isEnabled) return false;
        
        const notification = this.formatNewMessageNotification(
            user.username || 'User',
            user.email,
            message,
            convId,
            country
        );
        return await this.sendToAdmins(notification);
    }
    
    async sendTestMessage() {
        return await this.sendToAdmins('✅ Telegram notification test successful! Your support system is now connected.');
    }
    
    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
        /**
     * 发送充值申请通知（用户提交充值后）
     */
    async notifyDepositRequest(user, amount, network, screenshotPath = null, txid = null) {
        if (!this.isEnabled) return false;
        
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const screenshotLink = screenshotPath ? `\n📎 截图: ${appUrl}${screenshotPath}` : '';
        const txidInfo = txid ? `\n🆔 交易ID: ${txid}` : '';
        
        const message = `
💰 #充值申请 - 待审核

👤 用户: ${this.escapeHtml(user.username || 'User')}
📧 邮箱: ${this.escapeHtml(user.email || '未设置')}
🆔 UID: ${user.uid || user.id}
💵 金额: ${amount} USDT
🌐 网络: ${network}
⏰ 时间: ${new Date().toLocaleString()}${txidInfo}${screenshotLink}

🔗 审核链接: ${appUrl}/admin/deposits.html
        `;
        
        return await this.sendToAdmins(message);
    }
        /**
     * 发送提现申请通知（用户提交提现后）
     */
    async notifyWithdrawRequest(user, amount, address, network, txid = null) {
        if (!this.isEnabled) return false;
        
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const txidInfo = txid ? `\n🆔 交易ID: ${txid}` : '';
        
        const message = `
💸 #提现申请 - 待审核

👤 用户: ${this.escapeHtml(user.username || 'User')}
📧 邮箱: ${this.escapeHtml(user.email || '未设置')}
🆔 UID: ${user.uid || user.id}
💵 金额: ${amount} USDT
🏦 网络: ${network}
📮 地址: ${this.escapeHtml(address)}${txidInfo}
⏰ 时间: ${new Date().toLocaleString()}

🔗 审核链接: ${appUrl}/admin/withdrawals.html
        `;
        
        return await this.sendToAdmins(message);
    }

    /**
     * 发送提现完成通知（管理员审核通过后）
     */
    async notifyWithdrawCompleted(user, amount, address, network, txid = null, adminName = null) {
        if (!this.isEnabled) return false;
        
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const adminInfo = adminName ? `\n👨‍💼 审核人: ${adminName}` : '';
        const txidInfo = txid ? `\n🆔 交易ID: ${txid}` : '';
        
        const message = `
✅ #提现完成

👤 用户: ${this.escapeHtml(user.username || 'User')}
📧 邮箱: ${this.escapeHtml(user.email || '未设置')}
🆔 UID: ${user.uid || user.id}
💵 金额: ${amount} USDT
🏦 网络: ${network}
📮 地址: ${this.escapeHtml(address)}${txidInfo}
⏰ 时间: ${new Date().toLocaleString()}${adminInfo}

🔗 查看详情: ${appUrl}/admin/withdrawals.html
        `;
        
        return await this.sendToAdmins(message);
    }

    /**
     * 发送提现驳回通知
     */
    async notifyWithdrawRejected(user, amount, reason, adminName = null) {
        if (!this.isEnabled) return false;
        
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const adminInfo = adminName ? `\n👨‍💼 审核人: ${adminName}` : '';
        
        const message = `
❌ #提现驳回

👤 用户: ${this.escapeHtml(user.username || 'User')}
📧 邮箱: ${this.escapeHtml(user.email || '未设置')}
🆔 UID: ${user.uid || user.id}
💵 金额: ${amount} USDT
📝 驳回原因: ${this.escapeHtml(reason)}
⏰ 时间: ${new Date().toLocaleString()}${adminInfo}

🔗 查看详情: ${appUrl}/admin/withdrawals.html
        `;
        
        return await this.sendToAdmins(message);
    }
}

export default new TelegramService();
