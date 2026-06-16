/**
 * FOOTRADAPRO - Match Market Controller
 * @version 3.7.0 - 添加 SPA 页面切换重新初始化支持
 * 統一排序邏輯：今天比賽優先 → 聯賽優先級 → 時間排序
 */

(function() {
    'use strict';

    // ==================== 多语言配置 ====================
    const LOCALES = {
        zh: {
            'filter.upcoming': '即将开始',
            'filter.all': '全部',
            'filter.today': '今天',
            'filter.tomorrow': '明天',
            'button.authorize': '授权交易',
            'button.load_more': '加载更多',
            'status.upcoming': '即将开始',
            'empty.no_matches': '暂无比赛',
            'empty.adjust_filters': '请调整筛选条件或稍后再试',
            'confidence.label': 'AI 置信度',
            'loading': '加载中...'
        },
        en: {
            'filter.upcoming': 'Upcoming',
            'filter.all': 'All',
            'filter.today': 'Today',
            'filter.tomorrow': 'Tomorrow',
            'button.authorize': 'Authorize',
            'button.load_more': 'Load More',
            'status.upcoming': 'Upcoming',
            'empty.no_matches': 'No matches available',
            'empty.adjust_filters': 'Adjust filters or check back later',
            'confidence.label': 'AI Confidence',
            'loading': 'Loading...'
        }
    };

    let currentLanguage = localStorage.getItem('language') || 'en';

    function t(key) {
        const locale = LOCALES[currentLanguage] || LOCALES.en;
        return locale[key] || key;
    }

    // ==================== 联赛优先级 ====================
    const LEAGUE_PRIORITY = {
        'UEFA Champions League': 1, 'Champions League': 1,
        'UEFA Europa League': 2, 'Europa League': 2,
        'Premier League': 3, 'La Liga': 4, 'Serie A': 5,
        'Bundesliga': 6, 'Ligue 1': 7, 'default': 30
    };

    // ==================== 状态管理 ====================
    const AppState = {
        matches: [],
        filteredMatches: [],
        featuredMatches: [],
        selectedStatus: 'upcoming',
        selectedLeague: 'all',
        timeFilter: 'all',
        currentDisplayCount: 24,
        batchSize: 24,
        isLoading: false,
        hasMore: true,
        leagues: new Map()
    };

    // DOM 元素
    const DOM = {
        get featuredGrid() { return document.getElementById('featuredGrid'); },
        get allMatchesGrid() { return document.getElementById('allMatchesGrid'); },
        get matchCount() { return document.getElementById('matchCount'); },
        get leagueSelect() { return document.getElementById('leagueSelect'); },
        get loadMoreBtn() { return document.getElementById('loadMoreBtn'); },
        get loadMoreContainer() { return document.getElementById('loadMoreContainer'); },
        get loadingIndicator() { return document.getElementById('loadingIndicator'); },
        get themeToggle() { return document.getElementById('themeToggle'); },
        get langToggle() { return document.getElementById('langToggle'); },
        get tickerContent() { return document.getElementById('tickerContent'); }
    };

    // ==================== 辅助函数 ====================
    function formatMatchTime(utcString) {
        if (!utcString) return '-';
        try {
            const date = new Date(utcString);
            return date.toLocaleString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', 
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return '-'; }
    }

    function getRelativeTime(utcString) {
        const matchTime = new Date(utcString);
        const now = new Date();
        const diffHours = Math.floor((matchTime - now) / (1000 * 60 * 60));
        if (diffHours < 0) return 'Started';
        if (diffHours === 0) return 'Now';
        if (diffHours < 24) return `${diffHours}h`;
        return `${Math.floor(diffHours / 24)}d`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function getTeamLogoUrl(logoUrl) {
        if (logoUrl && logoUrl !== '/uploads/teams/default.png' && logoUrl !== 'NULL') {
            if (logoUrl.startsWith('data:image')) {
                return logoUrl;
            }
            return logoUrl + '?t=' + Date.now();
        }
        return '/uploads/teams/default.png';
    }

    // ==================== 筛选逻辑 ====================
    function filterByTime(match) {
        if (AppState.timeFilter === 'all') return true;
        
        const matchTime = new Date(match.match_time);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        
        if (AppState.timeFilter === 'today') {
            return matchTime >= todayStart && matchTime < tomorrowStart;
        }
        if (AppState.timeFilter === 'tomorrow') {
            return matchTime >= tomorrowStart && matchTime < new Date(tomorrowStart.getTime() + 86400000);
        }
        return true;
    }

    function sortMatches(matches) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        
        return [...matches].sort((a, b) => {
            const aTime = new Date(a.match_time);
            const bTime = new Date(b.match_time);
            const aIsToday = aTime >= todayStart && aTime < tomorrowStart;
            const bIsToday = bTime >= todayStart && bTime < tomorrowStart;
            
            if (aIsToday !== bIsToday) {
                return aIsToday ? -1 : 1;
            }
            
            const priorityA = LEAGUE_PRIORITY[a.league] || LEAGUE_PRIORITY.default;
            const priorityB = LEAGUE_PRIORITY[b.league] || LEAGUE_PRIORITY.default;
            if (priorityA !== priorityB) return priorityA - priorityB;
            
            return aTime - bTime;
        });
    }

    function getFeaturedMatches(matches) {
        if (!matches || matches.length === 0) return [];
        
        const now = new Date();
        const upcomingMatches = matches.filter(match => new Date(match.match_time) > now);
        const sortedMatches = sortMatches(upcomingMatches);
        const featured = sortedMatches.slice(0, 4);
        
        console.log(`推荐统计: 总共 ${upcomingMatches.length} 场未开始比赛，推荐前 ${featured.length} 场`);
        return featured;
    }

    function applyFilters() {
        let filtered = AppState.matches.filter(m => {
            const realStatus = m.calculated_status || m.status;
            return realStatus === 'upcoming';
        });
        
        filtered = filtered.filter(m => filterByTime(m));
        
        if (AppState.selectedLeague !== 'all') {
            filtered = filtered.filter(m => m.league === AppState.selectedLeague);
        }
        
        filtered = sortMatches(filtered);
        
        AppState.filteredMatches = filtered;
        AppState.hasMore = filtered.length > AppState.batchSize;
        AppState.currentDisplayCount = AppState.batchSize;
        AppState.featuredMatches = getFeaturedMatches(filtered);
        
        if (DOM.matchCount) DOM.matchCount.textContent = filtered.length;
        render();
    }

    function renderMatchCard(match) {
        const time = formatMatchTime(match.match_time);
        const relativeTime = getRelativeTime(match.match_time);
        const leagueName = match.league || 'Unknown';
        const confidence = LEAGUE_PRIORITY[match.league] <= 10 ? 92 : 75;
        
        const homeLogo = getTeamLogoUrl(match.home_logo);
        const awayLogo = getTeamLogoUrl(match.away_logo);
        
        return `
            <div class="match-card" data-match-id="${match.id}">
                <div class="status-badge status-upcoming">${t('status.upcoming')}</div>
                <div class="match-logos-wrapper">
                    <div class="match-logo-item">
                        <img class="match-logo" src="${homeLogo}" alt="${escapeHtml(match.home_team)}" 
                            loading="lazy"
                            onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'logo-fallback\\'><i class=\\'fas fa-futbol\\'></i></div><div class=\\'match-team-name\\'>${escapeHtml(match.home_team)}</div>'">
                        <div class="match-team-name">${escapeHtml(match.home_team)}</div>
                    </div>
                    <div class="match-vs-badge">VS</div>
                    <div class="match-logo-item">
                        <img class="match-logo" src="${awayLogo}" alt="${escapeHtml(match.away_team)}"
                            loading="lazy"
                            onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'logo-fallback\\'><i class=\\'fas fa-futbol\\'></i></div><div class=\\'match-team-name\\'>${escapeHtml(match.away_team)}</div>'">
                        <div class="match-team-name">${escapeHtml(match.away_team)}</div>
                    </div>
                </div>
                <div class="match-info">
                    <div class="match-league-time">
                        <span class="league-badge">${escapeHtml(leagueName)}</span>
                        <span>${time} (${relativeTime})</span>
                    </div>
                    <div class="confidence-bar">
                        <div class="confidence-label">
                            <span>${t('confidence.label')}</span>
                            <span>${confidence}%</span>
                        </div>
                        <div class="confidence-progress">
                            <div class="confidence-fill" style="width: ${confidence}%"></div>
                        </div>
                    </div>
                </div>
                <button class="authorize-btn" onclick="window.location.href='/shell.html?page=authorize&matchId=${match.id}'">
                    ${t('button.authorize')} <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    function render() {
        if (!DOM.allMatchesGrid) return;
        
        if (DOM.featuredGrid) {
            if (AppState.featuredMatches.length > 0) {
                DOM.featuredGrid.innerHTML = AppState.featuredMatches.map(m => renderMatchCard(m)).join('');
            } else {
                DOM.featuredGrid.innerHTML = `<div class="empty-state"><i class="fas fa-futbol"></i><p>${t('empty.no_matches')}</p></div>`;
            }
        }
        
        const displayMatches = AppState.filteredMatches.slice(0, AppState.currentDisplayCount);
        const featuredIds = new Set(AppState.featuredMatches.map(m => m.id));
        const otherMatches = displayMatches.filter(m => !featuredIds.has(m.id));
        
        if (otherMatches.length > 0) {
            DOM.allMatchesGrid.innerHTML = otherMatches.map(m => renderMatchCard(m)).join('');
        } else if (AppState.filteredMatches.length === 0) {
            DOM.allMatchesGrid.innerHTML = `<div class="empty-state"><i class="fas fa-futbol"></i><p>${t('empty.no_matches')}</p><p style="font-size:12px;margin-top:8px;">${t('empty.adjust_filters')}</p></div>`;
        } else {
            DOM.allMatchesGrid.innerHTML = '';
        }
        
        updateLoadMoreButton();
    }

    function updateLoadMoreButton() {
        if (!DOM.loadMoreContainer) return;
        const remaining = AppState.filteredMatches.length - AppState.currentDisplayCount;
        if (remaining > 0) {
            DOM.loadMoreContainer.style.display = 'flex';
            if (DOM.loadMoreBtn) DOM.loadMoreBtn.textContent = `${t('button.load_more')} (${remaining})`;
        } else {
            DOM.loadMoreContainer.style.display = 'none';
        }
    }

    function loadMore() {
        AppState.currentDisplayCount += AppState.batchSize;
        render();
        setTimeout(() => {
            if (DOM.allMatchesGrid && DOM.allMatchesGrid.lastChild && DOM.allMatchesGrid.lastChild.scrollIntoView) {
                DOM.allMatchesGrid.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }

    async function loadMatches() {
        if (AppState.isLoading) return;
        AppState.isLoading = true;
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'block';
        
        try {
            const res = await APIClient.get('/api/v1/matches');
            const result = await res.json();
            
            if (result.success && result.data) {
                AppState.matches = result.data;
                const leagues = new Map();
                AppState.matches.forEach(m => {
                    if (m.league) leagues.set(m.league, (leagues.get(m.league) || 0) + 1);
                });
                AppState.leagues = leagues;
                updateLeagueSelect();
                applyFilters();
                console.log(`✅ Loaded ${AppState.matches.length} matches`);
            } else {
                showToast('Failed to load matches', 'error');
            }
        } catch (error) {
            console.error('Error loading matches:', error);
            if (DOM.allMatchesGrid) {
                DOM.allMatchesGrid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load matches</p></div>`;
            }
        } finally {
            AppState.isLoading = false;
            if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
        }
    }

    function updateLeagueSelect() {
        if (DOM.leagueSelect) {
            let options = '<option value="all">🌍 All Leagues</option>';
            for (let [league, count] of AppState.leagues) {
                options += `<option value="${escapeHtml(league)}">${escapeHtml(league)} (${count})</option>`;
            }
            DOM.leagueSelect.innerHTML = options;
            DOM.leagueSelect.value = AppState.selectedLeague;
        }
        
        const leagueList = document.getElementById('leagueList');
        if (leagueList) {
            let items = '';
            for (let [league, count] of AppState.leagues) {
                const activeClass = AppState.selectedLeague === league ? 'active' : '';
                items += `<div class="league-item ${activeClass}" data-league="${escapeHtml(league)}">
                            <span>${escapeHtml(league)}</span>
                            <span class="league-count">${count}</span>
                          </div>`;
            }
            leagueList.innerHTML = items;
            
            document.querySelectorAll('.league-item').forEach(item => {
                item.addEventListener('click', () => {
                    const league = item.dataset.league;
                    document.querySelectorAll('.league-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    AppState.selectedLeague = league;
                    AppState.currentDisplayCount = AppState.batchSize;
                    if (window.applyFilters) window.applyFilters();
                });
            });
        }
        
        const mobileSelect = document.getElementById('mobileLeagueSelect');
        if (mobileSelect) {
            let options = '<option value="all">🌍 All Leagues</option>';
            for (let [league, count] of AppState.leagues) {
                options += `<option value="${escapeHtml(league)}">${escapeHtml(league)} (${count})</option>`;
            }
            mobileSelect.innerHTML = options;
            mobileSelect.value = AppState.selectedLeague;
        }
    }

    async function loadTicker() {
        try {
            const res = await APIClient.get('/api/v1/ticker/messages?limit=10');
            const result = await res.json();
            if (result.success && result.data && result.data.length > 0) {
                const messages = result.data.map(m => m.message).join(' // ');
                if (DOM.tickerContent) DOM.tickerContent.innerHTML = `⚡ ${messages} ⚡`;
            }
        } catch (err) {
            console.warn('Ticker error:', err);
        }
    }

    function bindEvents() {
        document.querySelectorAll('[data-status]').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.selectedStatus = btn.dataset.status;
                AppState.currentDisplayCount = AppState.batchSize;
                applyFilters();
            };
        });
        
        document.querySelectorAll('[data-time]').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.timeFilter = btn.dataset.time;
                AppState.currentDisplayCount = AppState.batchSize;
                applyFilters();
            };
        });
        
        if (DOM.leagueSelect) {
            DOM.leagueSelect.onchange = (e) => {
                AppState.selectedLeague = e.target.value;
                AppState.currentDisplayCount = AppState.batchSize;
                applyFilters();
            };
        }
        
        if (DOM.loadMoreBtn) DOM.loadMoreBtn.onclick = () => loadMore();
        if (DOM.themeToggle) DOM.themeToggle.onclick = () => ThemeManager.toggleTheme();
        
        if (DOM.langToggle) {
            DOM.langToggle.onclick = () => {
                currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
                localStorage.setItem('language', currentLanguage);
                window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: currentLanguage } }));
                if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
                render();
                updateLeagueSelect();
            };
        }
        
        window.addEventListener('languagechange', (e) => {
            if (e.detail?.language) {
                currentLanguage = e.detail.language;
                render();
                updateLeagueSelect();
            }
        });
        
        if (ThemeManager.addListener) {
            ThemeManager.addListener(() => loadMatches());
        }
    }

    // ==================== 重新初始化函数（SPA 页面切换时调用） ====================
    async function reinitMatchMarket() {
        console.log('🔄 重新初始化比赛市场...');
        
        // 重置状态
        AppState.matches = [];
        AppState.filteredMatches = [];
        AppState.featuredMatches = [];
        AppState.selectedLeague = 'all';
        AppState.timeFilter = 'all';
        AppState.currentDisplayCount = 24;
        AppState.hasMore = true;
        AppState.leagues.clear();
        
        // 重新绑定事件
        bindEvents();
        
        // 重新加载数据
        await loadMatches();
        
        console.log('✅ 比赛市场重新初始化完成');
    }

    // ==================== 初始化 ====================
    async function init() {
        await ThemeManager.init();
        const savedLang = localStorage.getItem('language');
        if (savedLang === 'zh' || savedLang === 'en') currentLanguage = savedLang;
        if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
        
        bindEvents();
        await loadMatches();
        loadTicker();
        
        console.log('Match Market Controller initialized');
    }
    
    // 监听 SPA 页面切换事件（由 router.js 触发）
    window.addEventListener('page-loaded', (e) => {
        if (e.detail && e.detail.page === 'markets') {
            console.log('📄 检测到 markets 页面加载，重新初始化');
            setTimeout(() => {
                reinitMatchMarket();
            }, 100);
        }
    });
    
    document.addEventListener('DOMContentLoaded', init);
    
    // ==================== 暴露全局变量 ====================
    window.AppState = AppState;
    window.LEAGUE_PRIORITY = LEAGUE_PRIORITY;
    window.refreshMatches = loadMatches;
    window.loadMatches = loadMatches;
    window.applyFilters = applyFilters;
    window.updateLeagueSelect = updateLeagueSelect;
    window.render = render;
    window.getTeamLogoUrl = getTeamLogoUrl;
    window.reinitMatchMarket = reinitMatchMarket;
    
})();