/**
 * FOOTRADAPRO - 仪表盘控制器
 * 版本: 1.0.0
 */

(function() {
    'use strict';

    // ==================== DOM 元素 ====================
    const DOM = {
        totalUsers: document.getElementById('totalUsers'),
        totalVolume: document.getElementById('totalVolume'),
        claimedBonus: document.getElementById('claimedBonus'),
        activeMatches: document.getElementById('activeMatches'),
        recentUsers: document.getElementById('recentUsers'),
        adminName: document.getElementById('adminName'),
        logoutBtn: document.getElementById('logoutBtn')
    };

    // ==================== 工具函数 ====================
    function formatAmount(amount) {
        return parseFloat(amount || 0).toFixed(2);
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
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

    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        
        try {
            const response = await fetch(`/api/v1/admin${endpoint}`, {
                ...defaultOptions,
                ...options
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/admin/index.html';
                }
                throw new Error(data.error || '请求失败');
            }
            
            return data;
        } catch (err) {
            console.error('API请求失败:', err);
            throw err;
        }
    }

    // ==================== 加载仪表盘数据 ====================
    async function loadDashboard() {
        try {
            // 加载统计数据
            const statsRes = await adminRequest('/stats');
            
            if (statsRes.success && statsRes.data) {
                if (DOM.totalUsers) DOM.totalUsers.textContent = statsRes.data.totalUsers || 0;
                if (DOM.totalVolume) DOM.totalVolume.textContent = formatAmount(statsRes.data.totalVolume) + ' USDT';
                if (DOM.claimedBonus) DOM.claimedBonus.textContent = statsRes.data.claimedBonus || 0;
                if (DOM.activeMatches) DOM.activeMatches.textContent = statsRes.data.activeMatches || 0;
            }
            
            // 加载最近用户
            const usersRes = await adminRequest('/users?limit=5');
            
            if (usersRes.success && usersRes.data) {
                const tbody = DOM.recentUsers;
                if (usersRes.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="loading">暂无用户</td></tr>';
                } else {
                    let html = '';
                    usersRes.data.slice(0, 5).forEach(user => {
                        html += `
                            <tr>
                                <td>${user.id}</td>
                                <td>${user.username || '-'}</td>
                                <td>${user.uid || '-'}</td>
                                <td>${formatAmount(user.balance)} USDT</td>
                                <td>${formatDateTime(user.created_at)}</td>
                            </tr>
                        `;
                    });
                    tbody.innerHTML = html;
                }
            }
        } catch (err) {
            console.error('加载仪表盘失败:', err);
            if (DOM.recentUsers) {
                DOM.recentUsers.innerHTML = '<tr><td colspan="5" class="loading" style="color: #ef4444;">加载失败，请刷新重试</td></tr>';
            }
        }
    }

    // ==================== 设置管理员名称 ====================
    function setAdminName() {
        const storedAdmin = localStorage.getItem('admin_name');
        if (storedAdmin && DOM.adminName) {
            DOM.adminName.textContent = storedAdmin;
        }
    }

    // ==================== 退出登录 ====================
    function bindLogout() {
        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', () => {
                window.location.href = '/admin/index.html';
            });
        }
    }

    // ==================== 初始化 ====================
    function init() {
        setAdminName();
        bindLogout();
        loadDashboard();
        
        // 每60秒自动刷新数据
        setInterval(loadDashboard, 60000);
    }
    
    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();