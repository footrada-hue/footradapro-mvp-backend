/**
 * 报告详情页控制器 - 真实API版本
 */

(function() {
    'use strict';

    // 確保時間工具已加載
    if (!window.FOOTRADAPRO_TIME) {
        console.warn('FOOTRADAPRO_TIME not loaded, using fallback');
    }
    const TIME = window.FOOTRADAPRO_TIME;

    const AppState = {
        theme: localStorage.getItem('theme') || 'dark',
        matchId: null,
        report: null
    };

    const elements = {
        backBtn: document.getElementById('backBtn'),
        themeBtn: document.getElementById('themeBtn'),
        loadingState: document.getElementById('loadingState'),
        reportContainer: document.getElementById('reportContainer'),
        homeTeam: document.getElementById('homeTeam'),
        awayTeam: document.getElementById('awayTeam'),
        score: document.getElementById('score'),
        league: document.getElementById('league'),
        matchDate: document.getElementById('matchDate'),
        aiConclusion: document.getElementById('aiConclusion'),
        possessionHome: document.getElementById('possessionHome'),
        possessionAway: document.getElementById('possessionAway'),
        shotsHome: document.getElementById('shotsHome'),
        shotsAway: document.getElementById('shotsAway'),
        shotsOnTargetHome: document.getElementById('shotsOnTargetHome'),
        shotsOnTargetAway: document.getElementById('shotsOnTargetAway'),
        cornersHome: document.getElementById('cornersHome'),
        cornersAway: document.getElementById('cornersAway'),
        foulsHome: document.getElementById('foulsHome'),
        foulsAway: document.getElementById('foulsAway'),
        yellowCardsHome: document.getElementById('yellowCardsHome'),
        yellowCardsAway: document.getElementById('yellowCardsAway'),
        redCardsHome: document.getElementById('redCardsHome'),
        redCardsAway: document.getElementById('redCardsAway'),
        xgHome: document.getElementById('xgHome'),
        xgAway: document.getElementById('xgAway'),
        timeline: document.getElementById('timeline')
    };

    // 初始化
    async function init() {
        applyTheme();
        bindEvents();
        
        const urlParams = new URLSearchParams(window.location.search);
        AppState.matchId = urlParams.get('match_id');
        
        if (AppState.matchId) {
            await loadReport();
        } else {
            showError('Missing match ID');
        }
    }

    // 绑定事件
    function bindEvents() {
        if (elements.backBtn) {
            elements.backBtn.addEventListener('click', () => window.history.back());
        }
        
        if (elements.themeBtn) {
            elements.themeBtn.addEventListener('click', toggleTheme);
        }
    }

    // 主题切换
    function applyTheme() {
        document.body.setAttribute('data-theme', AppState.theme);
        updateThemeIcon();
    }

    function updateThemeIcon() {
        const icon = elements.themeBtn?.querySelector('i');
        if (icon) {
            icon.className = AppState.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    function toggleTheme() {
        AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', AppState.theme);
        applyTheme();
    }

    // 格式化時間
    function formatDate(dateString) {
        if (!dateString) return '-';
        return TIME ? 
            TIME.formatFull(dateString) : 
            new Date(dateString).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
    }

    // 加载报告
    async function loadReport() {
        showLoading();
        
        try {
            const response = await fetch('/api/v1/user/report/' + AppState.matchId, {
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (result.success) {
                AppState.report = result.data;
                renderReport();
            } else {
                showError('Report not found or not published');
            }
        } catch (err) {
            console.error('Failed to load report:', err);
            showError('Failed to load');
        }
    }

    // 渲染报告
    function renderReport() {
        const r = AppState.report;
        
        // 比赛信息
        elements.homeTeam.textContent = r.home_team;
        elements.awayTeam.textContent = r.away_team;
        elements.score.textContent = `${r.home_score || 0} : ${r.away_score || 0}`;
        elements.league.textContent = r.league;
        elements.matchDate.textContent = formatDate(r.match_time);
        
        // AI分析
        elements.aiConclusion.textContent = r.ai_conclusion || 'No AI analysis available';
        
        // 数据看板
        elements.possessionHome.textContent = (r.possession_home || 0) + '%';
        elements.possessionHome.style.width = (r.possession_home || 0) + '%';
        elements.possessionAway.textContent = (r.possession_away || 0) + '%';
        elements.possessionAway.style.width = (r.possession_away || 0) + '%';
        
        elements.shotsHome.textContent = r.shots_home || 0;
        elements.shotsAway.textContent = r.shots_away || 0;
        elements.shotsOnTargetHome.textContent = r.shots_ontarget_home || 0;
        elements.shotsOnTargetAway.textContent = r.shots_ontarget_away || 0;
        elements.cornersHome.textContent = r.corners_home || 0;
        elements.cornersAway.textContent = r.corners_away || 0;
        elements.foulsHome.textContent = r.fouls_home || 0;
        elements.foulsAway.textContent = r.fouls_away || 0;
        elements.yellowCardsHome.textContent = r.yellow_cards_home || 0;
        elements.yellowCardsAway.textContent = r.yellow_cards_away || 0;
        elements.redCardsHome.textContent = r.red_cards_home || 0;
        elements.redCardsAway.textContent = r.red_cards_away || 0;
        elements.xgHome.textContent = (r.xg_home || 0).toFixed(2);
        elements.xgAway.textContent = (r.xg_away || 0).toFixed(2);
        
        // 关键事件
        if (r.key_events && r.key_events.length > 0) {
            const eventsHtml = r.key_events.map(event => 
                `<div class="event-item">
                    <span class="event-time">${event.minute || 0}'</span>
                    <span class="event-desc">${event.description || ''}</span>
                </div>`
            ).join('');
            elements.timeline.innerHTML = eventsHtml;
        }
        
        hideLoading();
    }

    // 显示加载
    function showLoading() {
        elements.loadingState.style.display = 'block';
        elements.reportContainer.style.display = 'none';
    }

    // 隐藏加载
    function hideLoading() {
        elements.loadingState.style.display = 'none';
        elements.reportContainer.style.display = 'block';
    }

    // 显示错误
    function showError(message) {
        elements.loadingState.style.display = 'none';
        elements.reportContainer.style.display = 'none';
        elements.loadingState.innerHTML = 
            `<div class="error-state">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-500); font-size: 48px; margin-bottom: 16px;"></i>
                <p>${message}</p>
                <button class="btn-primary" onclick="window.history.back()" style="margin-top: 20px; padding: 12px 24px; background: var(--brand-500); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">
                    Go Back
                </button>
            </div>`;
        elements.loadingState.style.display = 'block';
    }

    // 初始化
    document.addEventListener('DOMContentLoaded', init);

})();