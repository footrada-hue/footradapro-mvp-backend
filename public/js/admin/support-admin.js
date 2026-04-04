/**
 * Support Admin Module - Admin Side
 * Fixed: Full emoji picker with large selection panel and working send functionality
 * Added: Admin status (online/away/busy), heartbeat, browser notifications, sound alerts
 */
class SupportAdmin {
    constructor() {
        this.currentConvId = null;
        this.pollingInterval = null;
        this.heartbeatInterval = null;
        this.isSending = false;
        this.conversationsList = document.getElementById('conversationsList');
        this.messagesArea = document.getElementById('messagesArea');
        this.replyInput = document.getElementById('replyInput');
        this.sendReplyBtn = document.getElementById('sendReplyBtn');
        
        this.init();
    }
    
    t(key, params = {}) {
        const translations = {
            noConversations: 'No conversations',
            noMessages: 'No messages',
            selectConversation: 'Select a conversation from the left',
            replyPlaceholder: 'Type your reply...',
            send: 'Send Reply',
            update: 'Update',
            loading: 'Loading...',
            statusOpen: 'Open',
            statusResolved: 'Resolved',
            statusClosed: 'Closed',
            statusUpdated: 'Status updated',
            updateFailed: 'Update failed',
            replyFailed: 'Failed to send reply',
            total: 'Total',
            open: 'Open',
            today: 'Today',
            user: 'User',
            admin: 'Admin',
            system: 'System',
            justNow: 'Just now',
            minutesAgo: 'minutes ago',
            hoursAgo: 'hours ago',
            daysAgo: 'days ago',
            quickRepliesTitle: 'Quick Replies',
            noTemplates: 'No templates available',
            emoji: 'Emoji',
            emojiCommon: 'Common Emojis',
            emojiSmileys: 'Smileys & Emotion',
            emojiPeople: 'People & Body',
            emojiNature: 'Animals & Nature',
            emojiFood: 'Food & Drink',
            emojiActivities: 'Activities',
            emojiTravel: 'Travel & Places',
            emojiObjects: 'Objects',
            emojiSymbols: 'Symbols'
        };
        
        let text = translations[key] || key;
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        
        return text;
    }
    
    async init() {
        await this.loadStats();
        await this.loadConversations();
        await this.loadQuickReplies();
        await this.loadAdminStatus();
        this.startPolling();
        this.startHeartbeat();
        this.bindEvents();
        this.setupTabNotification();
        this.requestNotificationPermission();
        
        // 初始化表情选择器
        setTimeout(() => {
            this.initAdminEmojiPicker();
        }, 100);
    }
    
    async loadStats() {
        try {
            const response = await fetch('/api/v1/admin/support/stats', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('totalConv').innerText = result.data.total_conversations;
                document.getElementById('openConv').innerText = result.data.open_conversations;
                document.getElementById('todayConv').innerText = result.data.today_conversations;
            }
        } catch (error) {
            console.error('Load stats error:', error);
        }
    }
    
    async loadConversations() {
        try {
            const unreadResponse = await fetch('/api/v1/admin/support/unread/stats', {
                credentials: 'include'
            });
            const unreadResult = await unreadResponse.json();
            
            const unreadMap = {};
            if (unreadResult.success && unreadResult.data.conversations) {
                unreadResult.data.conversations.forEach(c => {
                    unreadMap[c.conv_id] = c.unread_count;
                });
                if (unreadResult.data.total_unread > 0) {
                    const originalTitle = document.title.replace(/^\[\d+\]\s*/, '');
                    document.title = `[${unreadResult.data.total_unread}] ${originalTitle}`;
                    
                    // 新消息通知和声音
                    if (!document.hasFocus()) {
                        this.sendNotification('New Message', `You have ${unreadResult.data.total_unread} unread messages`);
                        this.playSound();
                    }
                } else {
                    const originalTitle = document.title.replace(/^\[\d+\]\s*/, '');
                    document.title = originalTitle;
                }
            }
            
            const response = await fetch('/api/v1/admin/support/conversations?limit=100', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.data.data) {
                const conversations = result.data.data.map(conv => ({
                    ...conv,
                    unread_count: unreadMap[conv.id] || 0
                }));
                this.renderConversations(conversations);
            }
        } catch (error) {
            console.error('Load conversations error:', error);
        }
    }
    
