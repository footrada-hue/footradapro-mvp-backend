/**
 * 复盘报告编辑器控制器
 */

(function() {
    'use strict';

    // 確保時間工具已加載
    if (!window.FOOTRADAPRO_TIME) {
        console.warn('FOOTRADAPRO_TIME not loaded, using fallback');
    }
    const TIME = window.FOOTRADAPRO_TIME;

    let matches = [];
    let currentMatch = null;
    let events = [];

    // ==================== 格式化輔助函數 ====================
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        
        if (TIME) {
            return TIME.formatShortDate(dateStr);
        } else {
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (e) {
                return '-';
            }
        }
    }

    // ==================== 初始化 ====================
    async function init() {
        bindEvents();
        await loadMatches();
        await loadPublishedReports();
    }

    // ==================== 绑定事件 ====================
    function bindEvents() {
        // 比赛选择
        const matchSelect = document.getElementById('matchSelect');
        if (matchSelect) {
            matchSelect.addEventListener('change', (e) => {
                const matchId = e.target.value;
                const newReportBtn = document.getElementById('newReportBtn');
                if (newReportBtn) newReportBtn.disabled = !matchId;
                if (matchId) {
                    loadMatchDetails(matchId);
                }
            });
        }
        
        // 新建报告
        const newReportBtn = document.getElementById('newReportBtn');
        if (newReportBtn) {
            newReportBtn.addEventListener('click', () => {
                showEditor(true);
            });
        }
        
        // 取消编辑
        const cancelEdit = document.getElementById('cancelEdit');
        if (cancelEdit) {
            cancelEdit.addEventListener('click', () => {
                showEditor(false);
                resetForm();
            });
        }
        
        // 保存草稿
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => {
                saveReport('draft');
            });
        }
        
        // 提交表单（发布）
        const reportForm = document.getElementById('reportForm');
        if (reportForm) {
            reportForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveReport('published');
            });
        }
        
        // 添加事件
        const addEventBtn = document.getElementById('addEventBtn');
        if (addEventBtn) {
            addEventBtn.addEventListener('click', addEvent);
        }
    }

    // ==================== 加载比赛列表 ====================
    async function loadMatches() {
        try {
            const token = localStorage.getItem('admin_token');
            const response = await fetch('/api/v1/admin/report/matches', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();
            
            if (result.success) {
                matches = result.data;
                renderMatchSelect();
            }
        } catch (err) {
            console.error('Failed to load matches:', err);
        }
    }

    // ==================== 渲染比赛下拉框 ====================
    function renderMatchSelect() {
        const select = document.getElementById('matchSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select match...</option>';
        
        matches.forEach(match => {
            const option = document.createElement('option');
            option.value = match.match_id;
            option.textContent = `${match.home_team} vs ${match.away_team} (${formatDate(match.match_time)})`;
            if (match.has_report) {
                option.textContent += ' [Report exists]';
            }
            select.appendChild(option);
        });
    }

    // ==================== 加载比赛详情 ====================
    async function loadMatchDetails(matchId) {
        try {
            const token = localStorage.getItem('admin_token');
            const response = await fetch(`/api/v1/admin/settle/match/${matchId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();
            
            if (result.success) {
                currentMatch = result.data.match;
                
                const homeTeam = document.getElementById('homeTeam');
                if (homeTeam) homeTeam.value = currentMatch.home_team;
                
                const awayTeam = document.getElementById('awayTeam');
                if (awayTeam) awayTeam.value = currentMatch.away_team;
                
                const matchIdField = document.getElementById('matchId');
                if (matchIdField) matchIdField.value = matchId;
                
                // 检查是否已有报告
                const reportResponse = await fetch(`/api/v1/admin/report/${matchId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (reportResponse.ok) {
                    const reportResult = await reportResponse.json();
                    if (reportResult.success) {
                        loadReportData(reportResult.data);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load match details:', err);
        }
    }

    // ==================== 加载报告数据 ====================
    function loadReportData(report) {
        const fields = [
            'homeScore', 'awayScore', 'possessionHome', 'possessionAway',
            'shotsHome', 'shotsAway', 'shotsOnTargetHome', 'shotsOnTargetAway',
            'cornersHome', 'cornersAway', 'foulsHome', 'foulsAway',
            'yellowCardsHome', 'yellowCardsAway', 'redCardsHome', 'redCardsAway',
            'xgHome', 'xgAway', 'aiConclusion'
        ];
        
        fields.forEach(field => {
            const element = document.getElementById(field);
            if (!element) return;
            
            let value = report[field];
            if (field === 'aiConclusion') {
                element.value = value || '';
            } else {
                element.value = value || 0;
            }
        });
        
        if (report.key_events) {
            events = report.key_events;
            renderEvents();
        }
    }

    // ==================== 显示/隐藏编辑器 ====================
    function showEditor(show) {
        const editor = document.getElementById('reportEditor');
        if (editor) {
            editor.style.display = show ? 'block' : 'none';
        }
    }

    // ==================== 重置表单 ====================
    function resetForm() {
        const form = document.getElementById('reportForm');
        if (form) form.reset();
        events = [];
        renderEvents();
    }

    // ==================== 添加事件 ====================
    function addEvent() {
        events.push({ time: '', description: '' });
        renderEvents();
    }

    // ==================== 渲染事件 ====================
    function renderEvents() {
        const container = document.getElementById('eventsContainer');
        if (!container) return;
        
        if (events.length === 0) {
            container.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 20px;">No events</p>';
            return;
        }
        
        container.innerHTML = events.map((event, index) => `
            <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                <input type="text" placeholder="Minute" value="${event.time || ''}" 
                    style="width: 80px; padding: 8px; background: var(--surface-secondary); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary);"
                    onchange="window.updateEvent(${index}, 'time', this.value)">
                <input type="text" placeholder="Event description" value="${event.description || ''}" 
                    style="flex: 1; padding: 8px; background: var(--surface-secondary); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary);"
                    onchange="window.updateEvent(${index}, 'description', this.value)">
                <i class="fas fa-times" onclick="window.removeEvent(${index})" 
                    style="cursor: pointer; color: var(--danger-500); font-size: 18px;"></i>
            </div>
        `).join('');
    }

    // ==================== 更新事件 ====================
    window.updateEvent = (index, field, value) => {
        if (events[index]) {
            events[index][field] = value;
        }
    };

    // ==================== 删除事件 ====================
    window.removeEvent = (index) => {
        events.splice(index, 1);
        renderEvents();
    };

    // ==================== 保存报告 ====================
    async function saveReport(status) {
        const form = document.getElementById('reportForm');
        if (!form) return;
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        data.key_events = events;
        data.status = status;
        
        try {
            const token = localStorage.getItem('admin_token');
            const response = await fetch('/api/v1/admin/report/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(status === 'published' ? '✅ Report published!' : '✅ Draft saved');
                showEditor(false);
                resetForm();
                await loadPublishedReports();
                await loadMatches(); // 刷新比赛列表
            } else {
                alert('❌ Save failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Save failed:', err);
            alert('❌ Save failed');
        }
    }

    // ==================== 加载已发布报告 ====================
    async function loadPublishedReports() {
        const tbody = document.getElementById('reportsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        
        try {
            const token = localStorage.getItem('admin_token');
            // 这里需要后端提供一个获取已发布报告的接口
            // 暂时用模拟数据
            setTimeout(() => {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No published reports</td>
                    </tr>
                `;
            }, 500);
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--danger-500);">Failed to load</td></tr>';
        }
    }

    // ==================== 初始化 ====================
    document.addEventListener('DOMContentLoaded', init);
})();