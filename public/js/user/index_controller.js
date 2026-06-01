cd ~/Desktop/footradapro-beiyong

cat > public/js/user/index_controller.js << 'EOF'
/**
 * FOOTRADAPRO - Homepage Controller v10.1
 * 修复余额显示问题
 */
(function() {
    'use strict';

    // ==================== 多语言配置 ====================
    const LOCALES = {
        zh: {
            'nav.home': '首页', 'nav.market': '市场', 'nav.records': '记录', 'nav.profile': '个人',
            'platform.title': '平台性能', 'platform.subtitle': '实时分析与指标', 'platform.report': '完整报告',
            'stat.totalAuth': '总授权', 'stat.successRate': '成功率', 'stat.totalVolume': '总交易量', 'stat.activeUsers': '活跃用户',
            'stat.subAuth': '最近30天', 'stat.subSuccess': '较上期+4.2%', 'stat.subVolume': 'USDT等值', 'stat.subUsers': '周活跃',
            'ai.accuracy': 'AI准确率', 'ai.highConfidence': '高置信度', 'ai.predictions': '总预测数', 'ai.bestLeague': '最佳联赛',
            'onchain.title': 'USDT 链上验证', 'onchain.verified': '已验证于以太坊', 'onchain.etherscan': '在Etherscan验证', 'onchain.footer': '智能合约已审计 · 非托管架构',
            'liquidity.pool': '流动性池', 'liquidity.available': '可用余额', 'liquidity.authorized': '已授权', 'liquidity.pnl': '今日盈亏',
            'mode.sandbox': '沙盒', 'mode.live': '实盘',
            'mode.sandbox.note': '沙盒模式使用虚拟资金(tUSDT)，无真实资产风险。所有数据仅用于策略测试。',
            'mode.live.note': '实盘模式使用真实资金(USDT)，交易有风险，请谨慎操作。',
            'spotlight.title': 'AI焦点 · 热门赛事', 'spotlight.all': '全部比赛', 'match.authorize': '授权',
            'auth.title': '最近授权', 'auth.viewAll': '查看全部', 'auth.noRecords': '暂无授权记录',
            'auth.timestamp': '时间', 'auth.match': '比赛', 'auth.amount': '金额', 'auth.status': '状态', 'auth.mode': '模式', 'auth.details': '详情',
            'status.pending': '待处理', 'status.completed': '已完成', 'status.settled': '已结算',
            'copy.success': '合约地址已复制', 'copy.failed': '复制失败', 'support': '客服支持'
        },
        en: {
            'nav.home': 'Home', 'nav.market': 'Market', 'nav.records': 'Records', 'nav.profile': 'Profile',
            'platform.title': 'Platform Performance', 'platform.subtitle': 'Real-time analytics & metrics', 'platform.report': 'Full Report',
            'stat.totalAuth': 'Total Auth', 'stat.successRate': 'Success Rate', 'stat.totalVolume': 'Total Volume', 'stat.activeUsers': 'Active Users',
            'stat.subAuth': 'last 30 days', 'stat.subSuccess': '+4.2% vs previous', 'stat.subVolume': 'USDT equivalent', 'stat.subUsers': 'weekly active',
            'ai.accuracy': 'AI Accuracy', 'ai.highConfidence': 'High Confidence', 'ai.predictions': 'Predictions', 'ai.bestLeague': 'Best League',
            'onchain.title': 'USDT On-Chain Verification', 'onchain.verified': 'Verified on Ethereum', 'onchain.etherscan': 'Verify on Etherscan', 'onchain.footer': 'Smart contract audited · Non-custodial architecture',
            'liquidity.pool': 'Liquidity Pool', 'liquidity.available': 'Available balance', 'liquidity.authorized': 'Authorized', 'liquidity.pnl': 'Today P&L',
            'mode.sandbox': 'Sandbox', 'mode.live': 'Live',
            'mode.sandbox.note': 'Sandbox uses virtual funds (tUSDT) — no real asset risk. All data is simulated for strategy testing only.',
            'mode.live.note': 'Live mode uses real funds (USDT). Trading involves risk. Please proceed with caution.',
            'spotlight.title': 'AI Spotlight', 'spotlight.all': 'All matches', 'match.authorize': 'Authorize',
            'auth.title': 'Recent Authorizations', 'auth.viewAll': 'View all', 'auth.noRecords': 'No authorization records yet',
            'auth.timestamp': 'Timestamp', 'auth.match': 'Match', 'auth.amount': 'Amount', 'auth.status': 'Status', 'auth.mode': 'Mode', 'auth.details': 'Details',
            'status.pending': 'Pending', 'status.completed': 'Completed', 'status.settled': 'Settled',
            'copy.success': 'Contract address copied', 'copy.failed': 'Failed to copy', 'support': 'Support'
        }
    };

    let currentLanguage = localStorage.getItem('language') || 'zh';
    let currentCurrency = 'tUSDT';

    const DOM = {
        themeToggle: document.getElementById('themeToggle'),
        testModeBtn: document.getElementById('testModeBtn'),
        liveModeBtn: document.getElementById('liveModeBtn'),
        modeBadge: document.getElementById('modeBadge'),
        modeNote: document.getElementById('modeNote'),
        virtualTip: document.getElementById('virtualTip'),
        langToggle: document.getElementById('langToggle'),
        poolAmount: document.getElementById('poolAmount'),
        availableBalance: document.getElementById('availableBalance'),
        authorizedAmount: document.getElementById('authorizedAmount'),
        todayPnl: document.getElementById('todayPnl'),
        eventsGrid: document.getElementById('eventsGrid'),
        authTableBody: document.getElementById('authTableBody'),
        mobileAuthList: document.getElementById('mobileAuthList'),
        statTotalAuth: document.getElementById('statTotalAuth'),
        statSuccessRate: document.getElementById('statSuccessRate'),
        statTotalVolume: document.getElementById('statTotalVolume'),
        statActiveUsers: document.getElementById('statActiveUsers'),
        statAiAccuracy: document.getElementById('statAiAccuracy'),
        statHighConfAccuracy: document.getElementById('statHighConfAccuracy'),
        statTotalPredictions: document.getElementById('statTotalPredictions'),
        statBestLeague: document.getElementById('statBestLeague'),
        contractAddressSpan: document.getElementById('contractAddress')
    };

    const UserState = {
        authority: { sandbox: 10000.00, mainnet: 0.00 },
        userStats: { totalAuthorized: 0, totalProfit: 0 },
        matches: [],
        userName: 'Trader'
    };

    function t(key) {
        const locale = LOCALES[currentLanguage] || LOCALES.zh;
        return locale[key] || key;
    }

    function updateAllTexts() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });
        if (DOM.modeBadge) DOM.modeBadge.textContent = ThemeManager.isTestMode ? t('mode.sandbox') : t('mode.live');
        if (DOM.modeNote) {
            const noteKey = ThemeManager.isTestMode ? 'mode.sandbox.note' : 'mode.live.note';
            DOM.modeNote.innerHTML = `<i class="fa-regular fa-circle-info"></i> ${t(noteKey)}`;
        }
        if (DOM.virtualTip) {
            const tipKey = ThemeManager.isTestMode ? 'mode.sandbox.note' : 'mode.live.note';
            DOM.virtualTip.innerHTML = ThemeManager.isTestMode ? `🧪 ${t(tipKey)}` : `⚠️ ${t(tipKey)}`;
        }
        if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
    }

    function switchLanguage() {
        currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
        localStorage.setItem('language', currentLanguage);
        updateAllTexts();
        renderAuthorizations();
        window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: currentLanguage } }));
        showToast(`Language switched to ${currentLanguage === 'zh' ? '中文' : 'English'}`, 'success');
    }

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
        try {
            const date = new Date(utcString);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', 
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return '-'; }
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
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => showToast(t('copy.success'), 'success'))
            .catch(() => showToast(t('copy.failed'), 'warning'));
    }

    function getTeamLogoUrl(logoUrl) {
        if (logoUrl && logoUrl !== '/uploads/teams/default.png') return logoUrl;
        return '/uploads/teams/default.png';
    }

    // ==================== 余额显示修复 ====================
    function updateCurrencyDisplay() {
        const isTestMode = ThemeManager.isTestMode;
        currentCurrency = isTestMode ? 'tUSDT' : 'USDT';
        
        const sandboxBalance = Number(UserState.authority.sandbox) || 0;
        const mainnetBalance = Number(UserState.authority.mainnet) || 0;
        const balance = isTestMode ? sandboxBalance : mainnetBalance;
        const totalAuthorized = Number(UserState.userStats.totalAuthorized) || 0;
        const totalProfit = Number(UserState.userStats.totalProfit) || 0;
        
        if (DOM.poolAmount) DOM.poolAmount.innerText = formatAmount(balance);
        if (DOM.availableBalance) DOM.availableBalance.innerText = `${formatAmount(balance)} ${currentCurrency}`;
        if (DOM.authorizedAmount) DOM.authorizedAmount.innerText = `${formatAmount(totalAuthorized)} ${currentCurrency}`;
        if (DOM.todayPnl) {
            DOM.todayPnl.innerText = `${totalProfit >= 0 ? '+' : ''}${formatAmount(totalProfit)} ${currentCurrency}`;
        }
        
        console.log(`💰 余额显示: ${isTestMode ? '沙盒' : '实盘'}模式, 余额=${balance} ${currentCurrency}`);
    }

    async function fetchUserBalance() {
        try {
            const res = await APIClient.get('/api/v1/user/balance');
            const data = await res.json();
            console.log('💰 余额API返回:', data);
            
            if (data.success && data.data) {
                UserState.authority.mainnet = Number(data.data.balance) || 0;
                UserState.authority.sandbox = Number(data.data.test_balance) || 10000;
                console.log(`💰 余额: 实盘=${UserState.authority.mainnet}, 沙盒=${UserState.authority.sandbox}`);
            }
        } catch (err) { 
            console.warn('Failed to fetch balance:', err); 
        }
    }

    // ==================== 其余函数保持不变 ====================
    async function fetchUserStats() {
        try {
            const mode = ThemeManager.isTestMode ? 'test' : 'live';
            const res = await APIClient.get(`/api/v1/user/authorize/list?mode=${mode}&limit=200`);
            const data = await res.json();
            if (data.success && data.data) {
                const auths = data.data;
                UserState.userStats.totalAuthorized = auths.reduce((s, a) => s + (Number(a.amount) || 0), 0);
                const settled = auths.filter(a => a.status === 'settled' || a.profit !== undefined);
                UserState.userStats.totalProfit = settled.reduce((s, a) => s + (Number(a.profit) || 0), 0);
                return auths;
            }
            return [];
        } catch (err) { return []; }
    }

    async function loadMatches() {
        try {
            const mode = ThemeManager.isTestMode ? 'test' : 'live';
            const res = await APIClient.get(`/api/v1/matches?mode=${mode}&limit=100`);
            const data = await res.json();
            if (data.success && data.data) UserState.matches = data.data;
        } catch (err) { console.warn('Failed to load matches'); }
    }

    async function loadRecentTransactions() {
        try {
            const res = await APIClient.get(`/api/v1/user/transactions?limit=5`);
            const data = await res.json();
            return data.success && data.data ? data.data : [];
        } catch (err) { return []; }
    }

    function getTodayMatchesForRecommend() {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(todayStart.getDate() + 1);
        
        const upcomingMatches = UserState.matches.filter(m => {
            const matchDate = new Date(m.match_time);
            const realStatus = m.calculated_status || m.status;
            return matchDate >= todayStart && matchDate < tomorrowStart && 
                   (realStatus === 'upcoming' || realStatus === 'pending');
        });
        
        const priority = { 'UEFA Champions League': 1, 'UEFA Europa League': 2, 'Premier League': 3, 'La Liga': 4, 'Serie A': 5, 'Bundesliga': 6, 'Ligue 1': 7 };
        return upcomingMatches.sort((a, b) => (priority[a.league] || 100) - (priority[b.league] || 100));
    }

    function updateMatchCards() {
        if (!DOM.eventsGrid) return;
        const displayMatches = getTodayMatchesForRecommend().slice(0, 4);
        
        if (displayMatches.length === 0) {
            DOM.eventsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:40px;"><i class="fas fa-futbol" style="font-size:48px;opacity:0.5;"></i><p style="margin-top:16px;">${t('auth.noRecords')}</p><a href="/match-market.html" style="color:var(--accent);">${t('spotlight.all')} →</a></div>`;
            return;
        }
        
        DOM.eventsGrid.innerHTML = displayMatches.map(m => `
            <div class="event-card" data-match-id="${m.id}">
                <div class="matchup">
                    <div class="team"><div class="team-icon"><img src="${getTeamLogoUrl(m.home_logo)}" alt="${escapeHtml(m.home_team)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="team-name">${escapeHtml(m.home_team)}</div></div>
                    <div class="vs">VS</div>
                    <div class="team"><div class="team-icon"><img src="${getTeamLogoUrl(m.away_logo)}" alt="${escapeHtml(m.away_team)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="team-name">${escapeHtml(m.away_team)}</div></div>
                </div>
                <div class="event-league"><i class="fa-solid fa-trophy"></i> ${escapeHtml(m.league || 'Unknown League')}</div>
                <div class="event-time"><i class="fa-regular fa-clock"></i> ${formatMatchTime(m.match_time)}</div>
                <button class="event-btn" data-match-id="${m.id}">${t('match.authorize')} <i class="fa-solid fa-arrow-right"></i></button>
            </div>
        `).join('');
        
        document.querySelectorAll('.event-btn').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); window.location.href = `/authorize-submit.html?matchId=${btn.dataset.matchId}`; };
        });
    }

    async function renderAuthorizations() {
        const transactions = await loadRecentTransactions();
        if (!DOM.authTableBody) return;
        
        if (!transactions || transactions.length === 0) {
            DOM.authTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;"><i class="fas fa-history" style="font-size:24px;opacity:0.5;"></i><p>${t('auth.noRecords')}</p></td></tr>`;
            if (DOM.mobileAuthList) DOM.mobileAuthList.innerHTML = `<div style="text-align:center;padding:20px;">${t('auth.noRecords')}</div>`;
            return;
        }
        
        const isTestMode = ThemeManager.isTestMode;
        const currencySymbol = isTestMode ? 'tUSDT' : 'USDT';
        
        DOM.authTableBody.innerHTML = transactions.map(tx => {
            let statusClass = 'status-pending';
            let statusText = t('status.pending');
            if (tx.profit !== undefined) {
                if (tx.profit >= 0) {
                    statusClass = 'status-completed';
                    statusText = t('status.completed');
                } else {
                    statusClass = 'status-settled';
                    statusText = t('status.settled');
                }
            }
            const modeClass = isTestMode ? 'mode-sandbox' : 'mode-live';
            const modeText = isTestMode ? t('mode.sandbox') : t('mode.live');
            
            return `
                <tr>
                    <td class="link">${formatMatchTime(tx.created_at) || '-'}</td>
                    <td>${escapeHtml(tx.match_name || `${tx.home_team || '?'} vs ${tx.away_team || '?'}`)}</td>
                    <td>${formatAmount(tx.amount || 0)} ${currencySymbol}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td><span class="mode-badge ${modeClass}">${modeText}</span></td>
                    <td><a href="#" class="detail-link" data-id="${tx.id}">${t('auth.details')} →</a></td>
                </tr>
            `;
        }).join('');
        
        if (DOM.mobileAuthList) {
            DOM.mobileAuthList.innerHTML = transactions.map(tx => {
                let statusClass = 'status-pending';
                let statusText = t('status.pending');
                if (tx.profit !== undefined) {
                    if (tx.profit >= 0) {
                        statusClass = 'status-completed';
                        statusText = t('status.completed');
                    } else {
                        statusClass = 'status-settled';
                        statusText = t('status.settled');
                    }
                }
                const modeClass = isTestMode ? 'mode-sandbox' : 'mode-live';
                const modeText = isTestMode ? t('mode.sandbox') : t('mode.live');
                
                return `
                    <div class="mobile-history-item">
                        <div class="mobile-history-header">
                            <span>${formatMatchTime(tx.created_at) || '-'}</span>
                            <span class="mode-badge ${modeClass}">${modeText}</span>
                        </div>
                        <div class="mobile-history-match">${escapeHtml(tx.match_name || `${tx.home_team || '?'} vs ${tx.away_team || '?'}`)}</div>
                        <div class="mobile-history-details">
                            <span><strong>${formatAmount(tx.amount || 0)} ${currencySymbol}</strong></span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            <a href="#" class="detail-link" data-id="${tx.id}">${t('auth.details')}</a>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function updatePlatformStats() {
        const stats = {
            totalAuth: 1245678, successRate: 83.2, totalVolume: 52400000, activeUsers: 48300,
            aiAccuracy: 83.2, highConfAccuracy: 91.4, totalPredictions: 1020000, bestLeague: 'UCL (86.3%)',
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
        };
        if (DOM.statTotalAuth) DOM.statTotalAuth.innerText = formatCompactNumber(stats.totalAuth);
        if (DOM.statSuccessRate) DOM.statSuccessRate.innerText = stats.successRate;
        if (DOM.statTotalVolume) DOM.statTotalVolume.innerText = formatCompactNumber(stats.totalVolume);
        if (DOM.statActiveUsers) DOM.statActiveUsers.innerText = formatCompactNumber(stats.activeUsers);
        if (DOM.statAiAccuracy) DOM.statAiAccuracy.innerText = stats.aiAccuracy;
        if (DOM.statHighConfAccuracy) DOM.statHighConfAccuracy.innerText = stats.highConfAccuracy;
        if (DOM.statTotalPredictions) DOM.statTotalPredictions.innerText = formatCompactNumber(stats.totalPredictions);
        if (DOM.statBestLeague) DOM.statBestLeague.innerHTML = stats.bestLeague;
        if (DOM.contractAddressSpan) DOM.contractAddressSpan.innerText = stats.contractAddress;
        
        const aiFill = document.getElementById('aiAccuracyFill');
        const highFill = document.getElementById('highConfFill');
        if (aiFill) aiFill.style.width = stats.aiAccuracy + '%';
        if (highFill) highFill.style.width = stats.highConfAccuracy + '%';
    }

    async function refreshAllData() {
        await Promise.all([fetchUserBalance(), fetchUserStats(), loadMatches()]);
        updateCurrencyDisplay();
        updateMatchCards();
        renderAuthorizations();
        updatePlatformStats();
        updateModeUI();
    }

    function updateModeUI() {
        const isTestMode = ThemeManager.isTestMode;
        if (DOM.testModeBtn && DOM.liveModeBtn) {
            DOM.testModeBtn.classList.toggle('active', isTestMode);
            DOM.liveModeBtn.classList.toggle('active', !isTestMode);
        }
        if (DOM.modeBadge) {
            DOM.modeBadge.className = isTestMode ? 'badge sandbox-mode' : 'badge live-mode';
            DOM.modeBadge.textContent = isTestMode ? t('mode.sandbox') : t('mode.live');
        }
        const noteKey = isTestMode ? 'mode.sandbox.note' : 'mode.live.note';
        if (DOM.modeNote) DOM.modeNote.innerHTML = `<i class="fa-regular fa-circle-info"></i> ${t(noteKey)}`;
        if (DOM.virtualTip) DOM.virtualTip.innerHTML = isTestMode ? `🧪 ${t(noteKey)}` : `⚠️ ${t(noteKey)}`;
    }

    async function switchToMode(targetMode) {
        const isTestMode = targetMode === 'test';
        if (ThemeManager.isTestMode === isTestMode) return;
        
        const success = await ThemeManager.toggleMode();
        if (success) {
            updateCurrencyDisplay();
            updateModeUI();
            await refreshAllData();
            showToast(`已切换到${isTestMode ? '沙盒模式' : '实盘模式'}`, 'success');
        } else {
            showToast('切换失败，请稍后重试', 'error');
        }
    }

    function toggleTheme() {
        ThemeManager.toggleTheme();
        showToast(`主题已切换为${ThemeManager.isDarkMode ? '深色' : '浅色'}`, 'success');
    }

    function bindEvents() {
        if (DOM.themeToggle) DOM.themeToggle.addEventListener('click', toggleTheme);
        if (DOM.testModeBtn) DOM.testModeBtn.addEventListener('click', () => switchToMode('test'));
        if (DOM.liveModeBtn) DOM.liveModeBtn.addEventListener('click', () => switchToMode('live'));
        if (DOM.langToggle) DOM.langToggle.addEventListener('click', switchLanguage);
        if (DOM.contractAddressSpan) DOM.contractAddressSpan.addEventListener('click', () => copyToClipboard(DOM.contractAddressSpan.innerText));
        
        ThemeManager.addListener((state) => {
            updateCurrencyDisplay();
            updateModeUI();
            refreshAllData();
        });
        
        if (ThemeManager.addThemeListener) {
            ThemeManager.addThemeListener((state) => {
                updateAllTexts();
                if (DOM.themeToggle) {
                    DOM.themeToggle.className = state.isDarkMode ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
                }
            });
        }
    }

    async function init() {
        await ThemeManager.init();
        
        window.addEventListener('languagechange', (e) => {
            if (e.detail?.language && currentLanguage !== e.detail.language) {
                currentLanguage = e.detail.language;
                updateAllTexts();
                renderAuthorizations();
                if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
            }
        });
        
        window.addEventListener('themechange', (e) => {
            if (DOM.themeToggle) {
                DOM.themeToggle.className = e.detail.isDarkMode ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
            }
        });
        
        updatePlatformStats();
        await refreshAllData();
        updateAllTexts();
        bindEvents();
        console.log('FootRadaPro initialized');
    }
    
    document.addEventListener('DOMContentLoaded', init);
})();
EOF