/**
 * 管理员权限验证 - 使用 HttpOnly Cookie 版本
 * 生产环境稳定版本 v2.0.0
 */
(function() {
    'use strict';
    
    // 配置常量
    const CONFIG = {
        LOGIN_PATH: '/admin/index.html',
        VERIFY_API: '/api/v1/admin/verify',
        LOGOUT_API: '/api/v1/admin/logout',
        MAX_RETRY_COUNT: 3,
        RETRY_DELAY: 1000
    };
    
    // 排除登录页和公共资源
    const currentPath = window.location.pathname;
    const excludePaths = [
        CONFIG.LOGIN_PATH,
        '/admin/login.html',
        '/admin/forgot-password.html'
    ];
    
    if (excludePaths.some(path => currentPath.includes(path))) {
        return;
    }
    
    /**
     * 清除管理员认证信息（现在只清理 sessionStorage，不再操作 localStorage）
     */
    function clearAdminAuth() {
        try {
            // 只清理 sessionStorage，因为 token 在 HttpOnly Cookie 中
            sessionStorage.clear();
        } catch (e) {
            console.error('Failed to clear auth:', e);
        }
    }
    
    /**
     * 重定向到登录页
     * @param {boolean} replace - 是否替换当前历史记录
     */
    function redirectToLogin(replace = true) {
        const loginUrl = CONFIG.LOGIN_PATH;
        if (replace) {
            window.location.replace(loginUrl);
        } else {
            window.location.href = loginUrl;
        }
    }
    
    /**
     * 带重试机制的 token 验证（通过 cookie 自动携带）
     * @param {number} retryCount - 当前重试次数
     * @returns {Promise}
     */
    function verifyWithRetry(retryCount = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
        
        return fetch(CONFIG.VERIFY_API, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include', // ⭐ 关键：自动携带 cookie
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Session expired or invalid');
                }
                if (response.status >= 500 && retryCount < CONFIG.MAX_RETRY_COUNT) {
                    // 服务器错误，等待后重试
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            verifyWithRetry(retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, CONFIG.RETRY_DELAY * Math.pow(2, retryCount)); // 指数退避
                    });
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        });
    }
    
    /**
     * 调用登出接口
     */
    async function callLogout() {
        try {
            await fetch(CONFIG.LOGOUT_API, {
                method: 'POST',
                credentials: 'include', // ⭐ 携带 cookie
                keepalive: true
            });
        } catch (err) {
            console.warn('Logout API call failed:', err);
        }
    }
    
    /**
     * 初始化登出功能
     */
    function initLogout() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            // 移除已有的事件监听，避免重复绑定
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            
            newLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // 调用登出接口
                await callLogout();
                
                // 清理本地数据
                clearAdminAuth();
                
                // 重定向到登录页
                redirectToLogin(true);
            });
        }
    }
    
    /**
     * 初始化页面活动检测
     */
    function initActivityDetection() {
        let lastActivity = Date.now();
        const CHECK_INTERVAL = 60000; // 每分钟检查一次
        const MAX_IDLE_TIME = 30 * 60 * 1000; // 30分钟无操作自动登出
        
        function updateLastActivity() {
            lastActivity = Date.now();
        }
        
        // 监听用户活动
        ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(eventType => {
            document.addEventListener(eventType, updateLastActivity, { passive: true });
        });
        
        // 定期检查空闲时间
        setInterval(() => {
            const idleTime = Date.now() - lastActivity;
            if (idleTime > MAX_IDLE_TIME) {
                console.log('Session expired due to inactivity');
                
                // 调用登出接口
                callLogout().finally(() => {
                    clearAdminAuth();
                    redirectToLogin(true);
                });
            }
        }, CHECK_INTERVAL);
    }
    
    /**
     * 初始化认证守卫
     */
    async function initAuthGuard() {
        try {
            // 直接验证 cookie 会话（不需要获取 token）
            try {
                const data = await verifyWithRetry();
                
                if (!data || !data.success) {
                    throw new Error('Session validation failed');
                }
                
                // 验证成功，初始化其他功能
                console.log('Admin authentication successful');
                
                // 初始化登出功能
                initLogout();
                
                // 初始化活动检测
                initActivityDetection();
                
                // 更新用户信息显示
                if (data.data && data.data.username) {
                    const usernameElement = document.getElementById('adminName') || document.getElementById('adminUsername');
                    if (usernameElement) {
                        usernameElement.textContent = data.data.name || data.data.username;
                    }
                }
                
                // 可选：保存用户信息到 sessionStorage（非敏感信息）
                if (data.data) {
                    try {
                        sessionStorage.setItem('admin_info', JSON.stringify({
                            id: data.data.id,
                            username: data.data.username,
                            name: data.data.name,
                            role: data.data.role
                        }));
                    } catch (e) {
                        // 忽略 sessionStorage 错误
                    }
                }
                
            } catch (verifyError) {
                console.error('Session verification failed:', verifyError.message);
                
                // 尝试调用登出清理服务器端会话
                await callLogout().catch(() => {});
                
                // 清理本地数据
                clearAdminAuth();
                
                // 重定向到登录页
                redirectToLogin(true);
            }
            
        } catch (error) {
            console.error('Auth guard initialization error:', error);
            // 发生严重错误时，保守地重定向
            redirectToLogin(true);
        }
    }
    
    // 根据页面加载状态执行初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthGuard);
    } else {
        // DOM已经加载完成
        initAuthGuard();
    }
    
    // 全局错误处理
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && event.reason.message && 
            (event.reason.message.includes('session') || 
             event.reason.message.includes('auth') ||
             event.reason.message.includes('unauthorized'))) {
            console.warn('Unhandled auth error:', event.reason);
            // 不自动重定向，让现有逻辑处理
        }
    });
    
})();