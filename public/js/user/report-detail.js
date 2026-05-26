/**
 * FOOTRADAPRO - Report Detail Page Controller
 */

(function() {
    'use strict';

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('match_id');
    const authId = urlParams.get('auth_id');

    // DOM Elements
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    const reportContent = document.getElementById('reportContent');

    // 队徽
    const homeImg = document.getElementById('homeImg');
    const awayImg = document.getElementById('awayImg');
    const homeName = document.getElementById('homeName');
    const awayName = document.getElementById('awayName');
    const homeCrest = document.getElementById('homeCrest');
    const awayCrest = document.getElementById('awayCrest');

    // 比赛信息
    const matchScore = document.getElementById('matchScore');
    const matchResult = document.getElementById('matchResult');
    const matchLeague = document.getElementById('matchLeague');
    const matchTime = document.getElementById('matchTime');
    const matchStatus = document.getElementById('matchStatus');

    // 报告内容
    const reportText = document.getElementById('reportText');

    // 按钮
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    let reportData = null;

    function formatDateTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return '-';
        }
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    /**
     * 从交易API获取队徽
     */
    async function fetchLogosFromTransaction() {
        if (!authId) return null;
        
        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            const response = await fetch(`/api/v1/user/transactions/${authId}?mode=${mode}`, {
                credentials: 'include'
            });
            const result = await response.json();
            if (result.success && result.data) {
                return {
                    home_logo: result.data.home_logo,
                    away_logo: result.data.away_logo,
                    home_team: result.data.home_team,
                    away_team: result.data.away_team,
                    home_score: result.data.home_score,
                    away_score: result.data.away_score,
                    league: result.data.league,
                    match_time: result.data.match_time,
                    status: result.data.status
                };
            }
        } catch (err) {
            console.error('Failed to fetch logos from transaction:', err);
        }
        return null;
    }

    async function loadReport() {
        if (!matchId) {
            showError('Missing match ID');
            return;
        }

        try {
            // 先获取报告数据
            let apiUrl = `/api/v1/user/report/${matchId}`;
            if (authId) {
                apiUrl += `?auth_id=${authId}`;
            }

            const response = await fetch(apiUrl, { credentials: 'include' });
            const result = await response.json();

            let reportData = null;
            let logoData = null;

            if (result.success && result.data) {
                reportData = result.data;
            }

            // 如果报告数据缺少队徽，从交易API获取
            if (!reportData?.home_logo && !reportData?.away_logo && authId) {
                logoData = await fetchLogosFromTransaction();
            }

            // 合并数据：优先使用报告数据，缺少的用交易数据补充
            const mergedData = {
                ...(logoData || {}),
                ...(reportData || {}),
                // 报告文本优先
                report_text: reportData?.report_text || reportData?.content,
                // AI摘要优先
                ai_summary: reportData?.ai_summary
            };

            if (mergedData.home_team || mergedData.away_team) {
                renderReport(mergedData);
                loadingState.style.display = 'none';
                reportContent.style.display = 'block';
            } else {
                showError(result.message || 'Report not found');
            }
        } catch (err) {
            console.error('Failed to load report:', err);
            showError('Network error');
        }
    }

    function renderReport(data) {
        const homeTeam = data.home_team || 'Home';
        const awayTeam = data.away_team || 'Away';
        const homeScore = data.home_score !== undefined ? data.home_score : (data.homeScore || 0);
        const awayScore = data.away_score !== undefined ? data.away_score : (data.awayScore || 0);

        // 更新队名
        homeName.textContent = homeTeam;
        awayName.textContent = awayTeam;

        // 更新队徽
        if (data.home_logo) {
            homeImg.src = data.home_logo;
            homeImg.style.display = 'block';
            const defaultIcon = homeCrest?.querySelector('i');
            if (defaultIcon) defaultIcon.style.display = 'none';
            homeImg.onerror = function() {
                this.style.display = 'none';
                if (defaultIcon) defaultIcon.style.display = 'flex';
            };
        } else {
            homeImg.style.display = 'none';
            const defaultIcon = homeCrest?.querySelector('i');
            if (defaultIcon) defaultIcon.style.display = 'flex';
        }
        
        if (data.away_logo) {
            awayImg.src = data.away_logo;
            awayImg.style.display = 'block';
            const defaultIcon = awayCrest?.querySelector('i');
            if (defaultIcon) defaultIcon.style.display = 'none';
            awayImg.onerror = function() {
                this.style.display = 'none';
                if (defaultIcon) defaultIcon.style.display = 'flex';
            };
        } else {
            awayImg.style.display = 'none';
            const defaultIcon = awayCrest?.querySelector('i');
            if (defaultIcon) defaultIcon.style.display = 'flex';
        }

        // 比分
        matchScore.textContent = `${homeScore} : ${awayScore}`;

        // 结果徽章
        if (homeScore > awayScore) {
            matchResult.textContent = 'WIN';
            matchResult.className = 'match-result win';
            matchResult.style.display = 'inline-block';
        } else if (homeScore < awayScore) {
            matchResult.textContent = 'LOSS';
            matchResult.className = 'match-result loss';
            matchResult.style.display = 'inline-block';
        } else if (homeScore === awayScore && (homeScore > 0 || awayScore > 0)) {
            matchResult.textContent = 'DRAW';
            matchResult.className = 'match-result draw';
            matchResult.style.display = 'inline-block';
        } else {
            matchResult.style.display = 'none';
        }

        // 联赛
        matchLeague.textContent = data.league || 'Unknown League';

        // 比赛时间
        matchTime.textContent = formatDateTime(data.match_time);

        // 比赛状态
        const statusMap = {
            'completed': 'Completed',
            'settled': 'Settled',
            'ongoing': 'Live',
            'pending': 'Upcoming'
        };
        matchStatus.textContent = statusMap[data.status] || data.status || 'Completed';

        // 报告文本
        if (data.report_text) {
            reportText.textContent = data.report_text;
        } else {
            reportText.textContent = 'No report content available for this match.';
        }
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
    }

    function copyReport() {
        const text = reportText?.textContent;
        if (!text || text === 'Loading...') {
            showToast('No content to copy');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast('Report copied');
        }).catch(() => {
            showToast('Copy failed');
        });
    }

    function downloadReport() {
        const text = reportText?.textContent;
        if (!text || text === 'Loading...') {
            showToast('No content to download');
            return;
        }
        const blob = new Blob([text], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `footrada_report_${matchId}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Report downloaded');
    }

    // 绑定事件
    if (copyBtn) copyBtn.addEventListener('click', copyReport);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadReport);

    // 主题初始化
    if (window.ThemeManager) {
        ThemeManager.init(true);
    }

    // 开始加载
    if (matchId) {
        loadReport();
    } else {
        showError('Missing match ID');
    }
})();