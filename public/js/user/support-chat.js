/**
 * Support Chat Module - User Side
 * Fixed: Duplicate message sending issue
 * 
 * @version 3.2.0 - Fixed duplicate message sending (removed temporary messages)
 */
console.log('🔥 test - support-chat.js loaded');
class SupportChat {
    constructor(config = {}) {
        // Core properties
        this.convId = null;
        this.userId = null;
        this.socket = null;
        this.isConnected = false;
        this.isLoading = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isSending = false; // 添加发送锁，防止重复发送
        
        // Polling fallback
        this.pollingInterval = null;
        this.unreadPollingInterval = null;
        
        // Typing indicator
        this.typingTimeout = null;
        this.typingIndicatorTimeout = null;
        
        // Pending file
        this.pendingFile = null;
        
        // DOM elements
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.fileInput = document.getElementById('fileInput');
        this.attachBtn = document.getElementById('attachBtn');
        this.emojiBtn = document.getElementById('emojiBtn');
        this.emojiPicker = document.getElementById('emojiPicker');
        
        // Custom configuration
        this.config = {
            maxFileSize: 10 * 1024 * 1024,
            pollingInterval: 3000,
            unreadPollingInterval: 5000,
            typingTimeoutDelay: 1000,
            typingIndicatorDelay: 2000,
            scrollThreshold: 100,
            maxRetries: 5,
            ...config
        };
        
        // Initialize after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    t(key, params = {}) {
        const translations = {
            'common.loading': 'Loading...',
            'common.error': 'Error',
            'common.success': 'Success',
            'chat.load_failed': 'Failed to load chat. Please refresh the page.',
            'chat.network_error': 'Network error. Please check your connection.',
            'chat.empty_message': 'No messages yet. Send your first message!',
            'chat.sending': 'Sending...',
            'chat.send_failed': 'Failed to send message. Please try again.',
            'chat.type_placeholder': 'Type your message...',
            'chat.send': 'Send',
            'chat.online': 'Online',
            'chat.offline': 'Offline',
            'file.too_large': 'File size cannot exceed {maxSize}MB',
            'file.upload_failed': 'File upload failed. Please try again.',
            'file.uploading': 'Uploading...',
            'typing.other': '{name} is typing...',
            'typing.support': 'Support is typing...',
            'emoji.common': 'Common Emojis'
        };
        
        let text = translations[key] || key;
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        
        return text;
    }
    
    async init() {
        try {
            console.log('[SupportChat] Initializing...');
            this.showLoading();
            
            const response = await fetch('/api/v1/user/support/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.convId = result.data.conversation.id;
                this.userId = result.data.conversation.user_id;
                console.log('[SupportChat] userId set to:', this.userId);
                this.renderMessages(result.data.messages);
                
                // 延迟 300ms 连接 WebSocket，确保所有资源就绪
                setTimeout(() => {
                    this.connectWebSocket();
                }, 300);
                this.bindEvents();
                this.initEmojiPicker();
                this.startPolling();
                this.startUnreadPolling();
                
                console.log('[SupportChat] Initialized successfully, convId:', this.convId);
            } else {
                this.showError(result.error || this.t('chat.load_failed'));
            }
        } catch (error) {
            console.error('[SupportChat] Init error:', error);
            this.showError(this.t('chat.network_error'));
        }
    }
    
