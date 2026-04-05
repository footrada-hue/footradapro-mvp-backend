/**
 * 用户管理控制器
 * 负责用户列表展示、筛选、分页、状态切换、批量操作等功能
 * @version 2.1.0
 * @description 生产环境标准 - 使用相对路径 API（UTILS.request 已包含 /api/v1 前缀）
 */

(function() {
    'use strict';

    if (typeof FOOTRADAPRO === 'undefined') {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    const UTILS = FOOTRADAPRO.UTILS;

    // ==================== 状态变量 ====================
    let allUsers = [];
    let filteredUsers = [];
    let currentPage = 1;
    const pageSize = 10;
    let selectedUsers = new Set();

    // ==================== DOM 元素 ====================
    const tbody = document.getElementById('userTableBody');
    const searchInput = document.getElementById('searchInput');
    const modeFilter = document.getElementById('modeFilter');
    const sortFilter = document.getElementById('sortFilter');
    const onlineOnlyCheck = document.getElementById('onlineOnly');
    const resetBtn = document.getElementById('resetFilters');
    const paginationDiv = document.getElementById('pagination');
    const modal = document.getElementById('userDetailModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalBody = document.getElementById('modalBody');
    const detailUsernameSpan = document.getElementById('detailUsername');
    const selectAllCheckbox = document.getElementById('selectAll');
    const bulkActions = document.getElementById('bulkActions');
    const selectedCountSpan = document.getElementById('selectedCount');

    // 统计卡片
    const totalUsersSpan = document.getElementById('totalUsers');
    const testUsersSpan = document.getElementById('testUsers');
    const liveUsersSpan = document.getElementById('liveUsers');
    const onlineUsersSpan = document.getElementById('onlineUsers');

    // ==================== 辅助函数 ====================
    
    /**
     * 解析 UTC 日期字符串
     * @param {string} dateStr - 日期字符串
     * @returns {Date|null}
     */
    function parseUTCDate(dateStr) {
        if (!dateStr) return null;
        try {
            return new Date(dateStr.replace(' ', 'T') + 'Z');
        } catch {
            return null;
        }
    }

    /**
     * 显示提示消息
     * @param {string} message - 消息内容
     * @param {string} type - 类型：success, error, info
     */
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 管理员 API 请求封装
     * 使用相对路径，UTILS.request 会自动添加 /api/v1 前缀
     * @param {string} endpoint - API 端点（如 /admin/users）
     * @param {Object} options - fetch 选项
     * @returns {Promise}
     */
    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const result = await UTILS.request(endpoint, mergedOptions);
            return result;
        } catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                // 未授权，跳转到登录页
                window.location.href = '/admin/index.html';
            }
            throw err;
        }
    }

    /**
     * 更新统计卡片
     */
    function updateStats() {
        const now = new Date();
        const onlineCount = allUsers.filter(u => {
            if (!u.last_active_at) return false;
            const lastActive = parseUTCDate(u.last_active_at);
            if (!lastActive) return false;
            return (now - lastActive) < 300000;
        }).length;

        if (totalUsersSpan) totalUsersSpan.textContent = allUsers.length;
        if (testUsersSpan) testUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 1).length;
        if (liveUsersSpan) liveUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 0).length;
        if (onlineUsersSpan) onlineUsersSpan.textContent = onlineCount;
    }

    /**
     * 获取在线状态 HTML
     * @param {string} lastActive - 最后活动时间
     * @returns {string}
     */
    function getOnlineStatus(lastActive) {
        if (!lastActive) return '<span style="color: #8e95a3;">⚪ 从未登录</span>';
        const last = parseUTCDate(lastActive);
        if (!last) return '<span style="color: #8e95a3;">⚪ 时间格式错误</span>';
        const now = new Date();
        const diffSeconds = Math.floor((now - last) / 1000);
        
        if (diffSeconds < 300) return '<span style="color: #10b981;">🟢 在线</span>';
        if (diffSeconds < 3600) return `<span style="color: #8e95a3;">⚪ ${Math.floor(diffSeconds / 60)}分钟前</span>`;
        if (diffSeconds < 86400) return `<span style="color: #8e95a3;">⚪ ${Math.floor(diffSeconds / 3600)}小时前</span>`;
        return `<span style="color: #8e95a3;">⚪ ${Math.floor(diffSeconds / 86400)}天前</span>`;
    }

    /**
     * 获取锁定状态 HTML
     * @param {Object} user - 用户对象
     * @returns {string}
     */
    function getLockedStatus(user) {
        const isLocked = user.is_mode_locked === 1;
        if (isLocked) return '<span style="color: #ef4444;">🔒 已锁定</span>';
        return '<span style="color: #10b981;">🔓 可切换</span>';
    }

    /**
     * 应用筛选条件
     */
    function applyFilters() {
        const keyword = searchInput?.value.trim().toLowerCase() || '';
        const mode = modeFilter?.value || '';
        const onlineOnly = onlineOnlyCheck?.checked || false;
        const sortBy = sortFilter?.value || 'id_desc';

        filteredUsers = allUsers.filter(user => {
            // 关键词搜索
            if (keyword) {
                const matchKeyword = (user.username?.toLowerCase().includes(keyword)) ||
                                    (user.uid?.toLowerCase().includes(keyword)) ||
                                    String(user.id).includes(keyword);
                if (!matchKeyword) return false;
            }
            // 模式筛选
            if (mode === 'test' && user.is_test_mode !== 1) return false;
            if (mode === 'live' && user.is_test_mode !== 0) return false;
            // 在线筛选
            if (onlineOnly) {
                if (!user.last_active_at) return false;
                const lastActive = parseUTCDate(user.last_active_at);
                if (!lastActive) return false;
                const now = new Date();
                if ((now - lastActive) >= 300000) return false;
            }
            return true;
        });

        // 排序
        filteredUsers.sort((a, b) => {
            switch(sortBy) {
                case 'id_asc': return a.id - b.id;
                case 'last_active_desc':
                    if (!a.last_active_at) return 1;
                    if (!b.last_active_at) return -1;
                    const aTime = parseUTCDate(a.last_active_at);
                    const bTime = parseUTCDate(b.last_active_at);
                    if (!aTime) return 1;
                    if (!bTime) return -1;
                    return bTime - aTime;
                case 'balance_desc': return (b.balance || 0) - (a.balance || 0);
                case 'test_balance_desc': return (b.test_balance || 0) - (a.test_balance || 0);
                default: return b.id - a.id;
            }
        });

        currentPage = 1;
        renderTable();
    }

    /**
     * HTML 转义（防止 XSS 攻击）
     * @param {string} str - 需要转义的字符串
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    /**
     * 渲染表格
     */
    function renderTable() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageUsers = filteredUsers.slice(start, end);

        if (!tbody) return;

        if (pageUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="loading">暂无用户</td></tr>';
        } else {
            let html = '';
            for (const user of pageUsers) {
                const modeClass = user.is_test_mode === 1 ? 'test' : 'live';
                const modeText = user.is_test_mode === 1 ? '测试' : '主网';
                const created = UTILS.formatDateTime(user.created_at).split(',')[0];
                const liveBalance = UTILS.formatAmount(user.balance || 0);
                const testBalance = UTILS.formatAmount(user.test_balance || 10000);
                const statusBadge = user.status === 'active' 
                    ? '<span class="status-badge active">正常</span>'
                    : '<span class="status-badge disabled">已禁用</span>';
                const rowClass = user.status === 'active' ? '' : 'disabled-user';
                const isSelected = selectedUsers.has(user.id);
                const lockedStatus = getLockedStatus(user);

                html += `<tr class="${rowClass}">
                    <td><input type="checkbox" class="user-select" value="${user.id}" ${isSelected ? 'checked' : ''} onchange="window.toggleUserSelection(${user.id})"></td>
                    <td>${user.id}</td>
                    <td>${escapeHtml(user.username) || '-'}</td>
                    <td>${escapeHtml(user.uid) || '-'}</td>
                    <td class="balance-live">${liveBalance} USDT</td>
                    <td class="balance-test">${testBalance} tUSDT</td>
                    <td><span class="mode-badge ${modeClass}">${modeText}</span></td>
                    <td>${lockedStatus}</td>
                    <td>${created}</td>
                    <td>${statusBadge}</td>
                    <td>${getOnlineStatus(user.last_active_at)}</td>
                    <td>
                        <div class="action-group">
                            <button class="action-btn" onclick="window.viewUserDetail(${user.id})" title="查看详情">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="action-btn" onclick="window.toggleUserMode('${escapeHtml(user.uid)}', ${user.is_test_mode}, this)" title="${user.is_test_mode === 1 ? '切换到主网' : '切换到测试'}">
                                <i class="fas fa-${user.is_test_mode === 1 ? 'rocket' : 'flask'}"></i>
                                ${user.is_test_mode === 1 ? '切主网' : '切测试'}
                            </button>
                            <button class="action-btn ${user.status === 'active' ? 'warning' : 'success'}" onclick="window.toggleUserStatus(${user.id}, '${user.status}')" title="${user.status === 'active' ? '禁用用户' : '启用用户'}">
                                <i class="fas ${user.status === 'active' ? 'fa-ban' : 'fa-check'}"></i>
                            </button>
                        </div>
                    </td>
                 </tr>`;
            }
            tbody.innerHTML = html;
        }

        renderPagination();
        updateSelectionUI();
    }

    /**
     * 渲染分页
     */
    function renderPagination() {
        if (!paginationDiv) return;
        
        const totalPages = Math.ceil(filteredUsers.length / pageSize);
        if (totalPages <= 1) {
            paginationDiv.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="page-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
        }

        html += `<button class="page-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;

        paginationDiv.innerHTML = html;
    }

    /**
     * 更新选择 UI
     */
    function updateSelectionUI() {
        const checkboxes = document.querySelectorAll('.user-select');
        for (const cb of checkboxes) {
            cb.checked = selectedUsers.has(parseInt(cb.value));
        }

        if (selectAllCheckbox) {
            const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
            const allVisibleSelected = visibleUsers.every(u => selectedUsers.has(u.id));
            selectAllCheckbox.checked = allVisibleSelected;
            selectAllCheckbox.indeterminate = !allVisibleSelected && visibleUsers.some(u => selectedUsers.has(u.id));
        }

        if (bulkActions && selectedCountSpan) {
            if (selectedUsers.size > 0) {
                bulkActions.style.display = 'flex';
                selectedCountSpan.textContent = selectedUsers.size;
            } else {
                bulkActions.style.display = 'none';
            }
        }
    }

    /**
     * 加载用户列表
     */
    async function loadUsers() {
        if (!tbody) return;
        
        try {
            tbody.innerHTML = '<tr><td colspan="12" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
            // ✅ 使用正确的 API 路径（UTILS.request 会自动添加 /api/v1 前缀）
            const result = await adminRequest('/admin/users');
            if (result.success && Array.isArray(result.data)) {
                allUsers = result.data;
                updateStats();
                applyFilters();
            } else {
                throw new Error(result.error || '加载失败');
            }
        } catch (err) {
            console.error('加载用户列表失败:', err);
            tbody.innerHTML = '<tr><td colspan="12" class="loading" style="color: #ef4444;">加载失败，请重试</td></tr>';
        }
    }

    // ==================== 全局函数（供 HTML 调用） ====================
    
    window.changePage = function(page) {
        if (page < 1 || page > Math.ceil(filteredUsers.length / pageSize)) return;
        currentPage = page;
        renderTable();
    };

    window.viewUserDetail = async function(userId) {
        if (!modal || !modalBody || !detailUsernameSpan) return;
        
        modal.classList.add('show');
        modalBody.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-pulse"></i>加载详情中...</div>';
        detailUsernameSpan.textContent = '';

        try {
            // ✅ 使用正确的 API 路径（UTILS.request 会自动添加 /api/v1 前缀）
            const result = await adminRequest(`/admin/users/${userId}`);
            if (result.success && result.data) {
                renderUserDetail(result.data);
            } else {
                throw new Error(result.error || '加载详情失败');
            }
        } catch (err) {
            console.error('加载详情失败:', err);
            modalBody.innerHTML = `<div class="loading" style="color: #ef4444;">加载失败，请重试</div>`;
        }
    };

    window.toggleUserStatus = async function(userId, currentStatus) {
        const action = currentStatus === 'active' ? '禁用' : '启用';
        if (!confirm(`确定要${action}该用户吗？`)) return;
        
        const button = event?.target?.closest('button');
        const originalHtml = button?.innerHTML || '';
        if (button) {
            button.classList.add('button-loading');
            button.disabled = true;
            button.innerHTML = '';
        }
        
        try {
            // ✅ 使用正确的 API 路径（UTILS.request 会自动添加 /api/v1 前缀）
            const result = await adminRequest(`/admin/users/${userId}/toggle`, { method: 'POST' });
            if (result.success) {
                showToast(`用户已${action}`, 'success');
                loadUsers();
            } else {
                throw new Error(result.error || '操作失败');
            }
        } catch (err) {
            if (button) {
                button.classList.remove('button-loading');
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
            showToast('操作失败：' + (err.message || '未知错误'), 'error');
        }
    };

    window.toggleUserMode = async function(userId, currentMode, button) {
        const targetMode = currentMode === 1 ? 'live' : 'test';
        const actionText = targetMode === 'live' ? '切换到主网' : '切换到测试';
        if (!confirm(`确定要将该用户${actionText}模式吗？`)) return;
        
        const originalHtml = button?.innerHTML || '';
        if (button) {
            button.classList.add('button-loading');
            button.disabled = true;
            button.innerHTML = '';
        }
        
        try {
            // ✅ 使用正确的 API 路径（UTILS.request 会自动添加 /api/v1 前缀）
            const result = await adminRequest(`/admin/users/${userId}/toggle-mode`, {
                method: 'POST',
                body: JSON.stringify({ mode: targetMode })
            });
            if (result.success) {
                showToast(`用户已成功${actionText}`, 'success');
                loadUsers();
            } else {
                throw new Error(result.error || '切换失败');
            }
        } catch (err) {
            if (button) {
                button.classList.remove('button-loading');
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
            showToast('操作失败：' + (err.message || '未知错误'), 'error');
        }
    };

    window.toggleUserSelection = function(userId) {
        if (selectedUsers.has(userId)) {
            selectedUsers.delete(userId);
        } else {
            selectedUsers.add(userId);
        }
        updateSelectionUI();
    };

    window.toggleSelectAll = function() {
        if (selectAllCheckbox?.checked) {
            const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
            for (const user of visibleUsers) {
                selectedUsers.add(user.id);
            }
        } else {
            selectedUsers.clear();
        }
        updateSelectionUI();
    };

    window.clearSelection = function() {
        selectedUsers.clear();
        updateSelectionUI();
    };

    window.batchSwitchToLive = async function() {
        if (selectedUsers.size === 0) {
            showToast('请先选择用户', 'info');
            return;
        }
        if (!confirm(`确定要将选中的 ${selectedUsers.size} 个用户切换到主网模式吗？`)) return;

        const userIds = Array.from(selectedUsers);
        try {
            // ✅ 使用正确的 API 路径（UTILS.request 会自动添加 /api/v1 前缀）
            const result = await adminRequest('/admin/users/bulk/switch-to-live', {
                method: 'POST',
                body: JSON.stringify({ userIds })
            });
            if (result.success) {
                showToast(`成功将 ${result.updated} 个用户切换到主网`, 'success');
                selectedUsers.clear();
                updateSelectionUI();
                loadUsers();
            } else {
                throw new Error(result.error || '批量操作失败');
            }
        } catch (err) {
            showToast('批量操作失败：' + (err.message || '未知错误'), 'error');
        }
    };

    /**
     * 渲染用户详情
     * @param {Object} data - 用户详情数据
     */
    function renderUserDetail(data) {
        const user = data.user;
        if (!detailUsernameSpan) return;
        detailUsernameSpan.textContent = user.username || user.uid;

        const modeText = user.is_test_mode === 1 ? '测试模式' : '主网模式';
        const modeClass = user.is_test_mode === 1 ? 'test' : 'live';
        const liveBalance = UTILS.formatAmount(user.balance || 0);
        const testBalance = UTILS.formatAmount(user.test_balance || 10000);

        let html = `
            <div class="info-grid">
                <div class="info-item"><span class="info-label">用户ID</span><span class="info-value">${user.id}</span></div>
                <div class="info-item"><span class="info-label">UID</span><span class="info-value">${escapeHtml(user.uid) || '-'}</span></div>
                <div class="info-item"><span class="info-label">用户名</span><span class="info-value">${escapeHtml(user.username) || '-'}</span></div>
                <div class="info-item"><span class="info-label">主网余额</span><span class="info-value">${liveBalance} USDT</span></div>
                <div class="info-item"><span class="info-label">测试余额</span><span class="info-value">${testBalance} tUSDT</span></div>
                <div class="info-item"><span class="info-label">当前模式</span><span class="info-value"><span class="mode-badge ${modeClass}">${modeText}</span></span></div>
                <div class="info-item"><span class="info-label">锁定状态</span><span class="info-value">${user.is_mode_locked === 1 ? '🔒 已锁定' : '🔓 可切换'}</span></div>
                <div class="info-item"><span class="info-label">注册时间</span><span class="info-value">${UTILS.formatDateTime(user.created_at)}</span></div>
                <div class="info-item"><span class="info-label">最后登录</span><span class="info-value">${user.last_login_at ? UTILS.formatDateTime(user.last_login_at) : '-'}</span></div>
                <div class="info-item"><span class="info-label">最后活动</span><span class="info-value">${user.last_active_at ? UTILS.formatRelativeTime(user.last_active_at) : '-'}</span></div>
            </div>
        `;

        if (modalBody) modalBody.innerHTML = html;
    }

    /**
     * 关闭详情模态框
     */
    function closeModal() {
        if (modal) modal.classList.remove('show');
    }

    // ==================== 事件绑定 ====================
    if (searchInput) searchInput.addEventListener('input', UTILS.debounce ? UTILS.debounce(applyFilters, 500) : applyFilters);
    if (modeFilter) modeFilter.addEventListener('change', applyFilters);
    if (sortFilter) sortFilter.addEventListener('change', applyFilters);
    if (onlineOnlyCheck) onlineOnlyCheck.addEventListener('change', applyFilters);
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (modeFilter) modeFilter.value = '';
            if (sortFilter) sortFilter.value = 'id_desc';
            if (onlineOnlyCheck) onlineOnlyCheck.checked = false;
            applyFilters();
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    const batchSwitchBtn = document.getElementById('batchSwitchToLive');
    const clearSelectionBtn = document.getElementById('clearSelection');
    
    if (batchSwitchBtn) batchSwitchBtn.addEventListener('click', window.batchSwitchToLive);
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', window.clearSelection);
    if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', window.toggleSelectAll);

    // ==================== 初始化 ====================
    loadUsers();

    // 显示管理员名称
    const adminNameSpan = document.getElementById('adminName');
    const storedAdmin = localStorage.getItem('admin_name');
    if (adminNameSpan && storedAdmin) adminNameSpan.textContent = storedAdmin;

    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = '/admin/index.html';
        });
    }
})();