    renderConversations(conversations) {
        if (!conversations || conversations.length === 0) {
            this.conversationsList.innerHTML = `<div class="empty-state">${this.t('noConversations')}</div>`;
            return;
        }
        
        this.conversationsList.innerHTML = conversations.map(conv => {
            const userDisplay = conv.username || conv.email || `${this.t('user')} ${conv.user_id}`;
            const userDetail = conv.email ? `<div style="font-size: 11px; color: #9ca3af;">${this.escapeHtml(conv.email)}</div>` : '';
            
            const unreadCount = conv.unread_count || 0;
            const unreadBadge = unreadCount > 0 ? 
                `<span style="background: #f97316; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 8px;">${unreadCount}</span>` : '';
            
            let countryFlag = '';
            if (conv.country_name && conv.country_name !== 'Unknown' && conv.country_name !== 'Local') {
                countryFlag = `<div style="font-size: 11px; color: #f97316; margin-top: 4px;">🌍 ${this.escapeHtml(conv.country_name)}${conv.city && conv.city !== 'Local' && conv.city !== 'Unknown' ? ` · ${this.escapeHtml(conv.city)}` : ''}</div>`;
            } else if (conv.country_name === 'Local') {
                countryFlag = `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">💻 Local</div>`;
            }
            
            const statusText = {
                open: this.t('statusOpen'),
                resolved: this.t('statusResolved'),
                closed: this.t('statusClosed')
            }[conv.status] || conv.status;
            
            return `
                <div class="conv-item" data-conv-id="${conv.id}" data-user-id="${conv.user_id}">
                    <div class="conv-header">
                        <div>
                            <span class="user-name">${this.escapeHtml(userDisplay)}</span>
                            ${unreadBadge}
                            ${userDetail}
                            ${countryFlag}
                        </div>
                        <span class="status-badge status-${conv.status}">${statusText}</span>
                    </div>
                    <div class="last-message">${this.escapeHtml(conv.last_message || '')}</div>
                    <div class="message-time">${this.formatTime(conv.updated_at)}</div>
                </div>
            `;
        }).join('');
        
        // 渲染完成后，恢复当前选中会话的高亮
        if (this.currentConvId) {
            const activeItem = document.querySelector(`.conv-item[data-conv-id="${this.currentConvId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }
        
        document.querySelectorAll('.conv-item').forEach(el => {
            el.addEventListener('click', () => {
                const convId = el.getAttribute('data-conv-id');
                this.selectConversation(convId);
                document.querySelectorAll('.conv-item').forEach(item => item.classList.remove('active'));
                el.classList.add('active');
            });
        });
    }
    
    async selectConversation(convId) {
        this.currentConvId = convId;
        await this.markConversationRead(convId);
        
        const conversations = await this.getAllConversations();
        const currentConv = conversations.find(c => c.id == convId);
        
        const chatHeader = document.getElementById('chatHeader');
        const replyArea = document.getElementById('replyArea');
        if (chatHeader) chatHeader.style.display = 'flex';
        if (replyArea) replyArea.style.display = 'flex';
        
        const userInfoDiv = document.getElementById('userInfo');
        if (userInfoDiv && currentConv) {
            const userName = currentConv.username || currentConv.email || `${this.t('user')} ${currentConv.user_id}`;
            const userEmail = currentConv.email ? `<span style="margin-left: 16px;">📧 ${this.escapeHtml(currentConv.email)}</span>` : '';
            
            let userCountry = '';
            if (currentConv.country_name && currentConv.country_name !== 'Unknown' && currentConv.country_name !== 'Local') {
                userCountry = `<span style="margin-left: 16px;">🌍 ${this.escapeHtml(currentConv.country_name)}${currentConv.city && currentConv.city !== 'Unknown' && currentConv.city !== 'Local' ? ` (${this.escapeHtml(currentConv.city)})` : ''}</span>`;
            } else if (currentConv.country_name === 'Local') {
                userCountry = `<span style="margin-left: 16px;">💻 Local</span>`;
            }
            
            userInfoDiv.innerHTML = `${this.escapeHtml(userName)} ${userEmail} ${userCountry}`;
        }
        
        const currentConvIdSpan = document.getElementById('currentConvId');
        if (currentConvIdSpan) currentConvIdSpan.innerText = convId;
        
        await this.loadMessages(convId);
        
        const statusSelect = document.getElementById('statusSelect');
        if (statusSelect && currentConv) {
            statusSelect.value = currentConv.status;
        }
    }
    
    async markConversationRead(convId) {
        try {
            const response = await fetch('/api/v1/admin/support/conversations/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ convId: convId })
            });
            const result = await response.json();
            if (result.success) {
                await this.loadConversations();
            }
        } catch (error) {
            console.error('Mark conversation read error:', error);
        }
    }
    
    async getAllConversations() {
        try {
            const response = await fetch('/api/v1/admin/support/conversations?limit=1000', {
                credentials: 'include'
            });
            const result = await response.json();
            if (result.success && result.data.data) {
                return result.data.data;
            }
        } catch (error) {
            console.error('Get conversations error:', error);
        }
        return [];
    }
    
    async loadMessages(convId) {
        try {
            const response = await fetch(`/api/v1/admin/support/messages?convId=${convId}&limit=100`, {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success) {
                this.renderMessages(result.data);
            }
        } catch (error) {
            console.error('Load messages error:', error);
        }
    }
    
    renderMessages(messages) {
        if (!messages || messages.length === 0) {
            this.messagesArea.innerHTML = `<div class="empty-state">${this.t('noMessages')}</div>`;
            return;
        }
        
        this.messagesArea.innerHTML = messages.map(msg => {
            const isUser = msg.sender_type === 'user';
            const isSystem = msg.sender_type === 'system';
            const time = new Date(msg.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            let attachmentsHtml = '';
            if (msg.attachments) {
                try {
                    let attachments = msg.attachments;
                    if (typeof attachments === 'string') {
                        attachments = JSON.parse(attachments);
                    }
                    
                    if (Array.isArray(attachments) && attachments.length > 0) {
                        attachments.forEach(att => {
                            if (att.type === 'image') {
                                attachmentsHtml += `
                                    <div class="image-attachment" style="margin-top: 8px;">
                                        <img src="${att.url}" alt="${this.escapeHtml(att.originalName)}" 
                                             style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;"
                                             onclick="window.open('${att.url}')">
                                    </div>
                                `;
                            } else {
                                const fileIcon = this.getFileIcon(att.type);
                                attachmentsHtml += `
                                    <div class="file-attachment" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f3f4f6; border-radius: 8px; margin-top: 8px;">
                                        <i class="${fileIcon}"></i>
                                        <a href="${att.url}" target="_blank" style="color: #f97316; text-decoration: none;">${this.escapeHtml(att.originalName)}</a>
                                        <span style="font-size: 11px; color: #6b7280;">(${this.formatFileSize(att.size)})</span>
                                    </div>
                                `;
                            }
                        });
                    }
                } catch (e) {
                    console.error('Parse attachments error:', e);
                }
            }
            
            let senderClass = 'admin';
            let senderLabel = this.t('admin');
            if (isUser) {
                senderClass = 'user';
                senderLabel = this.t('user');
            }
            if (isSystem) {
                senderClass = 'system';
                senderLabel = this.t('system');
            }
            
            let contentDisplay = this.escapeHtml(msg.content);
            if ((!contentDisplay || contentDisplay === '') && attachmentsHtml) {
                contentDisplay = '📷 Image';
            }
            
            return `
                <div class="message ${senderClass}">
                    <div class="message-bubble">
                        <div>${contentDisplay}</div>
                        ${attachmentsHtml}
                        <div class="message-time" style="font-size: 10px; margin-top: 4px; opacity: 0.7;">${time} · ${senderLabel}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        this.scrollToBottom();
    }
    
    // ==================== 发送回复 ====================
    
    async sendReply() {
        if (this.isSending) {
            console.log('[SupportAdmin] Already sending, skipping...');
            return;
        }
        
        const content = this.replyInput ? this.replyInput.value.trim() : '';
        if (!content || !this.currentConvId) {
            console.log('[SupportAdmin] No content or conversation ID');
            return;
        }
        
        console.log('[SupportAdmin] Sending reply:', content);
        
        this.isSending = true;
        const originalContent = content;
        
        if (this.replyInput) {
            this.replyInput.value = '';
        }
        
        if (this.sendReplyBtn) {
            this.sendReplyBtn.disabled = true;
        }
        
        try {
            const response = await fetch('/api/v1/admin/support/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    convId: this.currentConvId,
                    content: content
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('[SupportAdmin] Reply sent successfully');
                await this.loadMessages(this.currentConvId);
                await this.loadConversations();
                await this.loadStats();
                this.scrollToBottom();
            } else {
                console.error('[SupportAdmin] Send failed:', result.error);
                alert(result.error || this.t('replyFailed'));
                if (this.replyInput) {
                    this.replyInput.value = originalContent;
                }
            }
        } catch (error) {
            console.error('[SupportAdmin] Send reply error:', error);
            alert(this.t('replyFailed'));
            if (this.replyInput) {
                this.replyInput.value = originalContent;
            }
        } finally {
            this.isSending = false;
            if (this.sendReplyBtn) {
                this.sendReplyBtn.disabled = false;
            }
            if (this.replyInput) {
                this.replyInput.focus();
            }
        }
    }
    
    async updateStatus() {
        if (!this.currentConvId) return;
        
        const newStatus = document.getElementById('statusSelect').value;
        
        try {
            const response = await fetch('/api/v1/admin/support/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    convId: this.currentConvId,
                    status: newStatus
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                await this.loadConversations();
                await this.loadStats();
                alert(this.t('statusUpdated'));
            } else {
                alert(result.error || this.t('updateFailed'));
            }
        } catch (error) {
            console.error('Update status error:', error);
            alert(this.t('updateFailed'));
        }
    }
    
    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(() => {
            this.loadStats();
            this.loadConversations();
            if (this.currentConvId) {
                this.loadMessages(this.currentConvId);
            }
        }, 5000);
    }
    
    scrollToBottom() {
        if (this.messagesArea) {
            this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
        }
    }
    
    // ==================== Quick Replies ====================
    
    async loadQuickReplies() {
        try {
            const response = await fetch('/api/v1/admin/support/templates', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderQuickReplies(result.data);
            }
        } catch (error) {
            console.error('Load quick replies error:', error);
        }
    }
    
    renderQuickReplies(templates) {
        const container = document.getElementById('quickReplyList');
        if (!container) return;
        
        if (!templates || templates.length === 0) {
            container.innerHTML = `<div class="empty-state">${this.t('noTemplates')}</div>`;
            return;
        }
        
        container.innerHTML = templates.map(t => `
            <div class="quick-reply-item" data-content="${this.escapeHtml(t.content)}">
                <div class="quick-reply-title">${this.escapeHtml(t.title)}</div>
                <div class="quick-reply-content">${this.escapeHtml(t.content.substring(0, 60))}${t.content.length > 60 ? '...' : ''}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.quick-reply-item').forEach(item => {
            item.addEventListener('click', () => {
                const content = item.getAttribute('data-content');
                if (this.replyInput) {
                    this.replyInput.value = content;
                    this.replyInput.focus();
                }
                const panel = document.getElementById('quickReplyPanel');
                if (panel) panel.style.display = 'none';
            });
        });
    }
    
    toggleQuickReplyPanel() {
        const panel = document.getElementById('quickReplyPanel');
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (panel) {
            const isVisible = panel.style.display === 'block';
            if (emojiPicker) emojiPicker.style.display = 'none';
            panel.style.display = isVisible ? 'none' : 'block';
        }
    }
    
    // ==================== Admin Status ====================
    
    async loadAdminStatus() {
        try {
            const response = await fetch('/api/v1/admin/support/status', {
                credentials: 'include'
            });
            const result = await response.json();
            if (result.success && result.data) {
                const select = document.getElementById('adminStatusSelect');
                if (select && result.data.status) {
                    select.value = result.data.status;
                }
            }
        } catch (error) {
            console.error('Load admin status error:', error);
        }
    }
    
    async updateAdminStatus(status) {
        try {
            const response = await fetch('/api/v1/admin/support/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status })
            });
            const result = await response.json();
            if (!result.success) {
                console.error('Update status failed:', result.error);
            }
        } catch (error) {
            console.error('Update status error:', error);
        }
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(async () => {
            try {
                await fetch('/api/v1/admin/support/heartbeat', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }, 30000);
    }
    
    // ==================== Notifications ====================
    
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('Browser does not support notifications');
            return;
        }
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('Notification permission:', permission);
        }
    }
    
    sendNotification(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            const notification = new Notification(title, { 
                body: body, 
                icon: '/favicon.ico',
                silent: false
            });
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            setTimeout(() => notification.close(), 5000);
        }
    }
    
    playSound() {
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Play sound failed:', e));
        } catch (e) {
            console.log('Sound error:', e);
        }
    }
    
    // ==================== Emoji Picker ====================
    
    initAdminEmojiPicker() {
        console.log('[SupportAdmin] Initializing full emoji picker...');
        
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (!emojiPicker) {
            console.error('[SupportAdmin] Emoji picker element not found');
            return;
        }
        
        this.createFullEmojiPickerContent();
        this.bindEmojiEvents();
        emojiPicker.style.display = 'none';
        
        console.log('[SupportAdmin] Full emoji picker initialized');
    }
    
    createFullEmojiPickerContent() {
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (!emojiPicker) return;
        
        const emojiCategories = [
            {
                title: this.t('emojiSmileys'),
                emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']
            },
            {
                title: this.t('emojiPeople'),
                emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸']
            },
            {
                title: this.t('emojiNature'),
                emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐒', '🐔', '🐧', '🐦', '🐤', '🐥', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦔', '🐿️', '🦇', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌿', '🍀', '🍁', '🍂', '🍃', '🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌾', '🌽', '🍄']
            },
            {
                title: this.t('emojiFood'),
                emojis: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊']
            },
            {
                title: this.t('emojiActivities'),
                emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰']
            }
        ];
        
        let emojiHtml = '';
        emojiCategories.forEach(category => {
            emojiHtml += `
                <div class="emoji-category">
                    <div class="emoji-category-title">${category.title}</div>
                    <div class="emoji-list">
                        ${category.emojis.map(emoji => `
                            <span class="emoji-item" data-emoji="${emoji}" role="button" tabindex="0" 
                                  style="font-size: 28px; cursor: pointer; padding: 6px; border-radius: 8px; 
                                         transition: all 0.2s; display: inline-flex; align-items: center; 
                                         justify-content: center; width: 44px; height: 44px; background: #f9fafb;
                                         margin: 2px;">
                                ${emoji}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        emojiPicker.innerHTML = emojiHtml;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'emoji-picker-close';
        closeBtn.innerHTML = '✕ Close';
        closeBtn.style.cssText = `
            position: sticky;
            bottom: 0;
            width: 100%;
            background: white;
            border: none;
            border-top: 1px solid #e5e7eb;
            padding: 10px;
            cursor: pointer;
            color: #6b7280;
            font-size: 14px;
        `;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.hideAdminEmojiPicker();
        };
        emojiPicker.appendChild(closeBtn);
        
        const style = document.createElement('style');
        style.textContent = `
            .emoji-item:hover {
                background: #f3f4f6 !important;
                transform: scale(1.1);
                transition: all 0.2s;
            }
            .emoji-item:focus {
                outline: 2px solid #f97316;
                outline-offset: 2px;
            }
        `;
        emojiPicker.appendChild(style);
    }
    
    bindEmojiEvents() {
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (!emojiPicker) return;
        
        if (this._emojiHandler) {
            emojiPicker.removeEventListener('click', this._emojiHandler);
        }
        
        this._emojiHandler = (e) => {
            let target = e.target;
            while (target && target !== emojiPicker) {
                if (target.classList && target.classList.contains('emoji-item')) {
                    const emoji = target.getAttribute('data-emoji') || target.textContent;
                    console.log('[SupportAdmin] Emoji clicked:', emoji);
                    this.insertEmojiToInput(emoji);
                    e.stopPropagation();
                    break;
                }
                target = target.parentElement;
            }
        };
        
        emojiPicker.addEventListener('click', this._emojiHandler);
        console.log('[SupportAdmin] Emoji events bound');
    }
    
    insertEmojiToInput(emoji) {
        if (!this.replyInput) {
            console.error('[SupportAdmin] Reply input not found');
            return;
        }
        
        console.log('[SupportAdmin] Inserting emoji:', emoji);
        
        const start = this.replyInput.selectionStart;
        const end = this.replyInput.selectionEnd;
        const value = this.replyInput.value;
        
        const newValue = value.substring(0, start) + emoji + value.substring(end);
        this.replyInput.value = newValue;
        
        const newCursorPos = start + emoji.length;
        this.replyInput.selectionStart = newCursorPos;
        this.replyInput.selectionEnd = newCursorPos;
        
        this.replyInput.focus();
        this.hideAdminEmojiPicker();
        
        const inputEvent = new Event('input', { bubbles: true });
        this.replyInput.dispatchEvent(inputEvent);
        
        console.log('[SupportAdmin] Emoji inserted successfully, new value:', this.replyInput.value);
    }
    
    toggleAdminEmojiPicker() {
        const emojiPicker = document.getElementById('adminEmojiPicker');
        const quickPanel = document.getElementById('quickReplyPanel');
        
        if (!emojiPicker) {
            console.error('[SupportAdmin] Emoji picker not found');
            return;
        }
        
        const isVisible = emojiPicker.style.display === 'block';
        
        if (isVisible) {
            this.hideAdminEmojiPicker();
        } else {
            this.showAdminEmojiPicker();
        }
        
        if (quickPanel) {
            quickPanel.style.display = 'none';
        }
    }
    
    showAdminEmojiPicker() {
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (!emojiPicker) return;
        
        if (!emojiPicker.innerHTML || emojiPicker.innerHTML.trim() === '') {
            this.createFullEmojiPickerContent();
            this.bindEmojiEvents();
        }
        
        emojiPicker.style.display = 'block';
        console.log('[SupportAdmin] Emoji picker shown');
        emojiPicker.scrollTop = 0;
    }
    
    hideAdminEmojiPicker() {
        const emojiPicker = document.getElementById('adminEmojiPicker');
        if (emojiPicker) {
            emojiPicker.style.display = 'none';
            console.log('[SupportAdmin] Emoji picker hidden');
        }
    }
    
    // ==================== Event Bindings ====================
    
    bindEvents() {
        if (this.sendReplyBtn) {
            this.sendReplyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[SupportAdmin] Send button clicked');
                this.sendReply();
            });
        }
        
        const updateBtn = document.getElementById('updateStatusBtn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => this.updateStatus());
        }
        
        if (this.replyInput) {
            this.replyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[SupportAdmin] Enter key pressed');
                    this.sendReply();
                }
            });
        }
        
        const quickReplyBtn = document.getElementById('quickReplyBtn');
        if (quickReplyBtn) {
            quickReplyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleQuickReplyPanel();
            });
        }
        
        const adminEmojiBtn = document.getElementById('adminEmojiBtn');
        if (adminEmojiBtn) {
            if (this._emojiBtnHandler) {
                adminEmojiBtn.removeEventListener('click', this._emojiBtnHandler);
            }
            
            this._emojiBtnHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[SupportAdmin] Emoji button clicked');
                this.toggleAdminEmojiPicker();
            };
            
            adminEmojiBtn.addEventListener('click', this._emojiBtnHandler);
        }
        
        const closeQuickReplyBtn = document.getElementById('closeQuickReplyBtn');
        if (closeQuickReplyBtn) {
            closeQuickReplyBtn.addEventListener('click', () => {
                const panel = document.getElementById('quickReplyPanel');
                if (panel) panel.style.display = 'none';
            });
        }
        
        // 客服状态切换
        const adminStatusSelect = document.getElementById('adminStatusSelect');
        if (adminStatusSelect) {
            adminStatusSelect.addEventListener('change', (e) => {
                this.updateAdminStatus(e.target.value);
            });
        }
        
        // 点击外部关闭面板
        document.addEventListener('click', (e) => {
            const quickPanel = document.getElementById('quickReplyPanel');
            const emojiPicker = document.getElementById('adminEmojiPicker');
            const quickBtn = document.getElementById('quickReplyBtn');
            const emojiBtn = document.getElementById('adminEmojiBtn');
            
            if (quickPanel && !quickPanel.contains(e.target) && e.target !== quickBtn && !quickBtn?.contains(e.target)) {
                quickPanel.style.display = 'none';
            }
            if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn && !emojiBtn?.contains(e.target)) {
                this.hideAdminEmojiPicker();
            }
        });
        
        console.log('[SupportAdmin] All events bound successfully');
    }
    
    setupTabNotification() {
        let originalTitle = document.title;
        let notificationInterval = null;
        
        const checkAndNotify = async () => {
            const response = await fetch('/api/v1/admin/support/unread/stats', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.data.total_unread > 0) {
                if (!document.hasFocus()) {
                    if (notificationInterval) clearInterval(notificationInterval);
                    let count = 0;
                    notificationInterval = setInterval(() => {
                        document.title = count % 2 === 0 ? `✨ ${result.data.total_unread} new messages` : originalTitle;
                        count++;
                        if (count > 10) {
                            clearInterval(notificationInterval);
                            document.title = `[${result.data.total_unread}] ${originalTitle}`;
                        }
                    }, 800);
                }
            } else {
                if (notificationInterval) {
                    clearInterval(notificationInterval);
                }
                document.title = originalTitle;
            }
        };
        
        window.addEventListener('focus', () => {
            if (notificationInterval) {
                clearInterval(notificationInterval);
                document.title = originalTitle;
            }
            this.loadConversations();
        });
        
        setInterval(checkAndNotify, 10000);
    }
    
    formatTime(time) {
        if (!time) return '';
        const date = new Date(time);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return this.t('justNow');
        if (diff < 3600000) return `${Math.floor(diff / 60000)} ${this.t('minutesAgo')}`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${this.t('hoursAgo')}`;
        return `${Math.floor(diff / 86400000)} ${this.t('daysAgo')}`;
    }
    
    getFileIcon(type) {
        const icons = {
            image: 'fas fa-image',
            pdf: 'fas fa-file-pdf',
            document: 'fas fa-file-word',
            spreadsheet: 'fas fa-file-excel',
            text: 'fas fa-file-alt',
            video: 'fas fa-file-video',
            audio: 'fas fa-file-audio',
            default: 'fas fa-file'
        };
        return icons[type] || icons.default;
    }
    
    formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// 添加表情选择器样式
const adminEmojiStyles = document.createElement('style');
adminEmojiStyles.textContent = `
    #adminEmojiPicker {
        position: absolute;
        bottom: 70px;
        right: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.02);
        width: 400px;
        max-height: 450px;
        overflow-y: auto;
        z-index: 10000;
        border: 1px solid #e5e7eb;
        display: none;
    }
    
    #adminEmojiPicker .emoji-category {
        padding: 12px;
        border-bottom: 1px solid #f3f4f6;
    }
    
    #adminEmojiPicker .emoji-category:last-child {
        border-bottom: none;
    }
    
    #adminEmojiPicker .emoji-category-title {
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        display: block;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    #adminEmojiPicker .emoji-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    
    #adminEmojiPicker .emoji-item {
        font-size: 28px;
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: #f9fafb;
        margin: 2px;
    }
    
    #adminEmojiPicker .emoji-item:hover {
        background: #f3f4f6;
        transform: scale(1.1);
    }
    
    #adminEmojiPicker .emoji-picker-close {
        position: sticky;
        bottom: 0;
        width: 100%;
        background: white;
        border: none;
        border-top: 1px solid #e5e7eb;
        padding: 10px;
        cursor: pointer;
        color: #6b7280;
        font-size: 14px;
    }
    
    #adminEmojiPicker .emoji-picker-close:hover {
        background: #f9fafb;
    }
    
    @media (max-width: 768px) {
        #adminEmojiPicker {
            width: 320px;
            right: 10px;
            bottom: 65px;
        }
        
        #adminEmojiPicker .emoji-item {
            width: 38px;
            height: 38px;
            font-size: 24px;
        }
    }
`;
document.head.appendChild(adminEmojiStyles);

// 初始化
if (document.getElementById('conversationsList')) {
    console.log('[SupportAdmin] Creating admin instance...');
    window.supportAdmin = new SupportAdmin();
}