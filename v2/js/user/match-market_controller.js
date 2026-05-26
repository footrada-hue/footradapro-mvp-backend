/**
 * FOOTRADAPRO - Match Market Controller
 * English version - ready for i18n
 * @version 17.0.0
 * @since 2026-04-01
 */

(function() {
    'use strict';

    if (!window.FOOTRADAPRO) {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    const CONFIG = window.FOOTRADAPRO;
    const UTILS = CONFIG.UTILS;

    // ==================== Global State ====================
    const AppState = {
        matches: [],
        filteredMatches: [],
        userMode: 'test',
        authority: { sandbox: 10000.00, mainnet: 0.00 },
        currentPage: 1,
        pageSize: 24,
        totalPages: 1,
        selectedLeague: 'all',
        selectedStatus: 'upcoming',
        timeFilter: 'all',
        isLoading: false
    };

    // ==================== League Priority ====================
    const LEAGUE_PRIORITY = {
        'Champions League': 1,
        'Europa League': 2,
        'Premier League': 3,
        'La Liga': 4,
        'Serie A': 5,
        'Bundesliga': 6,
        'Ligue 1': 7,
        'International Friendly': 10,
        'World Cup Qualifier': 11,
        'default': 30
    };

    // ==================== League Icons ====================
    function getLeagueIcon(league) {
        const icons = {
            'Premier League': '⚡',
            'La Liga': '🇪🇸',
            'Serie A': '🇮🇹',
            'Bundesliga': '🇩🇪',
            'Ligue 1': '🇫🇷',
            'Champions League': '🏆',
            'Europa League': '🏆',
            'International Friendly': '🤝',
            'World Cup Qualifier': '🌍'
        };
        return icons[league] || '⚽';
    }

    // ==================== DOM Elements ====================
    const DOM = {
        contentContainer: document.querySelector('.content-container'),
        tickerBar: document.getElementById('tickerBar'),
        tickerMessages: document.getElementById('tickerMessages'),
        tickerVolume: document.getElementById('tickerVolume')
    };

    // ==================== Status Badge ====================
    function getStatusBadge(match) {
        const realStatus = match.calculated_status || match.status;
        
        if (realStatus === 'upcoming') {
            return '<span class="status-badge upcoming" data-i18n="status.upcoming">🟢 Upcoming</span>';
        } else if (realStatus === 'ongoing' || realStatus === 'live') {
            return '<span class="status-badge live" data-i18n="status.live">🟡 Live</span>';
        } else if (realStatus === 'finished') {
            return '<span class="status-badge finished" data-i18n="status.finished">🔴 Finished</span>';
        }
        return '<span class="status-badge upcoming" data-i18n="status.upcoming">🟢 Upcoming</span>';
    }

    // ==================== Helper Functions ====================
    function formatMatchTime(utcString) {
        if (!utcString) return '-';
        try {
            const date = new Date(utcString);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[date.getUTCMonth()];
            const day = date.getUTCDate();
            const hours = date.getUTCHours().toString().padStart(2, '0');
            const minutes = date.getUTCMinutes().toString().padStart(2, '0');
            return `${month} ${day}, ${hours}:${minutes}`;
        } catch { return '-'; }
    }

    function getRelativeTime(utcString) {
        const matchTime = new Date(utcString);
        const now = new Date();
        const diffHours = Math.floor((matchTime - now) / (1000 * 60 * 60));
        
        if (diffHours < 0) return 'Started';
        if (diffHours === 0) return 'Now';
        if (diffHours < 24) return `${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d`;
    }

    function isMatchAuthorizable(match) {
        const realStatus = match.calculated_status || match.status;
        return realStatus === 'upcoming';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i> ${escapeHtml(message)}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#10b981' : '#f97316'};
            color: white;
            padding: 12px 24px;
            border-radius: 40px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ==================== Time Filter ====================
function filterByTime(match) {
    if (AppState.timeFilter === 'all') return true;
    
    const matchTimeUTC = new Date(match.match_time);
    const nowUTC = new Date();
    
    // 使用 UTC 时间计算今天和明天
    const todayStartUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 0, 0, 0));
    const todayEndUTC = new Date(todayStartUTC);
    todayEndUTC.setUTCDate(todayEndUTC.getUTCDate() + 1);
    
    const tomorrowStartUTC = new Date(todayEndUTC);
    const tomorrowEndUTC = new Date(tomorrowStartUTC);
    tomorrowEndUTC.setUTCDate(tomorrowEndUTC.getUTCDate() + 1);
    
    if (AppState.timeFilter === 'today') {
        return matchTimeUTC >= todayStartUTC && matchTimeUTC < todayEndUTC;
    }
    if (AppState.timeFilter === 'tomorrow') {
        return matchTimeUTC >= tomorrowStartUTC && matchTimeUTC < tomorrowEndUTC;
    }
    return true;
}

    // ==================== Data Fetching ====================
    async function fetchUserMode() {
        try {
            const res = await fetch('/api/v1/user/mode', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                AppState.userMode = data.data.is_test_mode ? 'test' : 'live';
                if (window.ThemeManager) {
                    window.ThemeManager.isTestMode = (AppState.userMode === 'test');
                    window.ThemeManager.applyTheme();
                }
                updateModeUI();
            }
        } catch (err) { console.warn('Failed to fetch user mode'); }
    }

    async function fetchUserAuthority() {
        try {
            const res = await fetch('/api/v1/user/balance', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                AppState.authority.mainnet = data.data.balance || 0;
                AppState.authority.sandbox = data.data.test_balance || 10000;
            }
        } catch (err) { console.warn('Failed to fetch balance'); }
    }

    async function loadMatches() {
        if (AppState.isLoading) return;
        AppState.isLoading = true;

        try {
            const now = new Date();
            const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
            const fourteenDaysLater = new Date(todayStart);
            fourteenDaysLater.setUTCDate(todayStart.getUTCDate() + 14);

            const dateFrom = todayStart.toISOString();
            const dateTo = fourteenDaysLater.toISOString();
            
            let url = `/api/v1/matches?status=all&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`;
            
            if (AppState.selectedLeague !== 'all') {
                url += `&league=${encodeURIComponent(AppState.selectedLeague)}`;
            }
            
            const response = await fetch(url, { credentials: 'include' });
            const result = await response.json();
            
            if (result.success && result.data) {
                AppState.matches = result.data;
                applyFilters();
                console.log(`✅ Loaded ${AppState.matches.length} matches`);
            } else {
                renderEmpty('No matches available');
            }
        } catch (error) {
            console.error('Error loading matches:', error);
            renderEmpty('Network error');
        } finally {
            AppState.isLoading = false;
        }
    }

    // ==================== Get Recommended Matches ====================
    function getRecommendedMatches() {
        // 获取所有未开始的比赛
        
        
        const upcomingMatches = AppState.matches
            .filter(m => {
                const realStatus = m.calculated_status || m.status;
                return realStatus === 'upcoming';
            })
            .filter(m => filterByTime(m))
            .sort((a, b) => {
                const priorityA = LEAGUE_PRIORITY[a.league] || LEAGUE_PRIORITY.default;
                const priorityB = LEAGUE_PRIORITY[b.league] || LEAGUE_PRIORITY.default;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return new Date(a.match_time) - new Date(b.match_time);
            });
        
        // 取前4场作为推荐
        return upcomingMatches.slice(0, 4);
    }

    // ==================== Filtering ====================
    function applyFilters() {
        let filtered = [...AppState.matches];
        
        // 时间筛选
        filtered = filtered.filter(match => filterByTime(match));
        
        // 联赛筛选
        if (AppState.selectedLeague !== 'all') {
            filtered = filtered.filter(m => m.league === AppState.selectedLeague);
        }
        
        // 状态筛选
// 状态筛选（只显示 upcoming）
filtered = filtered.filter(m => {
    const realStatus = m.calculated_status || m.status;
    return realStatus === 'upcoming';
});
        
        // 排序
        filtered.sort((a, b) => {
            const priorityA = LEAGUE_PRIORITY[a.league] || LEAGUE_PRIORITY.default;
            const priorityB = LEAGUE_PRIORITY[b.league] || LEAGUE_PRIORITY.default;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return new Date(a.match_time) - new Date(b.match_time);
        });
        
        AppState.filteredMatches = filtered;
        AppState.totalPages = Math.ceil(filtered.length / AppState.pageSize);
        AppState.currentPage = 1;
        
        render();
    }

    // ==================== Render Match Card ====================
    function getMatchCard(match) {
        const time = formatMatchTime(match.match_time);
        const relativeTime = getRelativeTime(match.match_time);
        const leagueName = match.league || 'Unknown';
        const confidence = LEAGUE_PRIORITY[match.league] <= 10 ? 92 : 75;
        const statusBadge = getStatusBadge(match);
        const canAuthorize = isMatchAuthorizable(match);
        
        let scoreHtml = '';
        const realStatus = match.calculated_status || match.status;
        if (realStatus === 'finished' && (match.home_score !== null || match.away_score !== null)) {
            scoreHtml = `<div class="match-score">${match.home_score || 0} : ${match.away_score || 0}</div>`;
        }
        
        // Home team logo
        const homeLogoHtml = match.home_logo && match.home_logo !== '/uploads/teams/default.png'
            ? `<img class="match-logo" src="${match.home_logo}" alt="${escapeHtml(match.home_team)}" 
                loading="lazy" 
                onload="this.classList.add('loaded')" 
                onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\'logo-fallback\'><i class=\'fas fa-futbol\'></i></div>'">`
            : `<div class="logo-fallback"><i class="fas fa-futbol"></i></div>`;
        
        // Away team logo
        const awayLogoHtml = match.away_logo && match.away_logo !== '/uploads/teams/default.png'
            ? `<img class="match-logo" src="${match.away_logo}" alt="${escapeHtml(match.away_team)}" 
                loading="lazy" 
                onload="this.classList.add('loaded')" 
                onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\'logo-fallback\'><i class=\'fas fa-futbol\'></i></div>'">`
            : `<div class="logo-fallback"><i class="fas fa-futbol"></i></div>`;
        
        const buttonText = canAuthorize ? 'Authorize' : (realStatus === 'finished' ? 'Match Ended' : 'Not Available');
        const buttonDisabled = !canAuthorize;
        
        return `
            <div class="match-card" data-match-id="${match.id}">
                ${scoreHtml ? scoreHtml : statusBadge}
                <div class="match-logos-wrapper">
                    <div class="match-logo-item">
                        ${homeLogoHtml}
                        <div class="match-team-name">${escapeHtml(match.home_team)}</div>
                    </div>
                    <div class="match-vs-badge">VS</div>
                    <div class="match-logo-item">
                        ${awayLogoHtml}
                        <div class="match-team-name">${escapeHtml(match.away_team)}</div>
                    </div>
                </div>
                <div class="match-info">
                    <div class="match-league-time">
                        <span class="league-badge" data-i18n="league.label">${escapeHtml(leagueName)}</span>
                        <span class="match-time-short">${time} (${relativeTime})</span>
                    </div>
                    <div class="confidence-bar">
                        <span class="confidence-label" data-i18n="confidence.label">AI Confidence</span>
                        <div class="confidence-progress">
                            <div class="confidence-fill" style="width: ${confidence}%"></div>
                        </div>
                        <span class="confidence-value">${confidence}%</span>
                    </div>
                </div>
                <button class="authorize-btn" onclick="window.location.href='/authorize-submit.html?matchId=${match.id}'" ${buttonDisabled ? 'disabled' : ''} data-i18n="button.authorize">
                    ${buttonText} <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    // ==================== Render Filter Bar ====================
    function renderFilterBar() {
const statusButtons = [
    { value: 'upcoming', label: 'Upcoming', icon: 'fa-calendar', i18n: 'filter.upcoming' }
];
        
        const statusHtml = statusButtons.map(btn => `
            <button class="status-chip ${AppState.selectedStatus === btn.value ? 'active' : ''}" data-status="${btn.value}" data-i18n="${btn.i18n}">
                <i class="fas ${btn.icon}"></i>
                <span>${btn.label}</span>
            </button>
        `).join('');
        
        const leagueOptions = () => {
            const leagues = {};
            AppState.matches.forEach(m => {
                if (m.league) leagues[m.league] = (leagues[m.league] || 0) + 1;
            });
            const sortedLeagues = Object.keys(leagues).sort((a, b) => leagues[b] - leagues[a]);
            
            return `
                <select class="league-select" id="leagueSelect" data-i18n="filter.league">
                    <option value="all" data-i18n="filter.all_leagues">All Leagues</option>
                    ${sortedLeagues.map(league => `
                        <option value="${escapeHtml(league)}" ${AppState.selectedLeague === league ? 'selected' : ''}>
                            ${getLeagueIcon(league)} ${escapeHtml(league)} (${leagues[league]})
                        </option>
                    `).join('')}
                </select>
            `;
        };
        
        return `
            <div class="filter-bar-simple">
                <div class="status-group">
                    ${statusHtml}
                </div>
                <div class="league-group">
                    ${leagueOptions()}
                </div>
            </div>
        `;
    }

    // ==================== Render Recommended Section ====================
    function renderRecommendedSection() {
        const recommended = getRecommendedMatches();
        if (recommended.length === 0) return '';
        
        return `
            <div class="recommended-section">
                <div class="section-header">
                    <div class="section-title" data-i18n="section.featured">
                        <i class="fas fa-star"></i>
                        <span>Featured Matches</span>
                    </div>
                    <div class="time-quick-filters">
                        <button class="time-quick-btn ${AppState.timeFilter === 'today' ? 'active' : ''}" data-time-filter="today" data-i18n="filter.today">Today</button>
                        <button class="time-quick-btn ${AppState.timeFilter === 'tomorrow' ? 'active' : ''}" data-time-filter="tomorrow" data-i18n="filter.tomorrow">Tomorrow</button>
                    </div>
                </div>
                <div class="matches-grid">
                    ${recommended.map(m => getMatchCard(m)).join('')}
                </div>
            </div>
        `;
    }

    // ==================== Render All ====================
    function render() {
        if (!DOM.contentContainer) return;
        
        const start = (AppState.currentPage - 1) * AppState.pageSize;
        const end = start + AppState.pageSize;
        let pageMatches = AppState.filteredMatches.slice(start, end);
        
        // 获取推荐比赛的 ID，用于排除
        const recommendedMatches = getRecommendedMatches();
        const recommendedIds = recommendedMatches.map(m => m.id);
        
        
        // 排除推荐比赛（始终排除）
        if (recommendedIds.length > 0) {
            pageMatches = pageMatches.filter(match => !recommendedIds.includes(match.id));
        }
        
        const hasMatches = AppState.filteredMatches.length > 0;
        
        const fullHtml = `
            ${renderFilterBar()}
            
            ${renderRecommendedSection()}
            
            ${hasMatches ? `
            <div class="section-header">
                <div class="section-title" data-i18n="section.all_matches">
                    <i class="fas fa-list"></i>
                    <span>All Matches</span>
                    <span class="match-count">${AppState.filteredMatches.length}</span>
                </div>
                <div class="page-size-selector">
                    <label data-i18n="pagination.show">Show</label>
                    <select class="page-size-select" id="pageSizeSelect">
                        <option value="12" ${AppState.pageSize === 12 ? 'selected' : ''}>12</option>
                        <option value="24" ${AppState.pageSize === 24 ? 'selected' : ''}>24</option>
                        <option value="36" ${AppState.pageSize === 36 ? 'selected' : ''}>36</option>
                        <option value="48" ${AppState.pageSize === 48 ? 'selected' : ''}>48</option>
                    </select>
                    <label data-i18n="pagination.per_page">per page</label>
                </div>
            </div>
            <div class="matches-grid">
                ${pageMatches.map(m => getMatchCard(m)).join('')}
            </div>
            
            ${renderPagination()}
            ` : `
            <div class="empty-state">
                <i class="fas fa-futbol"></i>
                <p data-i18n="empty.no_matches">No matches available</p>
                <p class="empty-hint" data-i18n="empty.adjust_filters">Try adjusting your filters or check back later</p>
                <button class="reset-filters-btn" id="resetFiltersBtn" data-i18n="button.reset_filters">Reset Filters</button>
            </div>
            `}
        `;
        
        DOM.contentContainer.innerHTML = fullHtml;
        bindEvents();
    }

    function renderPagination() {
        if (AppState.totalPages <= 1) return '';
        
        let html = '<div class="pagination">';
        html += `<button class="page-btn" data-page="${AppState.currentPage - 1}" ${AppState.currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        
        const startPage = Math.max(1, AppState.currentPage - 2);
        const endPage = Math.min(AppState.totalPages, AppState.currentPage + 2);
        
        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<button class="page-btn" disabled>...</button>`;
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === AppState.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        
        if (endPage < AppState.totalPages) {
            if (endPage < AppState.totalPages - 1) html += `<button class="page-btn" disabled>...</button>`;
            html += `<button class="page-btn" data-page="${AppState.totalPages}">${AppState.totalPages}</button>`;
        }
        
        html += `<button class="page-btn" data-page="${AppState.currentPage + 1}" ${AppState.currentPage === AppState.totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        html += '</div>';
        
        return html;
    }

    function renderEmpty(message) {
        if (!DOM.contentContainer) return;
        DOM.contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-futbol"></i>
                <p>${message}</p>
                <button class="reset-filters-btn" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }

    // ==================== Event Binding ====================
    function bindEvents() {
// 状态筛选
document.querySelectorAll('.status-chip').forEach(chip => {
    chip.onclick = () => {
        const status = chip.dataset.status;
        AppState.selectedStatus = status;
        
        // 如果点击的是 "All" 状态，同时重置时间筛选
        if (status === 'all') {
            AppState.timeFilter = 'all';
            // 同时重置时间按钮的样式
            document.querySelectorAll('.time-quick-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }
        
        AppState.currentPage = 1;
        applyFilters();
    };
});
        
        // 时间快捷筛选
        document.querySelectorAll('.time-quick-btn').forEach(btn => {
            btn.onclick = () => {
                const timeFilter = btn.dataset.timeFilter;
                AppState.timeFilter = timeFilter;
                // 更新按钮样式
                document.querySelectorAll('.time-quick-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.currentPage = 1;
                applyFilters();
            };
        });
        
        // 联赛筛选
        const leagueSelect = document.getElementById('leagueSelect');
        if (leagueSelect) {
            leagueSelect.onchange = (e) => {
                AppState.selectedLeague = e.target.value;
                AppState.currentPage = 1;
                applyFilters();
            };
        }
        
        // 每页数量
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.onchange = (e) => {
                AppState.pageSize = parseInt(e.target.value);
                AppState.currentPage = 1;
                AppState.totalPages = Math.ceil(AppState.filteredMatches.length / AppState.pageSize);
                render();
            };
        }
        
// 重置筛选
const resetBtn = document.getElementById('resetFiltersBtn');
if (resetBtn) {
    resetBtn.onclick = () => {
        AppState.selectedLeague = 'all';
        AppState.selectedStatus = 'upcoming';
        AppState.timeFilter = 'all';  // 确保这行存在
        AppState.currentPage = 1;
        loadMatches();
    };
}
        
        // 分页
        document.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.onclick = () => {
                const page = parseInt(btn.dataset.page);
                if (!isNaN(page) && page >= 1 && page <= AppState.totalPages) {
                    AppState.currentPage = page;
                    render();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            };
        });
    }

    // ==================== Marquee Ticker ====================
    async function loadTicker() {
        if (!DOM.tickerMessages || !DOM.tickerBar) return;
        
        try {
            const res = await fetch('/api/v1/ticker/messages?limit=20', { credentials: 'include' });
            const data = await res.json();
            
            if (data.success && data.data && data.data.length > 0) {
                const messages = data.data.map(msg => msg.message).join(' // ');
                DOM.tickerMessages.innerHTML = messages + ' // ' + messages;
                DOM.tickerBar.style.display = 'flex';
            } else {
                DOM.tickerMessages.innerHTML = '🎉 Welcome to FOOTRADA // ⚡ AI-powered football trading platform';
                DOM.tickerBar.style.display = 'flex';
            }
        } catch (err) {
            console.warn('Ticker error:', err);
            DOM.tickerMessages.innerHTML = '🎉 Welcome to FOOTRADA // ⚡ AI-powered football trading platform';
            DOM.tickerBar.style.display = 'flex';
        }
    }

    async function loadTickerStats() {
        if (!DOM.tickerVolume) return;
        
        try {
            const res = await fetch('/api/v1/ticker/stats', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                const volume = data.data.today_volume || 0;
                DOM.tickerVolume.textContent = volume.toLocaleString();
            }
        } catch (err) {}
    }

    // ==================== UI Updates ====================
    function updateModeUI() {
        const isTestMode = AppState.userMode === 'test';
        if (isTestMode) {
            document.body.classList.add('test-mode');
            document.body.classList.remove('live-mode');
        } else {
            document.body.classList.add('live-mode');
            document.body.classList.remove('test-mode');
        }
    }

    // ==================== Refresh Button ====================
    function initRefreshButton() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                loadMatches();
                loadTicker();
                loadTickerStats();
                showToast('Refreshed', 'success');
            };
        }
    }

    // ==================== Initialization ====================
    async function init() {
        console.log('🎯 Match Market Controller initialized');
        
        if (window.FOOTRADA_TIMEZONE) console.log('✅ Timezone tool loaded');
        if (window.ThemeManager) await ThemeManager.init(true);
        
        await fetchUserAuthority();
        await fetchUserMode();
        
        await loadMatches();
        loadTicker();
        loadTickerStats();
        initRefreshButton();
        
        setInterval(() => {
            loadTickerStats();
        }, 60000);
    }
    
    document.addEventListener('DOMContentLoaded', init);
})();