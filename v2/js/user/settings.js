/**
 * FOOTRADAPRO - 設置頁面控制器
 * @description 管理系統設置、偏好選項等
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
        payPasswordDesc: document.getElementById('payPasswordDesc')
    };

    // 初始化
    document.addEventListener('DOMContentLoaded', async function() {
        // 等待 ThemeManager 初始化
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ 設置頁面 ThemeManager 初始化完成，當前模式:', ThemeManager.isTestMode ? '測試' : '真實');
            
            // 更新測試模式徽章
            updateTestModeBadge(ThemeManager.isTestMode);
            
            // 加載支付密碼狀態
            await loadPayPasswordStatus();
        }

        // 初始化各項設置
        initThemeToggle();
        initPrivacyToggle();
        initNotificationToggle();
        initLanguageSelector();
        initLogout();
        
        // 監聽模式變化
        if (window.ThemeManager) {
            ThemeManager.addListener((state) => {
                console.log('🎨 設置頁面收到主題變化:', state);
                updateTestModeBadge(state.isTestMode);
                loadPayPasswordStatus();
            });
        }
    });

    // 更新測試模式徽章
    function updateTestModeBadge(isTestMode) {
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
    }

    // 初始化主題切換
    function initThemeToggle() {
        if (!DOM.themeToggle) return;

        // 設置初始狀態
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        DOM.themeToggle.checked = currentTheme === 'light';

        DOM.themeToggle.addEventListener('change', function() {
            const newTheme = this.checked ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // 觸發主題變化事件
            window.dispatchEvent(new CustomEvent('themechange', {
                detail: { theme: newTheme }
            }));
        });
    }

    // 初始化隱私模式
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
        });
    }

    // 初始化通知開關
    function initNotificationToggle() {
        if (!DOM.notificationToggle) return;

        // 從 localStorage 讀取狀態，默認為 true
        const notificationsEnabled = localStorage.getItem('notifications_enabled') !== 'false';
        DOM.notificationToggle.checked = notificationsEnabled;

        DOM.notificationToggle.addEventListener('change', function() {
            localStorage.setItem('notifications_enabled', this.checked);
            
            // 可以在此處調用後端 API 更新通知設置
            console.log('通知設置已更新:', this.checked);
        });
    }

    // 初始化語言選擇器
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
        DOM.currentLang.textContent = langMap[savedLang] || 'English';

        DOM.currentLang.addEventListener('click', function() {
            showLanguageModal();
        });
    }

    // 顯示語言選擇模態框
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
        `;

        modal.innerHTML = `
            <div style="
                background: #151A28;
                border-radius: 24px;
                max-width: 320px;
                width: 90%;
                padding: 24px;
                border: 1px solid #333;
            ">
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: white;">選擇語言</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${languages.map(lang => `
                        <button class="lang-option" data-lang="${lang.code}" style="
                            width: 100%;
                            padding: 12px 16px;
                            background: transparent;
                            border: 1px solid #333;
                            border-radius: 12px;
                            color: white;
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
                <button onclick="this.closest('.modal-overlay').remove()" style="
                    width: 100%;
                    padding: 12px;
                    margin-top: 16px;
                    background: transparent;
                    border: 1px solid #333;
                    border-radius: 40px;
                    color: #94A3B8;
                    font-weight: 600;
                    cursor: pointer;
                ">取消</button>
            </div>
        `;

        document.body.appendChild(modal);

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
                DOM.currentLang.textContent = langMap[langCode] || 'English';
                
                modal.remove();
                
                // 觸發語言變化事件
                window.dispatchEvent(new CustomEvent('languageChanged', {
                    detail: { language: langCode }
                }));
            });
        });

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    // 初始化退出登錄
    function initLogout() {
        if (!DOM.logoutBtn) return;

        DOM.logoutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout?')) {
                // 清除本地存儲的認證信息
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                
                // 調用後端登出接口
                fetch('/api/v1/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                }).finally(() => {
                    window.location.href = '/login.html';
                });
            }
        });
    }

    // 加載支付密碼狀態
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
                    if (DOM.payPasswordDesc) {
                        DOM.payPasswordDesc.textContent = 'Not required in test mode';
                    }
                } else {
                    DOM.payPasswordStatus.textContent = hasPayPassword ? 'Set' : 'Not Set';
                    DOM.payPasswordStatus.style.color = hasPayPassword ? '#10b981' : '#f59e0b';
                }
            }
        } catch (err) {
            console.error('Failed to load paypassword status:', err);
        }
    }
})();