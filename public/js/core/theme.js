/**
 * FOOTRADAPRO - 全局主題切換核心
 * 生產版本 - 以後端數據為準，localStorage僅用於提升體驗
 * 
 * 设计原则：
 * - 背景始终为深色
 * - 测试模式：蓝色强调色
 * - 真实模式：橙色强调色
 */

const ThemeManager = {
    isTestMode: false,
    testBalance: 10000,
    listeners: [],
    initialized: false,
    
    async init(forceRefresh = false, silent = false) {
        if (this.initialized && !forceRefresh) {
            return this;
        }

        try {
            const cached = localStorage.getItem('footradapro_theme_cache');
            if (cached && !forceRefresh) {
                const { isTestMode, testBalance } = JSON.parse(cached);
                this.isTestMode = isTestMode;
                this.testBalance = testBalance || 10000;
                this.applyTheme();
            }

            const res = await fetch('/api/v1/user/mode', {
                credentials: 'include',
                headers: { 
                    'Cache-Control': 'no-cache',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            
            const data = await res.json();
            
            if (data.success) {
                const newMode = data.data.is_test_mode === true;
                const newBalance = data.data.test_balance || 10000;
                
                if (this.isTestMode !== newMode || this.testBalance !== newBalance) {
                    this.isTestMode = newMode;
                    this.testBalance = newBalance;
                    this.applyTheme();
                    this.updateCache();
                }
                
                if (!silent) {
                    console.log(`🎨 主題初始化 [後端]: ${this.isTestMode ? '測試模式' : '真實模式'}`);
                }
            }
            
            this.initialized = true;
            
        } catch (err) {
            console.error('❌ 從後端獲取模式失敗:', err);
            if (!this.initialized) {
                const cached = localStorage.getItem('footradapro_theme_cache');
                if (cached) {
                    const { isTestMode, testBalance } = JSON.parse(cached);
                    this.isTestMode = isTestMode;
                    this.testBalance = testBalance || 10000;
                } else {
                    this.isTestMode = true;
                    this.testBalance = 10000;
                }
                this.applyTheme();
            }
        }
        
        window.addEventListener('modechange', (e) => {
            if (e.detail && e.detail.fromBackend) {
                this.isTestMode = e.detail.isTestMode === true;
                this.testBalance = e.detail.testBalance || 10000;
                this.applyTheme();
                this.updateCache();
            }
        });

        return this;
    },
    
    updateCache() {
        try {
            localStorage.setItem('footradapro_theme_cache', JSON.stringify({
                isTestMode: this.isTestMode,
                testBalance: this.testBalance,
                timestamp: Date.now()
            }));
        } catch (e) {}
    },
    
    async toggleMode(silent = false) {
        try {
            const targetMode = !this.isTestMode;
            
            const res = await fetch('/api/v1/user/mode/toggle', {
                method: 'POST',
                credentials: 'include',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ is_test_mode: targetMode })
            });
            
            const data = await res.json();
            
            if (data.success) {
                this.isTestMode = data.data.is_test_mode === true;
                this.testBalance = data.data.test_balance || 10000;
                this.applyTheme();
                this.updateCache();
                
                window.dispatchEvent(new CustomEvent('modechange', {
                    detail: { 
                        isTestMode: this.isTestMode,
                        testBalance: this.testBalance,
                        fromBackend: true,
                        silent: silent
                    }
                }));
                
                if (!silent) {
                    console.log(`✅ 已切換到${this.getModeName()}`);
                }
                
                return true;
            }
            return false;
        } catch (err) {
            console.error('❌ 切換模式失敗:', err);
            return false;
        }
    },
    
    applyTheme() {
        // ===== 始终使用深色主题 =====
        // 背景永远深色，不随模式改变
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.setAttribute('data-theme', 'dark');
        
        // 模式切换只改变强调色（通过 class）
        if (this.isTestMode) {
            document.documentElement.classList.add('test-mode');
            document.documentElement.classList.remove('live-mode');
            document.body.classList.add('test-mode');
            document.body.classList.remove('live-mode');
            
            document.documentElement.style.setProperty('--mode-color', '#5B8CFF');
            document.documentElement.style.setProperty('--mode-color-rgb', '91, 140, 255');
        } else {
            document.documentElement.classList.add('live-mode');
            document.documentElement.classList.remove('test-mode');
            document.body.classList.add('live-mode');
            document.body.classList.remove('test-mode');
            
            document.documentElement.style.setProperty('--mode-color', '#F7931A');
            document.documentElement.style.setProperty('--mode-color-rgb', '247, 147, 26');
        }

        this.notifyListeners();
    },
    
    getCurrency() {
        return this.isTestMode ? 'tUSDT' : 'USDT';
    },
    
    getModeName() {
        return this.isTestMode ? '測試模式' : '真實模式';
    },
    
    addListener(callback) {
        if (typeof callback === 'function') this.listeners.push(callback);
    },
    
    notifyListeners() {
        const state = {
            isTestMode: this.isTestMode,
            testBalance: this.testBalance,
            currency: this.getCurrency(),
            modeName: this.getModeName()
        };
        
        this.listeners.forEach(callback => {
            try { callback(state); } catch (err) {
                console.error('監聽器執行失敗:', err);
            }
        });
    }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init(false, false);
});

window.ThemeManager = ThemeManager;