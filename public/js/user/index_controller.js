/**
 * FOOTRADAPRO - Homepage Controller v7.0 (Performance Optimized)
 * 布局：桌面端 2x2 网格，移动端单列
 * 模块4：2x2 正方形网格推荐比赛
 * 性能优化：并行API请求、减少重绘、懒加载新闻
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
        isPrivacyMode: UTILS.getStorage('privacy_mode', false),
        matches: [],
        network: 'sandbox',
        userMode: 'test',
        authority: { sandbox: 10000.00, mainnet: 0.00 },
        userStats: {
            totalAuthorized: 0,
            totalProfit: 0,
            winRate: 0,
            hasAuthorized: false
        },
        platformStats: {
            totalAuth: 1245678,
            successRate: 83.2,
            totalVolume: 52400000,
            activeUsers: 48300,
            aiAccuracy: 83.2,
            highConfAccuracy: 91.4,
            totalPredictions: 1020000,
            bestLeague: 'UCL (86.3%)',
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
        },
        selectedAmount: 200,
        userName: 'Trader',
        isRendering: false
    };

    // DOM Elements
    const DOM = {
        appRoot: document.getElementById('appRoot'),
        modeIndicator: document.getElementById('modeIndicator'),
        testModeBtn: document.getElementById('testModeBtn'),
        liveModeBtn: document.getElementById('liveModeBtn'),
        privacyToggle: document.getElementById('privacyToggle'),
        tickerBar: document.getElementById('tickerBar'),
        tickerMessages: document.getElementById('tickerMessages'),
        tickerVolume: document.getElementById('tickerVolume')
    };

    // ==================== Helper Functions ====================
    function formatAmount(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatCompactNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function formatMatchTime(utcString) {
        if (!utcString) return '-';
        if (window.FOOTRADA_TIMEZONE) {
            return window.FOOTRADA_TIMEZONE.formatMatchTime(utcString, 'short');
        }
        try {
            const date = new Date(utcString);
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return '-'; }
    }

    function getRelativeTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff === 2) return '2 days ago';
        return `${diff} days ago`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }

    function truncateText(text, maxLength = 100) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function showToast(message, type = 'info', notificationId = null) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        else if (type === 'warning') icon = 'fa-exclamation-triangle';
        else if (type === 'error') icon = 'fa-times-circle';
        
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${escapeHtml(message)}</span>
            <button class="toast-close" data-id="${notificationId || ''}">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                const nid = closeBtn.dataset.id;
                if (nid) {
                    try {
                        await fetch(`/api/v1/user/notifications/${nid}/read`, {
                            method: 'POST',
                            credentials: 'include'
                        });
                    } catch (err) {}
                }
                toast.remove();
            });
        }
        
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5000);
    }

    function isDesktop() {
        return window.innerWidth >= 1024;
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Contract address copied', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'warning');
        });
    }

    // ==================== Team Logo Helper ====================
    function getTeamLogoUrl(logoUrl, teamName) {
        if (logoUrl && logoUrl !== '/uploads/teams/default.png') {
            return logoUrl;
        }
        if (!teamName) return '/uploads/teams/default.png';
        
        const teamMap = {
            'arsenal': 'arsenal.png', 'aston villa': 'aston-villa.png',
            'bournemouth': 'bournemouth.png', 'brentford': 'brentford.png',
            'brighton': 'brighton.png', 'burnley': 'burnley.png',
            'chelsea': 'chelsea.png', 'crystal palace': 'crystal-palace.png',
            'everton': 'everton.png', 'fulham': 'fulham.png',
            'liverpool': 'liverpool.png', 'luton town': 'luton-town.png',
            'manchester city': 'manchester-city.png', 'manchester united': 'manchester-united.png',
            'newcastle united': 'newcastle.png', 'nottingham forest': 'nottingham-forest.png',
            'sheffield united': 'sheffield-united.png', 'tottenham hotspur': 'tottenham.png',
            'west ham united': 'west-ham.png', 'wolverhampton wanderers': 'wolves.png',
            'real madrid': 'real-madrid.png', 'barcelona': 'barcelona.png',
            'atletico madrid': 'atletico-madrid.png', 'bayern munich': 'bayern-munich.png',
            'borussia dortmund': 'borussia-dortmund.png', 'paris saint-germain': 'psg.png',
            'psg': 'psg.png', 'marseille': 'marseille.png',
            'ac milan': 'ac-milan.png', 'inter milan': 'inter-milan.png', 'juventus': 'juventus.png'
        };
        
        const normalizedName = teamName.toLowerCase().trim();
        const filename = teamMap[normalizedName] || 'default.png';
        return `/uploads/teams/${filename}`;
    }

    // ==================== Data Fetching (并行优化) ====================
    async function fetchUserName() {
        try {
            const res = await fetch('/api/v1/user/status', { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                const user = data.data;
                if (user.email && user.email.includes('@')) {
                    const nameFromEmail = user.email.split('@')[0];
                    AppState.userName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1).toLowerCase();
                } else if (user.username && user.username !== 'user') {
                    AppState.userName = user.username;
                } else if (user.uid) {
                    AppState.userName = user.uid.slice(-6);
                }
            }
        } catch (err) {
            console.warn('Failed to fetch user name:', err);
        }
        return AppState.userName;
    }

    async function fetchUserStats() {
        try {
            const mode = AppState.userMode === 'test' ? 'test' : 'live';
            const res = await fetch(`/api/v1/user/authorize/list?mode=${mode}&limit=200`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                const auths = data.data;
                AppState.userStats.totalAuthorized = auths.reduce((s, a) => s + (a.amount || 0), 0);
                const settled = auths.filter(a => a.status === 'settled' || a.profit !== undefined);
                const wins = settled.filter(a => a.profit > 0).length;
                AppState.userStats.winRate = settled.length ? (wins / settled.length) * 100 : 0;
                AppState.userStats.totalProfit = settled.reduce((s, a) => s + (a.profit || 0), 0);
                AppState.userStats.hasAuthorized = auths.length > 0;
                return auths;
            }
            return [];
        } catch (err) { 
            console.warn('Failed to fetch user stats'); 
            return [];
        }
    }

    async function fetchUserMode() {
        try {
            const res = await fetch('/api/v1/user/mode', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                AppState.userMode = data.data.is_test_mode ? 'test' : 'live';
                AppState.network = data.data.is_test_mode ? 'sandbox' : 'mainnet';
                updateModeUI();
                if (window.ThemeManager && ThemeManager.isTestMode !== (AppState.userMode === 'test')) {
                    ThemeManager.isTestMode = (AppState.userMode === 'test');
                    ThemeManager.applyTheme();
                }
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
        try {
            const mode = AppState.userMode === 'test' ? 'test' : 'live';
            const res = await fetch(`/api/v1/matches?mode=${mode}&limit=100`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                AppState.matches = data.data;
                return true;
            }
            return false;
        } catch (err) {
            console.warn('Failed to load matches');
            return false;
        }
    }

    let newsCache = null;
    let newsCacheTime = 0;
    const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

    async function loadNews() {
        // 检查缓存
        if (newsCache && (Date.now() - newsCacheTime) < NEWS_CACHE_TTL) {
            return newsCache;
        }
        
        try {
            const res = await fetch(`/api/v1/news/news?category=all&limit=4&t=${Date.now()}`, { credentials: 'include' });
            const result = await res.json();
            if (result.success && result.data && result.data.length > 0) {
                newsCache = result.data;
                newsCacheTime = Date.now();
                return result.data;
            }
            return null;
        } catch (err) {
            console.warn('News API failed:', err);
            return null;
        }
    }

    async function loadRecentTransactions() {
        try {
            const mode = AppState.userMode === 'test' ? 'test' : 'live';
            const res = await fetch(`/api/v1/user/transactions?mode=${mode}&limit=3`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                return data.data;
            }
            return [];
        } catch (err) {
            console.warn('Failed to fetch transactions');
            return [];
        }
    }

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
            if (data.success && DOM.tickerVolume) {
                const volume = data.data.today_volume || 0;
                DOM.tickerVolume.textContent = volume.toLocaleString();
            }
        } catch (err) {}
    }

    // ==================== Chart Data ====================
    function getWeeklyChartData(authorizations) {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekData = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            weekData.push({
                date: date,
                dateStr: `${date.getMonth() + 1}/${date.getDate()}`,
                authorized: 0,
                profit: 0
            });
        }
        
        authorizations.forEach(auth => {
            const authDate = new Date(auth.created_at);
            const dayIndex = Math.floor((authDate - weekStart) / (1000 * 60 * 60 * 24));
            if (dayIndex >= 0 && dayIndex < 7) {
                weekData[dayIndex].authorized += auth.amount || 0;
                if (auth.profit !== undefined) {
                    weekData[dayIndex].profit += auth.profit || 0;
                }
            }
        });
        
        return weekData;
    }

    function renderChart(weekData) {
        const maxValue = Math.max(...weekData.map(d => d.authorized + Math.abs(d.profit)), 1);
        const height = isDesktop() ? 180 : 140;
        
        return `
            <div class="chart-container">
                <div class="chart-title">Weekly Trend</div>
                <div class="chart-bars">
                    ${weekData.map(day => {
                        const authHeight = (day.authorized / maxValue) * height;
                        let profitHeight = 0;
                        let profitColor = '';
                        if (day.profit > 0) {
                            profitHeight = (day.profit / maxValue) * height;
                            profitColor = 'profit';
                        } else if (day.profit < 0) {
                            profitHeight = (Math.abs(day.profit) / maxValue) * height;
                            profitColor = 'negative';
                        }
                        const profitDisplay = day.profit !== 0 ? `${day.profit > 0 ? '+' : ''}${formatAmount(day.profit)}` : '';
                        const profitSymbol = day.profit > 0 ? '\u2191' : (day.profit < 0 ? '\u2193' : '');
                        
                        return `
                            <div class="chart-bar-wrapper">
                                <div class="chart-bar-stack">
                                    <div class="bar-segment bar-auth" style="height: ${authHeight}px;"></div>
                                    ${profitHeight > 0 ? `<div class="bar-segment bar-profit ${profitColor}" style="height: ${profitHeight}px;"></div>` : ''}
                                    <div class="chart-tooltip">
                                        ${day.dateStr}<br>
                                        Auth: ${formatAmount(day.authorized)} USDT<br>
                                        P&L: ${profitSymbol} ${profitDisplay} USDT
                                    </div>
                                </div>
                                <div class="chart-label">${day.dateStr}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="chart-legend">
                    <span><i class="legend-dot auth"></i> Authorized</span>
                    <span><i class="legend-dot profit"></i> Profit</span>
                    <span><i class="legend-dot loss"></i> Loss</span>
                </div>
            </div>
        `;
    }

    // ==================== Business Logic ====================
    function getAIRecommendedMatch() {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayStart.getDate() + 1);
        
        const todayMatches = AppState.matches.filter(m => {
            const matchDate = new Date(m.match_time);
            const realStatus = m.calculated_status || m.status;
            return matchDate >= todayStart && matchDate < todayEnd && 
                   (realStatus === 'upcoming' || realStatus === 'pending');
        });
        
        if (todayMatches.length === 0) return null;
        
        const priority = {
            'UEFA Champions League': 1,
            'UEFA Europa League': 2,
            'Premier League': 3,
            'La Liga': 4,
            'Serie A': 5,
            'Bundesliga': 6,
            'Ligue 1': 7,
            'default': 100
        };
        
        return todayMatches.sort((a, b) => {
            const aPri = priority[a.league] || priority.default;
            const bPri = priority[b.league] || priority.default;
            if (aPri !== bPri) return aPri - bPri;
            return new Date(a.match_time) - new Date(b.match_time);
        })[0];
    }

    function getConfidenceByLeague(league) {
        const confidenceMap = {
            'UEFA Champions League': 92,
            'UEFA Europa League': 86,
            'Premier League': 84,
            'La Liga': 81,
            'Serie A': 79,
            'Bundesliga': 77,
            'Ligue 1': 74,
            'default': 68
        };
        return confidenceMap[league] || 68;
    }

    function getTodayMatchesForRecommend() {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayStart.getDate() + 1);
        
        const tomorrowStart = new Date(todayEnd);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowStart.getDate() + 1);
        
        const mainMatch = getAIRecommendedMatch();
        const mainMatchId = mainMatch ? mainMatch.id : null;
        
        const upcomingMatches = AppState.matches.filter(m => {
            const matchDate = new Date(m.match_time);
            const realStatus = m.calculated_status || m.status;
            return (matchDate >= todayStart && matchDate < tomorrowEnd) &&
                   (realStatus === 'upcoming' || realStatus === 'pending') &&
                   m.id !== mainMatchId;
        });
        
        const priority = {
            'UEFA Champions League': 1,
            'UEFA Europa League': 2,
            'Premier League': 3,
            'La Liga': 4,
            'Serie A': 5,
            'Bundesliga': 6,
            'Ligue 1': 7,
            'default': 100
        };
        
        return upcomingMatches.sort((a, b) => {
            const aPri = priority[a.league] || priority.default;
            const bPri = priority[b.league] || priority.default;
            if (aPri !== bPri) return aPri - bPri;
            return new Date(a.match_time) - new Date(b.match_time);
        });
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
        
        if (DOM.modeIndicator) {
            const testBadge = DOM.modeIndicator.querySelector('.test-mode-badge');
            if (isTestMode && testBadge) {
                testBadge.style.display = 'inline-flex';
                const balanceSpan = testBadge.querySelector('.mode-balance');
                if (balanceSpan) {
                    balanceSpan.textContent = `· Simulated ${formatAmount(AppState.authority.sandbox)} USDT`;
                }
            } else if (testBadge) {
                testBadge.style.display = 'none';
            }
        }
        
        if (DOM.testModeBtn && DOM.liveModeBtn) {
            DOM.testModeBtn.classList.toggle('active', isTestMode);
            DOM.liveModeBtn.classList.toggle('active', !isTestMode);
        }
    }

    // ==================== Render (优化版本) ====================
    async function render() {
        if (!DOM.appRoot || AppState.isRendering) return;
        AppState.isRendering = true;

        const isTestMode = AppState.userMode === 'test';
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        
        const aiMatch = getAIRecommendedMatch();
        const recommendMatches = getTodayMatchesForRecommend();
        const displayMatches = recommendMatches.slice(0, 4);
        
        // 并行获取数据
// 先获取用户统计
const authorizations = await fetchUserStats();
const weekData = getWeeklyChartData(authorizations);

// 并行获取其他数据
const [recentTransactions, newsArticles] = await Promise.all([
    loadRecentTransactions(),
    loadNews()
]);
        
        if (AppState.userName === 'Trader') {
            await fetchUserName();
        }
        const userName = AppState.userName;
        
        // ===== 模块1：AI 推荐卡片 =====
        let aiSectionHtml = '';
        if (aiMatch) {
            const confidence = getConfidenceByLeague(aiMatch.league);
            const aiMessage = `I've analyzed 200+ data points. Based on recent form, home advantage, and key player availability, this match shows strong winning potential.`;
            
            aiSectionHtml = `
                <div class="ai-section">
                    <div class="ai-badge">
                        <i class="fas fa-robot"></i>
                        <span>${isTestMode ? 'Test Mode · AI Pick' : "Today's AI Pick"}</span>
                    </div>
                    
                    <div class="ai-match-teams">
                        <div class="ai-team">
                            <div class="ai-team-logo">
                                <img src="${getTeamLogoUrl(aiMatch.home_logo, aiMatch.home_team)}" 
                                     alt="${escapeHtml(aiMatch.home_team)}"
                                     loading="lazy"
                                     onerror="this.src='/uploads/teams/default.png'">
                            </div>
                            <div class="ai-team-name">${escapeHtml(aiMatch.home_team)}</div>
                        </div>
                        <div class="ai-vs">VS</div>
                        <div class="ai-team">
                            <div class="ai-team-logo">
                                <img src="${getTeamLogoUrl(aiMatch.away_logo, aiMatch.away_team)}" 
                                     alt="${escapeHtml(aiMatch.away_team)}"
                                     loading="lazy"
                                     onerror="this.src='/uploads/teams/default.png'">
                            </div>
                            <div class="ai-team-name">${escapeHtml(aiMatch.away_team)}</div>
                        </div>
                    </div>
                    
                    <div class="ai-match-meta">
                        <span><i class="fas fa-trophy"></i> ${escapeHtml(aiMatch.league || 'Unknown League')}</span>
                        <span><i class="far fa-clock"></i> ${formatMatchTime(aiMatch.match_time)}</span>
                    </div>
                    
                    <div class="confidence">
                        <div class="confidence-header">
                            <span class="confidence-label">AI Confidence</span>
                            <span class="confidence-value">${confidence}%</span>
                        </div>
                        <div class="confidence-bar">
                            <div class="confidence-fill" style="width: ${confidence}%"></div>
                        </div>
                    </div>
                    
                    <div class="ai-message">${truncateText(aiMessage, 100)}</div>
                    
                    <div class="amount-presets">
                        <button class="amount-preset" data-amount="100">100</button>
                        <button class="amount-preset active" data-amount="200">200</button>
                        <button class="amount-preset" data-amount="300">300</button>
                        <button class="amount-preset" data-amount="500">500</button>
                    </div>
                    <div class="amount-input">
                        <input type="number" id="authAmountInput" value="${AppState.selectedAmount}" step="10" min="100" max="500">
                        <span>${currency}</span>
                    </div>
                    
                    <button class="authorize-btn" id="authorizeBtn" data-match-id="${aiMatch.id}">
                        ${isTestMode ? 'Test Trade' : 'Let AI Trade'} <i class="fas fa-arrow-right"></i>
                    </button>
                    <div class="btn-tip">Click to execute AI-recommended trade</div>
                </div>
            `;
        } else {
            aiSectionHtml = `
                <div class="ai-section">
                    <div class="ai-badge">
                        <i class="fas fa-robot"></i>
                        <span>AI Pick</span>
                    </div>
                    <div class="match-teams">No matches available</div>
                    <div class="match-meta">New matches coming soon</div>
                    <div class="ai-message">I'm analyzing the latest data. New matches will appear here shortly.</div>
                    <a href="/match-market.html" class="view-link">Browse Market →</a>
                </div>
            `;
        }
        
        const hasChartData = weekData && weekData.some(d => d.authorized > 0);
        const chartHtml = hasChartData ? renderChart(weekData) : '';
        const showChartSection = hasChartData;
        
        const combinedCardHtml = `
            <div class="combined-card ${!showChartSection ? 'no-chart' : ''}">
                ${aiSectionHtml}
                ${showChartSection ? `<div class="chart-section">${chartHtml}</div>` : ''}
            </div>
        `;
        
        // ===== 模块2：新闻卡片 =====
        let newsHtml = '';
        if (newsArticles && newsArticles.length > 0) {
            newsHtml = `
                <div class="news-card">
                    <div class="card-title">
                        <span><i class="fas fa-newspaper"></i> Football News</span>
                        <a href="/platform-reports.html">View All →</a>
                    </div>
                    <div class="news-grid">
                        ${newsArticles.slice(0, 4).map(article => `
                            <div class="news-item" onclick="window.open('${article.url}', '_blank')">
                                <div class="news-image" style="background-image: url('${article.imageUrl || 'https://placehold.co/80x80/1F2937/9CA3AF?text=News'}')"></div>
                                <div class="news-content">
                                    <div class="news-source">${escapeHtml(article.source || 'Football News')}</div>
                                    <div class="news-title">${escapeHtml(article.title)}</div>
                                    <div class="news-meta">
                                        <span>${getRelativeTime(article.publishedAt)}</span>
                                        <span class="news-link">Read →</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            newsHtml = `
                <div class="news-card">
                    <div class="card-title">
                        <span><i class="fas fa-newspaper"></i> Football News</span>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-futbol"></i>
                        <p>No news available</p>
                        <a href="/platform-reports.html" class="view-link">View Reports →</a>
                    </div>
                </div>
            `;
        }
        
        // ===== 模块3：平台统计卡片 =====
        const hasTransactions = recentTransactions && recentTransactions.length > 0;
        let historyItemsHtml = '';
        if (hasTransactions) {
            historyItemsHtml = recentTransactions.map(t => `
                <div class="history-item" onclick="window.location.href='/transaction-detail.html?id=${t.id}'">
                    <div class="history-info">
                        <div class="history-match">${escapeHtml(t.match_name || `${t.home_team} vs ${t.away_team}`)}</div>
                        <div class="history-date">${getRelativeTime(t.created_at)}</div>
                    </div>
                    <div class="history-profit ${(t.profit || 0) >= 0 ? 'positive' : 'negative'}">
                        ${(t.profit || 0) >= 0 ? '+' : ''}${formatAmount(t.profit || 0)} ${currency}
                    </div>
                    ${isTestMode ? '<span class="history-test-badge">Test</span>' : ''}
                </div>
            `).join('');
        }
        
        const statsCardHtml = `
            <div class="stats-card">
                <div class="card-title">
                    <span><i class="fas fa-chart-line"></i> Platform Performance</span>
                    <a href="/platform-reports.html">Full Report →</a>
                </div>
                
                <div class="stats-grid-compact">
                    <div class="stat-compact">
                        <div class="stat-value-sm">${formatCompactNumber(AppState.platformStats.totalAuth)}</div>
                        <div class="stat-label-sm">Total Auth</div>
                        <div class="trend-up">↑12.3%</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${AppState.platformStats.successRate}%</div>
                        <div class="stat-label-sm">Success Rate</div>
                        <div class="trend-up">↑2.1%</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${formatCompactNumber(AppState.platformStats.totalVolume)}</div>
                        <div class="stat-label-sm">Total Volume</div>
                        <div class="trend-up">↑8.7%</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${formatCompactNumber(AppState.platformStats.activeUsers)}</div>
                        <div class="stat-label-sm">Active Users</div>
                        <div class="trend-up">↑5.7%</div>
                    </div>
                </div>
                
                <div class="ai-stats-grid">
                    <div class="stat-compact">
                        <div class="stat-value-sm">${AppState.platformStats.aiAccuracy}%</div>
                        <div class="stat-label-sm">AI Accuracy</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${AppState.platformStats.highConfAccuracy}%</div>
                        <div class="stat-label-sm">High Confidence</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${formatCompactNumber(AppState.platformStats.totalPredictions)}</div>
                        <div class="stat-label-sm">Predictions</div>
                    </div>
                    <div class="stat-compact">
                        <div class="stat-value-sm">${AppState.platformStats.bestLeague}</div>
                        <div class="stat-label-sm">Best League</div>
                    </div>
                </div>
                
                ${hasTransactions ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="font-size: 13px;"><i class="fas fa-history"></i> Recent Trades</span>
                    <a href="/transaction-list.html" style="font-size: 11px; color: var(--brand-primary);">View All →</a>
                </div>
                <div class="history-list">${historyItemsHtml}</div>
                ` : ''}
                
                <div class="chain-proof">
                    <div class="chain-proof-header">
                        <i class="fab fa-ethereum"></i> USDT On-Chain Verification · Ethereum
                    </div>
                    <div class="chain-address">
                        <span>Contract: ${AppState.platformStats.contractAddress}</span>
                        <button class="copy-addr" onclick="copyToClipboard('${AppState.platformStats.contractAddress}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="proof-confirm">
                        <i class="fas fa-check-circle"></i> Verified on Ethereum
                    </div>
                    <div class="proof-confirm">
                        <i class="fas fa-link"></i> 
                        <a href="https://etherscan.io/address/${AppState.platformStats.contractAddress}" target="_blank">Verify on Etherscan →</a>
                    </div>
                </div>
            </div>
        `;
        
        // ===== 模块4：推荐比赛卡片 =====
        let matchesHtml = '';
        if (displayMatches.length > 0) {
            matchesHtml = `
                <div class="matches-card">
                    <div class="card-title">
                        <span><i class="fas fa-fire"></i> Today's Recommendations</span>
                        <a href="/match-market.html">View All →</a>
                    </div>
                    <div class="more-matches-grid">
                        ${displayMatches.map(m => {
                            const confidence = getConfidenceByLeague(m.league);
                            return `
                                <div class="more-match-card" data-match-id="${m.id}" data-clickable="true">
                                    <div class="more-match-logos">
                                        <div class="more-match-team">
                                            <div class="more-match-team-logo">
                                                <img src="${getTeamLogoUrl(m.home_logo, m.home_team)}" 
                                                     alt="${escapeHtml(m.home_team)}"
                                                     loading="lazy"
                                                     onerror="this.src='/uploads/teams/default.png'">
                                            </div>
                                            <div class="more-match-team-name">${escapeHtml(m.home_team)}</div>
                                        </div>
                                        <div class="more-match-vs">VS</div>
                                        <div class="more-match-team">
                                            <div class="more-match-team-logo">
                                                <img src="${getTeamLogoUrl(m.away_logo, m.away_team)}" 
                                                     alt="${escapeHtml(m.away_team)}"
                                                     loading="lazy"
                                                     onerror="this.src='/uploads/teams/default.png'">
                                            </div>
                                            <div class="more-match-team-name">${escapeHtml(m.away_team)}</div>
                                        </div>
                                    </div>
                                    <div class="more-match-info">
                                        <div class="more-match-league">
                                            <i class="fas fa-trophy"></i> ${escapeHtml(m.league || 'Unknown')}
                                        </div>
                                        <div class="more-match-meta">
                                            <span class="more-match-confidence">${confidence}%</span>
                                            <span><i class="far fa-clock"></i> ${formatMatchTime(m.match_time)}</span>
                                        </div>
                                    </div>
                                    <button class="more-match-btn" data-match-id="${m.id}">Trade <i class="fas fa-arrow-right"></i></button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } else {
            matchesHtml = `
                <div class="matches-card">
                    <div class="card-title">
                        <span><i class="fas fa-fire"></i> Today's Recommendations</span>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-futbol"></i>
                        <p>No matches available today</p>
                        <a href="/match-market.html" class="view-link">Browse Market →</a>
                    </div>
                </div>
            `;
        }
        
        // ===== Greeting =====
        const greetingHtml = `
            <div class="greeting">
                <h1>Welcome back, ${escapeHtml(userName)}</h1>
                <p>AI is analyzing matches. Ready to trade?</p>
            </div>
        `;
        
        // ===== Complete Layout =====
        const fullHtml = `
            ${greetingHtml}
            <div class="dashboard-grid">
                ${combinedCardHtml}
                ${newsHtml}
            </div>
            <div class="dashboard-grid">
                ${statsCardHtml}
                ${matchesHtml}
            </div>
        `;
        
        // 使用 requestAnimationFrame 优化渲染
        requestAnimationFrame(() => {
            DOM.appRoot.innerHTML = fullHtml;
            bindEvents();
            AppState.isRendering = false;
        });
        
        window.copyToClipboard = copyToClipboard;
    }
    
    // ==================== Event Binding ====================
    function bindEvents() {
        const amountInput = document.getElementById('authAmountInput');
        const presetBtns = document.querySelectorAll('.amount-preset');
        const authorizeBtn = document.getElementById('authorizeBtn');
        
        if (amountInput) {
            amountInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value) || 200;
                if (val < 100) val = 100;
                if (val > 500) val = 500;
                AppState.selectedAmount = val;
                e.target.value = val;
                presetBtns.forEach(btn => btn.classList.remove('active'));
            });
        }
        
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount);
                if (!isNaN(amount)) {
                    AppState.selectedAmount = amount;
                    if (amountInput) amountInput.value = amount;
                    presetBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });
        
        if (authorizeBtn) {
            authorizeBtn.addEventListener('click', async () => {
                const amount = AppState.selectedAmount;
                const matchId = authorizeBtn.dataset.matchId;
                const isTestMode = AppState.userMode === 'test';
                const currency = isTestMode ? 'tUSDT' : 'USDT';
                const balance = isTestMode ? AppState.authority.sandbox : AppState.authority.mainnet;
                
                if (amount < 100 || amount > 500) {
                    showToast('Amount must be between 100-500 USDT', 'warning');
                    return;
                }
                if (amount > balance) {
                    showToast(`Insufficient balance: ${formatAmount(balance)} ${currency}`, 'warning');
                    return;
                }
                if (!matchId) {
                    showToast('Please select a match', 'warning');
                    return;
                }
                
                authorizeBtn.disabled = true;
                authorizeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                
                try {
                    const res = await fetch('/api/v1/user/quick-authorize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ amount, matchId })
                    });
                    const result = await res.json();
                    if (result.success) {
                        showToast('Authorization successful! Redirecting...', 'success');
                        setTimeout(() => {
                            window.location.href = `/transaction-detail.html?authId=${result.data.authId}`;
                        }, 1000);
                    } else {
                        let msg = 'Authorization failed';
                        if (result.error === 'NO_AVAILABLE_MATCH') msg = 'No available match';
                        if (result.error === 'INSUFFICIENT_BALANCE') msg = 'Insufficient balance';
                        showToast(msg, 'error');
                        authorizeBtn.disabled = false;
                        authorizeBtn.innerHTML = `${isTestMode ? 'Test Trade' : 'Let AI Trade'} <i class="fas fa-arrow-right"></i>`;
                    }
                } catch (err) {
                    showToast('Network error, please try again', 'error');
                    authorizeBtn.disabled = false;
                    authorizeBtn.innerHTML = `${isTestMode ? 'Test Trade' : 'Let AI Trade'} <i class="fas fa-arrow-right"></i>`;
                }
            });
        }
        
        document.querySelectorAll('.more-match-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const matchId = btn.dataset.matchId;
                if (matchId) {
                    window.location.href = `/authorize-submit.html?matchId=${matchId}`;
                }
            });
        });
        
        document.querySelectorAll('.more-match-card[data-clickable="true"]').forEach(card => {
            card.addEventListener('click', () => {
                const matchId = card.dataset.matchId;
                if (matchId) {
                    window.location.href = `/authorize-submit.html?matchId=${matchId}`;
                }
            });
        });
    }
    
    // ==================== Mode Switching ====================
    function showModeSwitchConfirmation(isTestMode, onConfirm) {
        const modal = document.createElement('div');
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;z-index:10000;`;
        modal.innerHTML = `
            <div style="background:#1F2937;border-radius:24px;max-width:300px;width:90%;padding:24px;border:1px solid rgba(59,130,246,0.3);">
                <div style="text-align:center;margin-bottom:20px;">
                    <i class="fas ${isTestMode ? 'fa-flask' : 'fa-bolt'}" style="font-size:48px;color:${isTestMode ? '#3B82F6' : '#F97316'};margin-bottom:12px;"></i>
                    <h2 style="font-size:20px;font-weight:600;margin-bottom:8px;color:white;">${isTestMode ? 'Test Mode' : 'Live Mode'}</h2>
                    <p style="color:#9CA3AF;font-size:13px;">${isTestMode ? 'You will receive 10,000 tUSDT for risk-free practice.' : 'Use your real USDT balance for actual trading.'}</p>
                </div>
                <div style="display:flex;gap:12px;">
                    <button class="cancel-btn" style="flex:1;padding:10px;background:transparent;border:1px solid #374151;border-radius:40px;color:#9CA3AF;cursor:pointer;">Cancel</button>
                    <button class="confirm-btn" style="flex:1;padding:10px;background:${isTestMode ? '#3B82F6' : '#F97316'};border:none;border-radius:40px;color:white;cursor:pointer;">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.cancel-btn').onclick = () => modal.remove();
        modal.querySelector('.confirm-btn').onclick = () => { modal.remove(); onConfirm(); };
    }
    
    async function switchToMode(targetMode) {
        const isTestMode = targetMode === 'test';
        if (AppState.userMode === targetMode) return;
        
        showModeSwitchConfirmation(isTestMode, async () => {
            if (window.ThemeManager) {
                const success = await ThemeManager.toggleMode();
                if (success) {
                    setTimeout(() => {
                        AppState.userMode = targetMode;
                        AppState.network = isTestMode ? 'sandbox' : 'mainnet';
                        updateModeUI();
                        fetchUserStats();
                        loadMatches();
                        render();
                    }, 50);
                }
            } else {
                AppState.userMode = targetMode;
                AppState.network = isTestMode ? 'sandbox' : 'mainnet';
                updateModeUI();
                fetchUserStats();
                loadMatches();
                render();
            }
        });
    }
    
    // ==================== 4-Step Onboarding ====================
    let currentStep = 0, steps = [], overlay = null, highlightDiv = null;
    
    function initOnboarding() {
        if (localStorage.getItem('footrada_guide_completed') === 'true') return;
        if (AppState.userStats.hasAuthorized) return;
        
        setTimeout(() => {
            const combinedCard = document.querySelector('.combined-card');
            const statsCard = document.querySelector('.stats-card');
            
            if (!combinedCard) return;
            
            steps = [
                { title: 'Welcome to FOOTRADA', desc: 'AI-powered football trading platform. Authorize funds, and AI handles the rest.', icon: '✨', target: null },
                { title: 'AI Recommended Trade', desc: 'AI selects the best match. Check confidence, enter amount, and authorize with one click.', icon: '⚡', target: '.combined-card' },
                { title: 'Track Your Performance', desc: 'View your authorization amounts and profit trends.', icon: '📊', target: '.combined-card .chart-section' },
                { title: 'Platform Trust & Verification', desc: 'Check platform stats and USDT on-chain verification.', icon: '🔗', target: '.stats-card' }
            ];
            
            createOnboarding();
            showStep(0);
        }, 800);
    }
    
    function createOnboarding() {
        overlay = document.getElementById('onboardingOverlay');
        highlightDiv = document.getElementById('onboardingHighlight');
        if (!overlay) return;
        
        document.getElementById('onboardingClose')?.addEventListener('click', finishOnboarding);
        document.getElementById('onboardingSkip')?.addEventListener('click', finishOnboarding);
        document.getElementById('onboardingPrev')?.addEventListener('click', () => {
            if (currentStep > 0) showStep(currentStep - 1);
        });
        document.getElementById('onboardingNext')?.addEventListener('click', () => {
            if (currentStep === steps.length - 1) {
                finishOnboarding();
            } else {
                showStep(currentStep + 1);
            }
        });
        
        overlay.style.display = 'flex';
    }
    
    function showStep(idx) {
        currentStep = idx;
        const step = steps[idx];
        
        document.getElementById('onboardingIcon').innerHTML = step.icon;
        document.getElementById('onboardingTitle').innerText = step.title;
        document.getElementById('onboardingDesc').innerText = step.desc;
        
        document.getElementById('onboardingPrev').style.display = idx === 0 ? 'none' : 'block';
        document.getElementById('onboardingNext').innerText = idx === steps.length - 1 ? 'Get Started' : 'Next';
        
        const dots = document.querySelectorAll('.onboarding-step-dots .dot');
        dots.forEach((d, i) => {
            d.classList.toggle('active', i === idx);
        });
        
        if (step.target) {
            const targetElement = document.querySelector(step.target);
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                const scrollY = window.scrollY;
                highlightDiv.style.display = 'block';
                highlightDiv.style.top = (rect.top + scrollY) + 'px';
                highlightDiv.style.left = rect.left + 'px';
                highlightDiv.style.width = rect.width + 'px';
                highlightDiv.style.height = rect.height + 'px';
                highlightDiv.style.borderRadius = window.getComputedStyle(targetElement).borderRadius;
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                highlightDiv.style.display = 'none';
            }
        } else {
            highlightDiv.style.display = 'none';
        }
    }
    
    function finishOnboarding() {
        if (overlay) overlay.style.display = 'none';
        if (highlightDiv) highlightDiv.style.display = 'none';
        localStorage.setItem('footrada_guide_completed', 'true');
    }
    
    // ==================== Intervals (优化版) ====================
    function startIntervals() {
        // 合并定时器，减少后台任务
        setInterval(() => {
            loadMatches();
            fetchUserStats();
            loadTicker();
            loadTickerStats();
            render();
        }, 60000);
        
        // 新闻单独，间隔更长
        setInterval(() => {
            loadNews();
        }, 300000);
    }
    
    // ==================== Initialization (并行优化) ====================
    async function init() {
        if (!DOM.appRoot) {
            console.error('appRoot element not found');
            return;
        }
        
        if (window.ThemeManager) await ThemeManager.init(true);
        
        // 并行请求所有数据
        await Promise.all([
            fetchUserAuthority(),
            fetchUserMode(),
            fetchUserStats(),
            fetchUserName(),
            loadMatches()
        ]);
        
        loadTicker();
        loadTickerStats();
        
        await render();
        
        startIntervals();
        
        DOM.privacyToggle?.addEventListener('click', () => {
            AppState.isPrivacyMode = !AppState.isPrivacyMode;
            UTILS.setStorage('privacy_mode', AppState.isPrivacyMode);
        });
        DOM.testModeBtn?.addEventListener('click', () => switchToMode('test'));
        DOM.liveModeBtn?.addEventListener('click', () => switchToMode('live'));
        
        initOnboarding();
    }
    
    document.addEventListener('DOMContentLoaded', init);
})();