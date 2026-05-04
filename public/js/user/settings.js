/**
 * FOOTRADAPRO - 設置頁面控制器
 * @description 管理系統設置、偏好選項等
 * Version: 2.0 - SPA 架构适配 + 完整按钮逻辑
 */

(function() {
    'use strict';

    const DOM = {
        themeToggle: document.getElementById('themeToggle'),
        privacyToggle: document.getElementById('privacyToggle'),
        notificationToggle: document.getElementById('notificationToggle'),
        currentLang: document.getElementById('currentLang'),
        logoutBtn: document.getElementById('logoutBtn'),
        testModeBadge: document.getElementById('testModeBadge'),
        payPasswordStatus: document.getElementById('payPasswordStatus'),
        payPasswordDesc: document.getElementById('payPasswordDesc'),
        modeBadge: document.getElementById('modeBadge'),
        changePasswordBtn: document.getElementById('changePasswordBtn'),
        setPayPasswordBtn: document.getElementById('setPayPasswordBtn')
    };

    // 防止重复初始化
    let isInitialized = false;

    // 初始化
    async function init() {
        if (isInitialized) {
            console.log('设置页面已初始化，跳过');
            return;
        }
        
        console.log('🚀 初始化设置页面控制器...');
        
        // 等待 ThemeManager 初始化
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ 設置頁面 ThemeManager 初始化完成，當前模式:', ThemeManager.isTestMode ? '測試' : '真實');
            
            // 更新測試模式徽章
            updateTestModeBadge(ThemeManager.isTestMode);
            
            // 更新模式徽章（新样式）
            updateModeBadge(ThemeManager.isTestMode);
            
            // 加載支付密碼狀態
            await loadPayPasswordStatus();
        }

        // 初始化各項設置
        initThemeToggle();
        initPrivacyToggle();
        initNotificationToggle();
        initLanguageSelector();
        initLogout();
        initButtons();
        
        // 監聽模式變化
        if (window.ThemeManager) {
            ThemeManager.addListener((state) => {
                console.log('🎨 設置頁面收到模式變化:', state);
                updateTestModeBadge(state.isTestMode);
                updateModeBadge(state.isTestMode);
                loadPayPasswordStatus();
            });
        }
        
        // 监听主题变化事件
        window.addEventListener('themechange', function(e) {
            console.log('主题变化:', e.detail);
        });
        
        // 监听隐私模式变化
        window.addEventListener('privacychange', function(e) {
            console.log('隐私模式变化:', e.detail);
        });
        
        // 监听语言变化
        window.addEventListener('languageChanged', function(e) {
            console.log('语言变化:', e.detail);
        });
        
        isInitialized = true;
        console.log('✅ 设置页面控制器初始化完成');
    }

    // 更新測試模式徽章（原有逻辑）
    function updateTestModeBadge(isTestMode) {
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
    }
    
    // 更新模式徽章（新样式）
    function updateModeBadge(isTestMode) {
        if (DOM.modeBadge) {
            DOM.modeBadge.className = `mode-badge ${isTestMode ? 'sandbox' : 'live'}`;
            DOM.modeBadge.innerHTML = isTestMode 
                ? '<i class="fas fa-flask"></i><span>Sandbox Mode</span>'
                : '<i class="fas fa-bolt"></i><span>Live Mode</span>';
        }
    }

    // 初始化主題切換（原有逻辑 + 增强）
    function initThemeToggle() {
        if (!DOM.themeToggle) return;

        // 設置初始狀態 - 从 localStorage 或 body 属性读取
        const savedTheme = localStorage.getItem('theme');
        const bodyTheme = document.body.getAttribute('data-theme');
        let currentTheme = savedTheme || bodyTheme || 'dark';
        
        // 同步到 body 类
        if (currentTheme === 'light') {
            document.body.classList.remove('dark');
            DOM.themeToggle.checked = true;
        } else {
            document.body.classList.add('dark');
            DOM.themeToggle.checked = false;
        }
        
        // 同步到 body 属性
        document.body.setAttribute('data-theme', currentTheme);

        DOM.themeToggle.addEventListener('change', function() {
            const newTheme = this.checked ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // 更新 body 类
            if (newTheme === 'light') {
                document.body.classList.remove('dark');
            } else {
                document.body.classList.add('dark');
            }
            
            // 同步到 ThemeManager
            if (window.ThemeManager) {
                window.ThemeManager.setTheme(newTheme);
            }
            
            // 觸發主題變化事件
            window.dispatchEvent(new CustomEvent('themechange', {
                detail: { theme: newTheme }
            }));
            
            console.log('主题已切换:', newTheme);
        });
    }

    // 初始化隱私模式（原有逻辑）
    function initPrivacyToggle() {
        if (!DOM.privacyToggle) return;

        // 從 localStorage 讀取狀態
        const isPrivacyMode = localStorage.getItem('privacy_mode') === 'true';
        DOM.privacyToggle.checked = isPrivacyMode;

        DOM.privacyToggle.addEventListener('change', function() {
            localStorage.setItem('privacy_mode', this.checked);
            
            // 觸發隱私模式變化事件
            window.dispatchEvent(new CustomEvent('privacychange', {
                detail: { isPrivacyMode: this.checked }
            }));
            
            console.log('隐私模式:', this.checked ? '开启' : '关闭');
        });
    }

    // 初始化通知開關（原有逻辑）
    function initNotificationToggle() {
        if (!DOM.notificationToggle) return;

        // 從 localStorage 讀取狀態，默認為 true
        const notificationsEnabled = localStorage.getItem('notifications_enabled') !== 'false';
        DOM.notificationToggle.checked = notificationsEnabled;

        DOM.notificationToggle.addEventListener('change', function() {
            localStorage.setItem('notifications_enabled', this.checked);
            
            // 可以在此處調用後端 API 更新通知設置
            console.log('通知設置已更新:', this.checked ? '开启' : '关闭');
        });
    }

    // 初始化語言選擇器（原有逻辑）
    function initLanguageSelector() {
        if (!DOM.currentLang) return;

        // 從 localStorage 讀取語言設置，默認為英文
        const savedLang = localStorage.getItem('preferred_lang') || 'en';
        const langMap = {
            'en': 'English',
            'zh': '中文',
            'es': 'Español',
            'ja': '日本語'
        };
        
        // 更新显示文本
        const currentLangSpan = DOM.currentLang.querySelector('span');
        if (currentLangSpan) {
            currentLangSpan.textContent = langMap[savedLang] || 'English';
        } else {
            DOM.currentLang.textContent = langMap[savedLang] || 'English';
        }

        DOM.currentLang.addEventListener('click', function() {
            showLanguageModal();
        });
    }

    // 顯示語言選擇模態框（原有逻辑 + 样式优化）
    function showLanguageModal() {
        const languages = [
            { code: 'en', name: 'English', flag: '🇬🇧' },
            { code: 'zh', name: '中文', flag: '🇨🇳' },
            { code: 'es', name: 'Español', flag: '🇪🇸' },
            { code: 'ja', name: '日本語', flag: '🇯🇵' }
        ];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        `;

        modal.innerHTML = `
            <div style="
                background: var(--card-bg, #151A28);
                backdrop-filter: blur(24px);
                border-radius: 28px;
                max-width: 320px;
                width: 90%;
                padding: 24px;
                border: 1px solid var(--glass-border, #333);
                box-shadow: 0 20px 35px -12px rgba(0,0,0,0.3);
            ">
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: var(--text-primary, white);">選擇語言</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${languages.map(lang => `
                        <button class="lang-option" data-lang="${lang.code}" style="
                            width: 100%;
                            padding: 12px 16px;
                            background: transparent;
                            border: 1px solid var(--border-light, #333);
                            border-radius: 16px;
                            color: var(--text-primary, white);
                            font-size: 14px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            transition: all 0.2s;
                        ">
                            <span style="font-size: 20px;">${lang.flag}</span>
                            <span>${lang.name}</span>
                        </button>
                    `).join('')}
                </div>
                <button id="closeLangModal" style="
                    width: 100%;
                    padding: 12px;
                    margin-top: 16px;
                    background: transparent;
                    border: 1px solid var(--border-light, #333);
                    border-radius: 40px;
                    color: var(--text-muted, #94A3B8);
                    font-weight: 600;
                    cursor: pointer;
                ">取消</button>
            </div>
        `;

        document.body.appendChild(modal);

        // 添加动画样式
        if (!document.querySelector('#modal-animation-style')) {
            const style = document.createElement('style');
            style.id = 'modal-animation-style';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // 綁定語言選項點擊事件
        modal.querySelectorAll('.lang-option').forEach(btn => {
            btn.addEventListener('click', function() {
                const langCode = this.dataset.lang;
                const langMap = {
                    'en': 'English',
                    'zh': '中文',
                    'es': 'Español',
                    'ja': '日本語'
                };
                
                localStorage.setItem('preferred_lang', langCode);
                
                // 更新显示
                const currentLangSpan = DOM.currentLang?.querySelector('span');
                if (currentLangSpan) {
                    currentLangSpan.textContent = langMap[langCode] || 'English';
                } else if (DOM.currentLang) {
                    DOM.currentLang.textContent = langMap[langCode] || 'English';
                }
                
                modal.remove();
                
                // 觸發語言變化事件
                window.dispatchEvent(new CustomEvent('languageChanged', {
                    detail: { language: langCode }
                }));
            });
        });

        // 关闭按钮
        const closeBtn = document.getElementById('closeLangModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }
        
        // 点击背景关闭
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    // 初始化退出登錄（原有逻辑 + 增强）
    function initLogout() {
        if (!DOM.logoutBtn) return;

        DOM.logoutBtn.addEventListener('click', async function() {
            const confirmed = confirm('Are you sure you want to logout?');
            if (confirmed) {
                // 清除本地存儲的認證信息
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                localStorage.removeItem('footradapro_token');
                
                // 調用後端登出接口
                try {
                    await fetch('/api/v1/user/logout', {
                        method: 'POST',
                        credentials: 'include'
                    });
                } catch (err) {
                    console.error('Logout API error:', err);
                }
                
                // 跳转到登录页
                window.location.href = '/login.html';
            }
        });
    }

    // ========== 新增：初始化按钮跳转 ==========
    function initButtons() {
        // Change Password 按钮 - 跳转到修改密码页面
        if (DOM.changePasswordBtn) {
            DOM.changePasswordBtn.addEventListener('click', function() {
                window.location.href = '/shell.html?page=change-password';
            });
        }
        
        // Set Payment Password 按钮 - 跳转到设置支付密码页面
        if (DOM.setPayPasswordBtn) {
            DOM.setPayPasswordBtn.addEventListener('click', function() {
                const isTestMode = window.ThemeManager ? window.ThemeManager.isTestMode : false;
                if (isTestMode) {
                    alert('Payment password is not required in test mode. Please switch to Live Mode.');
                    return;
                }
                window.location.href = '/shell.html?page=set-paypassword&mode=change&from=settings';
            });
        }
    }

    // 加載支付密碼狀態（原有逻辑 + 增强）
    async function loadPayPasswordStatus() {
        try {
            const res = await fetch('/api/v1/user/profile/paypassword/status', {
                credentials: 'include'
            });
            const data = await res.json();

            if (data.success && DOM.payPasswordStatus) {
                const hasPayPassword = data.data.has_paypassword;
                const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
                
                if (isTestMode) {
                    DOM.payPasswordStatus.textContent = 'N/A';
                    DOM.payPasswordStatus.style.color = '#6b7280';
                    DOM.payPasswordStatus.className = 'badge neutral';
                    if (DOM.payPasswordDesc) {
                        DOM.payPasswordDesc.textContent = 'Not required in test mode';
                    }
                } else {
                    DOM.payPasswordStatus.textContent = hasPayPassword ? 'Set' : 'Not Set';
                    DOM.payPasswordStatus.style.color = hasPayPassword ? '#10b981' : '#f59e0b';
                    DOM.payPasswordStatus.className = hasPayPassword ? 'badge success' : 'badge warning';
                    if (DOM.payPasswordDesc) {
                        DOM.payPasswordDesc.textContent = hasPayPassword ? 'Used for withdrawals' : 'Required for withdrawals';
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load paypassword status:', err);
            if (DOM.payPasswordStatus) {
                DOM.payPasswordStatus.textContent = 'Error';
                DOM.payPasswordStatus.style.color = '#ef4444';
            }
        }
    }

    // 暴露初始化函数供 SPA 调用
    window.initSettings = init;
    
    // 自动初始化（如果是直接加载）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();