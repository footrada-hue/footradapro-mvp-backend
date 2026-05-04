/**
 * FOOTRADAPRO - Transaction List Controller (统一版本)
 * @feature Support sandbox users, display test mode badge, support report viewing
 * @production Production version - 2026.03.22
 */

(function() {
    'use strict';

    if (!window.FOOTRADAPRO) {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    // Ensure time utility is loaded
    const TIME = window.FOOTRADAPRO_TIME;

    // ==================== State Management ====================
    const AppState = {
        transactions: [],
        currentPage: 1,
        currentStatus: 'all',
        hasMore: false,
        stats: {
            total: 0,
            win: 0,
            loss: 0
        }
    };

    const pageSize = 10;

    // ==================== DOM Element Getters ====================
    function getDOMElements() {
        return {
            loadingState: document.getElementById('loadingState'),
            transactionList: document.getElementById('transactionList'),
            emptyState: document.getElementById('emptyState'),
            loadMore: document.getElementById('loadMore'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            
            totalCount: document.getElementById('totalCount'),
            winCount: document.getElementById('winCount'),
            lossCount: document.getElementById('lossCount'),
            
            tabBtns: document.querySelectorAll('.filter-tab, .tab-btn'),
            chatButton: document.getElementById('chatButton'),
            
            testModeBadge: document.getElementById('testModeBadge'),
            currencySymbols: document.querySelectorAll('.currency'),
            modeSwitcher: document.getElementById('modeSwitcher')
        };
    }

    let DOM = getDOMElements();

    // ==================== Format Helpers ====================
    function formatAmount(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        
        if (TIME && TIME.formatShortDate) {
            return TIME.formatShortDate(dateString);
        } else {
            try {
                const date = new Date(dateString);
                return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return '-';
            }
        }
    }

    /**
     * Check mode lock status, control switcher visibility
     */
    async function checkModeLockStatus() {
        try {
            const res = await fetch('/api/v1/user/mode/status', {
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.success && data.data) {
                const canSwitch = data.data.can_switch;
                const modeSwitcher = document.getElementById('modeSwitcher');
                
                if (modeSwitcher) {
                    modeSwitcher.style.display = canSwitch ? 'flex' : 'none';
                    console.log('Transaction page mode switcher visibility:', canSwitch ? 'visible' : 'hidden');
                }
            }
        } catch (err) {
            console.error('Failed to check mode lock status:', err);
            const modeSwitcher = document.getElementById('modeSwitcher');
            if (modeSwitcher) modeSwitcher.style.display = 'none';
        }
    }

    // ==================== Initialize ====================
    document.addEventListener('DOMContentLoaded', async function() {
        console.log('Transaction list controller initialized');
        
        DOM = getDOMElements();
        
        if (!DOM.transactionList) {
            console.error('❌ transactionList element not found, please check HTML');
            return;
        }
        
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ ThemeManager initialized, current mode:', ThemeManager.isTestMode ? 'Test' : 'Live');
            
            updateModeUI(ThemeManager.isTestMode);
        }
        
        await checkModeLockStatus();
        
        loadTransactions();
        loadStats();
        bindEvents();
        initChatWidget();
        
        if (window.ThemeManager) {
            ThemeManager.addListener((state) => {
                console.log('🎨 Transaction list received theme change:', state);
                updateModeUI(state.isTestMode);
                loadTransactions(true);
                loadStats();
            });
        }
    });

    function updateModeUI(isTestMode) {
        document.body.classList.remove('test-mode', 'live-mode');
        document.body.classList.add(isTestMode ? 'test-mode' : 'live-mode');
        
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
        
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        if (DOM.currencySymbols) {
            DOM.currencySymbols.forEach(el => {
                el.textContent = currency;
            });
        }
    }

    // ==================== Load Transactions ====================
    async function loadTransactions(reset = true) {
        if (reset) {
            AppState.currentPage = 1;
            AppState.transactions = [];
            showLoading();
        }

        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const url = `/api/v1/user/transactions?status=${AppState.currentStatus}&page=${AppState.currentPage}&limit=${pageSize}&include_report=true&mode=${mode}`;
            console.log('Loading transactions from:', url);
            
            const response = await fetch(url, { 
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();

            if (result.success) {
                const newTransactions = result.data || [];
                
                if (reset) {
                    AppState.transactions = newTransactions;
                } else {
                    AppState.transactions = [...AppState.transactions, ...newTransactions];
                }

                AppState.hasMore = result.pagination?.pages > AppState.currentPage;

                renderTransactions();
            } else {
                showEmpty();
            }
        } catch (err) {
            console.error('Failed to load transactions:', err);
            showEmpty();
        }
    }

    // ==================== Load Stats ====================
    async function loadStats() {
        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const response = await fetch(`/api/v1/user/transactions/stats?mode=${mode}`, { 
                credentials: 'include' 
            });
            const result = await response.json();

            if (result.success && result.data) {
                AppState.stats = result.data;
                if (DOM.totalCount) DOM.totalCount.textContent = AppState.stats.total || 0;
                if (DOM.winCount) DOM.winCount.textContent = AppState.stats.win || 0;
                if (DOM.lossCount) DOM.lossCount.textContent = AppState.stats.loss || 0;
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    // ==================== Render Transactions ====================
    function renderTransactions() {
        if (!DOM.transactionList) {
            console.error('❌ transactionList not found, cannot render');
            return;
        }

        if (AppState.transactions.length === 0) {
            showEmpty();
            return;
        }

        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        const currency = isTestMode ? 'tUSDT' : 'USDT';

        const pending = AppState.transactions.filter(t => t.status === 'pending' || t.status === 'upcoming');
        const settled = AppState.transactions.filter(t => t.status === 'settled' || t.status === 'completed' || t.status === 'won' || t.status === 'lost');

        let html = '';

        if (pending.length > 0) {
            html += '<div class="section-title"><i class="fas fa-hourglass-half" style="margin-right: 8px; color: var(--warning-500);"></i>Active</div>';
            pending.forEach(t => html += renderTransactionCard(t, currency));
        }

        if (settled.length > 0) {
            html += '<div class="section-title"><i class="fas fa-check-circle" style="margin-right: 8px; color: var(--success-500);"></i>Settled</div>';
            settled.forEach(t => html += renderTransactionCard(t, currency));
        }

        DOM.transactionList.innerHTML = html;
        DOM.transactionList.style.display = 'block';
        
        if (DOM.loadingState) DOM.loadingState.style.display = 'none';
        if (DOM.emptyState) DOM.emptyState.style.display = 'none';
        if (DOM.loadMore) DOM.loadMore.style.display = AppState.hasMore ? 'block' : 'none';
    }

    // ==================== Check Report Exists ====================
    async function checkReportExists(matchId) {
        if (!matchId) return false;
        
        try {
            const response = await fetch(`/api/v1/user/report/${matchId}`, {
                method: 'HEAD',
                credentials: 'include'
            });
            return response.status === 200;
        } catch (err) {
            console.error('Failed to check report:', err);
            return false;
        }
    }

    // ==================== Render Single Transaction Card ====================
    function renderTransactionCard(t, currency) {
        const timeStr = formatDate(t.match_time || t.created_at);
        const isTestMode = t.is_test_mode || false;
        
        const homeTeam = t.home_team || t.homeTeam || 'Unknown Home';
        const awayTeam = t.away_team || t.awayTeam || 'Unknown Away';
        const league = t.league || 'Unknown League';
        const amount = Number(t.amount) || 0;
        const profit = Number(t.profit) || 0;
        
        let statusText = 'Pending';
        if (t.status === 'won' || t.status === 'settled' || t.status === 'completed') {
            statusText = 'Settled';
        } else if (t.status === 'lost') {
            statusText = 'Settled';
        } else if (t.status === 'pending' || t.status === 'upcoming') {
            statusText = 'Pending';
        }
        
        const hasReport = t.has_report === true || t.report_exists === true;

        let profitHtml = '';
        let profitClass = '';
        
        if (t.status === 'pending' || t.status === 'upcoming') {
            profitHtml = '<span class="profit-badge pending">Pending</span>';
        } else {
            profitClass = profit > 0 ? 'positive' : (profit < 0 ? 'negative' : '');
            const profitSign = profit > 0 ? '+' : '';
            profitHtml = `<span class="profit-badge ${profitClass}">${profitSign}${formatAmount(profit)} ${currency}</span>`;
        }

        const testBadge = isTestMode ? '<span class="test-badge"><i class="fas fa-flask"></i> Test</span>' : '';

        const reportBtn = (t.status !== 'pending' && t.status !== 'upcoming' && hasReport) 
            ? `<button class="report-btn" onclick="window.viewReport('${t.match_id || t.matchId}', '${t.auth_id}', event)">
                 <i class="fas fa-file-alt"></i> View Report
               </button>`
            : '';

        return `
        <div class="transaction-card" data-auth-id="${t.auth_id}" data-match-id="${t.match_id || t.matchId}">
            <div class="card-header">
                <div class="card-header-left">
                    <div class="match-icon">
                        <i class="fas fa-futbol"></i>
                    </div>
                    <div class="match-teams">${escapeHtml(homeTeam)} vs ${escapeHtml(awayTeam)}</div>
                </div>
                <div class="card-header-right">
                    ${testBadge}
                    <div class="status-badge ${t.status}">${statusText}</div>
                </div>
            </div>
            <div class="card-body" onclick="window.viewDetail('${t.auth_id}')">
                <div class="match-league">
                    <i class="fas fa-trophy"></i> ${escapeHtml(league)}
                </div>
                <div class="amount-info">
                    <div class="auth-amount">${formatAmount(amount)} <small>${currency}</small></div>
                    ${profitHtml}
                </div>
            </div>
            <div class="card-footer">
                <div class="match-time">
                    <i class="fas fa-clock"></i> ${timeStr}
                </div>
                <div class="footer-right">
                    ${reportBtn}
                    <button class="detail-btn" onclick="window.viewDetail('${t.auth_id}')">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    // Simple escape function to prevent XSS
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==================== Global Functions ====================
    window.viewDetail = function(authId) {
        if (!authId) return;
        window.location.href = `/transaction-detail.html?authId=${authId}`;
    };

    window.viewReport = function(matchId, authId, event) {
        if (event) {
            event.stopPropagation();
        }
        
        let url = `/report-detail.html?match_id=${matchId}`;
        if (authId) {
            url += `&auth_id=${authId}`;
        }
        window.location.href = url;
    };

    // ==================== UI State Control ====================
    function showLoading() {
        if (DOM.loadingState) DOM.loadingState.style.display = 'flex';
        if (DOM.transactionList) DOM.transactionList.style.display = 'none';
        if (DOM.emptyState) DOM.emptyState.style.display = 'none';
        if (DOM.loadMore) DOM.loadMore.style.display = 'none';
    }

    function showEmpty() {
        if (DOM.loadingState) DOM.loadingState.style.display = 'none';
        if (DOM.transactionList) DOM.transactionList.style.display = 'none';
        if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
        if (DOM.loadMore) DOM.loadMore.style.display = 'none';
    }

    // ==================== Load More ====================
    async function loadMore() {
        AppState.currentPage++;
        await loadTransactions(false);
    }

    // ==================== Switch Tab ====================
    function switchTab(status) {
        AppState.currentStatus = status;
        AppState.currentPage = 1;
        
        if (DOM.tabBtns && DOM.tabBtns.length) {
            DOM.tabBtns.forEach(btn => {
                if (btn.dataset.status === status) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        showLoading();
        loadTransactions(true);
    }

    // ==================== Chat Widget ====================
    function initChatWidget() {
        if (DOM.chatButton) {
            DOM.chatButton.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/support.html';
            });
        }
    }

    // ==================== Event Binding ====================
    function bindEvents() {
        if (DOM.tabBtns && DOM.tabBtns.length) {
            DOM.tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    switchTab(btn.dataset.status || 'all');
                });
            });
        }

        if (DOM.loadMoreBtn) {
            DOM.loadMoreBtn.addEventListener('click', loadMore);
        }
    }
})();