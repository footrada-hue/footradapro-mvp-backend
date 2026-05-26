/**
 * FOOTRADAPRO - 比赛管理控制器 (优化版)
 * 基于 DeepSeek 自动录入，使用 calculated_status 实时状态
 * 
 * @version 6.2.0
 * @since 2026-04-12
 * @note 隊徽管理功能已移至 HTML 獨立實現，此控制器不再處理
 * @note 表格列宽已固定，表头与数据行完美对齐
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
        'manual': '<span class="source-badge manual"><i class="fas fa-pencil-alt"></i> 手动</span>',
        'auto-deepseek': '<span class="source-badge auto"><i class="fas fa-robot"></i> DeepSeek</span>',
        'deepseek': '<span class="source-badge auto"><i class="fas fa-robot"></i> DeepSeek</span>'
    };

    const defaultSourceBadge = '<span class="source-badge manual"><i class="fas fa-question"></i> 未知</span>';

    function getStatusBadge(match) {
        const realStatus = match.calculated_status || match.status;
        const statusMap = {
            upcoming: '<span class="status-badge upcoming"><i class="fas fa-clock"></i> 未开始</span>',
            ongoing: '<span class="status-badge live"><i class="fas fa-play-circle"></i> 进行中</span>',
            live: '<span class="status-badge live"><i class="fas fa-play-circle"></i> 进行中</span>',
            finished: '<span class="status-badge finished"><i class="fas fa-check-circle"></i> 已结束</span>'
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
            animation: slideIn 0.3s ease;
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
        return '<span class="score-badge no-score">- : -</span>';
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
            const response = await fetch('/api/v1/admin/matches/stats/overview', { credentials: 'include' });
            const result = await response.json();
            
            if (result.success && result.data) {
                const active = state.matches.filter(m => m.is_active == 1).length;
                
                if (DOM.totalMatches) DOM.totalMatches.textContent = result.data.total || 0;
                if (DOM.activeCount) DOM.activeCount.textContent = active;
                if (DOM.liveCount) DOM.liveCount.textContent = result.data.live || 0;
                if (DOM.finishedCount) DOM.finishedCount.textContent = result.data.finished || 0;
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    // ==================== 表格渲染 - 列宽固定对齐 ====================
    function renderTable() {
        const start = (state.currentPage - 1) * state.pageSize;
        const end = start + state.pageSize;
        const pageMatches = state.filteredMatches.slice(start, end);
        
        if (!DOM.matchesList) return;
        
        if (pageMatches.length === 0) {
            DOM.matchesList.innerHTML = `
                <tr>
                    <td colspan="11" class="empty-state">
                        <i class="fas fa-futbol"></i>
                        <div>暂无比赛数据</div>
                    </td>
                </tr>
            `;
            return;
        }
        
        DOM.matchesList.innerHTML = pageMatches.map(match => {
            const sourceKey = (match.source || '').split(',')[0];
            const sourceHtml = sourceBadgeMap[sourceKey] || defaultSourceBadge;
            const scoreHtml = formatScore(match.home_score, match.away_score);
            const statusHtml = getStatusBadge(match);
            const execRate = match.execution_rate || 30;
            
            // 优先级颜色
            let priorityColor = '#10B981';
            if (execRate >= 70) priorityColor = '#EF4444';
            else if (execRate >= 40) priorityColor = '#F59E0B';
            
            return `
                <tr>
                    <td style="width: 45px; text-align: center; padding: 12px 8px;">
                        <input type="checkbox" class="match-checkbox" data-id="${match.id}" ${state.selectedMatches.has(match.id) ? 'checked' : ''}>
                    </td>
                    <td style="width: 210px; text-align: left; padding: 12px 8px;">
                        <strong>${escapeHtml(match.home_team)}</strong>
                        <span style="color: var(--primary); margin: 0 4px;">vs</span>
                        <strong>${escapeHtml(match.away_team)}</strong>
                    </td>
                    <td style="width: 100px; text-align: left; padding: 12px 8px;">
                        <span class="league-tag">${escapeHtml(match.league || '-')}</span>
                    </td>
                    <td style="width: 90px; text-align: center; padding: 12px 8px;">
                        ${sourceHtml}
                    </td>
                    <td style="width: 70px; text-align: center; padding: 12px 8px;">
                        <span class="priority-badge" style="background: ${priorityColor}20; color: ${priorityColor};">
                            ${execRate}%
                        </span>
                    </td>
                    <td style="width: 150px; text-align: center; padding: 12px 8px;">
                        <i class="fas fa-calendar-alt" style="font-size: 11px; margin-right: 4px; color: var(--text-muted);"></i>
                        ${formatDateTime(match.match_time)}
                    </td>
                    <td style="width: 70px; text-align: center; padding: 12px 8px;">
                        ${scoreHtml}
                    </td>
                    <td style="width: 70px; text-align: center; padding: 12px 8px;">
                        ${statusHtml}
                    </td>
                    <td style="width: 85px; text-align: center; padding: 12px 8px;">
                        <label class="toggle-switch">
                            <input type="checkbox" class="active-toggle" data-id="${match.id}" ${match.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="toggle-label" style="font-size: 11px; margin-left: 6px; ${match.is_active ? 'color: #10B981;' : 'color: #64748B;'}">
                            ${match.is_active ? '显示' : '隐藏'}
                        </span>
                    </td>
                    <td style="width: 110px; text-align: center; padding: 12px 8px;">
                        <div class="action-buttons" style="display: flex; gap: 6px; justify-content: center;">
                            <button class="action-btn-sm edit-btn" data-id="${match.id}" title="编辑">
                                <i class="fas fa-edit"></i> 编辑
                            </button>
                            <button class="action-btn-sm danger delete-btn" data-id="${match.id}" title="删除">
                                <i class="fas fa-trash"></i> 删除
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
                showToast(isActive ? '比赛已在前台显示' : '比赛已从前台隐藏');
                loadMatches();
                loadStorageStats();
            } else {
                showToast('操作失败', 'error');
                loadMatches();
            }
        } catch (err) {
            showToast('网络错误', 'error');
            loadMatches();
        }
    }

    async function deleteMatch(id) {
        if (!confirm('确定要删除这场比赛吗？')) return;
        try {
            const response = await fetch(`/api/v1/admin/matches/${id}`, { method: 'DELETE', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                showToast('比赛已删除');
                loadMatches();
                loadStorageStats();
            } else {
                showToast('删除失败', 'error');
            }
        } catch (err) {
            showToast('网络错误', 'error');
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
            if (sourceEl) sourceEl.innerHTML = `<i class="fas fa-database"></i> 数据源: ${match.source || '手动'}`;
            document.getElementById('editExecutionRate').value = match.execution_rate || 30;
            document.getElementById('editRateValue').textContent = (match.execution_rate || 30) + '%';
            document.getElementById('editMinAuth').value = match.min_authorization || 100;
            document.getElementById('editMatchLimit').value = match.match_limit || 500;
            DOM.editModal.classList.add('show');
        } catch (err) {
            showToast('加载比赛信息失败', 'error');
        }
    }

    async function batchToggleActive(enable) {
        const ids = Array.from(state.selectedMatches);
        if (ids.length === 0) { showToast('请先选择比赛', 'warning'); return; }
        const action = enable ? '显示' : '隐藏';
        if (!confirm(`确定要${action} ${ids.length} 场比赛吗？`)) return;
        try {
            const response = await fetch('/api/v1/admin/matches/batch-toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, is_active: enable ? 1 : 0 })
            });
            const result = await response.json();
            if (result.success) {
                showToast(`${ids.length} 场比赛已${action}`);
                state.selectedMatches.clear();
                loadMatches();
                loadStorageStats();
            } else {
                showToast('操作失败', 'error');
            }
        } catch (err) {
            showToast('网络错误', 'error');
        }
    }

    async function batchByLeague(enable) {
        const league = document.getElementById('batchLeagueSelect').value;
        if (!league) { showToast('请选择联赛', 'warning'); return; }
        const action = enable ? '显示' : '隐藏';
        if (!confirm(`确定要${action}所有 ${league} 的比赛吗？`)) return;
        try {
            const response = await fetch('/api/v1/admin/matches/batch-by-league', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league, is_active: enable ? 1 : 0 })
            });
            const result = await response.json();
            if (result.success) {
                showToast(`${result.updated} 场 ${league} 比赛已${action}`);
                loadMatches();
                loadStorageStats();
                DOM.leagueBatchModal.classList.remove('show');
            } else {
                showToast('操作失败', 'error');
            }
        } catch (err) {
            showToast('网络错误', 'error');
        }
    }

    async function autoFetchMatches() {
        if (!confirm('从 DeepSeek AI 获取最新比赛数据？')) return;
        if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 获取中...';
        showToast('正在获取比赛数据，请稍候...', 'info');
        try {
            const response = await fetch('/api/v1/admin/matches/auto-fetch', { method: 'POST', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                const added = result.data?.newToPool || 0;
                showToast(`✅ 获取完成：新增 ${added} 场比赛`);
                if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-check-circle"></i> 数据已同步';
                loadMatches();
                loadStorageStats();
            } else {
                showToast(`获取失败：${result.error || '未知错误'}`, 'error');
                if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> 获取失败';
            }
        } catch (err) {
            showToast('网络错误，请重试', 'error');
            if (DOM.syncStatus) DOM.syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> 获取失败';
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
        if (!confirm('清理过期数据？此操作不可撤销。')) return;
        try {
            const response = await fetch('/api/v1/admin/matches/cleanup', { method: 'POST', credentials: 'include' });
            const result = await response.json();
            if (result.success) {
                showToast(result.message);
                loadStorageStats();
                loadMatches();
            } else {
                showToast('清理失败', 'error');
            }
        } catch (err) {
            showToast('网络错误', 'error');
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
                    leagueSelect.innerHTML = '<option value="all">全部联赛</option>' + result.data.map(l => `<option value="${escapeHtml(l.league)}">${escapeHtml(l.league)} (${l.match_count})</option>`).join('');
                }
                if (batchLeagueSelect) {
                    batchLeagueSelect.innerHTML = '<option value="">选择联赛</option>' + result.data.map(l => `<option value="${escapeHtml(l.league)}">${escapeHtml(l.league)} (${l.match_count})</option>`).join('');
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
        } catch (err) { showToast('加载失败', 'error'); }
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
        if (syncBtn) { syncBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 自动获取'; syncBtn.onclick = autoFetchMatches; }
        document.getElementById('refreshBtn')?.addEventListener('click', () => { loadMatches(); loadStorageStats(); showToast('已刷新', 'success'); });
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
                if (result.success) { showToast('策略已更新'); DOM.editModal.classList.remove('show'); loadMatches(); loadStorageStats(); }
                else { showToast('更新失败', 'error'); }
            } catch (err) { showToast('网络错误', 'error'); }
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
                const dateInput = document.getElementById('manualMatchDate');
                const timeInput = document.getElementById('manualMatchTime');
                if (dateInput) dateInput.value = today.toISOString().split('T')[0];
                if (timeInput) timeInput.value = '20:00';
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
                if (!homeTeam || !awayTeam || !league || !matchDate) { showToast('请填写所有必填项', 'error'); return; }
                const localDateTimeStr = `${matchDate}T${matchTime}:00`;
                const localDate = new Date(localDateTimeStr);
                if (isNaN(localDate.getTime())) { showToast('日期/时间格式无效', 'error'); return; }
                const matchDateTimeUTC = localDate.toISOString();
                const matchDateObj = new Date(matchDateTimeUTC);
                const cutoffDateTimeUTC = new Date(matchDateObj.getTime() - 5 * 60 * 1000).toISOString();
                if (matchDateObj <= new Date()) { showToast('比赛时间必须是将来的时间', 'error'); return; }
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
                        showToast(`✅ 比赛已添加：${homeTeam} vs ${awayTeam}`);
                        DOM.manualAddModal?.classList.remove('show');
                        manualAddForm.reset();
                        const homePreview = document.getElementById('homeLogoPreview');
                        const awayPreview = document.getElementById('awayLogoPreview');
                        if (homePreview) homePreview.style.display = 'none';
                        if (awayPreview) awayPreview.style.display = 'none';
                        loadMatches();
                        loadStorageStats();
                    } else { showToast(`添加失败：${result.error || '未知错误'}`, 'error'); }
                } catch (err) { showToast('网络错误，请重试', 'error'); }
            };
        }
    }

    // ==================== 隊徽管理功能（已禁用，移至 HTML 獨立實現） ====================
    async function loadAllTeamLogos() { console.log('队徽管理已由 HTML 独立实现'); }
    function openUploadModal() { console.log('队徽管理已由 HTML 独立实现'); }
    async function uploadTeamLogo() { console.log('队徽管理已由 HTML 独立实现'); }
    function initTeamLogoManager() { console.log('队徽管理已由 HTML 独立实现，跳过初始化'); }
    async function loadLeaguesForTeamLogo() { console.log('队徽管理已由 HTML 独立实现'); }

    // ==================== 初始化 ====================
    async function init() {
        if (window.FOOTRADA_TIMEZONE) {
            console.log('✅ 时区工具已加载:', window.FOOTRADA_TIMEZONE.getUserTimezoneInfo());
        } else {
            console.warn('⚠️ 时区工具未加载，使用 UTC 模式');
        }
        
        initEventListeners();
        
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