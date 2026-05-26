/**
 * FOOTRADAPRO - 跨頁面狀態同步核心
 * 實現多標籤頁/多視窗的主題、模式、語言狀態同步
 */

const StateSync = (function() {
    'use strict';

    // 同步的事件類型
    const SYNC_EVENTS = {
        THEME: 'theme',
        LANGUAGE: 'language',
        MODE: 'mode'
    };

    // 初始化標記
    let initialized = false;

    // ========== 內部方法 ==========

    /**
     * 處理 storage 事件（跨標籤頁通信）
     */
    function handleStorageEvent(e) {
        const { key, newValue, oldValue } = e;
        
        // 只處理我們關心的 key
        if (!key || !key.startsWith('footradapro_')) return;
        
        console.log(`[StateSync] 檢測到 storage 變化: ${key}`, { oldValue, newValue });
        
        switch (key) {
            case 'theme':
                if (newValue && newValue !== oldValue) {
                    window.dispatchEvent(new CustomEvent('themechange', {
                        detail: { theme: newValue, isDarkMode: newValue === 'dark' }
                    }));
                }
                break;
                
            case 'footradapro_language':
                if (newValue && newValue !== oldValue) {
                    window.dispatchEvent(new CustomEvent('languagechange', {
                        detail: { language: newValue }
                    }));
                }
                break;
                
            case 'footradapro_theme_cache':
                // 模式變化（包含在 cache 中）
                if (newValue && oldValue) {
                    try {
                        const newData = JSON.parse(newValue);
                        const oldData = JSON.parse(oldValue);
                        if (newData.isTestMode !== oldData.isTestMode) {
                            window.dispatchEvent(new CustomEvent('modechange', {
                                detail: { 
                                    isTestMode: newData.isTestMode,
                                    testBalance: newData.testBalance,
                                    fromSync: true
                                }
                            }));
                        }
                    } catch (err) {
                        console.warn('[StateSync] 解析模式緩存失敗:', err);
                    }
                }
                break;
        }
    }

    /**
     * 廣播狀態變更到其他標籤頁
     */
    function broadcast(key, value) {
        try {
            // 直接寫入 localStorage 會觸發其他標籤頁的 storage 事件
            if (key === 'language') {
                localStorage.setItem('footradapro_language', value);
            } else if (key === 'theme') {
                localStorage.setItem('theme', value);
            }
            // 模式已經在 ThemeManager.updateCache() 中寫入 footradapro_theme_cache
        } catch (err) {
            console.warn('[StateSync] 廣播失敗:', err);
        }
    }

    /**
     * 初始化時同步其他標籤頁的最新狀態
     */
    function syncFromStorage() {
        // 同步主題
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme && ThemeManager) {
            const isDarkMode = savedTheme === 'dark';
            if (ThemeManager.isDarkMode !== isDarkMode) {
                ThemeManager.isDarkMode = isDarkMode;
                ThemeManager.applyThemeToDOM();
                ThemeManager.notifyThemeListeners();
            }
        }
        
        // 同步語言（由各頁面控制器自行處理，因為語言存儲在各自的控制器中）
        const savedLanguage = localStorage.getItem('footradapro_language') || localStorage.getItem('language');
        if (savedLanguage) {
            window.dispatchEvent(new CustomEvent('languagechange', {
                detail: { language: savedLanguage }
            }));
        }
        
        console.log('[StateSync] 已從 localStorage 同步初始狀態');
    }

    // ========== 公開 API ==========
    const publicAPI = {
        /**
         * 初始化同步服務
         */
        init: function() {
            if (initialized) return this;
            
            // 監聽 storage 事件（跨標籤頁）
            window.addEventListener('storage', handleStorageEvent);
            
            // 從其他標籤頁同步初始狀態
            syncFromStorage();
            
            initialized = true;
            console.log('[StateSync] 跨頁面同步服務已啟動');
            return this;
        },
        
        /**
         * 廣播主題變更
         */
        broadcastTheme: function(theme) {
            broadcast('theme', theme);
        },
        
        /**
         * 廣播語言變更
         */
        broadcastLanguage: function(language) {
            broadcast('language', language);
        },
        
        /**
         * 獲取同步事件類型
         */
        getEvents: function() {
            return { ...SYNC_EVENTS };
        },
        
        /**
         * 銷毀同步服務（用於測試或頁面卸載）
         */
        destroy: function() {
            window.removeEventListener('storage', handleStorageEvent);
            initialized = false;
            console.log('[StateSync] 跨頁面同步服務已停止');
        }
    };
    
    return publicAPI;
})();

// 自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StateSync.init());
} else {
    StateSync.init();
}

window.StateSync = StateSync;