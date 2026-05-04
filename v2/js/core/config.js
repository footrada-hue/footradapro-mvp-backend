/**
 * FOOTRADAPRO MVP 全局配置文件
 * 适用范围：所有前端页面，统一管理项目常量、路由、业务规则、工具函数
 * @version 1.0.1
 * @description 生产环境标准配置 - API 使用 www 主域名确保 Cookie 正常传递
 */

;(function(window) {
    'use strict';

    // ====================== 1. 环境与API核心配置 ======================
    const ENV_CONFIG = {
        // 当前环境：dev 开发环境 | prod 生产环境
        env: 'prod',
        // 版本号，用于静态资源缓存更新
        version: '1.0.1',
        // API基础地址，开发/生产一键切换
        // 注意：必须使用主域名 www.footradapro.com 而非 api 子域名，以确保 Cookie 正确传递
        apiBaseUrl: {
            dev: 'http://localhost:3000/api/v1',
            prod: 'https://www.footradapro.com/api/v1'
        },
        // API请求超时时间（毫秒）
        requestTimeout: 30000,
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
            matches: '/admin/matches.html',
            users: '/admin/users.html'
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
        /**
         * 格式化金额
         * @param {number} amount - 金额
         * @returns {string}
         */
        formatAmount: function(amount) {
            return parseFloat(amount || 0).toFixed(2);
        },

        /**
         * 格式化日期时间
         * @param {string} dateString - 日期字符串
         * @returns {string}
         */
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

        /**
         * 格式化相对时间
         * @param {string} dateString - 日期字符串
         * @returns {string}
         */
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

        /**
         * 获取 URL 参数
         * @param {string} name - 参数名
         * @returns {string|null}
         */
        getUrlParam: function(name) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(name);
        },

        /**
         * 设置本地存储
         * @param {string} key - 键名
         * @param {*} value - 值
         */
        setStorage: function(key, value) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            try {
                localStorage.setItem(fullKey, JSON.stringify(value));
            } catch (err) {
                console.error('Storage error:', err);
            }
        },

        /**
         * 获取本地存储
         * @param {string} key - 键名
         * @param {*} defaultValue - 默认值
         * @returns {*}
         */
        getStorage: function(key, defaultValue = null) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            try {
                const value = localStorage.getItem(fullKey);
                return value ? JSON.parse(value) : defaultValue;
            } catch (err) {
                return defaultValue;
            }
        },

        /**
         * 删除本地存储
         * @param {string} key - 键名
         */
        removeStorage: function(key) {
            const fullKey = `${ENV_CONFIG.storagePrefix}${key}`;
            localStorage.removeItem(fullKey);
        },

        /**
         * 获取 API 基础 URL
         * @returns {string}
         */
        getApiBaseUrl: function() {
            return ENV_CONFIG.apiBaseUrl[ENV_CONFIG.env];
        },

        /**
         * 通用 API 请求方法
         * @param {string} endpoint - API 端点（如 /admin/users）
         * @param {Object} options - fetch 选项
         * @returns {Promise}
         */
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

            // 添加超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ENV_CONFIG.requestTimeout);
            config.signal = controller.signal;

            try {
                const response = await fetch(url, config);
                clearTimeout(timeoutId);
                
                const data = await response.json();
                
                if (!response.ok) {
                    if (response.status === 401) {
                        console.warn('Session expired or unauthorized');
                        // 不在 API 调用中自动跳转，让调用方处理
                    }
                    throw new Error(data.error || 'Request failed');
                }
                
                return data;
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    console.error('Request timeout:', endpoint);
                    throw new Error('REQUEST_TIMEOUT');
                }
                console.error('API Error:', err);
                throw err;
            }
        },

        /**
         * 检查是否已登录
         * @returns {boolean}
         */
        isLoggedIn: function() {
            return document.cookie.includes('footradapro.sid');
        },

        /**
         * 退出登录
         */
        logout: async function() {
            try {
                await UTILS.request('/auth/logout', { method: 'POST' });
            } catch (err) {
                console.error('Logout error:', err);
            } finally {
                window.location.href = '/login.html';
            }
        },

        /**
         * 防抖函数
         * @param {Function} fn - 需要防抖的函数
         * @param {number} delay - 延迟时间（毫秒）
         * @returns {Function}
         */
        debounce: function(fn, delay) {
            let timer = null;
            return function() {
                const context = this;
                const args = arguments;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    fn.apply(context, args);
                }, delay);
            };
        }
    };

    // ====================== 导出全局对象 ======================
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

    // ====================== DOM 事件初始化 ======================
    document.addEventListener('DOMContentLoaded', function() {
        // 后退按钮
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                window.history.back();
            });
        }

        // 退出登录按钮
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                UTILS.logout();
            });
        }
    });

})(window);