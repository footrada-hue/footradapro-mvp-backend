/**
 * FOOTRADAPRO - 比赛管理控制器 (优化版)
 * 基于 DeepSeek 自动录入，使用 calculated_status 实时状态
 * 
 * @version 6.0.0
 * @since 2026-04-02
 * @i18n 支持多语言，所有文案已标记
 */

(function() {
    'use strict';

    // ==================== 狀態管理 ====================
    const state = {
        matches: [],
        filteredMatches: [],
        selectedMatches: new Set(),
        currentPage: 1,
        pageSize: 15,
        totalPages: 1,
        sortOrder: 'desc',
        timeFilter: 'all',
        searchKeyword: '',
        leagueFilter: 'all',
        statusFilter: 'all',
        activeFilter: 'all',
        sourceFilter: 'all'
    };

    // 來源徽章映射
    const sourceBadgeMap = {
        'manual': '<span class="source-badge manual">✍️ Manual</span>',
        'auto-deepseek': '<span class="source-badge auto-deepseek">🤖 DeepSeek</span>',
        'deepseek': '<span class="source-badge auto-deepseek">🤖 DeepSeek</span>'
    };

    const defaultSourceBadge = '<span class="source-badge manual">📋 Unknown</span>';

    function getStatusBadge(match) {
        const realStatus = match.calculated_status || match.status;
        const statusMap = {
            upcoming: '<span class="status-badge upcoming">🟢 Upcoming</span>',
            ongoing: '<span class="status-badge live">🟡 Live</span>',
            live: '<span class="status-badge live">🟡 Live</span>',
            finished: '<span class="status-badge finished">🔴 Finished</span>'
        };
        return statusMap[realStatus] || statusMap.upcoming;
    }

    // ==================== DOM 元素 ====================
    const DOM = {
        matchesList: document.getElementById('matchesList'),
        searchInput: document.getElementById('searchInput'),
        leagueFilter: document.getElementById('leagueFilter'),
        statusFilter: document.getElementById('statusFilter'),
        activeFilter: document.getElementById('activeFilter'),
        sourceFilter: document.getElementById('sourceFilter'),
        selectAllCheckbox: document.getElementById('selectAllCheckbox'),
        selectedCount: document.getElementById('selectedCount'),
        totalMatches: document.getElementById('totalMatches'),
        activeCount: document.getElementById('activeCount'),
        liveCount: document.getElementById('liveCount'),
        finishedCount: document.getElementById('finishedCount'),
        pagination: document.getElementById('pagination'),
        editModal: document.getElementById('editModal'),
        leagueBatchModal: document.getElementById('leagueBatchModal'),
        manualAddModal: document.getElementById('manualAddModal'),
        syncStatus: document.getElementById('syncStatus')
    };

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '-';
        if (window.FOOTRADA_TIMEZONE) {
            return window.FOOTRADA_TIMEZONE.formatMatchTime(dateStr, 'full');
        }
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch {
            return '-';
        }
    }

    function formatScore(home, away) {
        if (home !== null && away !== null) {
            return `<span class="score-badge">${home} : ${away}</span>`;
        }
        return '-';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function filterByTime(match) {
        if (state.timeFilter === 'all') return true;
        if (window.FOOTRADA_TIMEZONE) {
            switch (state.timeFilter) {
                case 'today': return window.FOOTRADA_TIMEZONE.isToday(match.match_time);
                case 'tomorrow': return window.FOOTRADA_TIMEZONE.isTomorrow(match.match_time);
                case 'week': return window.FOOTRADA_TIMEZONE.isThisWeek(match.match_time);
                default: return true;
            }
        }
        const matchDate = new Date(match.match_time);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        switch (state.timeFilter) {
            case 'today': return matchDate >= today && matchDate < tomorrow;
            case 'tomorrow': return matchDate >= tomorrow && matchDate < new Date(tomorrow.getTime() + 86400000);
            case 'week': return matchDate >= today && matchDate < nextWeek;
            default: return true;
        }
    }

    function sortMatches(matches) {
        return [...matches].sort((a, b) => {
            if (state.sortOrder === 'priority') {
                const priorityA = a.priority || 100;
                const priorityB = b.priority || 100;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return new Date(a.match_time) - new Date(b.match_time);
            }
            const timeA = new Date(a.match_time);
            const timeB = new Date(b.match_time);
            return state.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }

    async function applyFilters() {
        let filtered = [...state.matches];
        filtered = filtered.filter(match => filterByTime(match));
        if (state.searchKeyword) {
            const keyword = state.searchKeyword.toLowerCase();
            filtered = filtered.filter(match => 
                match.home_team.toLowerCase().includes(keyword) ||
                match.away_team.toLowerCase().includes(keyword) ||
                (match.league && match.league.toLowerCase().includes(keyword))
            );
        }
        if (state.leagueFilter !== 'all') {
            filtered = filtered.filter(match => match.league === state.leagueFilter);
        }
        if (state.statusFilter !== 'all') {
            filtered = filtered.filter(match => {
                const realStatus = match.calculated_status || match.status;
                return realStatus === state.statusFilter;
            });
        }
        if (state.activeFilter !== 'all') {
            const isActive = state.activeFilter === '1';
            filtered = filtered.filter(match => (match.is_active == 1) === isActive);
        }
        if (state.sourceFilter !== 'all') {
            filtered = filtered.filter(match => {
                const source = match.source || '';
                return source === state.sourceFilter || source.includes(state.sourceFilter);
            });
        }
        state.filteredMatches = sortMatches(filtered);
        await updateStats();
        state.selectedMatches.clear();
        state.currentPage = 1;
        renderTable();
        renderPagination();
        updateSelectedCount();
    }

    async function updateStats() {
        try {
            // i18n: 从后端API获取统计数据
            const response = await fetch('/api/v1/admin/matches/stats/overview', { credentials: 'include' });
            const result = await response.json();
            
            if (result.success && result.data) {
                // 计算 active 数量（is_active = 1）
                const active = state.matches.filter(m => m.is_active == 1).length;
                
                // i18n: 更新统计卡片
                if (DOM.totalMatches) DOM.totalMatches.textContent = result.data.total || 0;
                if (DOM.activeCount) DOM.activeCount.textContent = active;
                if (DOM.liveCount) DOM.liveCount.textContent = result.data.live || 0;
                if (DOM.finishedCount) DOM.finishedCount.textContent = result.data.finished || 0;
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    function renderTable() {
        const start = (state.currentPage - 1) * state.pageSize;
        const end = start + state.pageSize;
        const pageMatches = state.filteredMatches.slice(start, end);
        if (!DOM.matchesList) return;
        if (pageMatches.length === 0) {
            DOM.matchesList.innerHTML = '<td colspan="11" class="empty-state"><i class="fas fa-futbol"></i><div>No match data available</div>\\<';
            return;
        }
        DOM.matchesList.innerHTML = pageMatches.map(match => {
            const sourceKey = (match.source || '').split(',')[0];
            const sourceHtml = sourceBadgeMap[sourceKey] || defaultSourceBadge;
            const scoreHtml = formatScore(match.home_score, match.away_score);
            const statusHtml = getStatusBadge(match);
            return `
                <tr>
                    <td style="text-align: center;">
                        <input type="checkbox" class="match-checkbox" data-id="${match.id}" ${state.selectedMatches.has(match.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <strong>${escapeHtml(match.home_team)}</strong> 
                        <span style="color: var(--accent);">vs</span> 
                        <strong>${escapeHtml(match.away_team)}</strong>
                    </td>
                    <td><span class="league-tag">${escapeHtml(match.league || '-')}</span></td>
                    <td>${sourceHtml}</td>
                    <td><span class="rate-badge">${match.execution_rate || 30}%</span></td>
                    <td>${formatDateTime(match.match_time)}</td>
                    <td>${scoreHtml}</td>
                    <td>${statusHtml}</td>
                    <td class="display-toggle">
                        <label class="toggle-switch">
                            <input type="checkbox" class="active-toggle" data-id="${match.id}" ${match.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="toggle-label ${match.is_active ? 'enabled' : 'disabled'}">
                            ${match.is_active ? 'Show' : 'Hide'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn-sm edit-btn" data-id="${match.id}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn-sm danger delete-btn" data-id="${match.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                 </tr>
            `;
        }).join('');
        bindTableEvents();
    }

    function bindTableEvents() {
        document.querySelectorAll('.match-checkbox').forEach(cb => {
            cb.onchange = (e) => {
                const id = parseInt(e.target.dataset.id);
                if (e.target.checked) state.selectedMatches.add(id);
                else state.selectedMatches.delete(id);
                updateSelectedCount();
                updateSelectAllState();
            };
        });
        document.querySelectorAll('.active-toggle').forEach(toggle => {
            toggle.onchange = (e) => {
                const id = parseInt(e.target.dataset.id);
                toggleActive(id, e.target.checked);
            };
        });
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => openEditModal(parseInt(btn.dataset.id));
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => deleteMatch(parseInt(btn.dataset.id));
        });
    }

    function updateSelectedCount() {
        if (DOM.selectedCount) DOM.selectedCount.textContent = state.selectedMatches.size;
        updateSelectAllState();
    }

    function updateSelectAllState() {
        if (!DOM.selectAllCheckbox) return;
        const start = (state.currentPage - 1) * state.pageSize;
        const end = start + state.pageSize;
        const pageMatches = state.filteredMatches.slice(start, end);
        const allSelected = pageMatches.length > 0 && pageMatches.every(m => state.selectedMatches.has(m.id));
        DOM.selectAllCheckbox.checked = allSelected;
    }

    async function toggleActive(id, isActive) {
        try {
            const response = await fetch(`/api/v1/admin/matches/${id}/toggle-active`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive ? 1 : 0 })
            });
            const result = await response.json();
            if (result.success) {
                showToast(isActive ? 'Match is now visible on frontend' : 'Match is now hidden from frontend');
                loadMatches();
                loadStorageStats();
            } else {
                showToast('Operation failed', 'error');
                loadMatches();
            }
        } catch (err) {
            showToast('Network error', 'error');
            loadMatches();
        }
    }

    async function deleteMatch(id) {
        if (!confirm('Are you sure you want to delete this match?')) return;
        try {
            const response = await fetch(`/api/v1/admin/matches/${id}`, { method: 'DELETE', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                showToast('Match deleted');
                loadMatches();
                loadStorageStats();
            } else {
                showToast('Delete failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        }
    }

    async function openEditModal(id) {
        try {
            const response = await fetch(`/api/v1/admin/matches/${id}`, { credentials: 'include' });
            const result = await response.json();
            if (!result.success) throw new Error();
            const match = result.data;
            document.getElementById('editId').value = match.id;
            document.getElementById('editHomeTeam').textContent = match.home_team;
            document.getElementById('editAwayTeam').textContent = match.away_team;
            document.getElementById('editMatchTime').textContent = formatDateTime(match.match_time);
            const sourceEl = document.getElementById('editSource');
            if (sourceEl) sourceEl.innerHTML = `<i class="fas fa-database"></i> Source: ${match.source || 'Manual'}`;
            document.getElementById('editExecutionRate').value = match.execution_rate || 30;
            document.getElementById('editRateValue').textContent = (match.execution_rate || 30) + '%';
            document.getElementById('editMinAuth').value = match.min_authorization || 100;
            document.getElementById('editMatchLimit').value = match.match_limit || 500;
            DOM.editModal.classList.add('show');
        } catch (err) {
            showToast('Failed to load match info', 'error');
        }
    }

    async function batchToggleActive(enable) {
        const ids = Array.from(state.selectedMatches);
        if (ids.length === 0) { showToast('Please select matches first', 'warning'); return; }
        const action = enable ? 'show' : 'hide';
        if (!confirm(`Are you sure you want to ${action} ${ids.length} matches?`)) return;
        try {
            const response = await fetch('/api/v1/admin/matches/batch-toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, is_active: enable ? 1 : 0 })
            });
            const result = await response.json();
            if (result.success) {
                showToast(`${ids.length} matches ${action}n`);
                state.selectedMatches.clear();
                loadMatches();
                loadStorageStats();
            } else {
                showToast('Operation failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        }
    }

    async function batchByLeague(enable) {
        const league = document.getElementById('batchLeagueSelect').value;
        if (!league) { showToast('Please select a league', 'warning'); return; }
        const action = enable ? 'show' : 'hide';
        if (!confirm(`Are you sure you want to ${action} all ${league} matches?`)) return;
        try {
            const response = await fetch('/api/v1/admin/matches/batch-by-league', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league, is_active: enable ? 1 : 0 })
            });
            const result = await response.json();
            if (result.success) {
                showToast(`${result.updated} ${league} matches ${action}n`);
                loadMatches();
                loadStorageStats();
                DOM.leagueBatchModal.classList.remove('show');
            } else {
                showToast('Operation failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        }
    }

    async function autoFetchMatches() {
        if (!confirm('Fetch latest match data from DeepSeek AI?')) return;
        if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...';
        showToast('Fetching match data, please wait...', 'info');
        try {
            const response = await fetch('/api/v1/admin/matches/auto-fetch', { method: 'POST', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                const added = result.data?.newToPool || 0;
                showToast(`✅ Fetch complete: ${added} new matches added`);
                if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-check-circle"></i> Data synced';
                loadMatches();
                loadStorageStats();
            } else {
                showToast(`Fetch failed: ${result.error || 'Unknown error'}`, 'error');
                if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Fetch failed';
            }
        } catch (err) {
            showToast('Network error, please try again', 'error');
            if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Fetch failed';
        }
    }

    async function loadStorageStats() {
        try {
            const response = await fetch('/api/v1/admin/matches/stats/overview', { credentials: 'include' });
            const result = await response.json();
            if (result.success && result.data) {
                document.getElementById('statTotal').textContent = result.data.total || 0;
                document.getElementById('statUpcoming').textContent = result.data.upcoming || 0;
                document.getElementById('statLive').textContent = result.data.live || 0;
                document.getElementById('statFinished').textContent = result.data.finished || 0;
                document.getElementById('statSources').textContent = result.data.sources || 0;
                document.getElementById('statOldest').textContent = result.data.oldest_match ? new Date(result.data.oldest_match).toLocaleDateString() : '-';
                document.getElementById('statNewest').textContent = result.data.newest_match ? new Date(result.data.newest_match).toLocaleDateString() : '-';
            }
        } catch (err) { console.error('Failed to load storage stats:', err); }
    }

    async function manualCleanup() {
        if (!confirm('Clean up expired data? This operation cannot be undone.')) return;
        try {
            const response = await fetch('/api/v1/admin/matches/cleanup', { method: 'POST', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                showToast(result.message);
                loadStorageStats();
                loadMatches();
            } else {
                showToast('Cleanup failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        }
    }

    async function loadLeagues() {
        try {
            const response = await fetch('/api/v1/admin/matches/leagues', { credentials: 'include' });
            const result = await response.json();
            if (result.success && result.data) {
                const leagueSelect = DOM.leagueFilter;
                const batchLeagueSelect = document.getElementById('batchLeagueSelect');
                if (leagueSelect) {
                    leagueSelect.innerHTML = '<option value="all">All Leagues</option>' + result.data.map(l => `<option value="${escapeHtml(l.league)}">${escapeHtml(l.league)} (${l.match_count})</option>`).join('');
                }
                if (batchLeagueSelect) {
                    batchLeagueSelect.innerHTML = '<option value="">Select League</option>' + result.data.map(l => `<option value="${escapeHtml(l.league)}">${escapeHtml(l.league)} (${l.match_count})</option>`).join('');
                }
            }
        } catch (err) { console.error('Failed to load leagues:', err); }
    }

    async function loadMatches() {
        try {
            const params = new URLSearchParams({ limit: 200, sortBy: state.sortOrder === 'priority' ? 'priority' : 'time' });
            const response = await fetch(`/api/v1/admin/matches/list?${params}`, { credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                state.matches = result.data;
                applyFilters();
            }
        } catch (err) { showToast('Load failed', 'error'); }
    }

    function renderPagination() {
        if (!DOM.pagination) return;
        state.totalPages = Math.ceil(state.filteredMatches.length / state.pageSize);
        if (state.totalPages <= 1) { DOM.pagination.innerHTML = ''; return; }
        let html = '<button class="page-btn" data-page="' + (state.currentPage - 1) + '" ' + (state.currentPage === 1 ? 'disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
        for (let i = 1; i <= state.totalPages; i++) {
            if (i === 1 || i === state.totalPages || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
                html += '<button class="page-btn ' + (i === state.currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
            } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
                html += '<button class="page-btn" disabled>...</button>';
            }
        }
        html += '<button class="page-btn" data-page="' + (state.currentPage + 1) + '" ' + (state.currentPage === state.totalPages ? 'disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
        DOM.pagination.innerHTML = html;
        document.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.onclick = () => {
                const page = parseInt(btn.dataset.page);
                if (!isNaN(page) && page >= 1 && page <= state.totalPages) {
                    state.currentPage = page;
                    renderTable();
                    renderPagination();
                    updateSelectAllState();
                }
            };
        });
    }

    function initEventListeners() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.timeFilter = btn.dataset.days === 'all' ? 'all' : (btn.dataset.days === '0' ? 'today' : (btn.dataset.days === '1' ? 'tomorrow' : 'week'));
                state.currentPage = 1;
                applyFilters();
            };
        });
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.sortOrder = btn.dataset.sort;
                state.currentPage = 1;
                applyFilters();
            };
        });
        if (DOM.searchInput) DOM.searchInput.oninput = (e) => { state.searchKeyword = e.target.value; state.currentPage = 1; applyFilters(); };
        if (DOM.leagueFilter) DOM.leagueFilter.onchange = (e) => { state.leagueFilter = e.target.value; state.currentPage = 1; applyFilters(); };
        if (DOM.statusFilter) DOM.statusFilter.onchange = (e) => { state.statusFilter = e.target.value; state.currentPage = 1; applyFilters(); };
        if (DOM.activeFilter) DOM.activeFilter.onchange = (e) => { state.activeFilter = e.target.value; state.currentPage = 1; applyFilters(); };
        if (DOM.sourceFilter) DOM.sourceFilter.onchange = (e) => { state.sourceFilter = e.target.value; state.currentPage = 1; applyFilters(); };
        if (DOM.selectAllCheckbox) {
            DOM.selectAllCheckbox.onchange = (e) => {
                const start = (state.currentPage - 1) * state.pageSize;
                const end = start + state.pageSize;
                const pageMatches = state.filteredMatches.slice(start, end);
                if (e.target.checked) pageMatches.forEach(m => state.selectedMatches.add(m.id));
                else pageMatches.forEach(m => state.selectedMatches.delete(m.id));
                renderTable();
                updateSelectedCount();
            };
        }
        document.getElementById('selectAllBtn')?.addEventListener('click', () => {
            const start = (state.currentPage - 1) * state.pageSize;
            const end = start + state.pageSize;
            const pageMatches = state.filteredMatches.slice(start, end);
            const allSelected = pageMatches.every(m => state.selectedMatches.has(m.id));
            if (allSelected) pageMatches.forEach(m => state.selectedMatches.delete(m.id));
            else pageMatches.forEach(m => state.selectedMatches.add(m.id));
            renderTable();
            updateSelectedCount();
        });
        document.getElementById('batchEnableBtn')?.addEventListener('click', () => batchToggleActive(true));
        document.getElementById('batchDisableBtn')?.addEventListener('click', () => batchToggleActive(false));
        document.getElementById('batchByLeagueBtn')?.addEventListener('click', () => DOM.leagueBatchModal.classList.add('show'));
        document.getElementById('closeLeagueModalBtn')?.addEventListener('click', () => DOM.leagueBatchModal.classList.remove('show'));
        document.getElementById('leagueBatchEnableBtn')?.addEventListener('click', () => batchByLeague(true));
        document.getElementById('leagueBatchDisableBtn')?.addEventListener('click', () => batchByLeague(false));
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) { syncBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Auto Fetch'; syncBtn.onclick = autoFetchMatches; }
        document.getElementById('refreshBtn')?.addEventListener('click', () => { loadMatches(); loadStorageStats(); showToast('Refreshed', 'success'); });
        document.getElementById('manualCleanupBtn')?.addEventListener('click', manualCleanup);
        document.getElementById('closeModalBtn')?.addEventListener('click', () => DOM.editModal.classList.remove('show'));
        document.getElementById('cancelEditBtn')?.addEventListener('click', () => DOM.editModal.classList.remove('show'));
        DOM.editModal?.addEventListener('click', (e) => { if (e.target === DOM.editModal) DOM.editModal.classList.remove('show'); });
        DOM.leagueBatchModal?.addEventListener('click', (e) => { if (e.target === DOM.leagueBatchModal) DOM.leagueBatchModal.classList.remove('show'); });
        document.getElementById('editMatchForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const data = {
                execution_rate: parseInt(document.getElementById('editExecutionRate').value) || 30,
                min_authorization: parseFloat(document.getElementById('editMinAuth').value) || 100,
                match_limit: parseFloat(document.getElementById('editMatchLimit').value) || 500
            };
            try {
                const response = await fetch(`/api/v1/admin/matches/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                const result = await response.json();
                if (result.success) { showToast('Strategy updated successfully'); DOM.editModal.classList.remove('show'); loadMatches(); loadStorageStats(); }
                else { showToast('Update failed', 'error'); }
            } catch (err) { showToast('Network error', 'error'); }
        });
        document.querySelectorAll('.rate-presets button').forEach(btn => {
            btn.onclick = () => {
                const rate = parseInt(btn.dataset.rate);
                document.getElementById('editExecutionRate').value = rate;
                document.getElementById('editRateValue').textContent = rate + '%';
            };
        });
        const rateSlider = document.getElementById('editExecutionRate');
        if (rateSlider) rateSlider.oninput = () => { document.getElementById('editRateValue').textContent = rateSlider.value + '%'; };
        document.getElementById('logoutBtn')?.addEventListener('click', () => { window.location.href = '/admin/index.html'; });
        const storedAdmin = localStorage.getItem('admin_name');
        if (storedAdmin) document.getElementById('adminName').textContent = storedAdmin;
        initManualAdd();
    }

    function initManualAdd() {
        const manualAddBtn = document.getElementById('manualAddBtn');
        const closeManualAddBtn = document.getElementById('closeManualAddBtn');
        const cancelManualAddBtn = document.getElementById('cancelManualAddBtn');
        const manualAddForm = document.getElementById('manualAddForm');
        if (manualAddBtn) {
            manualAddBtn.onclick = () => {
                const today = new Date();
                document.getElementById('manualMatchDate').value = today.toISOString().split('T')[0];
                document.getElementById('manualMatchTime').value = '20:00';
                DOM.manualAddModal?.classList.add('show');
            };
        }
        if (closeManualAddBtn) closeManualAddBtn.onclick = () => DOM.manualAddModal?.classList.remove('show');
        if (cancelManualAddBtn) cancelManualAddBtn.onclick = () => DOM.manualAddModal?.classList.remove('show');
        if (DOM.manualAddModal) DOM.manualAddModal.onclick = (e) => { if (e.target === DOM.manualAddModal) DOM.manualAddModal.classList.remove('show'); };
        if (manualAddForm) {
            manualAddForm.onsubmit = async (e) => {
                e.preventDefault();
                const homeTeam = document.getElementById('manualHomeTeam').value.trim();
                const awayTeam = document.getElementById('manualAwayTeam').value.trim();
                const league = document.getElementById('manualLeague').value.trim();
                const matchDate = document.getElementById('manualMatchDate').value;
                const matchTime = document.getElementById('manualMatchTime').value;
                if (!homeTeam || !awayTeam || !league || !matchDate) { showToast('Please fill in all required fields', 'error'); return; }
                const localDateTimeStr = `${matchDate}T${matchTime}:00`;
                const localDate = new Date(localDateTimeStr);
                if (isNaN(localDate.getTime())) { showToast('Invalid date/time format', 'error'); return; }
                const matchDateTimeUTC = localDate.toISOString();
                const matchDateObj = new Date(matchDateTimeUTC);
                const cutoffDateTimeUTC = new Date(matchDateObj.getTime() - 5 * 60 * 1000).toISOString();
                if (matchDateObj <= new Date()) { showToast('Match time must be in the future', 'error'); return; }
                const formData = new FormData();
                formData.append('home_team', homeTeam);
                formData.append('away_team', awayTeam);
                formData.append('league', league);
                formData.append('execution_rate', document.getElementById('manualExecRate').value);
                formData.append('min_authorization', document.getElementById('manualMinAuth').value);
                formData.append('match_limit', document.getElementById('manualMatchLimit').value);
                formData.append('is_active', document.getElementById('manualIsActive').value);
                formData.append('source', 'manual');
                formData.append('match_time', matchDateTimeUTC);
                formData.append('cutoff_time', cutoffDateTimeUTC);
                formData.append('match_id', `manual_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`);
                const homeLogoFile = document.getElementById('manualHomeLogo').files[0];
                const awayLogoFile = document.getElementById('manualAwayLogo').files[0];
                if (homeLogoFile) formData.append('home_logo', homeLogoFile);
                if (awayLogoFile) formData.append('away_logo', awayLogoFile);
                try {
                    const response = await fetch('/api/v1/admin/matches/add', { method: 'POST', body: formData });
                    const result = await response.json();
                    if (result.success) {
                        showToast(`✅ Match added: ${homeTeam} vs ${awayTeam}`);
                        DOM.manualAddModal?.classList.remove('show');
                        manualAddForm.reset();
                        document.getElementById('homeLogoPreview').style.display = 'none';
                        document.getElementById('awayLogoPreview').style.display = 'none';
                        loadMatches();
                        loadStorageStats();
                    } else { showToast(`Add failed: ${result.error || 'Unknown error'}`, 'error'); }
                } catch (err) { showToast('Network error, please try again', 'error'); }
            };
        }
    }

    // ==================== 队徽管理功能 ====================
    let currentUploadTeam = null;

    async function loadAllTeamLogos() {
        const tbody = document.getElementById('missingLogosList');
        if (!tbody) return;
        const league = document.getElementById('teamLogoLeagueFilter')?.value || 'all';
        const search = document.getElementById('teamLogoSearchInput')?.value || '';
        
        tbody.innerHTML = '<td colspan="5" class="empty-state">Loading...<\/td>';
        
        try {
            const params = new URLSearchParams();
            if (league !== 'all') params.append('league', league);
            if (search) params.append('search', search);
            
            const res = await fetch(`/api/v1/admin/matches/all-team-logos?${params}`, { credentials: 'include' });
            const result = await res.json();
            
            if (result.success && result.data) {
                if (result.data.length === 0) {
                    tbody.innerHTML = '<td colspan="5" class="empty-state">No team data<\/td>';
                    return;
                }
                
                tbody.innerHTML = result.data.map(team => `
                    <tr>
                        <td><strong>${escapeHtml(team.team_name)}</strong></td>
                        <td><span class="league-tag">${escapeHtml(team.league || '-')}</span></td>
                        <td>${team.involved_matches} matches</td>
                        <td class="logo-preview-cell">
                            <img class="table-logo-preview" src="${team.logo_url || '/uploads/teams/default.png'}" 
                                 onerror="this.src='/uploads/teams/default.png'"
                                 style="width: 32px; height: 32px; border-radius: 50%; object-fit: contain;">
                            <span class="logo-status-badge ${team.logo_status === 'ok' ? 'ok' : 'missing'}">
                                ${team.logo_status === 'ok' ? 'Has logo' : 'No logo'}
                            </span>
                        <\/td>
                        <td>
                            <button class="action-btn-sm upload-logo-btn" 
                                    data-team="${escapeHtml(team.team_name)}" 
                                    data-league="${escapeHtml(team.league || '')}" 
                                    data-matches="${team.involved_matches}"
                                    data-current-logo="${team.logo_url || ''}">
                                <i class="fas fa-upload"></i> Upload logo
                            </button>
                        <\/td>
                    </tr>
                `).join('');
                
                document.querySelectorAll('.upload-logo-btn').forEach(btn => {
                    btn.onclick = () => {
                        openUploadModal(
                            btn.dataset.team, 
                            btn.dataset.league, 
                            btn.dataset.matches,
                            btn.dataset.currentLogo
                        );
                    };
                });
            } else {
                tbody.innerHTML = '<td colspan="5" class="empty-state">Load failed<\/td>';
            }
        } catch (err) {
            tbody.innerHTML = '<td colspan="5" class="empty-state">Network error<\/td>';
            console.error(err);
        }
    }

    function openUploadModal(teamName, league, matches, currentLogo) {
        window.currentUploadTeam = teamName;
        document.getElementById('uploadTeamName').textContent = teamName;
        document.getElementById('uploadTeamInfo').textContent = `${league} • ${matches} matches affected`;
        
        const previewDiv = document.getElementById('uploadTeamPreview');
        if (previewDiv) {
            if (currentLogo && currentLogo !== '/uploads/teams/default.png') {
                previewDiv.innerHTML = `<img src="${currentLogo}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: contain;">`;
            } else {
                previewDiv.innerHTML = `<i class="fas fa-futbol" style="font-size: 48px; color: #f97316;"></i>`;
            }
        }
        
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('teamLogoFile').value = '';
        document.getElementById('uploadLogoModal').classList.add('show');
    }

    async function uploadTeamLogo() {
        const fileInput = document.getElementById('teamLogoFile');
        const file = fileInput.files[0];
        const teamName = window.currentUploadTeam;
        
        if (!file) {
            showToast('Please select an image file', 'error');
            return;
        }
        if (!teamName) {
            showToast('Invalid team', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('team_name', teamName);
        formData.append('logo', file);
        
        try {
            showToast('Uploading...', 'info');
            const res = await fetch('/api/v1/admin/matches/upload-logo', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const result = await res.json();
            
            if (result.success) {
                showToast(`✅ ${teamName} logo updated, affects ${result.updated_matches} matches`);
                document.getElementById('uploadLogoModal').classList.remove('show');
                loadAllTeamLogos();
                loadMatches();
            } else {
                showToast(result.error || 'Upload failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        }
    }

    function initTeamLogoManager() {
        setTimeout(() => {
            const manageBtn = document.getElementById('manageLogosBtn');
            if (manageBtn) {
                manageBtn.onclick = async () => {
                    try {
                        document.getElementById('teamLogoModal').classList.add('show');
                        await loadLeaguesForTeamLogo();
                        await loadAllTeamLogos();
                    } catch (err) {
                        console.error('Team logo management load failed:', err);
                    }
                };
            }
            
            const closeBtn = document.getElementById('closeTeamLogoModalBtn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    document.getElementById('teamLogoModal').classList.remove('show');
                };
            }
            
            const closeUpload = document.getElementById('closeUploadModalBtn');
            if (closeUpload) {
                closeUpload.onclick = () => {
                    document.getElementById('uploadLogoModal').classList.remove('show');
                };
            }
            
            const cancelUpload = document.getElementById('cancelUploadBtn');
            if (cancelUpload) {
                cancelUpload.onclick = () => {
                    document.getElementById('uploadLogoModal').classList.remove('show');
                };
            }
            
            const refreshBtn = document.getElementById('refreshTeamLogosBtn');
            if (refreshBtn) refreshBtn.onclick = () => { loadAllTeamLogos(); };
            
            const searchInput = document.getElementById('teamLogoSearchInput');
            if (searchInput) {
                searchInput.oninput = () => { loadAllTeamLogos(); };
            }
            
            const leagueFilter = document.getElementById('teamLogoLeagueFilter');
            if (leagueFilter) leagueFilter.onchange = () => { loadAllTeamLogos(); };
            
            const fileInput = document.getElementById('teamLogoFile');
            if (fileInput) {
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            document.getElementById('uploadPreviewImg').src = ev.target.result;
                            document.getElementById('uploadPreview').style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    }
                };
            }
            
            const confirmBtn = document.getElementById('confirmUploadBtn');
            if (confirmBtn) {
                confirmBtn.onclick = () => uploadTeamLogo();
            }
            
            console.log('✅ Team logo management initialized');
        }, 200);
    }

    async function loadLeaguesForTeamLogo() {
        try {
            const res = await fetch('/api/v1/admin/matches/leagues', { credentials: 'include' });
            const result = await res.json();
            if (result.success && result.data) {
                const select = document.getElementById('teamLogoLeagueFilter');
                if (select) {
                    select.innerHTML = '<option value="all">All Leagues</option>' + result.data.map(l => `<option value="${escapeHtml(l.league)}">${escapeHtml(l.league)} (${l.match_count})</option>`).join('');
                }
            }
        } catch (err) { console.error(err); }
    }

    // ==================== 初始化 ====================
    async function init() {
        if (window.FOOTRADA_TIMEZONE) {
            console.log('✅ Timezone tool loaded:', window.FOOTRADA_TIMEZONE.getUserTimezoneInfo());
        } else {
            console.warn('⚠️ Timezone tool not loaded, using UTC mode');
        }
        
        initEventListeners();
        initTeamLogoManager();
        
        await loadLeagues();
        await loadMatches();
        await loadStorageStats();
        
        setInterval(() => {
            loadMatches();
            loadStorageStats();
        }, 300000);
    }
    
    init();
})();