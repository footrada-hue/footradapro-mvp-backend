/**
 * 复盘报告编辑器控制器 - 完整修复版（含 AI 功能）
 */

(function() {
    'use strict';

    const TIME = window.FOOTRADAPRO_TIME || window.FOOTRADAPRO?.UTILS;
    
    let currentMatch = null;
    let currentReport = null;
    let events = [];

    // 格式化函数
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '-';
        }
    }

    // API 请求
    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        try {
            const response = await fetch(`/api/v1/admin/report${endpoint}`, { ...defaultOptions, ...options });
            if (response.status === 401) {
                window.location.href = '/admin/index.html';
                throw new Error('UNAUTHORIZED');
            }
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Request failed');
            return data;
        } catch (err) {
            console.error('API请求失败:', err);
            throw err;
        }
    }

    // 获取比赛列表
    async function loadMatches() {
        try {
            const result = await adminRequest('/matches');
            return result.data;
        } catch (err) {
            console.error('加载比赛失败:', err);
            return [];
        }
    }

    // 获取报告列表
    async function loadReports() {
        try {
            const result = await adminRequest('/');
            return result.data;
        } catch (err) {
            console.error('加载报告失败:', err);
            return [];
        }
    }

    // 获取单个报告
    async function loadReport(matchId) {
        try {
            const result = await adminRequest(`/${matchId}`);
            return result.data;
        } catch (err) {
            if (err.message === 'REPORT_NOT_FOUND') return null;
            throw err;
        }
    }

    // 获取比赛详情
    async function loadMatchDetail(matchId) {
        try {
            const result = await adminRequest(`/match/${matchId}`);
            return result.data;
        } catch (err) {
            console.error('加载比赛详情失败:', err);
            return null;
        }
    }

    // 保存报告
    async function saveReport(status) {
        if (!currentMatch) {
            alert('请先选择比赛');
            return false;
        }

        const data = {
            match_id: currentMatch.match_id,
            match_time: currentMatch.match_time,
            league: currentMatch.league,
            home_team: currentMatch.home_team,
            away_team: currentMatch.away_team,
            home_score: parseInt(document.getElementById('homeScore')?.value || 0),
            away_score: parseInt(document.getElementById('awayScore')?.value || 0),
            home_logo: currentMatch.home_logo,
            away_logo: currentMatch.away_logo,
            prediction_data: {
                possession: {
                    home: parseFloat(document.getElementById('possessionHome')?.value || 50),
                    away: parseFloat(document.getElementById('possessionAway')?.value || 50)
                },
                shots: {
                    home: parseInt(document.getElementById('shotsHome')?.value || 0),
                    away: parseInt(document.getElementById('shotsAway')?.value || 0)
                },
                shots_on_target: {
                    home: parseInt(document.getElementById('shotsOnTargetHome')?.value || 0),
                    away: parseInt(document.getElementById('shotsOnTargetAway')?.value || 0)
                },
                corners: {
                    home: parseInt(document.getElementById('cornersHome')?.value || 0),
                    away: parseInt(document.getElementById('cornersAway')?.value || 0)
                },
                fouls: {
                    home: parseInt(document.getElementById('foulsHome')?.value || 0),
                    away: parseInt(document.getElementById('foulsAway')?.value || 0)
                },
                yellow_cards: {
                    home: parseInt(document.getElementById('yellowCardsHome')?.value || 0),
                    away: parseInt(document.getElementById('yellowCardsAway')?.value || 0)
                },
                red_cards: {
                    home: parseInt(document.getElementById('redCardsHome')?.value || 0),
                    away: parseInt(document.getElementById('redCardsAway')?.value || 0)
                },
                xg: {
                    home: parseFloat(document.getElementById('xgHome')?.value || 0),
                    away: parseFloat(document.getElementById('xgAway')?.value || 0)
                }
            },
            evidence_chain: events,
            ai_deepdive: document.getElementById('aiDeepdive')?.value || '',
            status: status
        };

        try {
            await adminRequest('/save', { method: 'POST', body: JSON.stringify(data) });
            alert(status === 'published' ? '✅ 报告发布成功！' : '✅ 草稿保存成功！');
            if (status === 'published') {
                if (confirm('报告发布成功！是否立即查看？')) {
                    window.open(`/report-detail.html?match_id=${currentMatch.match_id}`, '_blank');
                }
            }
            await renderRecentReports();
            return true;
        } catch (err) {
            alert('保存失败：' + err.message);
            return false;
        }
    }

    // 渲染比赛下拉框
    async function renderMatchSelect() {
        const select = document.getElementById('matchSelect');
        if (!select) return;
        
        const matches = await loadMatches();
        select.innerHTML = '<option value="">请选择已清算的比赛...</option>';
        
        matches.forEach(match => {
            const option = document.createElement('option');
            option.value = match.match_id;
            option.textContent = `${match.home_team} vs ${match.away_team} (${formatDate(match.match_time)})`;
            if (match.has_report) option.textContent += ' [已有报告]';
            select.appendChild(option);
        });
    }

    // 渲染最近报告列表
    async function renderRecentReports() {
        const container = document.getElementById('reportsList');
        if (!container) return;
        
        try {
            const reports = await loadReports();
            if (reports.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><p>暂无报告</p></div>';
                return;
            }
            
            let html = '';
            reports.slice(0, 10).forEach(report => {
                const statusClass = report.status === 'published' ? 'published' : 'draft';
                const statusText = report.status === 'published' ? '已发布' : '草稿';
                html += `
                    <div class="report-item">
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <span class="report-item-status ${statusClass}"></span>
                            <span class="report-item-title">${escapeHtml(report.home_team)} vs ${escapeHtml(report.away_team)}</span>
                            <span class="report-item-meta">${report.home_score || 0} : ${report.away_score || 0}</span>
                            <span class="report-item-meta">${statusText}</span>
                            <span class="report-item-meta">${formatDate(report.published_at || report.updated_at)}</span>
                        </div>
                        <div class="report-item-actions">
                            <button onclick="window.editReport('${report.match_id}')"><i class="fas fa-edit"></i> 编辑</button>
                            <button onclick="window.viewReport('${report.match_id}')"><i class="fas fa-eye"></i> 查看</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>加载失败</p></div>';
        }
    }

    // 显示编辑器
    function showEditor(show) {
        const editor = document.getElementById('reportEditor');
        const recent = document.getElementById('recentReports');
        if (editor) editor.style.display = show ? 'block' : 'none';
        if (recent) recent.style.display = show ? 'none' : 'block';
    }

    // 重置表单
    function resetForm() {
        const fields = ['homeScore', 'awayScore', 'possessionHome', 'possessionAway', 'shotsHome', 'shotsAway',
            'shotsOnTargetHome', 'shotsOnTargetAway', 'cornersHome', 'cornersAway', 'foulsHome', 'foulsAway',
            'yellowCardsHome', 'yellowCardsAway', 'redCardsHome', 'redCardsAway', 'xgHome', 'xgAway', 'aiDeepdive'];
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el) el.value = field.includes('possession') ? 50 : (field.includes('xg') ? 0 : 0);
        });
        events = [];
        renderEvents();
    }

    // 填充表单数据
    function populateForm(report) {
        if (!report) return;
        
        if (report.home_score !== undefined) document.getElementById('homeScore').value = report.home_score;
        if (report.away_score !== undefined) document.getElementById('awayScore').value = report.away_score;
        
        if (report.prediction_data) {
            const pd = report.prediction_data;
            if (pd.possession) {
                if (pd.possession.home) document.getElementById('possessionHome').value = pd.possession.home;
                if (pd.possession.away) document.getElementById('possessionAway').value = pd.possession.away;
            }
            if (pd.shots) {
                if (pd.shots.home) document.getElementById('shotsHome').value = pd.shots.home;
                if (pd.shots.away) document.getElementById('shotsAway').value = pd.shots.away;
            }
            if (pd.shots_on_target) {
                if (pd.shots_on_target.home) document.getElementById('shotsOnTargetHome').value = pd.shots_on_target.home;
                if (pd.shots_on_target.away) document.getElementById('shotsOnTargetAway').value = pd.shots_on_target.away;
            }
            if (pd.corners) {
                if (pd.corners.home) document.getElementById('cornersHome').value = pd.corners.home;
                if (pd.corners.away) document.getElementById('cornersAway').value = pd.corners.away;
            }
            if (pd.fouls) {
                if (pd.fouls.home) document.getElementById('foulsHome').value = pd.fouls.home;
                if (pd.fouls.away) document.getElementById('foulsAway').value = pd.fouls.away;
            }
            if (pd.yellow_cards) {
                if (pd.yellow_cards.home) document.getElementById('yellowCardsHome').value = pd.yellow_cards.home;
                if (pd.yellow_cards.away) document.getElementById('yellowCardsAway').value = pd.yellow_cards.away;
            }
            if (pd.red_cards) {
                if (pd.red_cards.home) document.getElementById('redCardsHome').value = pd.red_cards.home;
                if (pd.red_cards.away) document.getElementById('redCardsAway').value = pd.red_cards.away;
            }
            if (pd.xg) {
                if (pd.xg.home) document.getElementById('xgHome').value = pd.xg.home;
                if (pd.xg.away) document.getElementById('xgAway').value = pd.xg.away;
            }
        }
        
        if (report.evidence_chain && Array.isArray(report.evidence_chain)) {
            events = report.evidence_chain;
            renderEvents();
        }
        
        if (report.ai_deepdive) document.getElementById('aiDeepdive').value = report.ai_deepdive;
    }

    // 渲染事件
    function renderEvents() {
        const container = document.getElementById('eventsContainer');
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">暂无关键事件</div>';
            return;
        }

        container.innerHTML = events.map((event, index) => `
            <div class="event-item">
                <input type="text" placeholder="分钟" value="${escapeHtml(event.time || '')}" onchange="window.updateEvent(${index}, 'time', this.value)">
                <input type="text" placeholder="事件描述" value="${escapeHtml(event.description || '')}" onchange="window.updateEvent(${index}, 'description', this.value)">
                <i class="fas fa-trash-alt" onclick="window.removeEvent(${index})"></i>
            </div>
        `).join('');
    }

    window.updateEvent = function(index, field, value) {
        if (events[index]) events[index][field] = value;
    };

    window.removeEvent = function(index) {
        events.splice(index, 1);
        renderEvents();
    };

    function addEvent() {
        events.push({ time: '', description: '' });
        renderEvents();
    }

    // ==================== AI 功能 ====================
    
    async function aiFetchMatchData() {
        if (!currentMatch) {
            alert('请先选择比赛');
            return;
        }
        
        const btn = document.getElementById('aiFetchDataBtn');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 获取中...';
        btn.disabled = true;
        
        try {
            const result = await adminRequest('/fetch-match-data', {
                method: 'POST',
                body: JSON.stringify({
                    matchId: currentMatch.match_id
                })
            });
            
            if (result.success && result.data) {
                const data = result.data;
                
                // 填充统计数据
                if (data.statistics) {
                    const stats = data.statistics;
                    if (stats.possession) {
                        if (document.getElementById('possessionHome')) document.getElementById('possessionHome').value = stats.possession.home;
                        if (document.getElementById('possessionAway')) document.getElementById('possessionAway').value = stats.possession.away;
                    }
                    if (stats.shots) {
                        if (document.getElementById('shotsHome')) document.getElementById('shotsHome').value = stats.shots.home;
                        if (document.getElementById('shotsAway')) document.getElementById('shotsAway').value = stats.shots.away;
                    }
                    if (stats.shots_on_target) {
                        if (document.getElementById('shotsOnTargetHome')) document.getElementById('shotsOnTargetHome').value = stats.shots_on_target.home;
                        if (document.getElementById('shotsOnTargetAway')) document.getElementById('shotsOnTargetAway').value = stats.shots_on_target.away;
                    }
                    if (stats.corners) {
                        if (document.getElementById('cornersHome')) document.getElementById('cornersHome').value = stats.corners.home;
                        if (document.getElementById('cornersAway')) document.getElementById('cornersAway').value = stats.corners.away;
                    }
                    if (stats.fouls) {
                        if (document.getElementById('foulsHome')) document.getElementById('foulsHome').value = stats.fouls.home;
                        if (document.getElementById('foulsAway')) document.getElementById('foulsAway').value = stats.fouls.away;
                    }
                    if (stats.yellow_cards) {
                        if (document.getElementById('yellowCardsHome')) document.getElementById('yellowCardsHome').value = stats.yellow_cards.home;
                        if (document.getElementById('yellowCardsAway')) document.getElementById('yellowCardsAway').value = stats.yellow_cards.away;
                    }
                    if (stats.red_cards) {
                        if (document.getElementById('redCardsHome')) document.getElementById('redCardsHome').value = stats.red_cards.home;
                        if (document.getElementById('redCardsAway')) document.getElementById('redCardsAway').value = stats.red_cards.away;
                    }
                    if (stats.xg) {
                        if (document.getElementById('xgHome')) document.getElementById('xgHome').value = stats.xg.home;
                        if (document.getElementById('xgAway')) document.getElementById('xgAway').value = stats.xg.away;
                    }
                }
                
                // 填充关键事件
                if (data.key_events && data.key_events.length > 0) {
                    events = data.key_events.map(e => ({
                        time: e.time,
                        description: `${e.team} ${e.event}${e.player ? ` (${e.player})` : ''}`
                    }));
                    renderEvents();
                }
                
                alert('✅ 比赛数据获取成功！');
            } else {
                alert('获取失败：' + (result.error || '未知错误'));
            }
        } catch (err) {
            alert('获取失败：' + err.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async function aiGenerateReport() {
        if (!currentMatch) {
            alert('请先选择比赛');
            return;
        }
        
        // 收集统计数据
        const statistics = {
            possession: {
                home: parseFloat(document.getElementById('possessionHome')?.value || 50),
                away: parseFloat(document.getElementById('possessionAway')?.value || 50)
            },
            shots: {
                home: parseInt(document.getElementById('shotsHome')?.value || 0),
                away: parseInt(document.getElementById('shotsAway')?.value || 0)
            },
            shots_on_target: {
                home: parseInt(document.getElementById('shotsOnTargetHome')?.value || 0),
                away: parseInt(document.getElementById('shotsOnTargetAway')?.value || 0)
            },
            corners: {
                home: parseInt(document.getElementById('cornersHome')?.value || 0),
                away: parseInt(document.getElementById('cornersAway')?.value || 0)
            },
            fouls: {
                home: parseInt(document.getElementById('foulsHome')?.value || 0),
                away: parseInt(document.getElementById('foulsAway')?.value || 0)
            },
            yellow_cards: {
                home: parseInt(document.getElementById('yellowCardsHome')?.value || 0),
                away: parseInt(document.getElementById('yellowCardsAway')?.value || 0)
            },
            red_cards: {
                home: parseInt(document.getElementById('redCardsHome')?.value || 0),
                away: parseInt(document.getElementById('redCardsAway')?.value || 0)
            },
            xg: {
                home: parseFloat(document.getElementById('xgHome')?.value || 0),
                away: parseFloat(document.getElementById('xgAway')?.value || 0)
            }
        };
        
        const btn = document.getElementById('aiGenerateReportBtn');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
        btn.disabled = true;
        
        try {
            const result = await adminRequest('/generate-report', {
                method: 'POST',
                body: JSON.stringify({
                    matchId: currentMatch.match_id,
                    statistics: statistics,
                    keyEvents: events,
                    homeScore: parseInt(document.getElementById('homeScore')?.value || 0),
                    awayScore: parseInt(document.getElementById('awayScore')?.value || 0)
                })
            });
            
            if (result.success && result.data.report) {
                document.getElementById('aiDeepdive').value = result.data.report;
                alert('✅ 深度报告生成成功！');
            } else {
                alert('生成失败：' + (result.error || '未知错误'));
            }
        } catch (err) {
            alert('生成失败：' + err.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // 加载比赛到编辑器
    async function loadMatchToEditor(matchId) {
        try {
            const match = await loadMatchDetail(matchId);
            if (!match) {
                alert('比赛不存在');
                return false;
            }
            
            currentMatch = match;
            
            // 显示比赛信息
            document.getElementById('displayTeams').textContent = `${match.home_team} vs ${match.away_team}`;
            document.getElementById('displayLeague').textContent = match.league || '未知联赛';
            document.getElementById('displayTime').innerHTML = `<i class="fas fa-calendar"></i> ${formatDate(match.match_time)}`;
            const scoreText = (match.home_score !== undefined && match.away_score !== undefined) ? `${match.home_score} : ${match.away_score}` : '比分待获取';
            document.getElementById('displayScoreText').textContent = scoreText;
            
            // 预填比分
            if (match.home_score !== undefined) document.getElementById('homeScore').value = match.home_score;
            if (match.away_score !== undefined) document.getElementById('awayScore').value = match.away_score;
            
            // 检查是否有已存在的报告
            try {
                const report = await loadReport(matchId);
                if (report) {
                    currentReport = report;
                    populateForm(report);
                } else {
                    resetForm();
                }
            } catch (err) {
                resetForm();
            }
            
            return true;
        } catch (err) {
            alert('加载比赛失败：' + err.message);
            return false;
        }
    }

    // 编辑报告
    window.editReport = async function(matchId) {
        const success = await loadMatchToEditor(matchId);
        if (success) {
            showEditor(true);
            const select = document.getElementById('matchSelect');
            if (select) select.value = matchId;
            document.getElementById('newReportBtn').disabled = false;
        }
    };

    // 查看报告
    window.viewReport = function(matchId) {
        window.open(`/report-detail.html?match_id=${matchId}`, '_blank');
    };

    // 绑定事件
    function bindEvents() {
        const matchSelect = document.getElementById('matchSelect');
        const newReportBtn = document.getElementById('newReportBtn');
        const cancelEdit = document.getElementById('cancelEdit');
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        const publishBtn = document.getElementById('publishBtn');
        const addEventBtn = document.getElementById('addEventBtn');
        const showTemplateBtn = document.getElementById('showTemplateBtn');
        const closeTemplateModal = document.getElementById('closeTemplateModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const templateModal = document.getElementById('templateModal');
        const logoutBtn = document.getElementById('logoutBtn');
        const aiFetchDataBtn = document.getElementById('aiFetchDataBtn');
        const aiGenerateReportBtn = document.getElementById('aiGenerateReportBtn');

        if (matchSelect) {
            matchSelect.addEventListener('change', async (e) => {
                const matchId = e.target.value;
                if (newReportBtn) newReportBtn.disabled = !matchId;
                if (matchId) {
                    await loadMatchToEditor(matchId);
                }
            });
        }

        if (newReportBtn) {
            newReportBtn.addEventListener('click', () => {
                if (currentMatch) {
                    showEditor(true);
                } else {
                    alert('请先选择比赛');
                }
            });
        }

        if (cancelEdit) {
            cancelEdit.addEventListener('click', () => {
                showEditor(false);
                currentMatch = null;
                currentReport = null;
                resetForm();
                if (matchSelect) matchSelect.value = '';
                if (newReportBtn) newReportBtn.disabled = true;
            });
        }

        if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => saveReport('draft'));
        if (publishBtn) publishBtn.addEventListener('click', () => saveReport('published'));
        if (addEventBtn) addEventBtn.addEventListener('click', addEvent);
        
        // AI 按钮事件绑定
        if (aiFetchDataBtn) aiFetchDataBtn.addEventListener('click', aiFetchMatchData);
        if (aiGenerateReportBtn) aiGenerateReportBtn.addEventListener('click', aiGenerateReport);

        // 模板模态框
        if (showTemplateBtn) {
            showTemplateBtn.addEventListener('click', () => {
                if (templateModal) templateModal.classList.add('show');
            });
        }
        if (closeTemplateModal) {
            closeTemplateModal.addEventListener('click', () => {
                if (templateModal) templateModal.classList.remove('show');
            });
        }
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                if (templateModal) templateModal.classList.remove('show');
            });
        }
        if (templateModal) {
            templateModal.addEventListener('click', (e) => {
                if (e.target === templateModal) templateModal.classList.remove('show');
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_name');
                window.location.href = '/admin/index.html';
            });
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    }

    // 初始化
    async function init() {
        bindEvents();
        await renderMatchSelect();
        await renderRecentReports();
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlMatchId = urlParams.get('matchId');
        if (urlMatchId) {
            const select = document.getElementById('matchSelect');
            if (select) {
                select.value = urlMatchId;
                await loadMatchToEditor(urlMatchId);
                document.getElementById('newReportBtn').disabled = false;
                showEditor(true);
            }
        }
    }

    const storedAdmin = localStorage.getItem('admin_name');
    if (storedAdmin) {
        const adminNameSpan = document.getElementById('adminName');
        if (adminNameSpan) adminNameSpan.textContent = storedAdmin;
    }

    init();
})();