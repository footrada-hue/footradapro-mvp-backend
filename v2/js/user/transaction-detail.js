/**
 * FOOTRADAPRO - Transaction Detail Controller
 * Optimized version: Supports global time utility, dynamic status cards, report preview, match countdown
 * Supports loading data from matchId or authId, displays team logos correctly
 * @feature Supports sandbox users, displays test mode badge, integrates report viewing
 * @version 2.1.0
 * @since 2026-03-29
 * 
 * 文案优化：
 * - Authorization Amount: 授权金额
 * - AI Allocation Ratio: AI 分配比例
 * - Active AI Deployment: AI 主动部署
 * - AI Strategy Reserve: AI 策略储备
 * - AI Analysis Report: AI 分析报告
 * - Strategy Fee: 策略管理费
 * - AI Deployment Return: AI 部署收益
 * - Reserve Return: 策略储备返还
 */

(function() {
    'use strict';

    if (!window.FOOTRADAPRO) {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    // Ensure time utility is loaded
    if (!window.FOOTRADAPRO_TIME) {
        console.warn('FOOTRADAPRO_TIME not loaded, using fallback');
    }
    const TIME = window.FOOTRADAPRO_TIME;
    const UTILS = window.FOOTRADAPRO.UTILS;

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authId = urlParams.get('authId');
    const matchId = urlParams.get('matchId');

    // ==================== DOM Elements ====================
    const DOM = {
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        detailContent: document.getElementById('detailContent'),
        
        // Transaction ID
        authIdEl: document.getElementById('authId'),
        
        // Match Info
        matchTeams: document.getElementById('matchTeams'),
        matchLeague: document.getElementById('matchLeague'),
        matchDate: document.getElementById('matchDate'),
        
        // Team logos
        homeTeamAbbr: document.getElementById('homeTeamAbbr'),
        awayTeamAbbr: document.getElementById('awayTeamAbbr'),
        homeLogo: document.getElementById('homeLogo'),
        awayLogo: document.getElementById('awayLogo'),
        homeLogoContainer: document.getElementById('homeLogoContainer'),
        awayLogoContainer: document.getElementById('awayLogoContainer'),
        
        // Status Card
        statusCard: document.getElementById('statusCard'),
        
        // Countdown container
        countdownContainer: document.getElementById('countdownContainer'),
        matchCountdown: document.getElementById('matchCountdown'),
        
        // Authorization Details (Updated labels)
        authAmount: document.getElementById('authAmount'),
        executionRate: document.getElementById('executionRate'),      // AI Allocation Ratio
        deployedAmount: document.getElementById('deployedAmount'),    // Active AI Deployment
        reservedAmount: document.getElementById('reservedAmount'),    // AI Strategy Reserve
        authTime: document.getElementById('authTime'),
        
        // Settlement Cards (Updated labels)
        settlementCard: document.getElementById('settlementCard'),
        resultText: document.getElementById('resultText'),
        profitRateText: document.getElementById('profitRateText'),    // Return Rate
        deployedProfit: document.getElementById('deployedProfit'),    // AI Deployment Return
        platformFee: document.getElementById('platformFee'),          // Strategy Fee
        netProfit: document.getElementById('netProfit'),              // Net Profit
        deployedReturn: document.getElementById('deployedReturn'),    // Deployment Return
        reservedReturn: document.getElementById('reservedReturn'),    // Reserve Return
        finalReturn: document.getElementById('finalReturn'),          // Final Return
        settledAt: document.getElementById('settledAt'),
        // 新增的字段
authAmountDetail: document.getElementById('authAmountDetail'),
executionRateDetail: document.getElementById('executionRateDetail'),
deployedAmountDetail: document.getElementById('deployedAmountDetail'),
reservedAmountDetail: document.getElementById('reservedAmountDetail'),
        
        // Progress Section
        progressSection: document.getElementById('progressSection'),
        
        // Report section
        reportSectionNew: document.getElementById('reportSectionNew'),
        viewFullReportBtn: document.getElementById('viewFullReportBtn'),
        reportPreviewContent: document.getElementById('reportPreviewContent'),
        
        // Legacy report elements (backward compatibility)
        reportPreviewSection: document.getElementById('reportPreviewSection'),
        reportScore: document.getElementById('reportScore'),
        reportPossession: document.getElementById('reportPossession'),
        reportShots: document.getElementById('reportShots'),
        reportAISummary: document.getElementById('reportAISummary'),
        viewReportFromPreview: document.getElementById('viewReportFromPreview'),
        
        // Report Button (fallback)
        reportSection: document.getElementById('reportSection'),
        viewReportBtn: document.getElementById('viewReportBtn'),
        
        // Chat
        chatButton: document.getElementById('chatButton'),
        
        // Test mode badge
        testModeBadge: document.getElementById('testModeBadge'),
        
        // Currency symbols
        currencySymbols: document.querySelectorAll('.currency')
    };

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
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return '-';
    }
}

function formatShortDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return '-';
    }
}

    function getTeamAbbr(teamName) {
        if (!teamName) return '---';
        const words = teamName.split(' ');
        if (words.length > 1) {
            return words.map(w => w[0]).join('').toUpperCase().substring(0, 3);
        }
        return teamName.substring(0, 3).toUpperCase();
    }

    // ==================== Countdown Function ====================
