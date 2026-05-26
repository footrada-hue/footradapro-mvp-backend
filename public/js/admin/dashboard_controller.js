/**
 * FOOTRADAPRO - 仪表盘控制器
 * 版本: 2.0.0
 * 最后更新: 2026-01-23
 * 描述: 生产级仪表盘数据控制器，支持实时数据加载和自动刷新
 */

(function() {
    'use strict';

    // ==================== DOM 元素引用 ====================
    const DOM = {
        get totalUsers() { return document.getElementById('totalUsers'); },
        get totalVolume() { return document.getElementById('totalVolume'); },
        
        get activeMatches() { return document.getElementById('activeMatches'); },
        get recentUsers() { return document.getElementById('recentUsers'); },
        get adminName() { return document.getElementById('adminName'); },
        get logoutBtn() { return document.getElementById('logoutBtn'); }
    };

    // ==================== 配置常量 ====================
    const CONFIG = {
        AUTO_REFRESH_INTERVAL: 60000,  // 自动刷新间隔（毫秒）
        RECENT_USERS_LIMIT: 5,          // 最近用户显示数量
        CURRENCY: 'USDT',               // 默认货币
        API_BASE: '/api/v1/admin'       // API基础路径
    };

    // ==================== 工具函数 ====================
    
    /**
     * 格式化金额显示
     * @param {number|string} amount - 金额
     * @returns {string} 格式化后的金额
     */
    function formatAmount(amount) {
        const num = parseFloat(amount || 0);
        return num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    /**
     * 格式化日期时间
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期时间
     */
    function formatDateTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return '-';
        }
    }

    /**
     * 安全获取元素文本内容
     * @param {HTMLElement} element - DOM元素
     * @param {string} defaultValue - 默认值
     * @returns {string}
     */
    function safeGetText(element, defaultValue = '0') {
        if (!element) return defaultValue;
        const text = element.textContent || '';
        const match = text.match(/[\d.]+/);
        return match ? match[0] : defaultValue;
    }

    /**
     * 显示加载状态
     * @param {HTMLElement} container - 容器元素
     */
    function showLoadingState(container) {
        if (container && container.tagName === 'TBODY') {
            container.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
        }
    }

    /**
     * 显示错误状态
     * @param {HTMLElement} container - 容器元素
     * @param {string} message - 错误消息
     */
    function showErrorState(container, message = '加载失败，请刷新重试') {
        if (container && container.tagName === 'TBODY') {
            container.innerHTML = `<tr><td colspan="5" class="loading" style="color: #ef4444;">${message}</td></tr>`;
        }
    }

    /**
     * 统一的API请求方法
     * @param {string} endpoint - API端点
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应数据
     */
    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                ...defaultOptions,
                ...options
            });
            
            // 检查HTTP状态码
            if (response.status === 401) {
                // 未授权，清除本地存储并跳转登录页
                localStorage.removeItem('admin_name');
                localStorage.removeItem('admin_token');
                window.location.href = '/admin/index.html';
                throw new Error('SESSION_EXPIRED');
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('服务器返回了非JSON响应');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (err) {
            console.error(`API请求失败 [${endpoint}]:`, err);
            throw err;
        }
    }

    // ==================== 数据加载函数 ====================
    
    /**
     * 加载统计数据（总用户数、总交易额等）
     * 使用 /stats 端点
     */
    async function loadStats() {
        try {
            const response = await adminRequest('/stats');
            
            if (response.success && response.data) {
                const data = response.data;
                
                // 更新统计卡片
                if (DOM.totalUsers) {
                    DOM.totalUsers.textContent = data.total_users?.toLocaleString() || '0';
                }
                
                if (DOM.totalVolume) {
                    DOM.totalVolume.textContent = formatAmount(data.total_authorizations || 0) + ` ${CONFIG.CURRENCY}`;
                }
                

                
                if (DOM.activeMatches) {
                    // 从比赛统计获取进行中比赛数量
                    try {
                        const matchesRes = await adminRequest('/stats/matches');
                        if (matchesRes.success && matchesRes.data) {
                            DOM.activeMatches.textContent = matchesRes.data.live || '0';
                        } else {
                            DOM.activeMatches.textContent = data.live_matches || '0';
                        }
                    } catch (err) {
                        DOM.activeMatches.textContent = data.active_matches || '0';
                    }
                }
                
                console.log('✅ 统计数据加载成功', data);
                return data;
            } else {
                throw new Error(response.error || '统计数据加载失败');
            }
        } catch (err) {
            console.error('加载统计数据失败:', err);
            // 设置默认值
            if (DOM.totalUsers) DOM.totalUsers.textContent = '--';
            if (DOM.totalVolume) DOM.totalVolume.textContent = `-- ${CONFIG.CURRENCY}`;
            
            if (DOM.activeMatches) DOM.activeMatches.textContent = '--';
            return null;
        }
    }

    /**
     * 加载最近注册用户
     * 使用 /users 端点（如果有recent端点更好）
     */
    async function loadRecentUsers() {
        const tbody = DOM.recentUsers;
        if (!tbody) return;
        
        showLoadingState(tbody);
        
        try {
            let users = [];
            
            // 尝试多个可能的端点
            const endpoints = [
                '/users/recent',
                '/users?limit=' + CONFIG.RECENT_USERS_LIMIT,
                '/stats/users/recent'
            ];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await adminRequest(endpoint);
                    if (response.success && response.data) {
                        if (Array.isArray(response.data)) {
                            users = response.data.slice(0, CONFIG.RECENT_USERS_LIMIT);
                            break;
                        } else if (response.data.users && Array.isArray(response.data.users)) {
                            users = response.data.users.slice(0, CONFIG.RECENT_USERS_LIMIT);
                            break;
                        } else if (response.data.list && Array.isArray(response.data.list)) {
                            users = response.data.list.slice(0, CONFIG.RECENT_USERS_LIMIT);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // 如果还是没有数据，尝试直接查询数据库（通过后端API）
            if (users.length === 0) {
                // 尝试从用户管理API获取
                try {
                    const response = await adminRequest('/users?page=1&limit=' + CONFIG.RECENT_USERS_LIMIT);
                    if (response.success && response.data && Array.isArray(response.data)) {
                        users = response.data.slice(0, CONFIG.RECENT_USERS_LIMIT);
                    } else if (response.success && response.data && response.data.users) {
                        users = response.data.users.slice(0, CONFIG.RECENT_USERS_LIMIT);
                    }
                } catch (e) {
                    console.log('用户列表API不可用');
                }
            }
            
            // 渲染表格
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="loading">暂无用户数据</td></tr>';
            } else {
                let html = '';
                users.forEach(user => {
                    html += `
                        <tr>
                            <td>${user.id || '-'}</td>
                            <td>${escapeHtml(user.username || user.name || '-')}</td>
                            <td>${user.uid || user.user_id || '-'}</td>
                            <td>${formatAmount(user.balance || 0)} ${CONFIG.CURRENCY}</td>
                            <td>${formatDateTime(user.created_at || user.register_time)}</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }
            
            console.log(`✅ 加载了 ${users.length} 条用户记录`);
        } catch (err) {
            console.error('加载最近用户失败:', err);
            showErrorState(tbody, '用户数据加载失败');
        }
    }

    /**
     * HTML转义（防止XSS攻击）
     * @param {string} str - 原始字符串
     * @returns {string} 转义后的字符串
     */
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 加载所有仪表盘数据
     */
    async function loadDashboard() {
        console.log('📊 开始加载仪表盘数据...');
        const startTime = Date.now();
        
        try {
            // 并行加载所有数据
            await Promise.all([
                loadStats(),
                loadRecentUsers()
            ]);
            
            const elapsed = Date.now() - startTime;
            console.log(`✅ 仪表盘数据加载完成，耗时: ${elapsed}ms`);
        } catch (err) {
            console.error('❌ 仪表盘数据加载失败:', err);
        }
    }

    // ==================== UI 交互函数 ====================
    
    /**
     * 设置管理员名称
     */
    function setAdminName() {
        const storedAdmin = localStorage.getItem('admin_name');
        if (storedAdmin && DOM.adminName) {
            DOM.adminName.textContent = storedAdmin;
        } else {
            // 尝试从session中获取
            fetch('/api/v1/admin/auth/me', { credentials: 'include' })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data && data.data.username) {
                        DOM.adminName.textContent = data.data.username;
                        localStorage.setItem('admin_name', data.data.username);
                    }
                })
                .catch(err => console.error('获取管理员信息失败:', err));
        }
    }

    /**
     * 绑定退出登录事件
     */
    function bindLogout() {
        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                try {
                    // 尝试调用登出API
                    await fetch('/api/v1/admin/auth/logout', { 
                        method: 'POST', 
                        credentials: 'include' 
                    });
                } catch (err) {
                    console.error('登出API调用失败:', err);
                }
                
                // 清除本地存储
                localStorage.removeItem('admin_name');
                localStorage.removeItem('admin_token');
                
                // 跳转到登录页
                window.location.href = '/admin/index.html';
            });
        }
    }

    /**
     * 绑定刷新按钮（如果有）
     */
    function bindRefreshButton() {
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadDashboard();
            });
        }
    }

    // ==================== 初始化 ====================
    
    /**
     * 初始化仪表盘
     */
    function init() {
        console.log('🚀 仪表盘控制器初始化中...');
        
        // 设置管理员名称
        setAdminName();
        
        // 绑定事件
        bindLogout();
        bindRefreshButton();
        
        // 加载数据
        loadDashboard();
        
        // 设置自动刷新（可选，生产环境建议开启）
        if (CONFIG.AUTO_REFRESH_INTERVAL > 0) {
            setInterval(() => {
                console.log('🔄 自动刷新仪表盘数据...');
                loadDashboard();
            }, CONFIG.AUTO_REFRESH_INTERVAL);
        }
        
        console.log('✅ 仪表盘控制器初始化完成');
    }
    
    // 等待DOM加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();