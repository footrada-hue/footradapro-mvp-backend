/**
 * FOOTRADAPRO MVP 全局配置文件
 * 适用范围：所有前端页面，统一管理项目常量、路由、业务规则、工具函数
 * @version 1.0.0
 * 修改：移除主题切换功能，避免与 HTML 中的主題切換衝突
 */

;(function(window) {
    'use strict';

    // ====================== 1. 环境与API核心配置 ======================
    const ENV_CONFIG = {
        // 当前环境：dev 开发环境 | prod 生产环境
        env: 'dev',
        // 版本号，用于静态资源缓存更新
        version: '1.0.0',
        // API基础地址，开发/生产一键切换
        apiBaseUrl: {
            dev: 'http://localhost:3000/api/v1',
            prod: 'https://api.footradapro.com/api/v1'
        },
        // API请求超时时间（毫秒）
        requestTimeout: 10000,
        // 本地存储key前缀
        storagePrefix: 'footradapro_'
    };

    // ====================== 2. 品牌全局配置 ======================
    const BRAND_CONFIG = {
        appName: 'FOOTRADAPRO',
        fullName: 'FOOTRADAPRO - Football Trading System',
        slogan: 'AI-Powered · Rule-Locked · Tamper-Proof',
        domain: 'footradapro.com',
        officialSite: 'https://footradapro.com',
        supportEmail: 'support@footradapro.com',
        socialLinks: {
            telegram: 'https://t.me/footradapro_official',
            twitter: 'https://x.com/FOOTRADAPRO'
        }
    };

    // ====================== 3. 页面路由配置 ======================
    const ROUTES_CONFIG = {
        home: '/index.html',
        login: '/login.html',
        register: '/register.html',
        matchMarket: '/match-market.html',
        wallet: '/wallet.html',
        result: '/result.html',
        admin: {
            dashboard: '/admin/dashboard.html',
            matches: '/admin/matches.html'
        }
    };

    // ====================== 4. 主题与UI配置 ======================
    // 注意：主題切換功能已移至各頁面獨立管理，避免衝突
    const THEME_CONFIG = {
        defaultTheme: 'dark',
        storageKey: `${ENV_CONFIG.storagePrefix}theme`,
        cssVars: {
            dark: {
                '--bg-primary': '#0B0E11',
                '--bg-secondary': '#07090B',
                '--surface-primary': '#15181E',
                '--surface-secondary': '#1E222A',
                '--text-primary': '#FFFFFF',
                '--text-secondary': '#B0B8C4',
                '--accent-500': '#FF7A00',
                '--success-500': '#00E68A',
                '--warning-500': '#FFC107',
                '--danger-500': '#FF4D4F'
            },
            light: {
                '--bg-primary': '#F8FAFC',
                '--bg-secondary': '#F1F5F9',
                '--surface-primary': '#FFFFFF',
                '--surface-secondary': '#F8FAFC',
                '--text-primary': '#0F172A',
                '--text-secondary': '#475569',
                '--accent-500': '#FF7A00',
                '--success-500': '#00E68A',
                '--warning-500': '#FFC107',
                '--danger-500': '#FF4D4F'
            }
        }
    };

    // ====================== 5. 用户状态配置 ======================
    const USER_CONFIG = {
        storageKey: `${ENV_CONFIG.storagePrefix}user`,
        defaultBalance: 100.00
    };

    // ====================== 6. 核心业务常量 ======================
    const BUSINESS_CONSTANTS = {
        MATCH_STATUS: {
            UPCOMING: 'upcoming',
            LIVE: 'live',
            FINISHED: 'finished',
            SETTLED: 'settled'
        },
        BET_STATUS: {
            PENDING: 'pending',
            WON: 'won',
            LOST: 'lost'
        },
        BET_SELECTION: {
            HOME: 'home',
            DRAW: 'draw',
            AWAY: 'away'
        },
        CUTOFF_MINUTES: 5
    };

    // ====================== 7. 功能开关配置 ======================
    const FEATURE_FLAGS = {
        liveChat: false,
        twoFactorAuth: false,
        fundPassword: false,
        withdrawal: false,
        videoTutorials: false,
        referralProgram: false,
        vipProgram: false
    };

    // ====================== 8. 第三方服务配置 ======================
    const THIRD_PARTY_CONFIG = {
        tawkTo: { propertyId: '', widgetId: '', triggerBtnId: '' },
        googleAnalytics: { measurementId: '' },
        turnstile: {
            siteKey: '0x4AAAAAACoXtOC1lSON-7nw'
        }
    };

    // ====================== 9. 安全配置 ======================
    const SECURITY_CONFIG = {
        password: {
            minLength: 6
        },
        login: {
            maxFailedAttempts: 5,
            lockDuration: 30 * 60 * 1000
        }
    };

    // ====================== 10. 全局通用工具函数 ======================
    const UTILS = {
        formatAmount: function(amount) {
            return parseFloat(amount || 0).toFixed(2);
        },

        formatDateTime: function(dateString) {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid Date';
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        formatRelativeTime: function(dateString) {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid Date';
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString('en-US');
        },

        getUrlParam: function(name) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(name);
        },

        setStorage: function(key, value) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            try {
                localStorage.setItem(fullKey, JSON.stringify(value));
            } catch (err) {
                console.error('Storage error:', err);
            }
        },

        getStorage: function(key, defaultValue = null) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            try {
                const value = localStorage.getItem(fullKey);
                return value ? JSON.parse(value) : defaultValue;
            } catch (err) {
                return defaultValue;
            }
        },

        removeStorage: function(key) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            localStorage.removeItem(fullKey);
        },

        // ========== 主題切換功能已禁用，避免與 HTML 中的主題切換衝突 ==========
        // 主題切換功能現由各頁面獨立管理（register.html 中的主題切換腳本）
        // 如需在其他頁面使用主題切換，請參考 register.html 中的實現
        
        getApiBaseUrl: function() {
            return ENV_CONFIG.apiBaseUrl[ENV_CONFIG.env];
        },

        request: async function(endpoint, options = {}) {
            const baseUrl = UTILS.getApiBaseUrl();
            const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
            
            const defaultOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Version': ENV_CONFIG.version
                },
                credentials: 'include',
                timeout: ENV_CONFIG.requestTimeout
            };

            const config = { ...defaultOptions, ...options };
            
            const token = UTILS.getStorage('token');
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }

            try {
                const response = await fetch(url, config);
                const data = await response.json();
                
                if (!response.ok) {
                    if (response.status === 401) {
                        console.warn('Session expired');
                    }
                    throw new Error(data.error || 'Request failed');
                }
                
                return data;
            } catch (err) {
                console.error('API Error:', err);
                throw err;
            }
        },

        isLoggedIn: function() {
            return document.cookie.includes('footradapro.sid');
        },

        logout: async function() {
            try {
                await UTILS.request('/auth/logout', { method: 'POST' });
                window.location.href = '/login.html';
            } catch (err) {
                console.error('Logout error:', err);
                window.location.href = '/login.html';
            }
        }
    };

    window.FOOTRADAPRO = {
        ENV: ENV_CONFIG,
        BRAND: BRAND_CONFIG,
        ROUTES: ROUTES_CONFIG,
        THEME: THEME_CONFIG,
        USER: USER_CONFIG,
        CONSTANTS: BUSINESS_CONSTANTS,
        FEATURES: FEATURE_FLAGS,
        SECURITY: SECURITY_CONFIG,
        THIRD_PARTY: THIRD_PARTY_CONFIG,
        UTILS: UTILS
    };

    window.FOOTRADAPRO_CONFIG = window.FOOTRADAPRO;

    // ========== DOMContentLoaded 事件 ==========
    // 註釋掉主題相關的初始化，避免與 HTML 中的主題切換衝突
    document.addEventListener('DOMContentLoaded', function() {
        // 主題切換功能已禁用，由各頁面獨立管理
        // 如需主題切換功能，請在頁面中添加獨立的主題切換腳本
        
        // 保留其他功能
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => window.history.back());
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                UTILS.logout();
            });
        }
    });

})(window);