function startCountdown(matchTime) {
    if (!DOM.matchCountdown || !DOM.countdownContainer) return null;
    
    let timer = null;
    
    function updateCountdown() {
        const now = new Date();
        const match = new Date(matchTime);
        const diffMs = match - now;
        
        if (diffMs <= 0) {
            if (DOM.matchCountdown) {
                DOM.matchCountdown.innerHTML = 'Match in progress';
            }
            if (DOM.countdownContainer) {
                DOM.countdownContainer.style.background = 'rgba(245, 158, 11, 0.1)';
                DOM.countdownContainer.style.borderColor = 'var(--warning-500)';
            }
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            return;
        }
        
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        if (DOM.matchCountdown) {
            if (days > 0) {
                DOM.matchCountdown.innerHTML = `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                DOM.matchCountdown.innerHTML = 
                    `${hours.toString().padStart(2, '0')}:` +
                    `${minutes.toString().padStart(2, '0')}:` +
                    `${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
    
    updateCountdown();
    timer = setInterval(updateCountdown, 1000);
    return timer;
}

    // ==================== Check Required DOM Elements ====================
    function checkRequiredElements() {
        const required = [
            'authIdEl', 'matchTeams', 'matchLeague', 'matchDate',
            'authAmount', 'executionRate', 'deployedAmount', 'reservedAmount', 'authTime',
            'settlementCard', 'statusCard'
        ];
        
        const missing = [];
        required.forEach(key => {
            if (!DOM[key]) {
                missing.push(key);
            }
        });
        
        if (missing.length > 0) {
            console.error('Missing DOM elements:', missing);
            return false;
        }
        return true;
    }

    // ==================== Initialize ====================
    document.addEventListener('DOMContentLoaded', async function() {
        if (!authId && !matchId) {
            showError('Missing transaction or match ID');
            return;
        }
        
        if (!checkRequiredElements()) {
            console.error('Critical DOM elements missing');
            return;
        }
        
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ ThemeManager initialized, current mode:', ThemeManager.isTestMode ? 'Test' : 'Live');
            updateModeUI(ThemeManager.isTestMode);
        }
        
        loadTransactionDetail();
        initChatWidget();
        initBackButton();
        
        if (window.ThemeManager) {
            ThemeManager.addListener((state) => {
                console.log('🎨 Transaction detail received theme change:', state);
                updateModeUI(state.isTestMode);
                loadTransactionDetail();
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

    // ==================== Load Transaction Detail ====================
    async function loadTransactionDetail() {
        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            let apiUrl;
            if (authId) {
                apiUrl = `/api/v1/user/transactions/${authId}?mode=${mode}`;
            } else if (matchId) {
                apiUrl = `/api/v1/matches/${matchId}?mode=${mode}`;
            }
            
            const response = await fetch(apiUrl, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                renderDetail(result.data);
                DOM.loadingState.style.display = 'none';
                DOM.detailContent.style.display = 'block';
            } else {
                showError(result.message || 'Failed to load transaction details');
            }
        } catch (err) {
            console.error('Failed to load transaction:', err);
            showError('Network error. Please try again.');
        }
    }

    // ==================== Render Detail ====================
    function renderDetail(data) {
        window.currentTransactionData = data;
        const isTestMode = data.is_test_mode || false;
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        
        if (isTestMode && DOM.testModeBadge) {
            DOM.testModeBadge.style.display = 'inline-flex';
        }

        if (DOM.authIdEl) {
            DOM.authIdEl.textContent = data.auth_id || data.match_id || authId || matchId || '-';
        }
        
        if (DOM.matchTeams) {
            DOM.matchTeams.textContent = `${data.home_team || 'Home'} vs ${data.away_team || 'Away'}`;
        }
        if (DOM.matchLeague) {
            DOM.matchLeague.textContent = data.league || 'Unknown League';
        }
        if (DOM.matchDate) {
            DOM.matchDate.textContent = formatShortDate(data.match_time);
        }
        
        if (DOM.homeTeamAbbr) {
            DOM.homeTeamAbbr.textContent = getTeamAbbr(data.home_team);
        }
        if (DOM.awayTeamAbbr) {
            DOM.awayTeamAbbr.textContent = getTeamAbbr(data.away_team);
        }
        
        // Team logos handling
        if (data.home_logo && DOM.homeLogo && DOM.homeLogoContainer) {
            DOM.homeLogo.src = data.home_logo;
            DOM.homeLogo.style.display = 'block';
            DOM.homeLogo.onerror = function() {
                this.style.display = 'none';
                const defaultIcon = DOM.homeLogoContainer?.querySelector('.default-logo');
                if (defaultIcon) defaultIcon.style.display = 'flex';
            };
            const defaultIcon = DOM.homeLogoContainer?.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'none';
        } else {
            const defaultIcon = DOM.homeLogoContainer?.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'flex';
            if (DOM.homeLogo) DOM.homeLogo.style.display = 'none';
        }
        
        if (data.away_logo && DOM.awayLogo && DOM.awayLogoContainer) {
            DOM.awayLogo.src = data.away_logo;
            DOM.awayLogo.style.display = 'block';
            DOM.awayLogo.onerror = function() {
                this.style.display = 'none';
                const defaultIcon = DOM.awayLogoContainer?.querySelector('.default-logo');
                if (defaultIcon) defaultIcon.style.display = 'flex';
            };
            const defaultIcon = DOM.awayLogoContainer?.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'none';
        } else {
            const defaultIcon = DOM.awayLogoContainer?.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'flex';
            if (DOM.awayLogo) DOM.awayLogo.style.display = 'none';
        }
        
        // AI Strategy Allocation (Authorization Details)
        if (data.amount !== undefined) {
            const amount = Number(data.amount) || 0;
            const rate = Number(data.execution_rate) || 30;
            const deployed = amount * rate / 100;
            const reserved = amount - deployed;
            
            if (DOM.authAmount) {
                DOM.authAmount.textContent = formatAmount(amount) + ' ' + currency;
            }
            if (DOM.executionRate) {
                DOM.executionRate.textContent = rate + '%';
            }
            if (DOM.deployedAmount) {
                DOM.deployedAmount.textContent = formatAmount(deployed) + ' ' + currency;
            }
            if (DOM.reservedAmount) {
                DOM.reservedAmount.textContent = formatAmount(reserved) + ' ' + currency;
            }
            if (DOM.authTime) {
                DOM.authTime.textContent = formatDate(data.created_at || data.match_time);
            }
        } else {
            if (DOM.authAmount) DOM.authAmount.textContent = '—';
            if (DOM.executionRate) DOM.executionRate.textContent = (data.execution_rate || 30) + '%';
            if (DOM.authTime) DOM.authTime.textContent = formatDate(data.match_time);
        }
        
        const isPending = data.status === 'pending' || data.status === 'upcoming' || data.status === 'ongoing';
        const isSettled = data.status === 'settled' || data.status === 'completed' || data.profit !== undefined;
        const isWon = data.profit > 0;
        
        if (DOM.progressSection) {
            DOM.progressSection.style.display = 'none';
        }
        
        // Hide report sections initially
        if (DOM.reportPreviewSection) {
            DOM.reportPreviewSection.style.display = 'none';
        }
        if (DOM.reportSection) {
            DOM.reportSection.style.display = 'none';
        }
        if (DOM.reportSectionNew) {
            DOM.reportSectionNew.style.display = 'none';
        }
        
        if (isPending) {
            renderPendingStatus();
            if (DOM.settlementCard) DOM.settlementCard.style.display = 'none';
            
            if (DOM.countdownContainer && data.match_time) {
                DOM.countdownContainer.style.display = 'block';
                startCountdown(data.match_time);
            }
        } else if (isSettled) {
            renderSettledStatus(isWon);
            if (DOM.settlementCard) DOM.settlementCard.style.display = 'block';
            
            const profit = Number(data.profit) || 0;
            const amount = Number(data.amount) || 0;
            const rate = Number(data.execution_rate) || 30;
            const deployed = amount * rate / 100;
            const reserved = amount - deployed;
            const profitRate = data.profit_rate || (deployed > 0 ? (profit / deployed * 100).toFixed(2) : 0);
            const strategyFee = profit > 0 ? profit * 0.2 : 0;
            const netProfit = profit - strategyFee;
            const finalReturn = deployed + reserved + netProfit;
            
            // Settlement Details - Updated labels
            if (DOM.resultText) {
                DOM.resultText.textContent = profit > 0 ? 'Win' : 'Loss';
                DOM.resultText.className = 'detail-item-value ' + (profit > 0 ? 'positive' : 'negative');
            }
            
            if (DOM.authAmountDetail) {
    DOM.authAmountDetail.textContent = formatAmount(amount) + ' ' + currency;
}
if (DOM.executionRateDetail) {
    DOM.executionRateDetail.textContent = rate + '%';
}
if (DOM.deployedAmountDetail) {
    DOM.deployedAmountDetail.textContent = formatAmount(deployed) + ' ' + currency;
}
if (DOM.reservedAmountDetail) {
    DOM.reservedAmountDetail.textContent = formatAmount(reserved) + ' ' + currency;
}
            if (DOM.profitRateText) {
                DOM.profitRateText.textContent = profitRate + '%';
                DOM.profitRateText.className = 'detail-item-value ' + (profit > 0 ? 'positive' : 'negative');
            }
            
            if (DOM.deployedProfit) {
                DOM.deployedProfit.textContent = (profit > 0 ? '+' : '') + formatAmount(profit) + ' ' + currency;
                DOM.deployedProfit.className = 'detail-item-value ' + (profit > 0 ? 'positive' : 'negative');
            }
            
            if (DOM.platformFee) {
                DOM.platformFee.textContent = '- ' + formatAmount(strategyFee) + ' ' + currency;
            }
            
            if (DOM.netProfit) {
                DOM.netProfit.textContent = (netProfit > 0 ? '+' : '') + formatAmount(netProfit) + ' ' + currency;
                DOM.netProfit.className = 'detail-item-value ' + (netProfit > 0 ? 'positive' : 'negative');
            }
            
            if (DOM.deployedReturn) {
                DOM.deployedReturn.textContent = formatAmount(deployed) + ' ' + currency;
            }
            
            if (DOM.reservedReturn) {
                DOM.reservedReturn.textContent = formatAmount(reserved) + ' ' + currency;
            }
            
            if (DOM.finalReturn) {
                DOM.finalReturn.textContent = formatAmount(finalReturn) + ' ' + currency;
                DOM.finalReturn.className = 'detail-item-value highlight';
            }
            
            if (DOM.settledAt) {
                DOM.settledAt.textContent = formatDate(data.settled_at || data.updated_at);
            }
            
            checkReportAvailability(data.match_id || data.id);
        } else {
            renderUnknownStatus();
            if (DOM.settlementCard) DOM.settlementCard.style.display = 'none';
        }
    }

    // ==================== Check Report Availability ====================
    async function checkReportAvailability(matchId) {
        if (!matchId) {
            console.warn('No matchId provided for report check');
            return;
        }
        
        try {
            const response = await fetch(`/api/v1/user/report/${matchId}`, {
                method: 'HEAD',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.status === 200) {
                if (DOM.reportSectionNew) {
                    DOM.reportSectionNew.style.display = 'block';
                    
                    if (DOM.reportPreviewContent) {
                        DOM.reportPreviewContent.innerHTML = 'View the complete AI analysis and trading decisions that guided this authorization.';
                    }
                    
                    if (DOM.viewFullReportBtn) {
                        DOM.viewFullReportBtn.onclick = () => {
                            const currentAuthId = authId || (window.currentTransactionData?.auth_id);
                            let url = `/report-detail.html?match_id=${matchId}`;
                            if (currentAuthId) {
                                url += `&auth_id=${currentAuthId}`;
                            }
                            window.location.href = url;
                        };
                    }
                }
            } else {
                if (DOM.reportSectionNew) {
                    DOM.reportSectionNew.style.display = 'none';
                }
            }
        } catch (err) {
            console.error('Failed to check report availability:', err);
            if (DOM.reportSectionNew) {
                DOM.reportSectionNew.style.display = 'none';
            }
        }
        
        if (DOM.viewReportFromPreview) {
            DOM.viewReportFromPreview.onclick = () => {
                window.location.href = `/report-detail.html?match_id=${matchId}`;
            };
        }
        if (DOM.viewReportBtn) {
            DOM.viewReportBtn.onclick = () => {
                window.location.href = `/report-detail.html?match_id=${matchId}`;
            };
        }
    }

    // ==================== Render Pending Status ====================
    function renderPendingStatus() {
        if (!DOM.statusCard) return;
        
        DOM.statusCard.innerHTML = `
            <div class="status-card-pending">
                <div class="status-icon-large pending">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <div class="status-content">
                    <div class="status-title pending">Pending Settlement</div>
                    <div class="status-message">AI strategy is active. Waiting for match to complete.</div>
                </div>
            </div>
        `;
    }

    // ==================== Render Settled Status ====================
    function renderSettledStatus(isWon) {
        if (!DOM.statusCard) return;
        
        const statusClass = isWon ? 'won' : 'lost';
        const icon = isWon ? 'fa-check-circle' : 'fa-times-circle';
        const title = isWon ? 'Won' : 'Lost';
        const message = isWon ? 'AI strategy generated profit. Transaction settled.' : 'AI strategy incurred loss. Transaction settled.';
        
        DOM.statusCard.innerHTML = `
            <div class="status-card-settled status-card-${statusClass}">
                <div class="status-icon-large ${statusClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="status-content">
                    <div class="status-title ${statusClass}">${title}</div>
                    <div class="status-message">${message}</div>
                </div>
            </div>
        `;
    }

    // ==================== Render Unknown Status ====================
    function renderUnknownStatus() {
        if (!DOM.statusCard) return;
        
        DOM.statusCard.innerHTML = `
            <div class="status-card-unknown">
                <div class="status-icon-large unknown">
                    <i class="fas fa-question-circle"></i>
                </div>
                <div class="status-content">
                    <div class="status-title unknown">Unknown Status</div>
                    <div class="status-message">Unable to determine transaction status</div>
                </div>
            </div>
        `;
    }

    // ==================== Copy Transaction ID ====================
    window.copyTxId = function() {
        const textToCopy = document.getElementById('authId')?.textContent || authId || matchId || '';
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Transaction ID copied');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Transaction ID copied');
        });
    };

    function showToast(message) {
        let toast = document.querySelector('.toast-notification');
        if (toast) {
            toast.remove();
        }
        
        toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + message;
        document.body.appendChild(toast);
        
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = 'var(--success-500)';
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.style.zIndex = '9999';
        toast.style.animation = 'fadeInUp 0.3s ease';
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ==================== Show Error ====================
    function showError(message) {
        if (DOM.loadingState) DOM.loadingState.style.display = 'none';
        if (DOM.errorState) {
            DOM.errorState.style.display = 'block';
            const errorMsg = DOM.errorState.querySelector('p');
            if (errorMsg && message) {
                errorMsg.textContent = message;
            }
            
            const retryBtn = DOM.errorState.querySelector('button');
            if (retryBtn) {
                retryBtn.onclick = () => {
                    DOM.errorState.style.display = 'none';
                    DOM.loadingState.style.display = 'block';
                    loadTransactionDetail();
                };
            }
        }
    }

    // ==================== Chat Widget ====================
    function initChatWidget() {
        if (DOM.chatButton) {
            DOM.chatButton.addEventListener('click', () => {
                window.location.href = '/support.html';
            });
        }
    }

    // ==================== Back Button ====================
    function initBackButton() {
        const backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (document.referrer && document.referrer.includes(window.location.host)) {
                    window.history.back();
                } else {
                    window.location.href = '/';
                }
            });
        }
    }

    // ==================== Add Animation Styles ====================
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translate(-50%, 20px);
            }
            to {
                opacity: 1;
                transform: translate(-50%, 0);
            }
        }
        
        @keyframes fadeOut {
            from {
                opacity: 1;
                transform: translate(-50%, 0);
            }
            to {
                opacity: 0;
                transform: translate(-50%, 20px);
            }
        }
        
        .toast-notification {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .toast-notification i {
            font-size: 18px;
        }
    `;
    document.head.appendChild(style);
})();