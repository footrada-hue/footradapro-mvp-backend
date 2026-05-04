/**
 * FOOTRADAPRO - Authorize Controller
 * Authorization Page Controller - Supports global mode switching (Test Mode/Live Mode)
 * ThemeManager listener mechanism consistent with match page
 * 
 * @i18n All user-facing text is in English with data-i18n attributes for future translation
 */

(function() {
    'use strict';

    // ==================== Helper: Show Alert with i18n support ====================
    function showAlert(messageKey, defaultMessage) {
        // For now, show default English message
        // Later: use i18n system to translate messageKey
        alert(defaultMessage);
    }

    // ==================== Get URL Parameters ====================
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');

    // ==================== State Management ====================
    const state = {
        match: null,
        userBalance: 0,
        testBalance: 0,
        amount: 100,
        minAmount: 100,
        maxAmount: 500,
        executionRate: 30,
        countdownTimer: null,
        isTestMode: false
    };

    // ==================== DOM Elements ====================
    const DOM = {
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        matchContent: document.getElementById('matchContent'),
        
        // Match Info
        matchTeams: document.getElementById('matchTeams'),
        matchLeague: document.getElementById('matchLeague'),
        matchTime: document.getElementById('matchTime'),
        
        // Team Logos
        homeLogo: document.getElementById('homeLogo'),
        awayLogo: document.getElementById('awayLogo'),
        homeLogoContainer: document.getElementById('homeLogoContainer'),
        awayLogoContainer: document.getElementById('awayLogoContainer'),
        homeTeamAbbr: document.getElementById('homeTeamAbbr'),
        awayTeamAbbr: document.getElementById('awayTeamAbbr'),
        
        // User Info
        userBalance: document.getElementById('userBalance'),
        balanceCurrency: document.getElementById('balanceCurrency'),
        
        // Authorization Form
        amountInput: document.getElementById('amount'),
        authorizeBtn: document.getElementById('authorizeBtn'),
        
        // Success Modal
        successModal: document.getElementById('successModal'),
        successTeams: document.getElementById('successTeams'),
        successAmount: document.getElementById('successAmount'),
        viewDetailsBtn: document.getElementById('viewDetailsBtn'),
        continueBtn: document.getElementById('continueBtn'),
        
        // Ticker
        tickerContent: document.getElementById('tickerContent')
    };

    // ==================== Update Test Mode UI ====================
    function updateTestModeUI() {
        if (state.isTestMode) {
            document.body.classList.add('test-mode');
            if (DOM.balanceCurrency) DOM.balanceCurrency.textContent = 'tUSDT';
        } else {
            document.body.classList.remove('test-mode');
            if (DOM.balanceCurrency) DOM.balanceCurrency.textContent = 'USDT';
        }
        
        const balance = state.isTestMode ? state.testBalance : state.userBalance;
        if (DOM.userBalance) {
            const numBalance = typeof balance === 'number' ? balance : parseFloat(balance) || 0;
            DOM.userBalance.textContent = numBalance.toFixed(2);
        }
        
        console.log('🎨 Authorization page mode update:', state.isTestMode ? 'Test Mode (Blue)' : 'Live Mode (Orange)');
    }

    // ==================== Load User Balance (by mode) ====================
    async function loadUserBalance() {
        try {
            const balanceRes = await fetch('/api/v1/user/balance', {
                credentials: 'include'
            });
            const balanceData = await balanceRes.json();
            
            if (balanceData.success) {
                state.userBalance = parseFloat(balanceData.data.balance) || 0;
                state.testBalance = parseFloat(balanceData.data.test_balance) || 0;
                
                const modeRes = await fetch('/api/v1/user/mode', {
                    credentials: 'include'
                });
                const modeData = await modeRes.json();
                state.isTestMode = modeData.success ? modeData.data.is_test_mode : false;
                
                console.log('💰 Balance loaded:', {
                    isTestMode: state.isTestMode,
                    userBalance: state.userBalance,
                    testBalance: state.testBalance
                });
                
                updateTestModeUI();
                
                const currentBalance = state.isTestMode ? state.testBalance : state.userBalance;
                state.minAmount = state.match?.min_authorization || 100;
                state.maxAmount = Math.min(state.match?.match_limit || 500, currentBalance);
                
                if (DOM.amountInput) {
                    DOM.amountInput.min = state.minAmount;
                    DOM.amountInput.max = state.maxAmount;
                    DOM.amountInput.value = Math.min(state.minAmount, state.maxAmount);
                    state.amount = Math.min(state.minAmount, state.maxAmount);
                }
            }
        } catch (error) {
            console.error('Failed to load user balance:', error);
        }
    }

    // ==================== Load Match Details ====================
    async function loadMatchDetails() {
        try {
            showLoading(true);
            
            const checkResponse = await fetch(`/api/v1/user/authorize/check/${matchId}`, {
                credentials: 'include'
            });
            const checkResult = await checkResponse.json();
            
            if (!checkResult.success || !checkResult.available) {
                let errorMsg = 'Authorization unavailable for this match';
                if (checkResult.reason === 'MATCH_STARTED') errorMsg = 'Match has already started';
                if (checkResult.reason === 'MATCH_NOT_UPCOMING') errorMsg = 'Match status not available for authorization';
                if (checkResult.reason === 'MATCH_NOT_FOUND') errorMsg = 'Match not found';
                
                showError(errorMsg);
                return;
            }
            
            const response = await fetch(`/api/v1/matches/${matchId}`, {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success) {
                state.match = result.data;
                renderMatchDetails();
                startCountdown();
                showLoading(false);
            } else {
                showError('Match not found');
            }
        } catch (error) {
            console.error('Failed to load match details:', error);
            showError('Failed to load, please try again');
        }
    }

    // ==================== Render Match Details ====================
    function renderMatchDetails() {
        if (!state.match) return;
        
        const match = state.match;
        
        if (DOM.matchTeams) {
            DOM.matchTeams.textContent = `${match.home_team} vs ${match.away_team}`;
        }
        
        if (DOM.matchLeague) {
            DOM.matchLeague.textContent = match.league || 'Unknown League';
        }
        
        if (DOM.matchTime) {
            if (window.FOOTRADAPRO_TIME) {
                DOM.matchTime.textContent = FOOTRADAPRO_TIME.formatLocal(match.match_time);
            } else {
                try {
                    const matchDate = new Date(match.match_time);
                    if (!isNaN(matchDate.getTime())) {
                        DOM.matchTime.textContent = matchDate.toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                    } else {
                        DOM.matchTime.textContent = 'Date TBD';
                    }
                } catch (e) {
                    DOM.matchTime.textContent = 'Date TBD';
                }
            }
        }
        
        if (DOM.homeTeamAbbr) {
            DOM.homeTeamAbbr.textContent = getTeamAbbr(match.home_team);
        }
        if (DOM.awayTeamAbbr) {
            DOM.awayTeamAbbr.textContent = getTeamAbbr(match.away_team);
        }
        
        if (match.home_logo && DOM.homeLogo && DOM.homeLogoContainer) {
            DOM.homeLogo.src = match.home_logo;
            DOM.homeLogo.style.display = 'block';
            const defaultIcon = DOM.homeLogoContainer.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'none';
        }
        
        if (match.away_logo && DOM.awayLogo && DOM.awayLogoContainer) {
            DOM.awayLogo.src = match.away_logo;
            DOM.awayLogo.style.display = 'block';
            const defaultIcon = DOM.awayLogoContainer.querySelector('.default-logo');
            if (defaultIcon) defaultIcon.style.display = 'none';
        }
        
        state.executionRate = match.execution_rate || 30;
    }

    // ==================== Team Abbreviation ====================
    function getTeamAbbr(teamName) {
        if (!teamName) return '---';
        return teamName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || '---';
    }

    // ==================== Countdown ====================
    function startCountdown() {
        if (!state.match) return;
        
        let matchTime;
        try {
            matchTime = new Date(state.match.match_time);
            if (isNaN(matchTime.getTime())) {
                console.warn('Invalid match time:', state.match.match_time);
                return;
            }
        } catch (e) {
            console.error('Failed to parse match time:', e);
            return;
        }
        
        function updateCountdown() {
            const now = new Date();
            const diffMs = matchTime - now;
            
            let countdownEl = document.querySelector('.countdown-display');
            
            if (!countdownEl) {
                const matchCard = document.querySelector('.match-card');
                if (matchCard) {
                    const countdownDiv = document.createElement('div');
                    countdownDiv.className = 'countdown-container';
                    countdownDiv.innerHTML = `
                        <div class="countdown-label">
                            <i class="fas fa-clock"></i>
                            <span data-i18n="match_starts_in">Match starts in</span>
                        </div>
                        <div class="countdown-display">00:00:00</div>
                    `;
                    matchCard.appendChild(countdownDiv);
                    countdownEl = countdownDiv.querySelector('.countdown-display');
                }
            }
            
            if (diffMs <= 0) {
                if (countdownEl) {
                    countdownEl.innerHTML = 'Match in progress';
                    countdownEl.style.color = 'var(--danger-500)';
                }
                
                if (DOM.authorizeBtn) {
                    DOM.authorizeBtn.disabled = true;
                    DOM.authorizeBtn.innerHTML = '<i class="fas fa-lock"></i> <span data-i18n="match_started">Match Started</span>';
                }
                
                if (state.countdownTimer) {
                    clearInterval(state.countdownTimer);
                    state.countdownTimer = null;
                }
                return;
            }
            
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            
            if (countdownEl) {
                countdownEl.innerHTML = 
                    `${hours.toString().padStart(2, '0')}:` +
                    `${minutes.toString().padStart(2, '0')}:` +
                    `${seconds.toString().padStart(2, '0')}`;
            }
        }
        
        updateCountdown();
        state.countdownTimer = setInterval(updateCountdown, 1000);
    }

    // ==================== Initialize Event Listeners ====================
    function initEventListeners() {
        if (DOM.amountInput) {
            DOM.amountInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value) || state.minAmount;
                
                if (value < state.minAmount) value = state.minAmount;
                if (value > state.maxAmount) value = state.maxAmount;
                
                DOM.amountInput.value = value;
                state.amount = value;
            });
        }
        
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = e.target.dataset.amount;
                
                if (amount === 'max') {
                    state.amount = state.maxAmount;
                } else {
                    state.amount = parseInt(amount);
                }
                
                if (state.amount > state.maxAmount) state.amount = state.maxAmount;
                if (state.amount < state.minAmount) state.amount = state.minAmount;
                
                if (DOM.amountInput) {
                    DOM.amountInput.value = state.amount;
                }
            });
        });
        
        if (DOM.authorizeBtn) {
            DOM.authorizeBtn.addEventListener('click', submitAuthorization);
        }
        
        if (DOM.viewDetailsBtn) {
            DOM.viewDetailsBtn.addEventListener('click', () => {
                const authId = localStorage.getItem('lastAuthId');
                if (authId) {
                    window.location.href = '/transaction-detail.html?authId=' + authId;
                }
            });
        }
        
        if (DOM.continueBtn) {
            DOM.continueBtn.addEventListener('click', () => {
                window.location.href = '/match-market.html';
            });
        }
    }

    // ==================== Submit Authorization ====================
    async function submitAuthorization() {
        if (!state.match) return;
        
        const now = new Date();
        let matchTime;
        try {
            matchTime = new Date(state.match.match_time);
            if (isNaN(matchTime.getTime())) {
                throw new Error('Invalid match time');
            }
        } catch (e) {
            showAlert('invalid_match_time', 'Invalid match time');
            return;
        }
        
        if (now >= matchTime) {
            showAlert('match_started_cannot_authorize', 'Match has already started, cannot authorize');
            return;
        }
        
        const currentBalance = state.isTestMode ? state.testBalance : state.userBalance;
        if (state.amount > currentBalance) {
            showAlert('insufficient_balance', 'Insufficient balance');
            return;
        }
        
        DOM.authorizeBtn.disabled = true;
        DOM.authorizeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="processing">Processing...</span>';
        
        try {
            const response = await fetch('/api/v1/user/authorize/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    matchId: state.match.id,
                    amount: state.amount
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                localStorage.setItem('lastAuthId', result.data.authId);
                
                if (DOM.loadingState) DOM.loadingState.style.display = 'none';
                if (DOM.matchContent) DOM.matchContent.style.display = 'none';
                
                if (DOM.successModal) {
                    DOM.successModal.style.display = 'flex';
                    DOM.successModal.classList.add('show');
                    
                    if (DOM.successTeams) {
                        DOM.successTeams.textContent = `${state.match.home_team} vs ${state.match.away_team}`;
                    }
                    
                    if (DOM.successAmount) {
                        const deployed = result.data.deployed_amount || 0;
                        const currency = state.isTestMode ? 'tUSDT' : 'USDT';
                        // English version with i18n data attributes
                        DOM.successAmount.innerHTML = `
                            <div data-i18n="authorized_amount_label">Authorized Amount:</div>
                            <div style="font-weight: 600; margin-bottom: 8px;">${state.amount} ${currency}</div>
                            <div data-i18n="deployed_amount_label" style="font-size: 14px; color: var(--text-secondary);">Deployed Amount:</div>
                            <div style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">${deployed.toFixed(2)} ${currency} (${state.executionRate}%)</div>
                        `;
                    }
                }
                
                DOM.authorizeBtn.disabled = false;
                DOM.authorizeBtn.innerHTML = '<i class="fas fa-bolt"></i> <span data-i18n="confirm_authorization">Confirm Authorization</span>';
            } else {
                let errorMsg = result.error || 'Authorization failed';
                if (result.error === 'MATCH_STARTED') errorMsg = 'Match has already started, cannot authorize';
                if (result.error === 'INSUFFICIENT_BALANCE') errorMsg = 'Insufficient balance';
                
                showAlert('authorization_failed', errorMsg);
                
                DOM.authorizeBtn.disabled = false;
                DOM.authorizeBtn.innerHTML = '<i class="fas fa-bolt"></i> <span data-i18n="confirm_authorization">Confirm Authorization</span>';
            }
        } catch (error) {
            console.error('Authorization failed:', error);
            showAlert('authorization_error', 'Authorization failed, please try again');
            
            DOM.authorizeBtn.disabled = false;
            DOM.authorizeBtn.innerHTML = '<i class="fas fa-bolt"></i> <span data-i18n="confirm_authorization">Confirm Authorization</span>';
        }
    }

    // ==================== Initialize Ticker ====================
    function initTicker() {
        // All ticker messages in English with i18n keys
        const messages = [
            { key: 'ticker_1', text: '⚡ Manchester City 2-1 Liverpool • Real-time strategy update' },
            { key: 'ticker_2', text: '📊 Champions League final authorization volume exceeds 50,000 USDT' },
            { key: 'ticker_3', text: '🔔 Arsenal vs Chelsea authorization countdown: 2 hours' },
            { key: 'ticker_4', text: '💰 Total weekly authorization volume reached 1.2M USDT' }
        ];
        
        let index = 0;
        if (DOM.tickerContent) {
            DOM.tickerContent.innerHTML = messages.map(m => 
                `<span class="ticker-item" data-i18n="${m.key}">${m.text}</span>`
            ).join('');
            
            setInterval(() => {
                const ticker = DOM.tickerContent;
                if (ticker) {
                    index = (index + 1) % messages.length;
                    ticker.style.transform = `translateX(-${index * 200}px)`;
                }
            }, 3000);
        }
    }

    // ==================== Show Loading State ====================
    function showLoading(isLoading) {
        if (DOM.loadingState) {
            DOM.loadingState.style.display = isLoading ? 'flex' : 'none';
        }
        if (DOM.matchContent) {
            DOM.matchContent.style.display = isLoading ? 'none' : 'block';
        }
        if (DOM.errorState) {
            DOM.errorState.style.display = 'none';
        }
    }

    // ==================== Show Error ====================
    function showError(message) {
        if (DOM.loadingState) DOM.loadingState.style.display = 'none';
        if (DOM.matchContent) DOM.matchContent.style.display = 'none';
        if (DOM.errorState) {
            DOM.errorState.style.display = 'flex';
            const errorMsg = DOM.errorState.querySelector('p');
            if (errorMsg) {
                errorMsg.setAttribute('data-i18n', 'error_message');
                errorMsg.textContent = message || 'Match not found';
            }
        }
    }

    // ==================== Cleanup ====================
    window.addEventListener('beforeunload', () => {
        if (state.countdownTimer) {
            clearInterval(state.countdownTimer);
        }
    });

    // ==================== Listen to ThemeManager Mode Changes ====================
    function initThemeManagerListener() {
        if (window.ThemeManager) {
            state.isTestMode = ThemeManager.isTestMode;
            updateTestModeUI();
            
            ThemeManager.addListener((newState) => {
                console.log('🎨 Authorization page received mode change:', newState);
                state.isTestMode = newState.isTestMode;
                updateTestModeUI();
                loadUserBalance();
            });
        } else {
            console.warn('⚠️ ThemeManager not loaded, will fetch mode via API');
        }
    }

    // ==================== Initialize ====================
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('🎯 Authorize Controller initialized');
        
        if (!matchId) {
            showError('Missing match ID');
            return;
        }
        
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            state.isTestMode = ThemeManager.isTestMode;
            console.log('✅ Authorization page ThemeManager initialized, current mode:', state.isTestMode ? 'Test' : 'Live');
        }
        
        await loadMatchDetails();
        await loadUserBalance();
        initEventListeners();
        initTicker();
        initThemeManagerListener();
    });

})();