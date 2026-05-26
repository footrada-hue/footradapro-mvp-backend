/**
 * 财务管理控制器
 */

(function() {
    if (typeof FOOTRADAPRO === 'undefined') {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    const UTILS = FOOTRADAPRO.UTILS;

    // 数据存储
    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    const pageSize = 15;
    let allUsers = [];

    // 提现数据
    let allWithdrawals = [];
    let filteredWithdrawals = [];

    // 充值数据
    let allDeposits = [];
    let filteredDeposits = [];

    // DOM 元素
    const tbody = document.getElementById('financeTableBody');
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const dateFilter = document.getElementById('dateFilter');
    const exportBtn = document.getElementById('exportBtn');
    const paginationDiv = document.getElementById('pagination');
    
    // 模态框元素
    const userSelectModal = document.getElementById('userSelectModal');
    const adjustModal = document.getElementById('adjustBalanceModal');
    const withdrawReviewModal = document.getElementById('withdrawReviewModal');
    const adjustUserId = document.getElementById('adjustUserId');
    const adjustUsername = document.getElementById('adjustUsername');
    const adjustCurrentBalance = document.getElementById('adjustCurrentBalance');
    const adjustType = document.getElementById('adjustType');
    const adjustAmount = document.getElementById('adjustAmount');
    const adjustReason = document.getElementById('adjustReason');
    const userListDiv = document.getElementById('userList');
    const userSearchInput = document.getElementById('userSearchInput');

    // 提现审核弹窗元素
    const reviewWithdrawId = document.getElementById('reviewWithdrawId');
    const reviewUsername = document.getElementById('reviewUsername');
    const reviewAmount = document.getElementById('reviewAmount');
    const reviewNetAmount = document.getElementById('reviewNetAmount');
    const reviewNetwork = document.getElementById('reviewNetwork');
    const reviewAddress = document.getElementById('reviewAddress');
    const reviewTime = document.getElementById('reviewTime');
    const reviewUserBalance = document.getElementById('reviewUserBalance');
    const reviewTxHash = document.getElementById('reviewTxHash');
    const reviewRejectReason = document.getElementById('reviewRejectReason');
    const adminNote = document.getElementById('adminNote');

    // 标签页元素
    const tabBtns = document.querySelectorAll('.tab-btn');
    const withdrawTableBody = document.getElementById('withdrawTableBody');
    const withdrawSearchInput = document.getElementById('withdrawSearchInput');
    const withdrawStatusFilter = document.getElementById('withdrawStatusFilter');
    const depositTableBody = document.getElementById('depositTableBody');
    const depositSearchInput = document.getElementById('depositSearchInput');
    const depositStatusFilter = document.getElementById('depositStatusFilter');

    // API请求
    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        
        try {
            const response = await fetch(`/api/v1${endpoint}`, { ...defaultOptions, ...options });
            return await response.json();
        } catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                window.location.href = '/admin/index.html';
            }
            throw err;
        }
    }

    // 标签页切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
            
            if (tabName === 'withdrawals') {
                loadWithdrawals();
            } else if (tabName === 'deposits') {
                loadDeposits();
            }
        });
    });

    // 加载提现数据
    async function loadWithdrawals() {
        if (!withdrawTableBody) return;
        
        try {
            withdrawTableBody.innerHTML = '<tr><td colspan="10" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
            
            const statsRes = await adminRequest('/admin/withdraw/stats');
            if (statsRes.success) {
                const pendingCount = statsRes.data.pending_count || 0;
                const pendingBadge = document.getElementById('pendingWithdrawCount');
                if (pendingBadge) {
                    if (pendingCount > 0) {
                        pendingBadge.textContent = pendingCount;
                        pendingBadge.style.display = 'inline-block';
                    } else {
                        pendingBadge.style.display = 'none';
                    }
                }
            }

            const status = withdrawStatusFilter?.value || 'pending';
            const endpoint = status === 'all' ? '/admin/withdraw/all' : `/admin/withdraw/${status}`;
            
            const res = await adminRequest(endpoint);
            if (res.success) {
                allWithdrawals = res.data;
                filterWithdrawals();
            }
        } catch (err) {
            console.error('加载提现数据失败:', err);
            withdrawTableBody.innerHTML = '<tr><td colspan="10" class="loading" style="color: #ef4444;">加载失败，请刷新重试</td></tr>';
        }
    }

    // 筛选提现
    function filterWithdrawals() {
        const keyword = withdrawSearchInput?.value.toLowerCase() || '';
        const status = withdrawStatusFilter?.value || 'pending';

        filteredWithdrawals = allWithdrawals.filter(w => {
            if (status !== 'all' && w.status !== status) return false;
            if (keyword) {
                return w.username?.toLowerCase().includes(keyword) ||
                       w.uid?.toLowerCase().includes(keyword) ||
                       w.to_address?.toLowerCase().includes(keyword) ||
                       String(w.id).includes(keyword);
            }
            return true;
        });

        renderWithdrawals();
    }

    // 渲染提现表格
    function renderWithdrawals() {
        if (!withdrawTableBody) return;
        
        if (filteredWithdrawals.length === 0) {
            withdrawTableBody.innerHTML = '<tr><td colspan="10" class="loading">暂无记录</td></tr>';
            return;
        }

        let html = '';
        filteredWithdrawals.forEach(w => {
            const fee = 1;
            const netAmount = w.amount - fee;
            const statusClass = w.status === 'pending' ? 'status-pending' : 
                               w.status === 'approved' ? 'status-approved' : 
                               w.status === 'rejected' ? 'status-rejected' : 'status-approved';
            const statusText = w.status === 'pending' ? '待审核' : 
                              w.status === 'approved' ? '已通过' : 
                              w.status === 'rejected' ? '已拒绝' : '已完成';
            
            html += `<tr>
                <td>${w.id}</td>
                <td>${UTILS.formatDateTime(w.created_at)}</td>
                <td>${w.username || w.user_id}<br><small style="color: #8e95a3;">UID: ${w.uid || '-'}</small></td>
                <td>${UTILS.formatAmount(w.amount)} USDT</td>
                <td>${fee} USDT</td>
                <td>${UTILS.formatAmount(netAmount)} USDT</td>
                <td>${w.network || '-'}</td>
                <td><span class="address-truncate" title="${w.to_address || ''}">${w.to_address || '-'}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-group">
                        ${w.status === 'pending' ? 
                            `<button class="action-btn" onclick="window.openWithdrawReview(${w.id})"><i class="fas fa-gavel"></i> 审核</button>` : 
                            `<button class="action-btn" disabled style="opacity:0.5;"><i class="fas fa-check"></i> 已处理</button>`}
                    </div>
                </td>
            </tr>`;
        });
        withdrawTableBody.innerHTML = html;
    }

    // 加载充值数据
    async function loadDeposits() {
        if (!depositTableBody) return;
        
        try {
            depositTableBody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
            
            const statsRes = await adminRequest('/admin/deposit/stats');
            if (statsRes.success) {
                const pendingCount = statsRes.data.pending_count || 0;
                const pendingBadge = document.getElementById('pendingDepositCount');
                if (pendingBadge) {
                    if (pendingCount > 0) {
                        pendingBadge.textContent = pendingCount;
                        pendingBadge.style.display = 'inline-block';
                    } else {
                        pendingBadge.style.display = 'none';
                    }
                }
            }

            const status = depositStatusFilter?.value || 'pending';
            const endpoint = status === 'all' ? '/admin/deposit/all' : `/admin/deposit/${status}`;
            
            const res = await adminRequest(endpoint);
            if (res.success) {
                allDeposits = res.data;
                filterDeposits();
            }
        } catch (err) {
            console.error('加载充值数据失败:', err);
            depositTableBody.innerHTML = '<tr><td colspan="9" class="loading" style="color: #ef4444;">加载失败，请刷新重试</td></tr>';
        }
    }

    // 筛选充值
    function filterDeposits() {
        const keyword = depositSearchInput?.value.toLowerCase() || '';
        const status = depositStatusFilter?.value || 'pending';

        filteredDeposits = allDeposits.filter(d => {
            if (status !== 'all' && d.status !== status) return false;
            if (keyword) {
                return d.username?.toLowerCase().includes(keyword) ||
                       d.uid?.toLowerCase().includes(keyword) ||
                       d.tx_hash?.toLowerCase().includes(keyword) ||
                       String(d.id).includes(keyword);
            }
            return true;
        });

        renderDeposits();
    }

    // 渲染充值表格
    function renderDeposits() {
        if (!depositTableBody) return;
        
        if (filteredDeposits.length === 0) {
            depositTableBody.innerHTML = '<tr><td colspan="9" class="loading">暂无记录</td></tr>';
            return;
        }

        let html = '';
        filteredDeposits.forEach(d => {
            const statusClass = d.status === 'pending' ? 'status-pending' : 
                               d.status === 'completed' ? 'status-approved' : 'status-rejected';
            const statusText = d.status === 'pending' ? '待确认' : 
                              d.status === 'completed' ? '已完成' : '已驳回';
            
            html += `<tr>
                <td>${d.id}</td>
                <td>${UTILS.formatDateTime(d.created_at)}</td>
                <td>${d.username || d.user_id}<br><small style="color: #8e95a3;">UID: ${d.uid || '-'}</small></td>
                <td>${UTILS.formatAmount(d.amount)} USDT</td>
                <td>${d.network || '-'}</td>
                <td><span class="address-truncate" title="${d.tx_hash || ''}">${d.tx_hash || '-'}</span></td>
                <td>${d.confirmations || 0}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-group">
                        ${d.status === 'pending' ? 
                            `<button class="action-btn" onclick="alert('充值确认功能开发中')"><i class="fas fa-check-circle"></i> 确认</button>
                             <button class="action-btn warning" onclick="alert('充值驳回功能开发中')"><i class="fas fa-times-circle"></i> 驳回</button>` : 
                            `<button class="action-btn" disabled style="opacity:0.5;"><i class="fas fa-check"></i> 已处理</button>`}
                    </div>
                </td>
            </tr>`;
        });
        depositTableBody.innerHTML = html;
    }

    // 加载财务数据
    async function loadFinanceData() {
        if (!tbody) return;
        
        try {
            tbody.innerHTML = '<tr><td colspan="10" class="loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</td></tr>';
            
            const statsRes = await adminRequest('/admin/finance/stats');
            if (statsRes.success) {
                const totalBalanceEl = document.getElementById('totalBalance');
                const todayDepositEl = document.getElementById('todayDeposit');
                const todayWithdrawEl = document.getElementById('todayWithdraw');
                const totalRevenueEl = document.getElementById('totalRevenue');
                
                if (totalBalanceEl) totalBalanceEl.textContent = statsRes.data.totalBalance.toFixed(2) + ' USDT';
                if (todayDepositEl) todayDepositEl.textContent = statsRes.data.todayDeposit.toFixed(2) + ' USDT';
                if (todayWithdrawEl) todayWithdrawEl.textContent = statsRes.data.todayWithdraw.toFixed(2) + ' USDT';
                if (totalRevenueEl) totalRevenueEl.textContent = statsRes.data.totalRevenue.toFixed(2) + ' USDT';
            }

            const recordsRes = await adminRequest('/admin/finance/records');
            if (recordsRes.success) {
                allRecords = recordsRes.data;
                applyFilters();
            }
        } catch (err) {
            console.error('加载财务数据失败:', err);
            tbody.innerHTML = '<tr><td colspan="10" class="loading" style="color: #ef4444;">加载失败，请重试</td></tr>';
        }
    }

    // 加载用户列表
    async function loadUsers() {
        try {
            const result = await adminRequest('/admin/finance/users');
            if (result.success) {
                allUsers = result.data;
                renderUserList();
            }
        } catch (err) {
            console.error('加载用户列表失败:', err);
            if (userListDiv) userListDiv.innerHTML = '<div class="loading">加载失败</div>';
        }
    }

    // 渲染用户列表
    function renderUserList() {
        if (!userListDiv) return;
        
        const keyword = userSearchInput?.value.toLowerCase() || '';
        const filtered = allUsers.filter(user => 
            user.username.toLowerCase().includes(keyword) || 
            user.uid.toLowerCase().includes(keyword) ||
            String(user.id).includes(keyword)
        );

        if (filtered.length === 0) {
            userListDiv.innerHTML = '<div class="loading">暂无用户</div>';
            return;
        }

        let html = '';
        filtered.forEach(user => {
            html += `
                <div class="user-item" onclick="window.selectUser(${user.id}, '${user.username}', ${user.balance})">
                    <div>
                        <strong>${user.username}</strong>
                        <div style="font-size: 12px; color: #8e95a3;">UID: ${user.uid}</div>
                    </div>
                    <div style="color: #10b981;">${user.balance.toFixed(2)} USDT</div>
                </div>
            `;
        });
        userListDiv.innerHTML = html;
    }

    // 应用筛选
    function applyFilters() {
        const keyword = searchInput?.value.trim().toLowerCase() || '';
        const type = typeFilter?.value || '';
        const days = dateFilter?.value || 'all';

        filteredRecords = allRecords.filter(record => {
            if (keyword) {
                if (!(record.username?.toLowerCase().includes(keyword) ||
                      String(record.user_id).includes(keyword))) {
                    return false;
                }
            }
            if (type && record.type !== type) return false;
            if (days !== 'all') {
                const recordDate = new Date(record.created_at);
                const limitDate = new Date();
                limitDate.setDate(limitDate.getDate() - parseInt(days));
                if (recordDate < limitDate) return false;
            }
            return true;
        });

        currentPage = 1;
        renderTable();
    }

    // 渲染表格
    function renderTable() {
        if (!tbody) return;
        
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageRecords = filteredRecords.slice(start, end);

        if (pageRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">暂无记录</td></tr>';
            return;
        }

        let html = '';
        pageRecords.forEach(record => {
            const amountClass = record.amount > 0 ? 'text-success' : 'text-danger';
            const sign = record.amount > 0 ? '+' : '';
            // 统一的类型配置
const typeConfig = {
    deposit: { text: '充值', class: 'badge-deposit' },
    withdraw: { text: '提现申请', class: 'badge-withdraw' },
    withdraw_success: { text: '提现成功', class: 'badge-withdraw-approved' },
    withdraw_reject: { text: '提现驳回', class: 'badge-withdraw-reject' },
    authorization: { text: '授权', class: 'badge-authorization' },
    settlement: { text: '结算', class: 'badge-settlement' },
    bonus: { text: '体验金', class: 'badge-bonus' },
    admin_add: { text: '增加', class: 'badge-admin-add' },
    admin_deduct: { text: '扣除', class: 'badge-admin-deduct' },
    admin_set: { text: '设置', class: 'badge-admin-set' },
    bet: { text: '授权', class: 'badge-authorization' }
    
};
const config = typeConfig[record.type] || { text: record.type, class: 'badge-other' };
const typeText = config.text;
const typeClass = config.class;
            const operator = record.admin_name || '系统';

            html += `<tr>
                <td>${record.id}</td>
                <td>${UTILS.formatDateTime(record.created_at)}</td>
                <td>${record.username || record.user_id}</td>
                <td><span class="badge ${typeClass}">${typeText}</span></td>
                <td class="${amountClass}">${sign}${UTILS.formatAmount(record.amount)} USDT</td>
                <td>${UTILS.formatAmount(record.balance_before)} USDT</td>
                <td>${UTILS.formatAmount(record.balance_after)} USDT</td>
                <td>${record.reason || '-'}</td>
                <td>${operator}</td>
                <td>
                    <div class="action-group">
                        <button class="action-btn" onclick="window.viewUserDetail(${record.user_id})">
                            <i class="fas fa-eye"></i> 查看
                        </button>
                        <button class="action-btn" onclick="window.adjustBalance(${record.user_id}, '${record.username || record.user_id}')">
                            <i class="fas fa-coins"></i> 调整
                        </button>
                    </div>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
        renderPagination();
    }

    // 渲染分页
    function renderPagination() {
        if (!paginationDiv) return;
        
        const totalPages = Math.ceil(filteredRecords.length / pageSize);
        if (totalPages <= 1) {
            paginationDiv.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="page-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
        }

        html += `<button class="page-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        paginationDiv.innerHTML = html;
    }

    // 切换页码
    window.changePage = function(page) {
        if (page < 1 || page > Math.ceil(filteredRecords.length / pageSize)) return;
        currentPage = page;
        renderTable();
    };

    // 查看用户详情
    window.viewUserDetail = function(userId) {
        window.location.href = `/admin/users.html?userId=${userId}`;
    };

    // 打开选择用户模态框
    window.openUserSelectModal = function() {
        if (userSelectModal) {
            userSelectModal.classList.add('show');
            loadUsers();
            if (userSearchInput) {
                userSearchInput.value = '';
                userSearchInput.addEventListener('input', renderUserList);
            }
        }
    };

    // 关闭选择用户模态框
    window.closeUserSelectModal = function() {
        if (userSelectModal) userSelectModal.classList.remove('show');
    };

    // 选择用户
    window.selectUser = function(userId, username, balance) {
        closeUserSelectModal();
        if (adjustUserId) adjustUserId.value = userId;
        if (adjustUsername) adjustUsername.textContent = username;
        if (adjustCurrentBalance) adjustCurrentBalance.textContent = balance.toFixed(2);
        if (adjustAmount) adjustAmount.value = '';
        if (adjustReason) adjustReason.value = '';
        if (adjustType) adjustType.value = 'add';
        if (adjustModal) adjustModal.classList.add('show');
    };

    // 打开调整余额模态框
    window.adjustBalance = async function(userId, username) {
        try {
            const result = await adminRequest(`/admin/finance/users/${userId}`);
            if (result.success) {
                if (adjustUserId) adjustUserId.value = userId;
                if (adjustUsername) adjustUsername.textContent = username;
                if (adjustCurrentBalance) adjustCurrentBalance.textContent = result.data.user.balance.toFixed(2);
                if (adjustAmount) adjustAmount.value = '';
                if (adjustReason) adjustReason.value = '';
                if (adjustType) adjustType.value = 'add';
                if (adjustModal) adjustModal.classList.add('show');
            }
        } catch (err) {
            alert('获取用户信息失败');
        }
    };

    // 关闭调整模态框
    window.closeAdjustModal = function() {
        if (adjustModal) adjustModal.classList.remove('show');
    };

    // 提交调整
    window.submitAdjustBalance = async function() {
        const userId = adjustUserId?.value;
        const type = adjustType?.value;
        const amount = parseFloat(adjustAmount?.value);
        const reason = adjustReason?.value || 
            (type === 'add' ? '管理员增加' : 
             type === 'deduct' ? '管理员扣除' : '管理员设置');
        
        if (!amount || amount <= 0) {
            alert('请输入有效的金额');
            return;
        }
        
        let endpoint = '';
        let body = {};
        
        if (type === 'add') {
            endpoint = `/admin/finance/users/${userId}/add`;
            body = { amount, reason };
        } else if (type === 'deduct') {
            endpoint = `/admin/finance/users/${userId}/deduct`;
            body = { amount, reason };
        } else if (type === 'set') {
            endpoint = `/admin/finance/users/${userId}/set`;
            body = { balance: amount, reason };
        }
        
        try {
            const result = await adminRequest(endpoint, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            
            if (result.success) {
                alert('余额调整成功！');
                closeAdjustModal();
                loadFinanceData();
            } else {
                alert(result.message || '调整失败');
            }
        } catch (err) {
            alert('调整失败：' + (err.message || '未知错误'));
        }
    };

    // 打开提现审核弹窗
    window.openWithdrawReview = async function(withdrawId) {
        try {
            const res = await adminRequest(`/admin/withdraw/${withdrawId}`);
            if (res.success) {
                const w = res.data;
                if (reviewWithdrawId) reviewWithdrawId.value = w.id;
                if (reviewUsername) reviewUsername.textContent = `${w.username} (UID: ${w.uid})`;
                if (reviewAmount) reviewAmount.textContent = w.amount + ' USDT';
                if (reviewNetAmount) reviewNetAmount.textContent = (w.amount - 1) + ' USDT';
                if (reviewNetwork) reviewNetwork.textContent = w.network || '-';
                if (reviewAddress) reviewAddress.textContent = w.to_address || '-';
                if (reviewTime) reviewTime.textContent = UTILS.formatDateTime(w.created_at);
                if (reviewUserBalance) reviewUserBalance.textContent = w.user_balance + ' USDT';
                
                if (reviewTxHash) reviewTxHash.value = '';
                if (reviewRejectReason) reviewRejectReason.value = '';
                if (adminNote) adminNote.value = '';
                
                toggleReviewAction('approve');
                
                if (withdrawReviewModal) withdrawReviewModal.classList.add('show');
            }
        } catch (err) {
            alert('获取提现详情失败');
        }
    };

    // 关闭提现审核弹窗
    window.closeWithdrawReviewModal = function() {
        if (withdrawReviewModal) withdrawReviewModal.classList.remove('show');
    };

    // 切换审核操作类型
    window.toggleReviewAction = function(action) {
        const approveSection = document.getElementById('approveSection');
        const rejectSection = document.getElementById('rejectSection');
        
        if (action === 'approve') {
            if (approveSection) approveSection.style.display = 'block';
            if (rejectSection) rejectSection.style.display = 'none';
        } else {
            if (approveSection) approveSection.style.display = 'none';
            if (rejectSection) rejectSection.style.display = 'block';
        }
    };

    // 提交提现审核
    window.submitWithdrawReview = async function() {
        const withdrawId = reviewWithdrawId?.value;
        const action = document.querySelector('input[name="reviewAction"]:checked')?.value;
        const note = adminNote?.value || '';
        
        if (action === 'approve') {
            const txHash = reviewTxHash?.value.trim();
            if (!txHash) {
                alert('请输入交易哈希');
                return;
            }
            
            try {
                const res = await adminRequest(`/admin/withdraw/${withdrawId}/approve`, {
                    method: 'POST',
                    body: JSON.stringify({ tx_hash: txHash, admin_note: note })
                });
                
                if (res.success) {
                    alert('提现已通过');
                    closeWithdrawReviewModal();
                    loadWithdrawals();
                    loadFinanceData();
                } else {
                    alert(res.message || '操作失败');
                }
            } catch (err) {
                alert('操作失败：' + (err.message || '未知错误'));
            }
        } else if (action === 'reject') {
            const reason = reviewRejectReason?.value.trim();
            if (!reason) {
                alert('请输入拒绝原因');
                return;
            }
            
            try {
                const res = await adminRequest(`/admin/withdraw/${withdrawId}/reject`, {
                    method: 'POST',
                    body: JSON.stringify({ admin_note: reason + (note ? ` (${note})` : '') })
                });
                
                if (res.success) {
                    alert('提现已拒绝');
                    closeWithdrawReviewModal();
                    loadWithdrawals();
                } else {
                    alert(res.message || '操作失败');
                }
            } catch (err) {
                alert('操作失败：' + (err.message || '未知错误'));
            }
        }
    };

    // 导出报表
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const data = filteredRecords.map(r => ({
                时间: UTILS.formatDateTime(r.created_at),
                用户: r.username || r.user_id,
                类型: r.type,
                金额: r.amount,
                变动前: r.balance_before,
                变动后: r.balance_after,
                原因: r.reason,
                操作员: r.admin_name || '系统'
            }));
            const csv = convertToCSV(data);
            downloadCSV(csv, `财务记录_${new Date().toISOString().split('T')[0]}.csv`);
        });
    }

    function convertToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const rows = data.map(obj => headers.map(h => obj[h]).join(','));
        return [headers.join(','), ...rows].join('\n');
    }

    function downloadCSV(csv, filename) {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    // 事件监听
    if (searchInput) searchInput.addEventListener('input', UTILS.debounce ? UTILS.debounce(applyFilters, 500) : applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (dateFilter) dateFilter.addEventListener('change', applyFilters);
    
    if (userSearchInput) {
        userSearchInput.addEventListener('input', renderUserList);
    }

    if (withdrawSearchInput) {
        withdrawSearchInput.addEventListener('input', filterWithdrawals);
    }

    if (withdrawStatusFilter) {
        withdrawStatusFilter.addEventListener('change', filterWithdrawals);
    }

    if (depositSearchInput) {
        depositSearchInput.addEventListener('input', filterDeposits);
    }

    if (depositStatusFilter) {
        depositStatusFilter.addEventListener('change', filterDeposits);
    }

    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === adjustModal) closeAdjustModal();
        if (e.target === userSelectModal) closeUserSelectModal();
        if (e.target === withdrawReviewModal) closeWithdrawReviewModal();
    });

    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = '/admin/index.html';
        });
    }

    // 设置管理员名称
    const adminNameSpan = document.getElementById('adminName');
    const storedAdmin = localStorage.getItem('admin_name');
    if (adminNameSpan && storedAdmin) {
        adminNameSpan.textContent = storedAdmin;
    }

    // 初始化
    loadFinanceData();
})();