    connectWebSocket() {
        // 如果 userId 还没有，等待一下再试
        if (!this.userId) {
            console.log('[SupportChat] Waiting for userId...');
            setTimeout(() => this.connectWebSocket(), 500);
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('[SupportChat] Connecting to WebSocket:', wsUrl);
        
        this.socket = io(wsUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.config.maxRetries,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        this.socket.on('connect', () => {
            console.log('[Socket] Connected successfully');
            this.isConnected = true;
            this.retryCount = 0;
            this.updateConnectionStatus(true);
            
            this.socket.emit('join-conversation', {
                convId: this.convId,
                userId: this.userId,
                role: 'user'
            });
            console.log('[Socket] Joined conversation:', this.convId);
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            this.isConnected = false;
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error);
            this.retryCount++;
            if (this.retryCount >= this.config.maxRetries) {
                this.showError(this.t('chat.network_error'));
            }
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('new-message', (message) => {
            console.log('[Socket] New message received:', message);
            this.handleNewMessage(message);
        });
        
        this.socket.on('message-read', (data) => {
            console.log('[Socket] Message read by:', data.role);
        });
        
        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data);
        });
        
        this.socket.on('user-left', (data) => {
            console.log('[Socket] User left:', data);
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('[Socket] User joined:', data);
        });
        
        // 心跳检测
        setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit('ping');
            }
        }, 30000);
    }
    
    handleNewMessage(message) {
        console.log('[SupportChat] Handling new message:', message);
        
        // ========== 关键修复：忽略自己发送的消息 ==========
        // 如果消息是用户自己发送的，不处理（避免重复显示）
        if (message.sender_type === 'user') {
            console.log('[SupportChat] Ignoring own message from WebSocket');
            return;
        }
        // ================================================
        
        if (message.conv_id !== this.convId && message.convId !== this.convId) {
            console.log('[SupportChat] Message for different conversation, ignoring');
            return;
        }
        
        this.appendMessage(message);
        this.markMessagesAsRead();
        
        // 播放提示音
        this.playNotificationSound();
        
        if (document.hidden) {
            this.showDesktopNotification(message);
        }
    }
    
    playNotificationSound() {
        try {
            // 使用 Web Audio API 生成提示音（无需外部文件）
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 880;
            gainNode.gain.value = 0.3;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        } catch (e) {
            console.log('Sound not supported:', e);
        }
    }
    
    showDesktopNotification(message) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            new Notification('New Support Message', {
                body: message.content,
                icon: '/images/logo.png'
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
    
    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = isConnected ? this.t('chat.online') : this.t('chat.offline');
            statusElement.className = isConnected ? 'status-online' : 'status-offline';
        }
    }
    
    renderMessages(messages) {
        if (!this.messagesContainer) return;
        
        if (!messages || messages.length === 0) {
            this.messagesContainer.innerHTML = `
                <div class="empty-message">
                    <span class="empty-icon">💬</span>
                    <p>${this.t('chat.empty_message')}</p>
                </div>
            `;
            return;
        }
        
        const shouldScroll = this.isNearBottom();
        this.messagesContainer.innerHTML = messages.map(msg => this.formatMessage(msg)).join('');
        
        if (shouldScroll) {
            this.scrollToBottom();
        }
        
        if (messages && messages.length > 0) {
            this.markMessagesAsRead();
        }
    }
    
    formatMessage(msg) {
        const isUser = msg.sender_type === 'user';
        const isSystem = msg.sender_type === 'system';
        const time = new Date(msg.created_at).toLocaleTimeString();
        
        let attachmentsHtml = '';
        if (msg.attachments) {
            try {
                const attachments = typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments;
                if (Array.isArray(attachments)) {
                    attachments.forEach(att => {
                        if (att.type === 'image') {
                            attachmentsHtml += `
                                <div class="image-attachment">
                                    <img src="${this.escapeHtml(att.url)}" 
                                         alt="${this.escapeHtml(att.originalName)}" 
                                         loading="lazy"
                                         onclick="window.open('${this.escapeHtml(att.url)}')">
                                </div>
                            `;
                        } else {
                            attachmentsHtml += `
                                <div class="file-attachment">
                                    <i class="fas fa-file"></i>
                                    <a href="${this.escapeHtml(att.url)}" 
                                       target="_blank" 
                                       rel="noopener noreferrer"
                                       class="file-link">
                                        ${this.escapeHtml(att.originalName)}
                                    </a>
                                </div>
                            `;
                        }
                    });
                }
            } catch (e) {
                console.error('[SupportChat] Parse attachments error:', e);
            }
        }
        
        let senderClass = 'admin-message';
        if (isUser) senderClass = 'user-message';
        if (isSystem) senderClass = 'system-message';
        
        return `
            <div class="message ${senderClass}" data-message-id="${msg.id || ''}" data-message-time="${msg.created_at}">
                <div class="message-bubble">
                    <div class="message-content">${this.escapeHtml(msg.content || '')}</div>
                    ${attachmentsHtml}
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
    }
    
    appendMessage(message) {
        console.log('[SupportChat] Appending message:', message);
        const messageHtml = this.formatMessage(message);
        this.messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
        this.scrollToBottom();
        this.markMessagesAsRead();
    }
    
    // ==================== 修复：删除临时消息，只显示服务器返回的消息 ====================
    
    async sendMessage() {
        if (this.isSending) {
            console.log('[SupportChat] Already sending, skipping...');
            return;
        }
        
        const content = this.messageInput ? this.messageInput.value.trim() : '';
        if (!content && !this.pendingFile) return;
        
        this.isSending = true;
        this.isLoading = true;
        if (this.sendBtn) this.sendBtn.disabled = true;
        
        if (this.pendingFile) {
            await this.uploadAndSendFile(this.pendingFile);
            this.pendingFile = null;
            this.isLoading = false;
            this.isSending = false;
            if (this.sendBtn) this.sendBtn.disabled = false;
            return;
        }
        
        const messageData = {
            convId: this.convId,
            content: content,
            type: 'text',
            sender_type: 'user',
            created_at: new Date().toISOString()
        };
        
        // 清空输入框
        if (this.messageInput) {
            this.messageInput.value = '';
            this.autoResizeTextarea();
        }
        
        // 发送消息，不显示任何临时消息
        if (this.isConnected && this.socket) {
            console.log('[SupportChat] Sending message via WebSocket:', messageData);
            this.socket.emit('send-message', messageData, (response) => {
                this.isLoading = false;
                this.isSending = false;
                if (this.sendBtn) this.sendBtn.disabled = false;
                
                if (response && response.success) {
                    console.log('[SupportChat] Message sent successfully');
                    // ========== 只显示服务器返回的消息，不显示临时消息 ==========
                    if (response.data) {
                        this.appendMessage(response.data);
                    }
                    // ========================================================
                } else {
                    console.error('[SupportChat] Send failed:', response);
                    this.showError(this.t('chat.send_failed'));
                    // 发送失败，恢复输入框内容
                    if (this.messageInput) {
                        this.messageInput.value = content;
                    }
                }
            });
        } else {
            // HTTP 降级
            try {
                const response = await fetch('/api/v1/user/support/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        convId: this.convId,
                        content: content
                    })
                });
                const result = await response.json();
                this.isLoading = false;
                this.isSending = false;
                if (this.sendBtn) this.sendBtn.disabled = false;
                
                if (result.success && result.data) {
                    this.appendMessage(result.data);
                } else {
                    this.showError(this.t('chat.send_failed'));
                    if (this.messageInput) this.messageInput.value = content;
                }
            } catch (error) {
                console.error('[SupportChat] Send error:', error);
                this.isLoading = false;
                this.isSending = false;
                if (this.sendBtn) this.sendBtn.disabled = false;
                this.showError(this.t('chat.send_failed'));
                if (this.messageInput) this.messageInput.value = content;
            }
        }
    }
    
    removeTempMessage(tempId) {
        const tempMessage = document.querySelector(`.message[data-message-id="${tempId}"]`);
        if (tempMessage) {
            tempMessage.remove();
        }
    }
    
    async uploadAndSendFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        this.showTemporarySuccess(this.t('file.uploading'));
        
        try {
            const response = await fetch('/api/v1/upload/chat', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                const fileInfo = result.data;
                const messageData = {
                    convId: this.convId,
                    content: `[File] ${fileInfo.originalName}`,
                    type: 'file',
                    attachments: [fileInfo]
                };
                
                if (this.isConnected && this.socket) {
                    this.socket.emit('send-message', messageData);
                } else {
                    await fetch('/api/v1/user/support/message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            convId: this.convId,
                            content: messageData.content,
                            attachments: [fileInfo]
                        })
                    });
                }
            } else {
                this.showError(result.error || this.t('file.upload_failed'));
            }
        } catch (error) {
            console.error('[Upload] Error:', error);
            this.showError(this.t('file.upload_failed'));
        }
    }
    
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (file.size > this.config.maxFileSize) {
            this.showError(this.t('file.too_large', { maxSize: this.config.maxFileSize / (1024 * 1024) }));
            event.target.value = '';
            return;
        }
        
        this.pendingFile = file;
        this.sendMessage();
        event.target.value = '';
    }
    
    handlePaste(event) {
        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file.size <= this.config.maxFileSize) {
                    this.pendingFile = file;
                    this.sendMessage();
                } else {
                    this.showError(this.t('file.too_large', { maxSize: this.config.maxFileSize / (1024 * 1024) }));
                }
                break;
            }
        }
    }
    
    startTyping() {
        if (this.socket && this.isConnected) {
            this.socket.emit('typing', {
                convId: this.convId,
                isTyping: true,
                role: 'user',
                userName: 'User'
            });
            
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                if (this.socket && this.isConnected) {
                    this.socket.emit('typing', {
                        convId: this.convId,
                        isTyping: false,
                        role: 'user'
                    });
                }
            }, this.config.typingTimeoutDelay);
        }
    }
    
    showTypingIndicator(data) {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            if (data.isTyping && data.role === 'admin') {
                indicator.style.display = 'block';
                indicator.textContent = this.t('typing.support');
                
                clearTimeout(this.typingIndicatorTimeout);
                this.typingIndicatorTimeout = setTimeout(() => {
                    indicator.style.display = 'none';
                }, this.config.typingIndicatorDelay);
            } else {
                indicator.style.display = 'none';
            }
        }
    }
    
    async markMessagesAsRead() {
        if (!this.convId) return;
        
        if (this.socket && this.isConnected) {
            this.socket.emit('mark-read', {
                convId: this.convId,
                userId: this.userId,
                role: 'user'
            });
        }
        this.updateUnreadCount();
    }
    
    async refreshMessages() {
        if (!this.convId) return;
        
        try {
            const response = await fetch(`/api/v1/user/support/messages?convId=${this.convId}&limit=100`, {
                credentials: 'include'
            });
            const result = await response.json();
            if (result.success) {
                this.renderMessages(result.data);
            }
        } catch (error) {
            console.error('[SupportChat] Refresh error:', error);
        }
    }
    
    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(() => {
            if (!this.isConnected) {
                console.log('[SupportChat] WebSocket disconnected, polling for messages');
                this.refreshMessages();
            }
        }, this.config.pollingInterval);
    }
    
    async updateUnreadCount() {
        try {
            const response = await fetch('/api/v1/user/support/unread/count', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.data.unread_count > 0) {
                this.showUnreadBadge(result.data.unread_count);
            } else {
                this.hideUnreadBadge();
            }
        } catch (error) {
            console.error('[SupportChat] Update unread count error:', error);
        }
    }
    
    showUnreadBadge(count) {
        const originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = `(${count}) ${originalTitle}`;
        
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            badge.innerText = count;
            badge.style.display = 'flex';
        }
    }
    
    hideUnreadBadge() {
        const originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = originalTitle;
        
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            badge.style.display = 'none';
        }
    }
    
    startUnreadPolling() {
        if (this.unreadPollingInterval) clearInterval(this.unreadPollingInterval);
        this.unreadPollingInterval = setInterval(() => {
            this.updateUnreadCount();
        }, this.config.unreadPollingInterval);
    }
    
    // ==================== Emoji Picker ====================
    
    initEmojiPicker() {
        console.log('[SupportChat] Initializing emoji picker...');
        
        if (!this.emojiPicker) {
            console.error('[SupportChat] Emoji picker element not found!');
            this.createEmojiPickerElement();
        }
        
        if (!this.emojiPicker) {
            console.error('[SupportChat] Cannot create emoji picker');
            return;
        }
        
        this.emojiPicker.innerHTML = '';
        this.createEmojiPickerContent();
        this.bindEmojiDirectEvents();
        this.emojiPicker.style.display = 'none';
        
        console.log('[SupportChat] Emoji picker initialized, elements found:', 
                   this.emojiPicker.querySelectorAll('.emoji-item').length);
    }
    
    createEmojiPickerElement() {
        if (!this.emojiPicker && this.emojiBtn) {
            const picker = document.createElement('div');
            picker.id = 'emojiPicker';
            picker.className = 'emoji-picker';
            this.emojiBtn.parentNode.insertBefore(picker, this.emojiBtn.nextSibling);
            this.emojiPicker = picker;
            console.log('[SupportChat] Created emoji picker element');
        }
    }
    
    createEmojiPickerContent() {
        if (!this.emojiPicker) return;
        
        const commonEmojis = [
            '😊', '😂', '🥰', '😍', '😎', '🤔', '😭', '😡', '👍', '❤️',
            '🎉', '🔥', '✨', '⭐', '🙏', '🤝', '💪', '👋', '✅', '❌',
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩'
        ];
        
        const emojiHtml = `
            <div class="emoji-category">
                <div class="emoji-category-title">${this.t('emoji.common')}</div>
                <div class="emoji-list" id="emojiList">
                    ${commonEmojis.map(emoji => `
                        <span class="emoji-item" data-emoji="${emoji}" role="button" tabindex="0">${emoji}</span>
                    `).join('')}
                </div>
            </div>
        `;
        
        this.emojiPicker.innerHTML = emojiHtml;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'emoji-picker-close';
        closeBtn.innerHTML = '✕ Close';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.hideEmojiPicker();
        };
        this.emojiPicker.appendChild(closeBtn);
    }
    
    bindEmojiDirectEvents() {
        if (!this.emojiPicker) return;
        
        const emojiElements = this.emojiPicker.querySelectorAll('.emoji-item');
        console.log('[SupportChat] Binding events to', emojiElements.length, 'emoji elements');
        
        emojiElements.forEach(emojiEl => {
            emojiEl.removeEventListener('click', this._emojiClickHandler);
            
            const handler = (e) => {
                e.stopPropagation();
                const emoji = emojiEl.getAttribute('data-emoji') || emojiEl.textContent;
                console.log('[SupportChat] Emoji clicked:', emoji);
                this.insertEmoji(emoji);
            };
            
            emojiEl.addEventListener('click', handler);
            
            emojiEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const emoji = emojiEl.getAttribute('data-emoji') || emojiEl.textContent;
                    this.insertEmoji(emoji);
                }
            });
            
            emojiEl._clickHandler = handler;
        });
    }
    
    toggleEmojiPicker() {
        if (!this.emojiPicker) {
            console.error('[SupportChat] Emoji picker not found');
            return;
        }
        
        const isVisible = this.emojiPicker.style.display === 'block';
        if (isVisible) {
            this.hideEmojiPicker();
        } else {
            this.showEmojiPicker();
        }
    }
    
    showEmojiPicker() {
        if (!this.emojiPicker) return;
        
        this.bindEmojiDirectEvents();
        this.emojiPicker.style.display = 'block';
        console.log('[SupportChat] Emoji picker shown');
        
        const firstEmoji = this.emojiPicker.querySelector('.emoji-item');
        if (firstEmoji) {
            firstEmoji.focus();
        }
    }
    
    hideEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.style.display = 'none';
            console.log('[SupportChat] Emoji picker hidden');
        }
    }
    
    insertEmoji(emoji) {
        if (!this.messageInput) {
            console.error('[SupportChat] Message input not found');
            return;
        }
        
        console.log('[SupportChat] Inserting emoji:', emoji);
        
        const start = this.messageInput.selectionStart;
        const end = this.messageInput.selectionEnd;
        const value = this.messageInput.value;
        
        const newValue = value.substring(0, start) + emoji + value.substring(end);
        this.messageInput.value = newValue;
        
        const newCursorPos = start + emoji.length;
        this.messageInput.selectionStart = newCursorPos;
        this.messageInput.selectionEnd = newCursorPos;
        
        this.messageInput.focus();
        this.hideEmojiPicker();
        
        const inputEvent = new Event('input', { bubbles: true });
        this.messageInput.dispatchEvent(inputEvent);
        
        this.startTyping();
        this.autoResizeTextarea();
        
        console.log('[SupportChat] Emoji inserted successfully');
    }
    
    autoResizeTextarea() {
        if (this.messageInput) {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        }
    }
    
    setupAccessibility() {
        if (this.messageInput) {
            this.messageInput.setAttribute('aria-label', this.t('chat.type_placeholder'));
            this.messageInput.setAttribute('placeholder', this.t('chat.type_placeholder'));
        }
        
        if (this.sendBtn) {
            this.sendBtn.setAttribute('aria-label', this.t('chat.send'));
        }
        
        if (this.emojiBtn) {
            this.emojiBtn.setAttribute('aria-label', 'Open emoji picker');
        }
    }
    
    // ==================== Event Bindings ====================
    
    bindEvents() {
        // 发送按钮 - 使用防抖防止重复点击
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[SupportChat] Send button clicked');
                this.sendMessage();
            });
        }
        
        // 输入框事件
        if (this.messageInput) {
            // 使用 keydown 而不是 keypress 以获得更好的控制
            this.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[SupportChat] Enter key pressed');
                    this.sendMessage();
                }
            });
            
            this.messageInput.addEventListener('input', () => {
                this.startTyping();
                this.autoResizeTextarea();
            });
        }
        
        // 附件按钮
        if (this.attachBtn && this.fileInput) {
            this.attachBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.fileInput.click();
            });
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        
        // 粘贴事件
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // 表情按钮
        if (this.emojiBtn) {
            const oldHandler = this.emojiBtn._clickHandler;
            if (oldHandler) {
                this.emojiBtn.removeEventListener('click', oldHandler);
            }
            
            const emojiBtnHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[SupportChat] Emoji button clicked');
                this.toggleEmojiPicker();
            };
            
            this.emojiBtn.addEventListener('click', emojiBtnHandler);
            this.emojiBtn._clickHandler = emojiBtnHandler;
        }
        
        // 点击其他地方关闭表情选择器
        document.addEventListener('click', (e) => {
            if (this.emojiPicker && 
                this.emojiBtn && 
                !this.emojiPicker.contains(e.target) && 
                e.target !== this.emojiBtn &&
                !this.emojiBtn.contains(e.target)) {
                this.hideEmojiPicker();
            }
        });
        
        // 窗口获得焦点时标记消息已读
        window.addEventListener('focus', () => {
            this.markMessagesAsRead();
        });
        
        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.markMessagesAsRead();
                this.refreshMessages();
            }
        });
        
        // 清理
        window.addEventListener('beforeunload', () => {
            if (this.socket) {
                this.socket.disconnect();
            }
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }
            if (this.unreadPollingInterval) {
                clearInterval(this.unreadPollingInterval);
            }
        });
        
        console.log('[SupportChat] All events bound successfully');
    }
    
    // ==================== Utility Methods ====================
    
    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    isNearBottom() {
        if (!this.messagesContainer) return true;
        return this.messagesContainer.scrollHeight - 
               this.messagesContainer.scrollTop - 
               this.messagesContainer.clientHeight < this.config.scrollThreshold;
    }
    
    showLoading() {
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = `
                <div class="loading-message">
                    <div class="loading-spinner"></div>
                    <span>${this.t('common.loading')}</span>
                </div>
            `;
        }
    }
    
    showError(message) {
        const toast = this.createToast(message, 'error');
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    showTemporarySuccess(message) {
        const toast = this.createToast(message, 'success');
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 2000);
        }, 2000);
    }
    
    createToast(message, type = 'info') {
        const toast = document.createElement('div');
        const colors = {
            error: '#f97316',
            success: '#10b981',
            info: '#3b82f6'
        };
        
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type]};
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: fadeInUp 0.3s ease;
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 90%;
            text-align: center;
            pointer-events: none;
        `;
        
        toast.textContent = message;
        return toast;
    }
    
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// 添加 CSS 样式（保持与之前相同）
if (!document.getElementById('support-chat-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'support-chat-styles';
    styleElement.textContent = `
        .emoji-picker {
            position: absolute;
            bottom: 70px;
            left: 20px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
            width: 360px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 10000;
            border: 1px solid #e5e7eb;
            display: none;
        }
        
        .emoji-category {
            padding: 12px;
            border-bottom: 1px solid #f3f4f6;
        }
        
        .emoji-category-title {
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            display: block;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        
        .emoji-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .emoji-item {
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
        }
        
        .emoji-item:hover {
            background: #f3f4f6;
            transform: scale(1.1);
        }
        
        .emoji-picker-close {
            position: sticky;
            bottom: 0;
            width: 100%;
            background: white;
            border: none;
            border-top: 1px solid #e5e7eb;
            padding: 10px;
            cursor: pointer;
        }
        
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            scroll-behavior: smooth;
            background: #f9fafb;
        }
        
        .message {
            margin-bottom: 16px;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .user-message {
            display: flex;
            justify-content: flex-end;
        }
        
        .user-message .message-bubble {
            background: #f97316;
            color: white;
            border-radius: 18px 18px 4px 18px;
        }
        
        .admin-message {
            display: flex;
            justify-content: flex-start;
        }
        
        .admin-message .message-bubble {
            background: white;
            color: #1f2937;
            border-radius: 18px 18px 18px 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        
        .message-bubble {
            max-width: 70%;
            padding: 10px 14px;
            word-wrap: break-word;
        }
        
        .message-content {
            line-height: 1.4;
            white-space: pre-wrap;
        }
        
        .message-time {
            font-size: 10px;
            margin-top: 6px;
            opacity: 0.7;
            text-align: right;
        }
        
        .chat-input-area {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            padding: 16px 20px;
            background: white;
            border-top: 1px solid #e5e7eb;
        }
        
        .chat-input {
            flex: 1;
            border: 1px solid #e5e7eb;
            border-radius: 24px;
            padding: 10px 16px;
            font-size: 14px;
            resize: none;
            font-family: inherit;
            max-height: 120px;
        }
        
        .chat-input:focus {
            outline: none;
            border-color: #f97316;
        }
        
        .attach-btn, .emoji-btn, .send-btn {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #6b7280;
            padding: 8px;
            border-radius: 50%;
            transition: all 0.2s;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .attach-btn:hover, .emoji-btn:hover {
            background: #f3f4f6;
            color: #f97316;
        }
        
        .send-btn {
            background: #f97316;
            color: white;
        }
        
        .send-btn:hover:not(:disabled) {
            background: #ea580c;
        }
        
        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .typing-indicator {
            padding: 8px 20px;
            font-size: 12px;
            color: #9ca3af;
            font-style: italic;
        }
        
        .loading-message {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 40px;
        }
        
        .loading-spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #e5e7eb;
            border-top-color: #f97316;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .status-online {
            color: #10b981;
            position: relative;
            padding-left: 12px;
        }
        
        .status-online::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
        }
        
        .status-offline {
            color: #ef4444;
            position: relative;
            padding-left: 12px;
        }
        
        .status-offline::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 8px;
            background: #ef4444;
            border-radius: 50%;
        }
        
        @media (max-width: 768px) {
            .emoji-picker {
                width: 300px;
                left: 10px;
                bottom: 65px;
            }
            
            .message-bubble {
                max-width: 85%;
            }
            
            .emoji-item {
                width: 38px;
                height: 38px;
                font-size: 24px;
            }
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
        
        .file-attachment {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(0,0,0,0.05);
            border-radius: 8px;
            margin: 8px 0 4px;
        }
        
        .image-attachment {
            margin: 8px 0;
        }
        
        .image-attachment img {
            max-width: 200px;
            max-height: 150px;
            border-radius: 8px;
            cursor: pointer;
        }
        
        .file-link {
            color: #f97316;
            text-decoration: none;
        }
        
        .empty-message {
            text-align: center;
            color: #9ca3af;
            padding: 40px 20px;
        }
        
        .empty-icon {
            font-size: 48px;
            display: block;
            margin-bottom: 12px;
        }
    `;
    document.head.appendChild(styleElement);
}

// 初始化
let supportChatInstance = null;

function initSupportChat() {
    if (document.getElementById('messagesContainer') && !supportChatInstance) {
        console.log('[SupportChat] Creating new instance...');
        supportChatInstance = new SupportChat();
        window.supportChat = supportChatInstance;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupportChat);
} else {
    initSupportChat();
}

window.SupportChat = SupportChat;