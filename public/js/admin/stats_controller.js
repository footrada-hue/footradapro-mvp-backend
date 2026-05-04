/**
 * FOOTRADAPRO - 数据统计控制器
 * 版本: 1.0.1 (修复 DOM 元素获取时机问题)
 */

(function() {
    'use strict';

    // ==================== DOM 元素（使用 getter 延遲獲取，確保元素存在） ====================
    const DOM = {
        get loadingSpinner() { return document.getElementById('loadingSpinner'); },
        get statsContent() { return document.getElementById('statsContent'); },
        get statsCards() { return document.getElementById('statsCards'); },
        get authTableBody() { return document.getElementById('authTableBody'); },
        get adminName() { return document.getElementById('adminName'); },
        get logoutBtn() { return document.getElementById('logoutBtn'); },
        get startDate() { return document.getElementById('startDate'); },
        get endDate() { return document.getElementById('endDate'); },
        get applyRange() { return document.getElementById('applyRange'); },
        get rangeBtns() { return document.querySelectorAll('.range-btn'); }
    };

    // ==================== 图表实例 ====================
    let trendChart = null;
    let matchesChart = null;
    let activityChart = null;
    let modeChart = null;
    let vipChart = null;

    // ==================== 当前时间范围和模式 ====================
    let currentRange = 'today';
    let currentMode = 'all'; // all, test, live

    // ==================== 授权记录分页排序状态 ====================
    let authState = {
        page: 1,
        limit: 50,
        total: 0,
        sortField: 'created_at',
        sortOrder: 'desc',
        statusFilter: 'all'
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
            const response = await fetch(`/api/v1/admin/stats${endpoint}`, {
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

    // ==================== 获取日期范围参数（包含模式） ====================
    function getDateParams() {
        const params = {};
        if (currentRange === 'custom') {
            params.startDate = DOM.startDate?.value;
            params.endDate = DOM.endDate?.value;
        } else {
            params.range = currentRange;
        }
        params.mode = currentMode;
        return params;
    }

    // ==================== 加载所有数据 ====================
    async function loadAllStats() {
        try {
            console.log(`📊 加载统计数据 - 模式: ${currentMode}, 范围: ${currentRange}`);
            
            if (DOM.loadingSpinner) DOM.loadingSpinner.style.display = 'block';
            if (DOM.statsContent) DOM.statsContent.style.display = 'none';

            const params = getDateParams();
            const queryString = new URLSearchParams(params).toString();

            const [
                cardsRes,
                trendRes,
                matchesRes,
                activityRes,
                modeRes,
                vipRes
            ] = await Promise.all([
                adminRequest(`/cards?${queryString}`),
                adminRequest(`/trend?${queryString}`),
                adminRequest('/matches'),
                adminRequest('/activity'),
                adminRequest('/mode-distribution'),
                adminRequest('/vip-distribution')
            ]);

            console.log('统计数据加载完成', { cardsRes, trendRes });

            if (cardsRes.success && DOM.statsCards) renderCards(cardsRes.data);
            if (trendRes.success) renderTrendChart(trendRes.data);
            if (matchesRes.success) renderMatchesChart(matchesRes.data);
            if (activityRes.success) renderActivityChart(activityRes.data);
            if (modeRes.success) renderModeChart(modeRes.data);
            if (vipRes.success) renderVipChart(vipRes.data);
            
            // 加载授权记录（独立调用，支持分页）
            await loadAuthRecords();

            if (DOM.loadingSpinner) DOM.loadingSpinner.style.display = 'none';
            if (DOM.statsContent) DOM.statsContent.style.display = 'block';

        } catch (err) {
            console.error('加载统计数据失败:', err);
            if (DOM.loadingSpinner) {
                DOM.loadingSpinner.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 加载失败，请重试';
            }
        }
    }

    // ==================== 加载授权记录（支持分页、排序、筛选） ====================
    async function loadAuthRecords() {
        // 确保 authTableBody 存在
        if (!DOM.authTableBody) {
            console.error('authTableBody 元素不存在');
            return;
        }
        
        try {
            const params = getDateParams();
            const queryString = new URLSearchParams(params).toString();
            
            const url = `/authorizations/recent?page=${authState.page}&limit=${authState.limit}&sort=${authState.sortField}&order=${authState.sortOrder}&status=${authState.statusFilter}&${queryString}`;
            
            const res = await adminRequest(url);
            
            if (res.success) {
                authState.total = res.total || res.data.length || 0;
                renderAuthTable(res.data);
                updateAuthPagination();
            } else {
                DOM.authTableBody.innerHTML = '<tr><td colspan="6" class="loading-td">加载失败</td></tr>';
            }
        } catch (err) {
            console.error('加载授权记录失败:', err);
            DOM.authTableBody.innerHTML = '<tr><td colspan="6" class="loading-td">加载失败</td></tr>';
        }
    }

    // ==================== 渲染授权表格 ====================
    function renderAuthTable(data) {
        if (!DOM.authTableBody) return;
        
        if (!data || data.length === 0) {
            DOM.authTableBody.innerHTML = '<tr><td colspan="6" class="loading-td">暂无授权记录</td></tr>';
            return;
        }

        const statusMap = {
            pending: '<span class="status-badge pending">待结算</span>',
            won: '<span class="status-badge settled">盈利</span>',
            lost: '<span class="status-badge settled">亏损</span>',
            settled: '<span class="status-badge settled">已结算</span>'
        };

        DOM.authTableBody.innerHTML = data.map(auth => `
            <tr>
                <td>${auth.auth_id || auth.id}</td>
                <td>${auth.username || '-'}</td>
                <td>${auth.home_team || ''} ${auth.away_team ? 'vs ' + auth.away_team : '-'}</td>
                <td class="amount-cell">${formatAmount(auth.amount)} USDT</td>
                <td>${statusMap[auth.status] || auth.status}</td>
                <td>${formatDateTime(auth.created_at)}</td>
            </tr>
        `).join('');
        
        updateSortIcons();
    }

    // ==================== 更新排序图标 ====================
    function updateSortIcons() {
        const sortableThs = document.querySelectorAll('.data-table th.sortable');
        sortableThs.forEach(th => {
            const field = th.dataset.sort;
            th.classList.remove('asc', 'desc');
            if (field === authState.sortField) {
                th.classList.add(authState.sortOrder);
            }
        });
    }

    // ==================== 更新分页控件 ====================
    function updateAuthPagination() {
        const totalPages = Math.ceil(authState.total / authState.limit);
        const firstBtn = document.getElementById('authFirstBtn');
        const prevBtn = document.getElementById('authPrevBtn');
        const nextBtn = document.getElementById('authNextBtn');
        const lastBtn = document.getElementById('authLastBtn');
        const pageInfo = document.getElementById('authPageInfo');
        const totalInfo = document.getElementById('authTotalInfo');
        
        if (pageInfo) {
            pageInfo.textContent = `第 ${authState.page} / ${totalPages || 1} 页`;
        }
        if (totalInfo) {
            totalInfo.textContent = `共 ${authState.total} 条记录`;
        }
        
        if (firstBtn) firstBtn.disabled = authState.page <= 1;
        if (prevBtn) prevBtn.disabled = authState.page <= 1;
        if (nextBtn) nextBtn.disabled = authState.page >= totalPages;
        if (lastBtn) lastBtn.disabled = authState.page >= totalPages;
    }

    // ==================== 分页操作 ====================
    function goToFirstPage() { authState.page = 1; loadAuthRecords(); }
    function goToPrevPage() { if (authState.page > 1) { authState.page--; loadAuthRecords(); } }
    function goToNextPage() { 
        const totalPages = Math.ceil(authState.total / authState.limit);
        if (authState.page < totalPages) { authState.page++; loadAuthRecords(); }
    }
    function goToLastPage() { 
        const totalPages = Math.ceil(authState.total / authState.limit);
        authState.page = totalPages; 
        if (authState.page >= 1) loadAuthRecords();
    }

    // ==================== 排序操作 ====================
    function sortBy(field) {
        if (authState.sortField === field) {
            authState.sortOrder = authState.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            authState.sortField = field;
            authState.sortOrder = 'desc';
        }
        authState.page = 1;
        loadAuthRecords();
    }

    // ==================== 渲染统计卡片 ====================
    function renderCards(data) {
        if (!DOM.statsCards) return;
        
        DOM.statsCards.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-users"></i></div>
                <div class="stat-info">
                    <h4>总用户数</h4>
                    <div class="stat-value">${data.total_users || 0}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-chart-line"></i></div>
                <div class="stat-info">
                    <h4>总交易额</h4>
                    <div class="stat-value">${formatAmount(data.total_volume)} USDT</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon orange"><i class="fas fa-futbol"></i></div>
                <div class="stat-info">
                    <h4>总授权数</h4>
                    <div class="stat-value">${data.total_authorizations || 0}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon purple"><i class="fas fa-trophy"></i></div>
                <div class="stat-info">
                    <h4>完成比赛</h4>
                    <div class="stat-value">${data.finished_matches || 0}</div>
                </div>
            </div>
        `;
    }

    // ==================== 收入趋势图 ====================
    function renderTrendChart(data) {
        const canvas = document.getElementById('trendChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (trendChart) trendChart.destroy();

        const currentType = document.querySelector('.chart-type-btn[data-chart="trend"].active')?.dataset.type || 'line';

        trendChart = new Chart(ctx, {
            type: currentType,
            data: {
                labels: data.labels || [],
                datasets: [
                    {
                        label: '充值金额',
                        data: data.deposits || [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '结算金额',
                        data: data.settlements || [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '提现金额',
                        data: data.withdraws || [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    }

    // ==================== 比赛统计图 ====================
    function renderMatchesChart(data) {
        const canvas = document.getElementById('matchesChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (matchesChart) matchesChart.destroy();

        matchesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || ['未开始', '进行中', '已结束'],
                datasets: [{
                    label: '比赛数量',
                    data: [data.upcoming || 0, data.live || 0, data.finished || 0],
                    backgroundColor: ['#3b82f6', '#10b981', '#9ca3af'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    // ==================== 用户活跃度图 ====================
    function renderActivityChart(data) {
        const canvas = document.getElementById('activityChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (activityChart) activityChart.destroy();

        activityChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['活跃用户', '非活跃用户'],
                datasets: [{
                    data: [data.active || 0, data.inactive || 0],
                    backgroundColor: ['#10b981', '#6b7280'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // ==================== 测试/真实模式分布 ====================
    function renderModeChart(data) {
        const canvas = document.getElementById('modeChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (modeChart) modeChart.destroy();

        modeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['测试模式', '真实模式'],
                datasets: [{
                    data: [data.test_mode || 0, data.live_mode || 0],
                    backgroundColor: ['#2563eb', '#ff6b00'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // ==================== VIP分布图 ====================
    function renderVipChart(data) {
        const canvas = document.getElementById('vipChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (vipChart) vipChart.destroy();

        const colors = ['#94a3b8', '#ffd700', '#ff7a00', '#8b5cf6', '#ef4444'];
        
        vipChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => `VIP${d.vip_level}`),
                datasets: [{
                    data: data.map(d => d.count),
                    backgroundColor: data.map((d, i) => colors[d.vip_level] || colors[0]),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // ==================== 导出授权记录为 CSV ====================
    async function exportAuthRecords() {
        try {
            const params = getDateParams();
            const queryString = new URLSearchParams(params).toString();
            const res = await adminRequest(`/authorizations/recent?limit=1000&${queryString}&status=${authState.statusFilter}&sort=${authState.sortField}&order=${authState.sortOrder}`);
            
            if (!res.success || !res.data || res.data.length === 0) {
                alert('暂无数据可导出');
                return;
            }
            
            const data = res.data;
            
            const headers = ['授权ID', '用户ID', '用户名', '比赛', '金额(USDT)', '状态', '模式', '授权时间'];
            const statusMap = { pending: '待结算', won: '盈利', lost: '亏损', settled: '已结算' };
            const modeMap = { 0: '真实模式', 1: '测试模式' };
            
            const rows = data.map(auth => [
                auth.auth_id || auth.id,
                auth.user_id || '',
                auth.username || '-',
                `${auth.home_team || ''} ${auth.away_team ? 'vs ' + auth.away_team : '-'}`,
                parseFloat(auth.amount || 0).toFixed(2),
                statusMap[auth.status] || auth.status,
                modeMap[auth.is_test] || '未知',
                formatDateTime(auth.created_at)
            ]);
            
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');
            
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            const modeNames = { all: '全部', test: '测试模式', live: '真实模式' };
            const modeName = modeNames[currentMode] || '全部';
            const date = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            link.setAttribute('download', `授权记录_${modeName}_${date}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`✅ 导出成功: ${data.length} 条记录`);
            
        } catch (err) {
            console.error('导出失败:', err);
            alert('导出失败，请重试');
        }
    }

    // ==================== 绑定导出按钮 ====================
    function bindExportBtn() {
        const exportBtn = document.getElementById('exportAuthBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportAuthRecords);
        }
    }

    // ==================== 绑定授权记录事件 ====================
    function bindAuthEvents() {
        // 每页数量切换
        const limitSelect = document.getElementById('authLimitSelect');
        if (limitSelect) {
            limitSelect.addEventListener('change', (e) => {
                authState.limit = parseInt(e.target.value);
                authState.page = 1;
                loadAuthRecords();
            });
        }
        
        // 状态筛选
        const statusFilter = document.getElementById('authStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                authState.statusFilter = e.target.value;
                authState.page = 1;
                loadAuthRecords();
            });
        }
        
        // 排序按钮
        document.querySelectorAll('.data-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                sortBy(th.dataset.sort);
            });
        });
        
        // 分页按钮
        const firstBtn = document.getElementById('authFirstBtn');
        const prevBtn = document.getElementById('authPrevBtn');
        const nextBtn = document.getElementById('authNextBtn');
        const lastBtn = document.getElementById('authLastBtn');
        
        if (firstBtn) firstBtn.addEventListener('click', goToFirstPage);
        if (prevBtn) prevBtn.addEventListener('click', goToPrevPage);
        if (nextBtn) nextBtn.addEventListener('click', goToNextPage);
        if (lastBtn) lastBtn.addEventListener('click', goToLastPage);
    }

    // ==================== 图表类型切换 ====================
    function bindChartTypeSwitches() {
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const chartName = btn.dataset.chart;
                const chartType = btn.dataset.type;
                
                document.querySelectorAll(`.chart-type-btn[data-chart="${chartName}"]`).forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                
                if (chartName === 'trend') {
                    const params = getDateParams();
                    const queryString = new URLSearchParams(params).toString();
                    const res = await adminRequest(`/trend?${queryString}`);
                    if (res.success) renderTrendChart(res.data);
                }
            });
        });
    }

    // ==================== 时间范围切换 ====================
    function bindRangeSwitches() {
        DOM.rangeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                DOM.rangeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentRange = btn.dataset.range;
                loadAllStats();
            });
        });

        if (DOM.applyRange) {
            DOM.applyRange.addEventListener('click', () => {
                if (!DOM.startDate?.value || !DOM.endDate?.value) {
                    alert('请选择开始和结束日期');
                    return;
                }
                DOM.rangeBtns.forEach(b => b.classList.remove('active'));
                currentRange = 'custom';
                loadAllStats();
            });
        }
        
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        if (DOM.startDate) DOM.startDate.value = weekAgo.toISOString().split('T')[0];
        if (DOM.endDate) DOM.endDate.value = today.toISOString().split('T')[0];
    }

    // ==================== 模式切换监听 ====================
    function bindModeSwitches() {
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.mode;
                console.log('📊 切换模式:', currentMode);
                authState.page = 1;
                loadAllStats();
            });
        });
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
        console.log('📊 统计控制器初始化');
        setAdminName();
        bindLogout();
        bindRangeSwitches();
        bindModeSwitches();
        bindChartTypeSwitches();
        bindExportBtn();
        bindAuthEvents();
        loadAllStats();
        
        setInterval(loadAllStats, 60000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();