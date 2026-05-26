/**
 * 历史报告页控制器 - 真实API版本
 */

(function() {
    'use strict';

    // 確保時間工具已加載
    if (!window.FOOTRADAPRO_TIME) {
        console.warn('FOOTRADAPRO_TIME not loaded, using fallback');
    }
    const TIME = window.FOOTRADAPRO_TIME;

    const AppState = {
        theme: localStorage.getItem('theme') || 'dark',
        currentFilter: 'all',
        reports: [],
        filteredReports: [],
        stats: {
            totalTrades: 0,
            winRate: 0,
            totalProfit: 0,
            vipLevel: 0
        }
    };

    const elements = {
        backBtn: document.getElementById('backBtn'),
        themeBtn: document.getElementById('themeBtn'),
        totalTrades: document.getElementById('totalTrades'),
        winRate: document.getElementById('winRate'),
        totalProfit: document.getElementById('totalProfit'),
        vipLevel: document.getElementById('vipLevel'),
        filterTabs: document.querySelectorAll('.filter-tab'),
        reportsList: document.getElementById('reportsList')
    };

    // ==================== 格式化輔助函數 ====================
    function formatAmount(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        return TIME ? 
            TIME.formatShortDate(dateStr) : 
            new Date(dateStr).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
    }

    // ==================== 初始化 ====================
    async function init() {
        applyTheme();
        bindEvents();
        await loadUserStats();
        await loadReports();
    }

    // ==================== 绑定事件 ====================
    function bindEvents() {
        if (elements.backBtn) {
            elements.backBtn.addEventListener('click', () => window.history.back());
        }
        
        if (elements.themeBtn) {
            elements.themeBtn.addEventListener('click', toggleTheme);
        }
        
        elements.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const filter = tab.dataset.filter;
                setActiveFilter(filter);
                filterReports();
            });
        });
    }

    // ==================== 主题切换 ====================
    function applyTheme() {
        document.body.setAttribute('data-theme', AppState.theme);
        updateThemeIcon();
    }

    function updateThemeIcon() {
        const icon = elements.themeBtn?.querySelector('i');
        if (icon) {
            icon.className = AppState.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    function toggleTheme() {
        AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', AppState.theme);
        applyTheme();
    }

    // ==================== 设置活动筛选 ====================
    function setActiveFilter(filter) {
        AppState.currentFilter = filter;
        
        elements.filterTabs.forEach(tab => {
            if (tab.dataset.filter === filter) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    // ==================== 加载用户统计 ====================
    async function loadUserStats() {
        try {
            const response = await fetch('/api/v1/user/history/stats', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success) {
                AppState.stats = result.data;
                renderStats();
            }
        } catch (err) {
            console.error('Failed to load user stats:', err);
        }
    }

    // ==================== 加载报告列表 ====================
    async function loadReports() {
        showLoading();
        
        try {
            const url = AppState.currentFilter !== 'all' 
                ? `/api/v1/user/history/list?filter=${AppState.currentFilter}`
                : '/api/v1/user/history/list';
                
            const response = await fetch(url, {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success) {
                AppState.reports = result.data;
                AppState.filteredReports = result.data;
                renderReports();
            } else {
                showError();
            }
        } catch (err) {
            console.error('Failed to load reports:', err);
            showError();
        }
    }

    // ==================== 筛选报告 ====================
    function filterReports() {
        loadReports();
    }

    // ==================== 渲染统计 ====================
    function renderStats() {
        elements.totalTrades.textContent = AppState.stats.totalTrades;
        elements.winRate.textContent = (AppState.stats.winRate || 0).toFixed(1) + '%';
        elements.totalProfit.textContent = formatAmount(AppState.stats.totalProfit) + ' USDT';
        elements.vipLevel.textContent = 'VIP ' + (AppState.stats.vipLevel || 0);
        
        if (AppState.stats.totalProfit >= 0) {
            elements.totalProfit.style.color = 'var(--success-500)';
        } else {
            elements.totalProfit.style.color = 'var(--danger-500)';
        }
    }

    // ==================== 渲染报告 ====================
    function renderReports() {
        if (!elements.reportsList) return;
        
        if (AppState.filteredReports.length === 0) {
            elements.reportsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 16px;"></i>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">No historical reports</p>
                    <button class="btn-primary" onclick="window.location.href='/match-market.html'" 
                        style="padding: 12px 24px; background: var(--brand-500); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">
                        Go to Markets
                    </button>
                </div>
            `;
            return;
        }
        
        const reportsHtml = AppState.filteredReports.map(report => {
            const badgeClass = report.result === 'win' ? 'win' : 'loss';
            const badgeText = report.result === 'win' ? 'Win' : 'Loss';
            const returnClass = report.result === 'win' ? 'positive' : 'negative';
            const returnValue = report.result === 'win' 
                ? `+${formatAmount(report.profit)} USDT` 
                : `-${formatAmount(Math.abs(report.profit))} USDT`;
            const isCorrect = report.user_prediction === report.actual_result;
            
            return `
                <div class="report-card" onclick="window.location.href='/report-detail.html?match_id=${report.match_id}'" style="cursor: pointer;">
                    <div class="report-header">
                        <span class="report-date">${formatDate(report.match_time)}</span>
                        <span class="report-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="report-teams">${report.home_team} vs ${report.away_team}</div>
                    <div class="report-details">
                        <span class="report-league">${report.league || 'Unknown League'}</span>
                        <span class="report-odds">${report.odds || '-'}</span>
                        <span class="report-amount">${formatAmount(report.amount)} USDT</span>
                    </div>
                    <div class="report-footer">
                        <span class="report-return ${returnClass}">${returnValue}</span>
                        <div class="report-verifiable">
                            <i class="fas fa-${isCorrect ? 'check-circle' : 'times-circle'}" 
                               style="color: ${isCorrect ? 'var(--success-500)' : 'var(--danger-500)'};"></i>
                            <span>${isCorrect ? 'Correct' : 'Incorrect'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        elements.reportsList.innerHTML = reportsHtml;
    }

    // ==================== 显示加载状态 ====================
    function showLoading() {
        if (!elements.reportsList) return;
        elements.reportsList.innerHTML = `
            <div class="loading-state" style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 40px; color: var(--brand-500); margin-bottom: 16px;"></i>
                <p style="color: var(--text-secondary);">Loading historical reports...</p>
            </div>
        `;
    }

    // ==================== 显示错误 ====================
    function showError() {
        if (!elements.reportsList) return;
        elements.reportsList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger-500); margin-bottom: 16px;"></i>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">Failed to load, please try again</p>
                <button class="btn-primary" onclick="location.reload()" 
                    style="padding: 12px 24px; background: var(--brand-500); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">
                    Refresh
                </button>
            </div>
        `;
    }

    // ==================== 初始化 ====================
    document.addEventListener('DOMContentLoaded', init);
})();