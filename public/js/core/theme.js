/**
 * FOOTRADAPRO - 全局主題切換核心
 * 統一管理深色/淺色主題 + 測試/實盤模式
 */

const ThemeManager = {
    // 状态
    isTestMode: false,
    testBalance: 10000,
    isDarkMode: false,
    initialized: false,
    
    // 监听器
    listeners: [],
    themeListeners: [],
    
    // ========== 初始化 ==========
    async init(forceRefresh = false, silent = false) {
        if (this.initialized && !forceRefresh) {
            return this;
        }

        // 1. 初始化深色/浅色主题
        this.initTheme();
        
        // 2. 从后端获取模式
        await this.fetchModeFromServer(silent);
        
        // 3. 应用所有样式
        this.applyAllStyles();
        
        this.initialized = true;
        return this;
    },
    
    // 初始化深色/浅色主题（从 localStorage）
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.isDarkMode = savedTheme === 'dark';
        this.applyThemeToDOM();
        
        // 监听其他标签页的主题变化
        window.addEventListener('themechange', (e) => {
            const { isDarkMode } = e.detail;
            if (this.isDarkMode !== isDarkMode) {
                this.isDarkMode = isDarkMode;
                this.applyThemeToDOM();
                this.notifyThemeListeners();
            }
        });
    },
    
    // 从后端获取模式
    async fetchModeFromServer(silent) {
        try {
            const res = await APIClient.get('/api/v1/user/mode');
            
            if (!res.ok) {
                if (res.status === 401) {
                    console.warn('⚠️ 未授權，使用本地緩存');
                    this.loadFromCache();
                    return;
                }
                throw new Error(`HTTP ${res.status}`);
            }
            
            const data = await res.json();
            if (data.success) {
                this.isTestMode = data.data.is_test_mode === true;
                this.testBalance = data.data.test_balance || 10000;
                this.updateCache();
                
                if (!silent) {
                    console.log(`🎨 模式: ${this.isTestMode ? '測試模式' : '真實模式'}`);
                }
            }
        } catch (err) {
            console.error('❌ 獲取模式失敗:', err);
            this.loadFromCache();
        }
    },
    
    loadFromCache() {
        const cached = localStorage.getItem('footradapro_theme_cache');
        if (cached) {
            try {
                const { isTestMode, testBalance } = JSON.parse(cached);
                this.isTestMode = isTestMode;
                this.testBalance = testBalance || 10000;
            } catch(e) {}
        } else {
            this.isTestMode = true;
            this.testBalance = 10000;
        }
    },
    
    updateCache() {
        localStorage.setItem('footradapro_theme_cache', JSON.stringify({
            isTestMode: this.isTestMode,
            testBalance: this.testBalance,
            timestamp: Date.now()
        }));
    },
    
    // ========== 应用所有样式 ==========
    applyAllStyles() {
        this.applyThemeToDOM();      // 深色/浅色
        this.applyModeStyles();      // 测试/实盘颜色
    },
    
    // 应用深色/浅色主题到 DOM
    applyThemeToDOM() {
        if (this.isDarkMode) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
        
        // 更新按钮图标
        const themeIcon = document.getElementById('themeToggle');
        if (themeIcon) {
            if (this.isDarkMode) {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
            } else {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
            }
        }
    },
    
    // 应用模式样式（测试/实盘颜色）- 只管理类，不设置 inline style
    applyModeStyles() {
        if (this.isTestMode) {
            // 测试模式 - 紫色系
            document.body.classList.add('test-mode');
            document.body.classList.remove('live-mode');
            document.documentElement.classList.add('test-mode');
            document.documentElement.classList.remove('live-mode');
        } else {
            // 实盘模式 - 橙色系
            document.body.classList.add('live-mode');
            document.body.classList.remove('test-mode');
            document.documentElement.classList.add('live-mode');
            document.documentElement.classList.remove('test-mode');
        }
        
        this.notifyListeners();
    },
    
    // ========== 深色/浅色主题切换 ==========
    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        const newTheme = this.isDarkMode ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        this.applyThemeToDOM();
        
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { isDarkMode: this.isDarkMode, theme: newTheme }
        }));
        
        this.notifyThemeListeners();
        
        if (window.StateSync) {
            window.StateSync.broadcastTheme(newTheme);
        }
        
        console.log(`🎨 主題已切換: ${newTheme}`);
        return newTheme;
    },
    
    // ========== 测试/实盘模式切换 ==========
    async toggleMode(silent = false) {
        try {
            const targetMode = !this.isTestMode;
            
            const res = await APIClient.post('/api/v1/user/mode/toggle', { is_test_mode: targetMode });
            
            if (!res.ok) {
                if (res.status === 401) {
                    console.warn('⚠️ 未授權，無法切換模式');
                    if (typeof window.showToast === 'function') {
                        window.showToast('請先登錄後再切換模式', 'warning');
                    }
                    return false;
                }
                throw new Error(`HTTP ${res.status}`);
            }
            
            const data = await res.json();
            
            if (data.success) {
                this.isTestMode = data.data.is_test_mode === true;
                this.testBalance = data.data.test_balance || 10000;
                this.updateCache();
                this.applyModeStyles();
                
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
    
    // ========== 监听器 ==========
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
        this.listeners.forEach(cb => { try { cb(state); } catch(e) {} });
    },
    
    addThemeListener(callback) {
        if (typeof callback === 'function') this.themeListeners.push(callback);
    },
    
    notifyThemeListeners() {
        const state = {
            isDarkMode: this.isDarkMode,
            theme: this.isDarkMode ? 'dark' : 'light'
        };
        this.themeListeners.forEach(cb => { try { cb(state); } catch(e) {} });
    },
    
    // ========== 工具方法 ==========
    getTheme() {
        return this.isDarkMode ? 'dark' : 'light';
    },
    
    getCurrency() {
        return this.isTestMode ? 'tUSDT' : 'USDT';
    },
    
    getModeName() {
        return this.isTestMode ? '測試模式' : '真實模式';
    }
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
    ThemeManager.init();
}

window.ThemeManager = ThemeManager;