/**
 * 比赛结果页控制器 - 真实API版本
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
        authId: null,
        result: null
    };

    const elements = {
        backBtn: document.getElementById('backBtn'),
        themeBtn: document.getElementById('themeBtn'),
        loadingState: document.getElementById('loadingState'),
        resultCard: document.getElementById('resultCard'),
        emptyState: document.getElementById('emptyState'),
        homeTeam: document.getElementById('homeTeam'),
        awayTeam: document.getElementById('awayTeam'),
        homeScore: document.getElementById('homeScore'),
        awayScore: document.getElementById('awayScore'),
        league: document.getElementById('league'),
        matchTime: document.getElementById('matchTime'),
        userPrediction: document.getElementById('userPrediction'),
        matchResult: document.getElementById('matchResult'),
        comparisonResult: document.getElementById('comparisonResult'),
        authAmount: document.getElementById('authAmount'),
        vipLevel: document.getElementById('vipLevel'),
        tradingShare: document.getElementById('tradingShare'),
        profitAmount: document.getElementById('profitAmount'),
        commission: document.getElementById('commission'),
        userProfit: document.getElementById('userProfit'),
        viewReportBtn: document.getElementById('viewReportBtn')
    };

    // 初始化
    async function init() {
        applyTheme();
        bindEvents();
        
        const urlParams = new URLSearchParams(window.location.search);
        AppState.authId = urlParams.get('auth_id');
        
        if (AppState.authId) {
            await loadResult();
        } else {
            showEmptyState();
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
        
        if (elements.viewReportBtn) {
            elements.viewReportBtn.addEventListener('click', () => {
                if (AppState.result?.match_id) {
                    window.location.href = `/report-detail.html?match_id=${AppState.result.match_id}`;
                }
            });
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

    // 格式化金額
    function formatAmount(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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

    // 加载结果数据
    async function loadResult() {
        showLoading();
        
        try {
            const response = await fetch('/api/v1/user/history/' + AppState.authId, {
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (result.success) {
                AppState.result = result.data;
                renderResult();
            } else {
                showEmptyState();
            }
        } catch (err) {
            console.error('加载结果失败:', err);
            showError();
        }
    }

    // 渲染结果
    function renderResult() {
        const r = AppState.result;
        
        // 比赛信息
        elements.homeTeam.textContent = r.home_team;
        elements.awayTeam.textContent = r.away_team;
        elements.homeScore.textContent = r.home_score || 0;
        elements.awayScore.textContent = r.away_score || 0;
        elements.league.textContent = r.league;
        elements.matchTime.textContent = formatDate(r.match_time);
        
        // 预测对比
        const predictionMap = { home: 'Home Win', draw: 'Draw', away: 'Away Win' };
        elements.userPrediction.textContent = predictionMap[r.user_prediction] || r.user_prediction;
        elements.matchResult.textContent = predictionMap[r.match_result] || r.match_result;
        
        const isCorrect = r.user_prediction === r.match_result;
        elements.comparisonResult.textContent = isCorrect ? '✓ Correct' : '✗ Incorrect';
        elements.comparisonResult.className = 'comparison-result ' + (isCorrect ? 'correct' : 'incorrect');
        
        // 收益明细
        const profit = Number(r.profit) || 0;
        const commission = Number(r.commission) || 0;
        const userProfit = Number(r.user_profit) || 0;
        
        elements.authAmount.textContent = formatAmount(r.user_amount) + ' USDT';
        elements.vipLevel.textContent = 'VIP ' + (r.vip_level || 0);
        elements.tradingShare.textContent = ((r.trading_share || 0.3) * 100) + '%';
        elements.profitAmount.textContent = (profit > 0 ? '+' : '') + formatAmount(profit) + ' USDT';
        elements.commission.textContent = '- ' + formatAmount(commission) + ' USDT';
        elements.userProfit.textContent = (userProfit > 0 ? '+' : '') + formatAmount(userProfit) + ' USDT';
        
        if (userProfit > 0) {
            elements.userProfit.style.color = 'var(--success-500)';
        } else if (userProfit < 0) {
            elements.userProfit.style.color = 'var(--danger-500)';
        }
        
        hideLoading();
    }

    // 显示空状态
    function showEmptyState() {
        elements.loadingState.style.display = 'none';
        elements.resultCard.style.display = 'none';
        elements.emptyState.style.display = 'block';
    }

    // 显示加载
    function showLoading() {
        elements.loadingState.style.display = 'block';
        elements.resultCard.style.display = 'none';
        elements.emptyState.style.display = 'none';
    }

    // 隐藏加载
    function hideLoading() {
        elements.loadingState.style.display = 'none';
        elements.resultCard.style.display = 'block';
        elements.emptyState.style.display = 'none';
    }

    // 显示错误
    function showError() {
        elements.loadingState.style.display = 'none';
        elements.resultCard.style.display = 'none';
        elements.emptyState.style.display = 'block';
        const emptyStateP = elements.emptyState.querySelector('p');
        if (emptyStateP) {
            emptyStateP.textContent = 'Load failed, please try again';
        }
    }

    // 初始化
    document.addEventListener('DOMContentLoaded', init);

})();