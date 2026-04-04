/**
 * FOOTRADAPRO - 清算管理控制器 v2.0
 * @description 支持筛选、排序、批量清算、快速清算功能
 */

(function() {
    'use strict';

    // ==================== 工具函数 ====================
    const UTILS = {
        formatDateTime: (dateStr) => {
            if (!dateStr) return '-';
            try {
                const date = new Date(dateStr);
                return date.toLocaleString('zh-CN', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                });
            } catch (e) {
                return '-';
            }
        },
        
        formatAmount: (num) => {
            const value = Number(num);
            return isNaN(value) ? '0.00' : value.toFixed(2);
        },
        
        showToast: (msg, type = 'success') => {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
            toast.style.cssText = `
                position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
                background: ${type === 'success' ? '#10b981' : '#ef4444'}; color: white;
                border-radius: 12px; z-index: 10000; display: flex; align-items: center; gap: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease;
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        },
        
        escapeHtml: (str) => {
            if (!str) return '';
            return str.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        }
    };

    // 添加动画
    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
    document.head.appendChild(style);

    // ==================== DOM 元素 ====================
    const DOM = {
        pendingTable: document.getElementById('pendingTableBody'),
        historyTable: document.getElementById('historyTableBody'),
        pendingCount: document.getElementById('pendingCount'),
        todayCount: document.getElementById('todayCount'),
        totalAmount: document.getElementById('totalAmount'),
        settledCount: document.getElementById('settledCount'),
        modal: document.getElementById('settleModal'),
        batchModal: document.getElementById('batchSettleModal'),
        winBtn: document.getElementById('winStatusBtn'),
        lossBtn: document.getElementById('lossStatusBtn'),
        profitRate: document.getElementById('profitRateInput'),
        confirmBtn: document.getElementById('confirmSettleBtn'),
        cancelBtn: document.getElementById('cancelSettleBtn'),
        closeModal: document.getElementById('closeModalBtn'),
        toggleAuth: document.getElementById('toggleAuthBtn'),
        authContent: document.getElementById('authContent'),
        authToggleIcon: document.getElementById('authToggleIcon'),
        logoutBtn: document.getElementById('logoutBtn'),
        adminName: document.getElementById('adminName'),
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        // 筛选元素
        searchInput: document.getElementById('searchInput'),
        leagueFilter: document.getElementById('leagueFilter'),
        hasAuthFilter: document.getElementById('hasAuthFilter'),
        sortFilter: document.getElementById('sortFilter'),
        resetFilterBtn: document.getElementById('resetFilterBtn'),
        // 批量操作元素
        batchBar: document.getElementById('batchBar'),
        selectedCountSpan: document.getElementById('selectedCount'),
        selectAllCheckbox: document.getElementById('selectAllCheckbox'),
        batchSettleBtn: document.getElementById('batchSettleBtn'),
        selectAllBtn: document.getElementById('selectAllBtn'),
        clearSelectionBtn: document.getElementById('clearSelectionBtn'),
        // 批量清算模态框
        batchWinBtn: document.getElementById('batchWinBtn'),
        batchLossBtn: document.getElementById('batchLossBtn'),
        batchProfitRate: document.getElementById('batchProfitRate'),
        confirmBatchBtn: document.getElementById('confirmBatchBtn'),
        cancelBatchBtn: document.getElementById('cancelBatchBtn'),
        closeBatchModal: document.getElementById('closeBatchModalBtn'),
        batchCountSpan: document.getElementById('batchCount')
    };

    // 模态框元素
    const ModalDOM = {
        matchTitle: document.getElementById('modalMatchTitle'),
        matchLeague: document.getElementById('modalMatchLeague'),
        matchTime: document.getElementById('modalMatchTime'),
        execRate: document.getElementById('modalExecRate'),
        totalAuth: document.getElementById('modalTotalAuth'),
        authCount: document.getElementById('authCount'),
        authTableBody: document.getElementById('authTableBody'),
        totalAuthCount: document.getElementById('totalAuthCount'),
        totalAuthAmount: document.getElementById('totalAuthAmount'),
        previewTotalPayout: document.getElementById('previewTotalPayout'),
        previewTotalAmount: document.getElementById('previewTotalAmount'),
        previewTotalDeployed: document.getElementById('previewTotalDeployed'),
        previewTotalReserved: document.getElementById('previewTotalReserved'),
        previewAuth: document.getElementById('previewAuth'),
        previewDeployed: document.getElementById('previewDeployed'),
        previewReserved: document.getElementById('previewReserved'),
        previewProfit: document.getElementById('previewProfit'),
        previewFee: document.getElementById('previewFee'),
        previewNet: document.getElementById('previewNet'),
        previewTotal: document.getElementById('previewTotal')
    };

    let allMatches = [];
    let filteredMatches = [];
    let selectedMatches = new Set();
    let currentMatch = null;
    let currentStatus = 'win';
    let batchStatus = 'win';
    let currentPage = 1;
    const pageSize = 10;

    // ==================== API 请求 ====================
    async function adminRequest(endpoint, options = {}) {
        const token = localStorage.getItem('admin_token');
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            credentials: 'include'
        };

        try {
            const response = await fetch(`/api/v1/admin/settle${endpoint}`, {
                ...defaultOptions,
                ...options
            });
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('admin_token');
                    localStorage.removeItem('admin_name');
                    UTILS.showToast('登录已过期，请重新登录', 'error');
                    setTimeout(() => {
                        window.location.href = '/admin/index.html';
                    }, 1500);
                }
                throw new Error(data.error || data.message || '请求失败');
            }

            return data;
        } catch (err) {
            console.error('API请求失败:', err);
            throw err;
        }
    }

    // ==================== 加载待结算列表 ====================
    async function loadPendingMatches() {
        if (!DOM.pendingTable) return;

        try {
            DOM.pendingTable.innerHTML = `
                <tr><td colspan="9" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> 加载中...<\/td><\/tr>
            `;

            const result = await adminRequest('/pending');
            
            if (result.success && result.data) {
                allMatches = result.data;
                applyFilters();
                if (DOM.pendingCount) {
                    DOM.pendingCount.textContent = allMatches.length;
                }
            }
        } catch (err) {
            DOM.pendingTable.innerHTML = `
                <tr><td colspan="9" class="loading-cell" style="color: #ef4444;">加载失败: ${err.message}<\/td><\/tr>
            `;
        }
    }

    // ==================== 筛选和排序 ====================
    function applyFilters() {
        let filtered = [...allMatches];
        
        // 搜索筛选
        const keyword = DOM.searchInput?.value.trim().toLowerCase();
        if (keyword) {
            filtered = filtered.filter(m => 
                m.home_team.toLowerCase().includes(keyword) ||
                m.away_team.toLowerCase().includes(keyword)
            );
        }
        
        // 联赛筛选
        const league = DOM.leagueFilter?.value;
        if (league && league !== 'all') {
            filtered = filtered.filter(m => m.league === league);
        }
        
        // 授权状态筛选
        const hasAuth = DOM.hasAuthFilter?.value;
        if (hasAuth === 'yes') {
            filtered = filtered.filter(m => m.auth_count > 0);
        } else if (hasAuth === 'no') {
            filtered = filtered.filter(m => m.auth_count === 0);
        }
        
        // 排序
        const sortBy = DOM.sortFilter?.value || 'time_desc';
        filtered.sort((a, b) => {
            switch(sortBy) {
                case 'time_asc':
                    return new Date(a.match_time) - new Date(b.match_time);
                case 'auth_desc':
                    return (b.auth_count || 0) - (a.auth_count || 0);
                case 'auth_asc':
                    return (a.auth_count || 0) - (b.auth_count || 0);
                case 'amount_desc':
                    return (b.total_amount || 0) - (a.total_amount || 0);
                case 'amount_asc':
                    return (a.total_amount || 0) - (b.total_amount || 0);
                default:
                    return new Date(b.match_time) - new Date(a.match_time);
            }
        });
        
        filteredMatches = filtered;
        currentPage = 1;
        renderPendingTable();
        renderPendingPagination();
        
        // 更新统计卡片中的待结算数量
        if (DOM.pendingCount) {
            DOM.pendingCount.textContent = allMatches.length;
        }
    }
    
    function renderPendingTable() {
        if (!DOM.pendingTable) return;
        
        const start = (currentPage - 1) * pageSize;
        const pageMatches = filteredMatches.slice(start, start + pageSize);
        
        if (pageMatches.length === 0) {
            DOM.pendingTable.innerHTML = '<tr><td colspan="8" class="empty-cell">暂无待结算比赛</td></tr>';
            return;
        }
        
        let html = '';
        pageMatches.forEach(match => {
            const isSelected = selectedMatches.has(match.id);
            const hasAuth = match.auth_count > 0;
            
            html += `
                <tr>
                    <td style="text-align: center;">
                        <input type="checkbox" class="match-checkbox" data-id="${match.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td><strong>${UTILS.escapeHtml(match.home_team)}</strong> vs <strong>${UTILS.escapeHtml(match.away_team)}</strong></td>
                    <td>${UTILS.escapeHtml(match.league || '-')}</td>
                    <td>${UTILS.formatDateTime(match.match_time)}</td>
                    <td class="score-cell">
    ${(match.home_score !== null && match.away_score !== null) 
        ? `<span class="match-score">${match.home_score} : ${match.away_score}</span>` 
        : `<span class="score-missing">待获取</span>`}
</td>
                    <td><span class="rate-badge">${match.execution_rate || 30}%</span></td>
                    <td class="${hasAuth ? 'text-success' : ''}">${match.auth_count || 0}</td>
                    <td class="amount-cell">${UTILS.formatAmount(match.total_amount || 0)} USDT</td>
                    <td>
                        <button class="action-btn settle-btn" data-match-id="${match.match_id}" data-id="${match.id}">
                            <i class="fas fa-calculator"></i> 清算
                        </button>
                        ${hasAuth ? `<button class="action-btn quick quick-settle-btn" data-match-id="${match.match_id}" data-id="${match.id}" title="快速清算(盈利40%)">
                            <i class="fas fa-bolt"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `;
        });
        DOM.pendingTable.innerHTML = html;
        
        // 绑定清算按钮事件
        document.querySelectorAll('.settle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const matchId = btn.dataset.matchId;
                openSettleModal(matchId);
            });
        });
        
        // 绑定快速清算按钮事件
        document.querySelectorAll('.quick-settle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const matchId = btn.dataset.matchId;
                quickSettle(matchId);
            });
        });
        
        // 绑定复选框事件
        document.querySelectorAll('.match-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    selectedMatches.add(id);
                } else {
                    selectedMatches.delete(id);
                }
                updateBatchBar();
                updateSelectAllCheckbox();
            });
        });
        
        updateBatchBar();
        updateSelectAllCheckbox();
    }
    
    function renderPendingPagination() {
        const totalPages = Math.ceil(filteredMatches.length / pageSize);
        const paginationDiv = document.getElementById('pendingPagination');
        if (!paginationDiv) return;
        
        if (totalPages <= 1) {
            paginationDiv.innerHTML = '';
            return;
        }
        
        let html = '';
        html += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<button class="page-btn" disabled>...</button>`;
            }
        }
        
        html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        paginationDiv.innerHTML = html;
        
        document.querySelectorAll('#pendingPagination .page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                    currentPage = page;
                    renderPendingTable();
                    renderPendingPagination();
                }
            });
        });
    }
    
    function updateBatchBar() {
        const count = selectedMatches.size;
        if (DOM.batchBar) {
            DOM.batchBar.style.display = count > 0 ? 'flex' : 'none';
        }
        if (DOM.selectedCountSpan) {
            DOM.selectedCountSpan.textContent = count;
        }
    }
    
    function updateSelectAllCheckbox() {
        if (!DOM.selectAllCheckbox) return;
        const start = (currentPage - 1) * pageSize;
        const pageMatches = filteredMatches.slice(start, start + pageSize);
        const allSelected = pageMatches.length > 0 && pageMatches.every(m => selectedMatches.has(m.id));
        DOM.selectAllCheckbox.checked = allSelected;
    }
    
    function selectAllOnPage() {
        const start = (currentPage - 1) * pageSize;
        const pageMatches = filteredMatches.slice(start, start + pageSize);
        pageMatches.forEach(m => selectedMatches.add(m.id));
        renderPendingTable();
    }
    
    function clearSelection() {
        selectedMatches.clear();
        renderPendingTable();
    }

    // ==================== 快速清算 ====================
    async function quickSettle(matchId) {
        if (!confirm('快速清算将使用默认参数（盈利40%），是否继续？')) return;
        
        try {
            UTILS.showToast('正在执行快速清算...', 'info');
            
            const previewRes = await adminRequest(`/preview/${matchId}`);
            if (!previewRes.success || !previewRes.data) {
                throw new Error('获取比赛数据失败');
            }
            
            const match = previewRes.data;
            if (match.auth_count === 0) {
                UTILS.showToast('该比赛没有授权记录，无需清算', 'error');
                return;
            }
            
            const result = await adminRequest('/execute', {
                method: 'POST',
                body: JSON.stringify({
                    matchId: match.id,
                    status: 'win',
                    profitRate: 40
                })
            });
            
            if (result.success) {
                UTILS.showToast('清算成功！', 'success');
                loadPendingMatches();
                loadSettledHistory();
                if (confirm('清算成功！是否立即编辑复盘报告？') && match.match_id) {
                    window.location.href = `/admin/report-editor.html?matchId=${match.match_id}`;
                }
            } else {
                throw new Error(result.message || '清算失败');
            }
        } catch (err) {
            UTILS.showToast('快速清算失败: ' + err.message, 'error');
        }
    }
    
    // ==================== 批量清算 ====================
    function openBatchSettleModal() {
        if (selectedMatches.size === 0) {
            UTILS.showToast('请先选择要清算的比赛', 'error');
            return;
        }
        
        if (DOM.batchCountSpan) {
            DOM.batchCountSpan.textContent = selectedMatches.size;
        }
        
        if (DOM.batchModal) {
            DOM.batchModal.classList.add('show');
        }
    }
    
    async function confirmBatchSettle() {
        const selectedIds = Array.from(selectedMatches);
        const selectedMatchData = allMatches.filter(m => selectedIds.includes(m.id));
        const matchesWithAuth = selectedMatchData.filter(m => m.auth_count > 0);
        
        if (matchesWithAuth.length === 0) {
            UTILS.showToast('所选比赛均无授权记录', 'error');
            return;
        }
        
        if (matchesWithAuth.length !== selectedIds.length) {
            UTILS.showToast(`已自动跳过 ${selectedIds.length - matchesWithAuth.length} 场无授权比赛`, 'info');
        }
        
        const status = batchStatus;
        const profitRate = status === 'win' ? parseInt(DOM.batchProfitRate?.value || 40) : -100;
        
        if (!confirm(`确定要批量清算 ${matchesWithAuth.length} 场比赛吗？${status === 'win' ? '将使用盈利' + profitRate + '%' : '将全部标记为亏损'}`)) {
            return;
        }
        
        try {
            if (DOM.confirmBatchBtn) {
                DOM.confirmBatchBtn.disabled = true;
                DOM.confirmBatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 清算中...';
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (const match of matchesWithAuth) {
                try {
                    const result = await adminRequest('/execute', {
                        method: 'POST',
                        body: JSON.stringify({
                            matchId: match.id,
                            status: status,
                            profitRate: profitRate
                        })
                    });
                    
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                        console.error(`清算失败: ${match.home_team} vs ${match.away_team}`, result.message);
                    }
                } catch (err) {
                    failCount++;
                    console.error(`清算失败: ${match.home_team} vs ${match.away_team}`, err);
                }
            }
            
            UTILS.showToast(`批量清算完成！成功: ${successCount} 场，失败: ${failCount} 场`, successCount > 0 ? 'success' : 'error');
            
            if (DOM.batchModal) {
                DOM.batchModal.classList.remove('show');
            }
            
            selectedMatches.clear();
            loadPendingMatches();
            loadSettledHistory();
            
        } catch (err) {
            UTILS.showToast('批量清算失败: ' + err.message, 'error');
        } finally {
            if (DOM.confirmBatchBtn) {
                DOM.confirmBatchBtn.disabled = false;
                DOM.confirmBatchBtn.innerHTML = '<i class="fas fa-check"></i> 确认批量清算';
            }
        }
    }

    // ==================== 加载清算历史 ====================
    async function loadSettledHistory() {
        if (!DOM.historyTable) return;

        try {
            DOM.historyTable.innerHTML = `
                <tr><td colspan="8" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> 加载中...<\/td><\/tr>
            `;

            const result = await adminRequest('/history');
            
            if (result.success && result.data) {
                renderSettledHistory(result.data);
                if (DOM.todayCount) {
                    DOM.todayCount.textContent = result.data.length;
                }
                
                const total = result.data.reduce((sum, h) => sum + (h.total_amount || 0), 0);
                if (DOM.totalAmount) {
                    DOM.totalAmount.textContent = UTILS.formatAmount(total) + ' USDT';
                }
                if (DOM.settledCount) {
                    DOM.settledCount.textContent = result.data.length;
                }
            }
        } catch (err) {
            DOM.historyTable.innerHTML = `
                <tr><td colspan="8" class="loading-cell" style="color: #ef4444;">加载失败: ${err.message}<\/td><\/tr>
            `;
        }
    }

    function renderSettledHistory(history) {
        if (!DOM.historyTable) return;

        if (history.length === 0) {
            DOM.historyTable.innerHTML = '<tr><td colspan="8" class="empty-cell">暂无清算历史</td></tr>';
            return;
        }

        let html = '';
        history.forEach(item => {
            const resultText = item.result === 'win' ? '盈利' : '亏损';
            const resultClass = item.result === 'win' ? 'win' : 'loss';
            const profitSign = (item.total_profit || 0) > 0 ? '+' : '';
            
            html += `
                <tr>
                    <td><strong>${UTILS.escapeHtml(item.home_team)}</strong> vs <strong>${UTILS.escapeHtml(item.away_team)}</strong></td>
                    <td><span class="status-badge ${resultClass}">${resultText}</span></td>
                    <td>${item.profit_rate || 0}%</td>
                    <td>${item.auth_count || 0}</td>
                    <td>${UTILS.formatAmount(item.total_amount || 0)} USDT</td>
                    <td class="${item.total_profit > 0 ? 'text-success' : 'text-danger'}">${profitSign}${UTILS.formatAmount(item.total_profit || 0)} USDT</td>
                    <td>${UTILS.formatDateTime(item.settled_at)}</td>
                    <td><button class="action-btn report-btn" data-match-id="${item.match_id}"><i class="fas fa-file-alt"></i> 报告</button></td>
                </tr>
            `;
        });
        DOM.historyTable.innerHTML = html;

        document.querySelectorAll('.report-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const matchId = btn.dataset.matchId;
                window.location.href = `/admin/report-editor.html?matchId=${matchId}`;
            });
        });
    }

    // ==================== 打开清算模态框 ====================
    async function openSettleModal(matchId) {
        if (!matchId) {
            UTILS.showToast('比赛ID无效', 'error');
            return;
        }
        
        try {
            UTILS.showToast('加载清算数据...', 'info');
            
            const result = await adminRequest(`/preview/${matchId}`);
            
            if (result.success && result.data) {
                currentMatch = result.data;
                
                if (ModalDOM.matchTitle) {
                    ModalDOM.matchTitle.textContent = `${currentMatch.home_team} vs ${currentMatch.away_team}`;
                }
                if (ModalDOM.matchLeague) {
                    ModalDOM.matchLeague.textContent = currentMatch.league || '-';
                }
                if (ModalDOM.matchTime) {
                    ModalDOM.matchTime.textContent = UTILS.formatDateTime(currentMatch.match_time);
                }
                if (ModalDOM.execRate) {
                    ModalDOM.execRate.textContent = (currentMatch.execution_rate || 30) + '%';
                }
                if (ModalDOM.totalAuth) {
                    ModalDOM.totalAuth.textContent = UTILS.formatAmount(currentMatch.total_amount || 0) + ' USDT';
                }
                
                const auths = currentMatch.authorizations || [];
                if (ModalDOM.authCount) {
                    ModalDOM.authCount.textContent = auths.length;
                }
                
                if (auths.length > 0) {
                    let total = 0;
                    let authHtml = '';
                    auths.forEach(auth => {
                        total += auth.amount || 0;
                        authHtml += `
                            <tr>
                                <td>${auth.user_id}</td>
                                <td>${UTILS.escapeHtml(auth.username || '-')}</td>
                                <td>${UTILS.formatAmount(auth.amount || 0)} USDT</td>
                                <td>${UTILS.formatDateTime(auth.created_at)}</td>
                            </tr>
                        `;
                    });
                    if (ModalDOM.authTableBody) {
                        ModalDOM.authTableBody.innerHTML = authHtml;
                    }
                    if (ModalDOM.totalAuthCount) {
                        ModalDOM.totalAuthCount.textContent = auths.length;
                    }
                    if (ModalDOM.totalAuthAmount) {
                        ModalDOM.totalAuthAmount.textContent = UTILS.formatAmount(total);
                    }
                } else {
                    if (ModalDOM.authTableBody) {
                        ModalDOM.authTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无授权记录</td></tr>';
                    }
                    if (ModalDOM.totalAuthCount) ModalDOM.totalAuthCount.textContent = '0';
                    if (ModalDOM.totalAuthAmount) ModalDOM.totalAuthAmount.textContent = '0.00';
                }
                
                if (ModalDOM.previewTotalAmount) {
                    ModalDOM.previewTotalAmount.textContent = UTILS.formatAmount(currentMatch.total_amount || 0) + ' USDT';
                }
                if (ModalDOM.previewTotalDeployed) {
                    ModalDOM.previewTotalDeployed.textContent = UTILS.formatAmount(currentMatch.total_deployed || 0) + ' USDT';
                }
                if (ModalDOM.previewTotalReserved) {
                    ModalDOM.previewTotalReserved.textContent = UTILS.formatAmount(currentMatch.total_reserved || 0) + ' USDT';
                }
                if (ModalDOM.previewAuth) {
                    ModalDOM.previewAuth.textContent = (currentMatch.sample_auth || 100) + ' USDT';
                }
                if (ModalDOM.previewDeployed) {
                    ModalDOM.previewDeployed.textContent = UTILS.formatAmount(currentMatch.deployed_sample || 0) + ' USDT';
                }
                if (ModalDOM.previewReserved) {
                    ModalDOM.previewReserved.textContent = UTILS.formatAmount(currentMatch.reserved_sample || 0) + ' USDT';
                }
                
                updatePreview();
                
                if (DOM.modal) {
                    DOM.modal.classList.add('show');
                }
            } else {
                UTILS.showToast('获取清算数据失败', 'error');
            }
        } catch (err) {
            console.error('加载清算数据失败:', err);
            UTILS.showToast('加载清算数据失败: ' + err.message, 'error');
        }
    }

    function updatePreview() {
        if (!currentMatch) return;
        
        const deployed = currentMatch.deployed_sample || 0;
        const reserved = currentMatch.reserved_sample || 0;
        const totalDeployed = currentMatch.total_deployed || 0;
        const totalReserved = currentMatch.total_reserved || 0;
        
        if (currentStatus === 'win') {
            const profitPercent = parseInt(DOM.profitRate?.value || 40);
            
            const totalProfit = totalDeployed * (profitPercent / 100);
            const totalFee = totalProfit * 0.2;
            const totalNetProfit = totalProfit - totalFee;
            const totalPayout = totalDeployed + totalReserved + totalNetProfit;
            
            if (ModalDOM.previewTotalPayout) {
                ModalDOM.previewTotalPayout.textContent = UTILS.formatAmount(totalPayout) + ' USDT';
            }
            
            const profit = deployed * (profitPercent / 100);
            const fee = profit * 0.2;
            const netProfit = profit - fee;
            const total = deployed + reserved + netProfit;
            
            if (ModalDOM.previewProfit) {
                ModalDOM.previewProfit.textContent = '+' + UTILS.formatAmount(profit) + ' USDT';
            }
            if (ModalDOM.previewFee) {
                ModalDOM.previewFee.textContent = '-' + UTILS.formatAmount(fee) + ' USDT';
            }
            if (ModalDOM.previewNet) {
                ModalDOM.previewNet.textContent = '+' + UTILS.formatAmount(netProfit) + ' USDT';
            }
            if (ModalDOM.previewTotal) {
                ModalDOM.previewTotal.textContent = UTILS.formatAmount(total) + ' USDT';
            }
        } else {
            if (ModalDOM.previewTotalPayout) {
                ModalDOM.previewTotalPayout.textContent = UTILS.formatAmount(totalReserved) + ' USDT';
            }
            
            if (ModalDOM.previewProfit) {
                ModalDOM.previewProfit.textContent = '-' + UTILS.formatAmount(deployed) + ' USDT';
            }
            if (ModalDOM.previewFee) {
                ModalDOM.previewFee.textContent = '0.00 USDT';
            }
            if (ModalDOM.previewNet) {
                ModalDOM.previewNet.textContent = '-' + UTILS.formatAmount(deployed) + ' USDT';
            }
            if (ModalDOM.previewTotal) {
                ModalDOM.previewTotal.textContent = UTILS.formatAmount(totalReserved) + ' USDT';
            }
        }
    }

    // ==================== 确认清算 ====================
    async function confirmSettle() {
        if (!currentMatch) {
            UTILS.showToast('比赛信息丢失，请重新打开', 'error');
            return;
        }
        
        const data = {
            matchId: currentMatch.id,
            status: currentStatus,
            profitRate: currentStatus === 'win' ? parseInt(DOM.profitRate?.value || 40) : -100
        };
        
        try {
            if (DOM.confirmBtn) {
                DOM.confirmBtn.disabled = true;
                DOM.confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 清算中...';
            }
            
            const result = await adminRequest('/execute', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (result.success) {
                UTILS.showToast('清算成功！', 'success');
                if (DOM.modal) DOM.modal.classList.remove('show');
                loadPendingMatches();
                loadSettledHistory();
                if (confirm('清算成功！是否立即编辑复盘报告？') && currentMatch.match_id) {
                    window.location.href = `/admin/report-editor.html?matchId=${currentMatch.match_id}`;
                }
            } else {
                UTILS.showToast('清算失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (err) {
            UTILS.showToast('清算失败: ' + err.message, 'error');
        } finally {
            if (DOM.confirmBtn) {
                DOM.confirmBtn.disabled = false;
                DOM.confirmBtn.innerHTML = '<i class="fas fa-check"></i> 确认清算';
            }
        }
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        // 筛选事件
        if (DOM.searchInput) DOM.searchInput.addEventListener('input', () => applyFilters());
        if (DOM.leagueFilter) DOM.leagueFilter.addEventListener('change', () => applyFilters());
        if (DOM.hasAuthFilter) DOM.hasAuthFilter.addEventListener('change', () => applyFilters());
        if (DOM.sortFilter) DOM.sortFilter.addEventListener('change', () => applyFilters());
        if (DOM.resetFilterBtn) {
            DOM.resetFilterBtn.addEventListener('click', () => {
                if (DOM.searchInput) DOM.searchInput.value = '';
                if (DOM.leagueFilter) DOM.leagueFilter.value = 'all';
                if (DOM.hasAuthFilter) DOM.hasAuthFilter.value = 'all';
                if (DOM.sortFilter) DOM.sortFilter.value = 'time_desc';
                applyFilters();
            });
        }
        
        // 批量操作
        if (DOM.selectAllBtn) DOM.selectAllBtn.addEventListener('click', selectAllOnPage);
        if (DOM.clearSelectionBtn) DOM.clearSelectionBtn.addEventListener('click', clearSelection);
        if (DOM.selectAllCheckbox) {
            DOM.selectAllCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) selectAllOnPage();
                else clearSelection();
            });
        }
        if (DOM.batchSettleBtn) DOM.batchSettleBtn.addEventListener('click', openBatchSettleModal);
        
        // 批量清算模态框
        if (DOM.batchWinBtn) {
            DOM.batchWinBtn.addEventListener('click', () => {
                DOM.batchWinBtn.classList.add('active');
                DOM.batchLossBtn.classList.remove('active');
                batchStatus = 'win';
                const profitBlock = document.querySelector('#batchProfitBlock');
                if (profitBlock) profitBlock.style.display = 'block';
            });
        }
        if (DOM.batchLossBtn) {
            DOM.batchLossBtn.addEventListener('click', () => {
                DOM.batchLossBtn.classList.add('active');
                DOM.batchWinBtn.classList.remove('active');
                batchStatus = 'loss';
                const profitBlock = document.querySelector('#batchProfitBlock');
                if (profitBlock) profitBlock.style.display = 'none';
            });
        }
        if (DOM.confirmBatchBtn) DOM.confirmBatchBtn.addEventListener('click', confirmBatchSettle);
        if (DOM.cancelBatchBtn) DOM.cancelBatchBtn.addEventListener('click', () => DOM.batchModal?.classList.remove('show'));
        if (DOM.closeBatchModal) DOM.closeBatchModal.addEventListener('click', () => DOM.batchModal?.classList.remove('show'));
        if (DOM.batchModal) {
            DOM.batchModal.addEventListener('click', (e) => {
                if (e.target === DOM.batchModal) DOM.batchModal.classList.remove('show');
            });
        }
        
        // 盈亏状态切换
        if (DOM.winBtn) {
            DOM.winBtn.addEventListener('click', () => {
                DOM.winBtn.classList.add('active');
                DOM.lossBtn.classList.remove('active');
                currentStatus = 'win';
                const profitBlock = document.getElementById('profitConfigBlock');
                if (profitBlock) profitBlock.style.display = 'block';
                updatePreview();
            });
        }
        if (DOM.lossBtn) {
            DOM.lossBtn.addEventListener('click', () => {
                DOM.lossBtn.classList.add('active');
                DOM.winBtn.classList.remove('active');
                currentStatus = 'loss';
                const profitBlock = document.getElementById('profitConfigBlock');
                if (profitBlock) profitBlock.style.display = 'none';
                updatePreview();
            });
        }
        
        if (DOM.profitRate) DOM.profitRate.addEventListener('input', updatePreview);
        if (DOM.confirmBtn) DOM.confirmBtn.addEventListener('click', confirmSettle);
        if (DOM.cancelBtn) DOM.cancelBtn.addEventListener('click', () => DOM.modal?.classList.remove('show'));
        if (DOM.closeModal) DOM.closeModal.addEventListener('click', () => DOM.modal?.classList.remove('show'));
        if (DOM.modal) {
            DOM.modal.addEventListener('click', (e) => {
                if (e.target === DOM.modal) DOM.modal.classList.remove('show');
            });
        }
        
        if (DOM.toggleAuth) {
            DOM.toggleAuth.addEventListener('click', () => {
                if (DOM.authContent) {
                    const isHidden = DOM.authContent.style.display === 'none';
                    DOM.authContent.style.display = isHidden ? 'block' : 'none';
                    if (DOM.authToggleIcon) DOM.authToggleIcon.classList.toggle('expanded', isHidden);
                }
            });
        }
        
        const exportBtn = document.getElementById('exportAuthBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentMatch || !currentMatch.authorizations || currentMatch.authorizations.length === 0) {
                    UTILS.showToast('暂无数据可导出', 'error');
                    return;
                }
                
                const headers = ['用户ID', '用户名', '授权金额(USDT)', '授权时间'];
                const rows = currentMatch.authorizations.map(auth => [
                    auth.user_id,
                    auth.username || '-',
                    UTILS.formatAmount(auth.amount || 0),
                    auth.created_at || '-'
                ]);
                
                const csvContent = [
                    headers.join(','),
                    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                ].join('\n');
                
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.href = url;
                link.setAttribute('download', `授权明细_${currentMatch.home_team}_vs_${currentMatch.away_team}_${Date.now()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                UTILS.showToast(`导出成功，共 ${currentMatch.authorizations.length} 条记录`, 'success');
            });
        }
        
        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_name');
                window.location.href = '/admin/index.html';
            });
        }
        
        if (DOM.tabBtns.length) {
            DOM.tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    DOM.tabBtns.forEach(b => b.classList.remove('active'));
                    DOM.tabPanes.forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    const activePane = document.getElementById(tab + 'Pane');
                    if (activePane) activePane.classList.add('active');
                    if (tab === 'history') loadSettledHistory();
                });
            });
        }
    }

    // ==================== 初始化 ====================
    function init() {
        console.log('📊 清算管理控制器 v2.0 初始化');
        const storedAdmin = localStorage.getItem('admin_name');
        if (storedAdmin && DOM.adminName) {
            DOM.adminName.textContent = storedAdmin;
        }
        bindEvents();
        loadPendingMatches();
        
        if (DOM.winBtn) DOM.winBtn.classList.add('active');
        if (DOM.batchWinBtn) DOM.batchWinBtn.classList.add('active');
        
        setInterval(loadPendingMatches, 30000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();