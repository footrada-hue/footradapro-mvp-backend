/**
 * 用户管理控制器
 * 负责用户列表展示、筛选、分页、状态切换、批量操作等功能
 */

(function() {
    if (typeof FOOTRADAPRO === 'undefined') {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    const UTILS = FOOTRADAPRO.UTILS;

    let allUsers = [];
    let filteredUsers = [];
    let currentPage = 1;
    const pageSize = 10;
    let selectedUsers = new Set();

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

    const totalUsersSpan = document.getElementById('totalUsers');
    const testUsersSpan = document.getElementById('testUsers');
    const liveUsersSpan = document.getElementById('liveUsers');
    const onlineUsersSpan = document.getElementById('onlineUsers');

    function parseUTCDate(dateStr) {
        if (!dateStr) return null;
        return new Date(dateStr.replace(' ', 'T') + 'Z');
    }

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
                window.location.href = '/admin/index.html';
            }
            throw err;
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function updateStats() {
        const now = new Date();
        const onlineCount = allUsers.filter(u => {
            if (!u.last_active_at) return false;
            const lastActive = parseUTCDate(u.last_active_at);
            if (!lastActive) return false;
            return (now - lastActive) < 300000;
        }).length;

        totalUsersSpan.textContent = allUsers.length;
        testUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 1).length;
        liveUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 0).length;
        onlineUsersSpan.textContent = onlineCount;
    }

    window.toggleUserStatus = async function(userId, currentStatus) {
        const action = currentStatus === 'active' ? '禁用' : '启用';
        if (!confirm(`确定要${action}该用户吗？`)) return;
        
        const button = event.target.closest('button');
        const originalHtml = button.innerHTML;
        button.classList.add('button-loading');
        button.disabled = true;
        button.innerHTML = '';
        
        try {
            const result = await adminRequest(`/admin/users/${userId}/toggle`, { method: 'POST' });
            if (result.success) {
                showToast(`用户已${action}`, 'success');
                loadUsers();
            }
        } catch (err) {
            button.classList.remove('button-loading');
            button.disabled = false;
            button.innerHTML = originalHtml;
            showToast('操作失败：' + (err.message || '未知错误'), 'error');
        }
    };

    window.toggleUserMode = async function(userId, currentMode, button) {
        const targetMode = currentMode === 1 ? 'live' : 'test';
        const actionText = targetMode === 'live' ? '切换到主网' : '切换到测试';
        if (!confirm(`确定要将该用户${actionText}模式吗？`)) return;
        
        const originalHtml = button.innerHTML;
        button.classList.add('button-loading');
        button.disabled = true;
        button.innerHTML = '';
        
        try {
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
            button.classList.remove('button-loading');
            button.disabled = false;
            button.innerHTML = originalHtml;
            showToast('操作失败：' + (err.message || '未知错误'), 'error');
        }
    };

    window.batchSwitchToLive = async function() {
        if (selectedUsers.size === 0) {
            showToast('请先选择用户', 'info');
            return;
        }
        if (!confirm(`确定要将选中的 ${selectedUsers.size} 个用户切换到主网模式吗？`)) return;

        const userIds = Array.from(selectedUsers);
        try {
            const result = await adminRequest('/admin/users/bulk/switch-to-live', {
                method: 'POST',
                body: JSON.stringify({ userIds })
            });
            if (result.success) {
                showToast(`成功将 ${result.updated} 个用户切换到主网`, 'success');
                selectedUsers.clear();
                updateSelectionUI();
                loadUsers();
            }
        } catch (err) {
            showToast('批量操作失败：' + (err.message || '未知错误'), 'error');
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
        const checkboxes = document.querySelectorAll('.user-select');
        if (selectAllCheckbox.checked) {
            filteredUsers.forEach(user => selectedUsers.add(user.id));
        } else {
            selectedUsers.clear();
        }
        updateSelectionUI();
    };

    window.clearSelection = function() {
        selectedUsers.clear();
        updateSelectionUI();
    };

    function updateSelectionUI() {
        const checkboxes = document.querySelectorAll('.user-select');
        checkboxes.forEach(cb => {
            cb.checked = selectedUsers.has(parseInt(cb.value));
        });

        if (selectAllCheckbox) {
            const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
            const allVisibleSelected = visibleUsers.every(u => selectedUsers.has(u.id));
            selectAllCheckbox.checked = allVisibleSelected;
            selectAllCheckbox.indeterminate = !allVisibleSelected && visibleUsers.some(u => selectedUsers.has(u.id));
        }

        if (selectedUsers.size > 0) {
            bulkActions.style.display = 'flex';
            selectedCountSpan.textContent = selectedUsers.size;
        } else {
            bulkActions.style.display = 'none';
        }
    }

    async function loadUsers() {
        try {
            tbody.innerHTML = '<tr><td colspan="12" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
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

    function getLockedStatus(user) {
        const isLocked = user.is_mode_locked === 1;
        if (isLocked) return '<span style="color: #ef4444;">🔒 已锁定</span>';
        return '<span style="color: #10b981;">🔓 可切换</span>';
    }

    function applyFilters() {
        const keyword = searchInput.value.trim().toLowerCase();
        const mode = modeFilter.value;
        const onlineOnly = onlineOnlyCheck?.checked || false;
        const sortBy = sortFilter?.value || 'id_desc';

        filteredUsers = allUsers.filter(user => {
            if (keyword) {
                if (!(user.username?.toLowerCase().includes(keyword) ||
                      user.uid?.toLowerCase().includes(keyword) ||
                      String(user.id).includes(keyword))) {
                    return false;
                }
            }
            if (mode === 'test' && user.is_test_mode !== 1) return false;
            if (mode === 'live' && user.is_test_mode !== 0) return false;
            if (onlineOnly) {
                if (!user.last_active_at) return false;
                const lastActive = parseUTCDate(user.last_active_at);
                if (!lastActive) return false;
                const now = new Date();
                if ((now - lastActive) >= 300000) return false;
            }
            return true;
        });

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

    function renderTable() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageUsers = filteredUsers.slice(start, end);

        if (pageUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="loading">暂无用户</td></tr>';
        } else {
            let html = '';
            pageUsers.forEach(user => {
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
                    <td><input type="checkbox" class="user-select" value="${user.id}" ${isSelected ? 'checked' : ''} onchange="toggleUserSelection(${user.id})"></td>
                    <td>${user.id}</td>
                    <td>${user.username || '-'}</td>
                    <td>${user.uid || '-'}</td>
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
                            <button class="action-btn" onclick="window.toggleUserMode('${user.uid}', ${user.is_test_mode}, this)" title="${user.is_test_mode === 1 ? '切换到主网' : '切换到测试'}">
                                <i class="fas fa-${user.is_test_mode === 1 ? 'rocket' : 'flask'}"></i>
                                ${user.is_test_mode === 1 ? '切主网' : '切测试'}
                            </button>
                            <button class="action-btn ${user.status === 'active' ? 'warning' : 'success'}" onclick="window.toggleUserStatus(${user.id}, '${user.status}')" title="${user.status === 'active' ? '禁用用户' : '启用用户'}">
                                <i class="fas ${user.status === 'active' ? 'fa-ban' : 'fa-check'}"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        renderPagination();
        updateSelectionUI();
    }

    function renderPagination() {
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

    window.changePage = function(page) {
        if (page < 1 || page > Math.ceil(filteredUsers.length / pageSize)) return;
        currentPage = page;
        renderTable();
    };

    window.viewUserDetail = async function(userId) {
        modal.classList.add('show');
        modalBody.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-pulse"></i>加载详情中...</div>';
        detailUsernameSpan.textContent = '';

        try {
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

    function renderUserDetail(data) {
        const user = data.user;
        detailUsernameSpan.textContent = user.username || user.uid;

        const modeText = user.is_test_mode === 1 ? '测试模式' : '主网模式';
        const modeClass = user.is_test_mode === 1 ? 'test' : 'live';
        const liveBalance = UTILS.formatAmount(user.balance || 0);
        const testBalance = UTILS.formatAmount(user.test_balance || 10000);

        let html = `
            <div class="info-grid">
                <div class="info-item"><span class="info-label">用户ID</span><span class="info-value">${user.id}</span></div>
                <div class="info-item"><span class="info-label">UID</span><span class="info-value">${user.uid || '-'}</span></div>
                <div class="info-item"><span class="info-label">用户名</span><span class="info-value">${user.username || '-'}</span></div>
                <div class="info-item"><span class="info-label">主网余额</span><span class="info-value">${liveBalance} USDT</span></div>
                <div class="info-item"><span class="info-label">测试余额</span><span class="info-value">${testBalance} tUSDT</span></div>
                <div class="info-item"><span class="info-label">当前模式</span><span class="info-value"><span class="mode-badge ${modeClass}">${modeText}</span></span></div>
                <div class="info-item"><span class="info-label">锁定状态</span><span class="info-value">${user.is_mode_locked === 1 ? '🔒 已锁定' : '🔓 可切换'}</span></div>
                <div class="info-item"><span class="info-label">注册时间</span><span class="info-value">${UTILS.formatDateTime(user.created_at)}</span></div>
                <div class="info-item"><span class="info-label">最后登录</span><span class="info-value">${user.last_login_at ? UTILS.formatDateTime(user.last_login_at) : '-'}</span></div>
                <div class="info-item"><span class="info-label">最后活动</span><span class="info-value">${user.last_active_at ? UTILS.formatRelativeTime(user.last_active_at) : '-'}</span></div>
            </div>
        `;

        modalBody.innerHTML = html;
    }

    function closeModal() {
        modal.classList.remove('show');
    }

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

    loadUsers();

    const adminNameSpan = document.getElementById('adminName');
    const storedAdmin = localStorage.getItem('admin_name');
    if (adminNameSpan && storedAdmin) adminNameSpan.textContent = storedAdmin;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = '/admin/index.html';
        });
    }
})();