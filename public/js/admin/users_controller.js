/**
 * 用户管理控制器
 * 负责用户列表展示、筛选、分页、状态切换、批量操作等功能
 * @version 2.2.0
 * @description 新增密码重置、授权记录查看功能
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
    let currentAuthMode = 'test'; // 'test' 或 'live'
    let currentUserId = null;

    // ==================== DOM 元素 ====================
    const DOM = {
        get tbody() { return document.getElementById('userTableBody'); },
        get searchInput() { return document.getElementById('searchInput'); },
        get modeFilter() { return document.getElementById('modeFilter'); },
        get sortFilter() { return document.getElementById('sortFilter'); },
        get onlineOnlyCheck() { return document.getElementById('onlineOnly'); },
        get resetBtn() { return document.getElementById('resetFilters'); },
        get paginationDiv() { return document.getElementById('pagination'); },
        get modal() { return document.getElementById('userDetailModal'); },
        get closeModalBtn() { return document.getElementById('closeModalBtn'); },
        get modalBody() { return document.getElementById('modalBody'); },
        get detailUsernameSpan() { return document.getElementById('detailUsername'); },
        get selectAllCheckbox() { return document.getElementById('selectAll'); },
        get bulkActions() { return document.getElementById('bulkActions'); },
        get selectedCountSpan() { return document.getElementById('selectedCount'); },
        get totalUsersSpan() { return document.getElementById('totalUsers'); },
        get testUsersSpan() { return document.getElementById('testUsers'); },
        get liveUsersSpan() { return document.getElementById('liveUsers'); },
        get onlineUsersSpan() { return document.getElementById('onlineUsers'); },
        get adminNameSpan() { return document.getElementById('adminName'); },
        get logoutBtn() { return document.getElementById('logoutBtn'); }
    };

    // ==================== 辅助函数 ====================
    
    function parseUTCDate(dateStr) {
        if (!dateStr) return null;
        try {
            return new Date(dateStr.replace(' ', 'T') + 'Z');
        } catch {
            return null;
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
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
            font-size: 14px;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
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
            console.error('API请求失败:', endpoint, err);
            if (err.message === 'UNAUTHORIZED' || err.message === 'Request failed') {
                window.location.href = '/admin/index.html';
            }
            throw err;
        }
    }

    // ==================== 密码重置功能 ====================
    
    async function resetUserPassword(userId, username) {
        if (!confirm(`确定要重置用户「${username}」的登录密码吗？`)) return;
        
        try {
            const result = await adminRequest(`/admin/users/${userId}/reset-password`, {
                method: 'POST'
            });
            
            if (result.success) {
                showToast(`密码已重置，新密码：${result.data.new_password}`, 'success');
                alert(`用户「${username}」的新密码是：\n\n${result.data.new_password}\n\n请妥善保管并告知用户。`);
            } else {
                throw new Error(result.error || '重置失败');
            }
        } catch (err) {
            showToast('重置失败：' + err.message, 'error');
        }
    }
    
    async function resetUserPayPassword(userId, username) {
        if (!confirm(`确定要重置用户「${username}」的支付密码吗？`)) return;
        
        try {
            const result = await adminRequest(`/admin/users/${userId}/reset-paypassword`, {
                method: 'POST'
            });
            
            if (result.success) {
                showToast(`支付密码已重置，新密码：${result.data.new_paypassword}`, 'success');
                alert(`用户「${username}」的新支付密码是：\n\n${result.data.new_paypassword}\n\n请妥善保管并告知用户。`);
            } else {
                throw new Error(result.error || '重置失败');
            }
        } catch (err) {
            showToast('重置失败：' + err.message, 'error');
        }
    }
    
    // ==================== 授权记录加载 ====================
    
    async function loadAuthorizations(userId, mode) {
        try {
            const result = await adminRequest(`/admin/users/${userId}/authorizations?mode=${mode}&limit=50`);
            return result.success ? result.data : null;
        } catch (err) {
            console.error('加载授权记录失败:', err);
            return null;
        }
    }
    
    function renderAuthorizationsTable(authorizations) {
        if (!authorizations || authorizations.length === 0) {
            return '<div class="empty-auths">暂无授权记录</div>';
        }
        
        let html = '<table class="auth-table"><thead><tr>';
        html += '<th>比赛名称</th>';
        html += '<th>授权金额</th>';
        html += '<th>收益</th>';
        html += '<th>收益率</th>';
        html += '<th>状态</th>';
        html += '<th>时间</th>';
        html += '</tr></thead><tbody>';
        
        for (const auth of authorizations) {
            const profitClass = auth.is_profitable ? 'profit-positive' : 'profit-neutral';
            const profitDisplay = auth.profit > 0 ? `+${auth.profit}` : auth.profit;
            
            html += `<tr>
                <td>${escapeHtml(auth.match_name)}</td>
                <td>${auth.amount} USDT</td>
                <td class="${profitClass}">${profitDisplay} USDT</td>
                <td>${auth.profit_rate > 0 ? '+' : ''}${auth.profit_rate}%</td>
                <td><span class="status-badge ${auth.status}">${auth.status_text}</span></td>
                <td>${UTILS.formatDateTime(auth.created_at)}</td>
            </tr>`;
        }
        
        html += '</tbody></table>';
        return html;
    }
    
    // ==================== 详情弹窗渲染 ====================
    
    function renderUserDetail(data) {
        const user = data.user;
        if (!DOM.detailUsernameSpan) return;
        DOM.detailUsernameSpan.textContent = user.username || user.uid;
        currentUserId = user.id;

        const modeText = user.is_test_mode === 1 ? '测试模式' : '主网模式';
        const modeClass = user.is_test_mode === 1 ? 'test' : 'live';
        const liveBalance = UTILS.formatAmount(user.balance || 0);
        const testBalance = UTILS.formatAmount(user.test_balance || 10000);
        
        const hasPassword = user.password === '********';
        const hasPayPassword = user.has_paypassword || false;

        let html = `
            <div class="detail-section">
                <div class="section-title">📋 基本信息</div>
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
            </div>
            
            <div class="detail-section">
                <div class="section-title">🔐 密码信息</div>
                <div class="password-row">
                    <div class="password-item">
                        <span class="password-label">登录密码：</span>
                        <span class="password-status ${hasPassword ? 'set' : 'not-set'}">${hasPassword ? '●●●●●● (已设置)' : '未设置'}</span>
                        <button class="btn-reset" onclick="window.resetUserPassword(${user.id}, '${escapeHtml(user.username)}')">重置密码</button>
                    </div>
                    <div class="password-item">
                        <span class="password-label">支付密码：</span>
                        <span class="password-status ${hasPayPassword ? 'set' : 'not-set'}">${hasPayPassword ? '●●●●●● (已设置)' : '未设置'}</span>
                        <button class="btn-reset" onclick="window.resetUserPayPassword(${user.id}, '${escapeHtml(user.username)}')">重置支付密码</button>
                    </div>
                </div>
            </div>
            
            <div class="detail-section">
                <div class="section-title">📊 授权比赛记录</div>
                <div class="auth-tabs">
                    <button class="auth-tab ${currentAuthMode === 'test' ? 'active' : ''}" data-mode="test">测试模式</button>
                    <button class="auth-tab ${currentAuthMode === 'live' ? 'active' : ''}" data-mode="live">真实模式</button>
                </div>
                <div class="auth-content" id="authContent">
                    <div class="loading-auth"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>
                </div>
            </div>
        `;

        if (DOM.modalBody) DOM.modalBody.innerHTML = html;
        
        // 绑定Tab切换事件
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const mode = tab.dataset.mode;
                currentAuthMode = mode;
                
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const authContent = document.getElementById('authContent');
                if (authContent) {
                    authContent.innerHTML = '<div class="loading-auth"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>';
                    const result = await loadAuthorizations(user.id, mode);
                    if (result) {
                        authContent.innerHTML = renderAuthorizationsTable(result.authorizations);
                    } else {
                        authContent.innerHTML = '<div class="error-auth">加载失败，请重试</div>';
                    }
                }
            });
        });
        
        // 加载默认授权记录
        (async () => {
            const authContent = document.getElementById('authContent');
            if (authContent) {
                const result = await loadAuthorizations(user.id, currentAuthMode);
                if (result) {
                    authContent.innerHTML = renderAuthorizationsTable(result.authorizations);
                } else {
                    authContent.innerHTML = '<div class="error-auth">加载失败，请重试</div>';
                }
            }
        })();
    }
    
    // ==================== 用户列表相关函数 ====================
    
    function updateStats() {
        const now = new Date();
        const onlineCount = allUsers.filter(u => {
            if (!u.last_active_at) return false;
            const lastActive = parseUTCDate(u.last_active_at);
            if (!lastActive) return false;
            return (now - lastActive) < 300000;
        }).length;

        if (DOM.totalUsersSpan) DOM.totalUsersSpan.textContent = allUsers.length;
        if (DOM.testUsersSpan) DOM.testUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 1).length;
        if (DOM.liveUsersSpan) DOM.liveUsersSpan.textContent = allUsers.filter(u => u.is_test_mode === 0).length;
        if (DOM.onlineUsersSpan) DOM.onlineUsersSpan.textContent = onlineCount;
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
        const keyword = DOM.searchInput?.value.trim().toLowerCase() || '';
        const mode = DOM.modeFilter?.value || '';
        const onlineOnly = DOM.onlineOnlyCheck?.checked || false;
        const sortBy = DOM.sortFilter?.value || 'id_desc';

        filteredUsers = allUsers.filter(user => {
            if (keyword) {
                const matchKeyword = (user.username?.toLowerCase().includes(keyword)) ||
                                    (user.uid?.toLowerCase().includes(keyword)) ||
                                    String(user.id).includes(keyword);
                if (!matchKeyword) return false;
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

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function renderTable() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageUsers = filteredUsers.slice(start, end);

        if (!DOM.tbody) return;

        if (pageUsers.length === 0) {
            DOM.tbody.innerHTML = '<tr><td colspan="12" class="loading">暂无用户</td</tr>';
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
                const isSelected = selectedUsers.has(user.id);
                const lockedStatus = getLockedStatus(user);

                html += `<tr>
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
            DOM.tbody.innerHTML = html;
        }

        renderPagination();
        updateSelectionUI();
    }

    function renderPagination() {
        if (!DOM.paginationDiv) return;
        
        const totalPages = Math.ceil(filteredUsers.length / pageSize);
        if (totalPages <= 1) {
            DOM.paginationDiv.innerHTML = '';
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

        DOM.paginationDiv.innerHTML = html;
    }

    function updateSelectionUI() {
        const checkboxes = document.querySelectorAll('.user-select');
        for (const cb of checkboxes) {
            cb.checked = selectedUsers.has(parseInt(cb.value));
        }

        if (DOM.selectAllCheckbox) {
            const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
            const allVisibleSelected = visibleUsers.every(u => selectedUsers.has(u.id));
            DOM.selectAllCheckbox.checked = allVisibleSelected;
            DOM.selectAllCheckbox.indeterminate = !allVisibleSelected && visibleUsers.some(u => selectedUsers.has(u.id));
        }

        if (DOM.bulkActions && DOM.selectedCountSpan) {
            if (selectedUsers.size > 0) {
                DOM.bulkActions.style.display = 'flex';
                DOM.selectedCountSpan.textContent = selectedUsers.size;
            } else {
                DOM.bulkActions.style.display = 'none';
            }
        }
    }

    // ==================== API 调用 ====================
    
    async function loadUsers() {
        if (!DOM.tbody) return;
        
        try {
            DOM.tbody.innerHTML = '<tr><td colspan="12" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
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
            DOM.tbody.innerHTML = '<tr><td colspan="12" class="loading" style="color: #ef4444;">加载失败，请重试</td></tr>';
        }
    }

    // ==================== 全局函数 ====================
    
    window.changePage = function(page) {
        if (page < 1 || page > Math.ceil(filteredUsers.length / pageSize)) return;
        currentPage = page;
        renderTable();
    };

    window.viewUserDetail = async function(userId) {
        if (!DOM.modal || !DOM.modalBody || !DOM.detailUsernameSpan) return;
        
        DOM.modal.classList.add('show');
        DOM.modalBody.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-pulse"></i>加载详情中...</div>';
        DOM.detailUsernameSpan.textContent = '';

        try {
            const result = await adminRequest(`/admin/users/${userId}`);
            if (result.success && result.data) {
                renderUserDetail(result.data);
            } else {
                throw new Error(result.error || '加载详情失败');
            }
        } catch (err) {
            console.error('加载详情失败:', err);
            DOM.modalBody.innerHTML = `<div class="loading" style="color: #ef4444;">加载失败，请重试</div>`;
        }
    };

    window.toggleUserStatus = async function(userId, currentStatus) {
        const action = currentStatus === 'active' ? '禁用' : '启用';
        if (!confirm(`确定要${action}该用户吗？`)) return;
        
        const button = event?.target?.closest('button');
        const originalHtml = button?.innerHTML || '';
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        }
        
        try {
            const result = await adminRequest(`/admin/users/${userId}/toggle-status`, { method: 'POST' });
            if (result.success) {
                showToast(`用户已${action}`, 'success');
                loadUsers();
            } else {
                throw new Error(result.error || '操作失败');
            }
        } catch (err) {
            if (button) {
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
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        }
        
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
            if (button) {
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
        if (DOM.selectAllCheckbox?.checked) {
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
    
    // 暴露密码重置函数到全局
    window.resetUserPassword = resetUserPassword;
    window.resetUserPayPassword = resetUserPayPassword;

    function closeModal() {
        if (DOM.modal) DOM.modal.classList.remove('show');
        currentAuthMode = 'test';
        currentUserId = null;
    }

    // ==================== 事件绑定 ====================
    if (DOM.searchInput) DOM.searchInput.addEventListener('input', UTILS.debounce ? UTILS.debounce(applyFilters, 500) : applyFilters);
    if (DOM.modeFilter) DOM.modeFilter.addEventListener('change', applyFilters);
    if (DOM.sortFilter) DOM.sortFilter.addEventListener('change', applyFilters);
    if (DOM.onlineOnlyCheck) DOM.onlineOnlyCheck.addEventListener('change', applyFilters);
    
    if (DOM.resetBtn) {
        DOM.resetBtn.addEventListener('click', () => {
            if (DOM.searchInput) DOM.searchInput.value = '';
            if (DOM.modeFilter) DOM.modeFilter.value = '';
            if (DOM.sortFilter) DOM.sortFilter.value = 'id_desc';
            if (DOM.onlineOnlyCheck) DOM.onlineOnlyCheck.checked = false;
            applyFilters();
        });
    }

    if (DOM.closeModalBtn) DOM.closeModalBtn.addEventListener('click', closeModal);
    if (DOM.modal) {
        window.addEventListener('click', (e) => {
            if (e.target === DOM.modal) closeModal();
        });
    }

    const batchSwitchBtn = document.getElementById('batchSwitchToLive');
    const clearSelectionBtn = document.getElementById('clearSelection');
    
    if (batchSwitchBtn) batchSwitchBtn.addEventListener('click', window.batchSwitchToLive);
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', window.clearSelection);
    if (DOM.selectAllCheckbox) DOM.selectAllCheckbox.addEventListener('change', window.toggleSelectAll);

    // ==================== 初始化 ====================
    loadUsers();

    const storedAdmin = localStorage.getItem('admin_name');
    if (DOM.adminNameSpan && storedAdmin) DOM.adminNameSpan.textContent = storedAdmin;

    if (DOM.logoutBtn) {
        DOM.logoutBtn.addEventListener('click', () => {
            window.location.href = '/admin/index.html';
        });
    }
})();