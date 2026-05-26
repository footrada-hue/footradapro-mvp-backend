/**
 * FOOTRADAPRO - Authorizations Page Controller
 * @description Display active/settled authorized matches
 */

(function() {
    'use strict';

    // ==================== State Management ====================
    const AppState = {
        currentStatus: 'all', // 'all', 'pending', 'settled'
        pending: {
            page: 1,
            list: [],
            hasMore: false,
            total: 0
        },
        settled: {
            page: 1,
            list: [],
            hasMore: false,
            total: 0
        },
        all: {
            page: 1,
            list: [],
            hasMore: false,
            total: 0
        }
    };

    const pageSize = 20;

    // ==================== DOM Elements ====================
    const DOM = {
        loadingState: document.getElementById('loadingState'),
        emptyState: document.getElementById('emptyState'),
        loadMore: document.getElementById('loadMore'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
        
        pendingSection: document.getElementById('pendingSection'),
        settledSection: document.getElementById('settledSection'),
        pendingList: document.getElementById('pendingList'),
        settledList: document.getElementById('settledList'),
        allList: document.getElementById('allList'),
        
        pendingCount: document.getElementById('pendingCount'),
        winCount: document.getElementById('winCount'),
        lossCount: document.getElementById('lossCount'),
        
        filterTabs: document.querySelectorAll('.filter-tab'),
        
        testModeBadge: document.getElementById('testModeBadge')
    };

    // ==================== Initialize ====================
    document.addEventListener('DOMContentLoaded', async function() {
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ Authorizations page ThemeManager initialized, current mode:', ThemeManager.isTestMode ? 'Test' : 'Live');
            updateTestModeBadge(ThemeManager.isTestMode);
        }

        showLoading();
        
        try {
            await loadPending(true);
            await loadSettled(true);
            await loadAll(true);
            
            if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
            if (DOM.settledSection) DOM.settledSection.style.display = 'none';
            if (DOM.allList) DOM.allList.style.display = 'block';
            renderAll();
        } catch (err) {
            console.error('Initialization failed:', err);
        } finally {
            hideLoading();
        }

        bindEvents();
        
        if (window.ThemeManager) {
            ThemeManager.addListener(async (state) => {
                console.log('🎨 Authorizations page received theme change:', state);
                updateTestModeBadge(state.isTestMode);
                
                showLoading();
                
                try {
                    await loadPending(true);
                    await loadSettled(true);
                    await loadAll(true);
                    
                    if (AppState.currentStatus === 'pending') {
                        if (DOM.pendingSection) DOM.pendingSection.style.display = 'block';
                        if (DOM.settledSection) DOM.settledSection.style.display = 'none';
                        if (DOM.allList) DOM.allList.style.display = 'none';
                        renderPending();
                    } else if (AppState.currentStatus === 'settled') {
                        if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
                        if (DOM.settledSection) DOM.settledSection.style.display = 'block';
                        if (DOM.allList) DOM.allList.style.display = 'none';
                        renderSettled();
                    } else {
                        if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
                        if (DOM.settledSection) DOM.settledSection.style.display = 'none';
                        if (DOM.allList) DOM.allList.style.display = 'block';
                        renderAll();
                    }
                } catch (err) {
                    console.error('Failed to reload after mode change:', err);
                } finally {
                    hideLoading();
                }
            });
        }
    });

    function updateTestModeBadge(isTestMode) {
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
    }

    // ==================== Load Pending ====================
    async function loadPending(reset = false) {
        if (reset) {
            AppState.pending.page = 1;
            AppState.pending.list = [];
        }

        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const url = `/api/v1/user/authorize/list?status=pending&page=${AppState.pending.page}&limit=${pageSize}&mode=${mode}`;
            const res = await fetch(url, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                const newItems = data.data || [];
                
                if (reset) {
                    AppState.pending.list = newItems;
                } else {
                    AppState.pending.list = [...AppState.pending.list, ...newItems];
                }

                AppState.pending.hasMore = data.meta?.pages > AppState.pending.page;
                AppState.pending.total = data.meta?.total || 0;

                if (DOM.pendingCount) {
                    DOM.pendingCount.textContent = AppState.pending.total;
                }
            }
        } catch (err) {
            console.error('Failed to load pending:', err);
        }
    }

    // ==================== Load Settled ====================
    async function loadSettled(reset = false) {
        if (reset) {
            AppState.settled.page = 1;
            AppState.settled.list = [];
        }

        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const url = `/api/v1/user/authorize/list?status=settled&page=${AppState.settled.page}&limit=${pageSize}&mode=${mode}`;
            const res = await fetch(url, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                const newItems = data.data || [];
                
                if (reset) {
                    AppState.settled.list = newItems;
                } else {
                    AppState.settled.list = [...AppState.settled.list, ...newItems];
                }

                AppState.settled.hasMore = data.meta?.pages > AppState.settled.page;
                AppState.settled.total = data.meta?.total || 0;

                const winCount = AppState.settled.list.filter(item => item.profit > 0).length;
                const lossCount = AppState.settled.list.filter(item => item.profit < 0).length;
                
                if (DOM.winCount) DOM.winCount.textContent = winCount;
                if (DOM.lossCount) DOM.lossCount.textContent = lossCount;
            }
        } catch (err) {
            console.error('Failed to load settled:', err);
        }
    }

    // ==================== Load All ====================
    async function loadAll(reset = false) {
        if (reset) {
            AppState.all.page = 1;
            AppState.all.list = [];
        }

        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const url = `/api/v1/user/authorize/list?page=${AppState.all.page}&limit=${pageSize}&mode=${mode}`;
            const res = await fetch(url, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                const newItems = data.data || [];
                
                if (reset) {
                    AppState.all.list = newItems;
                } else {
                    AppState.all.list = [...AppState.all.list, ...newItems];
                }

                AppState.all.hasMore = data.meta?.pages > AppState.all.page;
                AppState.all.total = data.meta?.total || 0;
            }
        } catch (err) {
            console.error('Failed to load all:', err);
        }
    }

    // ==================== Render Pending ====================
    function renderPending() {
        if (AppState.pending.list.length === 0) {
            showEmpty('No active authorizations');
            return;
        }

        let html = '';
        AppState.pending.list.forEach(item => {
            html += renderAuthCard(item, 'pending');
        });

        if (DOM.pendingList) DOM.pendingList.innerHTML = html;
        hideLoading();
    }

    // ==================== Render Settled ====================
    function renderSettled() {
        if (AppState.settled.list.length === 0) {
            showEmpty('No settled authorizations');
            return;
        }

        let html = '';
        AppState.settled.list.forEach(item => {
            html += renderAuthCard(item, 'settled');
        });

        if (DOM.settledList) DOM.settledList.innerHTML = html;
        hideLoading();
    }

    // ==================== Render All ====================
    function renderAll() {
        if (AppState.all.list.length === 0) {
            showEmpty('No authorizations');
            return;
        }

        let html = '';
        AppState.all.list.forEach(item => {
            const isPending = item.status === 'pending' || item.status === 'upcoming';
            html += renderAuthCard(item, isPending ? 'pending' : 'settled');
        });

        if (DOM.allList) DOM.allList.innerHTML = html;
        hideLoading();
    }

    // ==================== Render Auth Card ====================
    function renderAuthCard(item, type) {
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        const isPending = type === 'pending';
        const isWin = item.profit > 0;
        
        const date = new Date(item.created_at).toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const profitClass = isPending ? 'pending' : (isWin ? 'positive' : 'negative');
        const profitText = isPending ? 'Pending' : (isWin ? `+${item.profit.toFixed(2)}` : `${item.profit.toFixed(2)}`);

        const resultClass = isPending ? 'pending' : (isWin ? 'won' : 'lost');
        const statusText = isPending ? 'Active' : (isWin ? 'Profit' : 'Loss');

        return `
            <div class="auth-card ${resultClass}" onclick="location.href='/transaction-detail.html?authId=${item.auth_id}'">
                <div class="auth-header">
                    <div class="auth-league">
                        <i class="fas fa-trophy"></i>
                        <span>${escapeHtml(item.league) || 'Unknown League'}</span>
                    </div>
                    <div class="auth-status ${statusText.toLowerCase()}">
                        <i class="fas fa-circle"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
                
                <div class="auth-teams">
                    <div class="team">
                        <div class="team-name">${escapeHtml(item.home_team) || 'Home'}</div>
                        <div class="team-abbr">${item.home_team ? item.home_team.substring(0, 3).toUpperCase() : 'HOM'}</div>
                    </div>
                    <div class="vs-badge">VS</div>
                    <div class="team">
                        <div class="team-name">${escapeHtml(item.away_team) || 'Away'}</div>
                        <div class="team-abbr">${item.away_team ? item.away_team.substring(0, 3).toUpperCase() : 'AWY'}</div>
                    </div>
                </div>
                
                <div class="auth-footer">
                    <div class="auth-amount">
                        <i class="fas fa-coins"></i>
                        ${item.amount.toFixed(2)} ${currency}
                    </div>
                    <div class="auth-profit ${profitClass}">
                        ${profitText} ${!isPending ? currency : ''}
                    </div>
                </div>
                
                <div class="auth-time">
                    <i class="far fa-clock"></i>
                    ${date}
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

    // ==================== Switch Tab ====================
    async function switchTab(status) {
        AppState.currentStatus = status;
        
        DOM.filterTabs.forEach(tab => {
            if (tab.dataset.status === status) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        showLoading();

        try {
            if (status === 'pending') {
                await loadPending(true);
                if (DOM.pendingSection) DOM.pendingSection.style.display = 'block';
                if (DOM.settledSection) DOM.settledSection.style.display = 'none';
                if (DOM.allList) DOM.allList.style.display = 'none';
                renderPending();
            } else if (status === 'settled') {
                await loadSettled(true);
                if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
                if (DOM.settledSection) DOM.settledSection.style.display = 'block';
                if (DOM.allList) DOM.allList.style.display = 'none';
                renderSettled();
            } else {
                await loadAll(true);
                if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
                if (DOM.settledSection) DOM.settledSection.style.display = 'none';
                if (DOM.allList) DOM.allList.style.display = 'block';
                renderAll();
            }

            updateLoadMoreButton();
        } catch (err) {
            console.error('Switch tab failed:', err);
            hideLoading();
        }
    }

    // ==================== Load More ====================
    async function loadMore() {
        if (AppState.currentStatus === 'pending') {
            AppState.pending.page++;
            await loadPending(false);
            renderPending();
        } else if (AppState.currentStatus === 'settled') {
            AppState.settled.page++;
            await loadSettled(false);
            renderSettled();
        } else {
            AppState.all.page++;
            await loadAll(false);
            renderAll();
        }
    }

    // ==================== Update Load More Button ====================
    function updateLoadMoreButton() {
        let hasMore = false;
        
        if (AppState.currentStatus === 'pending') {
            hasMore = AppState.pending.hasMore;
        } else if (AppState.currentStatus === 'settled') {
            hasMore = AppState.settled.hasMore;
        } else {
            hasMore = AppState.all.hasMore;
        }

        if (DOM.loadMore) {
            DOM.loadMore.style.display = hasMore ? 'flex' : 'none';
        }
    }

    // ==================== UI Control ====================
    function showLoading() {
        if (DOM.loadingState) DOM.loadingState.style.display = 'flex';
        if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
        if (DOM.settledSection) DOM.settledSection.style.display = 'none';
        if (DOM.allList) DOM.allList.style.display = 'none';
        if (DOM.emptyState) DOM.emptyState.style.display = 'none';
        if (DOM.loadMore) DOM.loadMore.style.display = 'none';
    }

    function hideLoading() {
        if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    }

    function showEmpty(message) {
        hideLoading();
        if (DOM.pendingSection) DOM.pendingSection.style.display = 'none';
        if (DOM.settledSection) DOM.settledSection.style.display = 'none';
        if (DOM.allList) DOM.allList.style.display = 'none';
        
        if (DOM.emptyState) {
            const p = DOM.emptyState.querySelector('p');
            if (p) p.textContent = message;
            DOM.emptyState.style.display = 'block';
        }
        
        if (DOM.loadMore) DOM.loadMore.style.display = 'none';
    }

    // ==================== Bind Events ====================
    function bindEvents() {
        DOM.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.status);
            });
        });

        if (DOM.loadMoreBtn) {
            DOM.loadMoreBtn.addEventListener('click', loadMore);
        }
    }

})();