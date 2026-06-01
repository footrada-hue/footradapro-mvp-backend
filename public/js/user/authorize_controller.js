/**
 * FOOTRADAPRO - Authorize Controller
 * @version 3.1.0
 * 修复金额输入逻辑
 */

(function() {
    'use strict';

    // ==================== 多语言配置 ====================
    const LOCALES = {
        zh: {
            'mode.sandbox': '沙盒模式',
            'mode.live': '实盘模式',
            'match.starts_in': '比赛开始倒计时',
            'match.started': '比赛已开始',
            'balance.title': '可用余额',
            'authorize.title': '授权金额',
            'button.authorize': '确认授权',
            'button.processing': '处理中...',
            'button.retry': '重试',
            'success.title': '授权成功！',
            'success.view_details': '查看详情',
            'success.continue': '继续',
            'error.load_failed': '加载比赛信息失败',
            'error.match_not_found': '比赛未找到',
            'error.match_started': '比赛已开始，无法授权',
            'error.insufficient_balance': '余额不足',
            'error.auth_failed': '授权失败，请重试',
            'error.amount_too_low': '授权金额不能低于 {min} {currency}',
            'error.amount_too_high': '授权金额不能超过 {max} {currency}',
            'toast.success': '授权提交成功'
        },
        en: {
            'mode.sandbox': 'Sandbox',
            'mode.live': 'Live',
            'match.starts_in': 'Match starts in',
            'match.started': 'Match Started',
            'balance.title': 'Available Balance',
            'authorize.title': 'Authorization Amount',
            'button.authorize': 'Confirm Authorization',
            'button.processing': 'Processing...',
            'button.retry': 'Retry',
            'success.title': 'Authorization Successful!',
            'success.view_details': 'View Details',
            'success.continue': 'Continue',
            'error.load_failed': 'Failed to load match details',
            'error.match_not_found': 'Match not found',
            'error.match_started': 'Match has already started',
            'error.insufficient_balance': 'Insufficient balance',
            'error.auth_failed': 'Authorization failed, please try again',
            'error.amount_too_low': 'Authorization amount cannot be less than {min} {currency}',
            'error.amount_too_high': 'Authorization amount cannot exceed {max} {currency}',
            'toast.success': 'Authorization submitted successfully'
        }
    };

    let currentLanguage = localStorage.getItem('language') || 'en';

    function t(key, params = {}) {
        const locale = LOCALES[currentLanguage] || LOCALES.en;
        let text = locale[key] || key;
        Object.keys(params).forEach(k => {
            text = text.replace(`{${k}}`, params[k]);
        });
        return text;
    }

    // ==================== URL 参数 ====================
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');

    // ==================== 状态管理 ====================
    const AppState = {
        match: null,
        userBalance: 0,
        testBalance: 0,
        amount: 100,
        minAmount: 100,
        maxAmount: 500,
        executionRate: 30,
        countdownTimer: null,
        isTestMode: false,
        isLoading: false
    };

    // ==================== DOM 元素 ====================
    const DOM = {
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        matchContent: document.getElementById('matchContent'),
        errorMessage: document.getElementById('errorMessage'),
        
        matchTeams: document.getElementById('matchTeams'),
        matchLeague: document.getElementById('matchLeague'),
        matchTime: document.getElementById('matchTime'),
        
        homeLogo: document.getElementById('homeLogo'),
        awayLogo: document.getElementById('awayLogo'),
        homeLogoContainer: document.getElementById('homeLogoContainer'),
        awayLogoContainer: document.getElementById('awayLogoContainer'),
        homeTeamAbbr: document.getElementById('homeTeamAbbr'),
        awayTeamAbbr: document.getElementById('awayTeamAbbr'),
        
        userBalance: document.getElementById('userBalance'),
        balanceCurrency: document.getElementById('balanceCurrency'),
        currencyUnit: document.getElementById('currencyUnit'),
        
        amountInput: document.getElementById('amount'),
        amountSlider: document.getElementById('amountSlider'),
        minAmountLabel: document.getElementById('minAmountLabel'),
        maxAmountLabel: document.getElementById('maxAmountLabel'),
        currentAmountDisplay: document.getElementById('currentAmountDisplay'),
        authorizeBtn: document.getElementById('authorizeBtn'),
        countdownDisplay: document.getElementById('countdownDisplay'),
        
        successModal: document.getElementById('successModal'),
        successTeams: document.getElementById('successTeams'),
        successAmount: document.getElementById('successAmount'),
        viewDetailsBtn: document.getElementById('viewDetailsBtn'),
        continueBtn: document.getElementById('continueBtn'),
        
        themeToggle: document.getElementById('themeToggle'),
        langToggle: document.getElementById('langToggle'),
        currentModeText: document.getElementById('currentModeText'),
        tickerContent: document.getElementById('tickerContent')
    };

    // ==================== 辅助函数 ====================
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function getTeamLogoUrl(logoUrl) {
        if (logoUrl && logoUrl !== '/uploads/teams/default.png') return logoUrl;
        return null;
    }

    function getTeamAbbr(teamName) {
        if (!teamName) return '---';
        const abbr = teamName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
        return abbr || '---';
    }

    function formatMatchTime(utcString) {
        if (!utcString) return 'Date TBD';
        try {
            const date = new Date(utcString);
            if (isNaN(date.getTime())) return 'Date TBD';
            return date.toLocaleString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch { return 'Date TBD'; }
    }

    // ==================== 更新 UI ====================
    function updateModeUI() {
        if (!DOM.currentModeText) return;
        const isSandbox = AppState.isTestMode;
        DOM.currentModeText.textContent = isSandbox ? t('mode.sandbox') : t('mode.live');
        DOM.currentModeText.className = isSandbox ? 'sandbox-text' : 'live-text';
        
        const currency = isSandbox ? 'tUSDT' : 'USDT';
        if (DOM.balanceCurrency) DOM.balanceCurrency.textContent = currency;
        if (DOM.currencyUnit) DOM.currencyUnit.textContent = currency;
        
        const balance = isSandbox ? AppState.testBalance : AppState.userBalance;
        if (DOM.userBalance) DOM.userBalance.textContent = balance.toFixed(2);
    }

    function renderMatchDetails() {
        if (!AppState.match) return;
        
        const match = AppState.match;
        
        if (DOM.matchTeams) {
            DOM.matchTeams.textContent = `${match.home_team} vs ${match.away_team}`;
        }
        if (DOM.matchLeague) {
            DOM.matchLeague.textContent = match.league || 'Unknown League';
        }
        if (DOM.matchTime) {
            DOM.matchTime.textContent = formatMatchTime(match.match_time);
        }
        
        const homeLogoUrl = getTeamLogoUrl(match.home_logo);
        const awayLogoUrl = getTeamLogoUrl(match.away_logo);
        
        if (DOM.homeLogo && DOM.homeLogoContainer) {
            if (homeLogoUrl) {
                DOM.homeLogo.src = homeLogoUrl;
                DOM.homeLogo.style.display = 'block';
                const defaultIcon = DOM.homeLogoContainer.querySelector('.default-logo');
                if (defaultIcon) defaultIcon.style.display = 'none';
                DOM.homeLogo.onerror = () => {
                    DOM.homeLogo.style.display = 'none';
                    if (defaultIcon) defaultIcon.style.display = 'flex';
                };
            }
        }
        
        if (DOM.awayLogo && DOM.awayLogoContainer) {
            if (awayLogoUrl) {
                DOM.awayLogo.src = awayLogoUrl;
                DOM.awayLogo.style.display = 'block';
                const defaultIcon = DOM.awayLogoContainer.querySelector('.default-logo');
                if (defaultIcon) defaultIcon.style.display = 'none';
                DOM.awayLogo.onerror = () => {
                    DOM.awayLogo.style.display = 'none';
                    if (defaultIcon) defaultIcon.style.display = 'flex';
                };
            }
        }
        
        if (DOM.homeTeamAbbr) DOM.homeTeamAbbr.textContent = getTeamAbbr(match.home_team);
        if (DOM.awayTeamAbbr) DOM.awayTeamAbbr.textContent = getTeamAbbr(match.away_team);
        
        AppState.executionRate = match.execution_rate || 30;
    }

    // ==================== 金额验证和更新 ====================
    function updateAmountLimits() {
        const currentBalance = AppState.isTestMode ? AppState.testBalance : AppState.userBalance;
        
        // 比赛限额和余额取最小值
        let maxAllowed = Math.min(AppState.maxAmount, currentBalance);
        
        // 确保不低于最小金额
        if (maxAllowed < AppState.minAmount) {
            maxAllowed = AppState.minAmount;
        }
        
        AppState.maxAmount = maxAllowed;
        
        // 更新 UI 显示
        if (DOM.minAmountLabel) {
            DOM.minAmountLabel.textContent = `${AppState.minAmount}`;
        }
        if (DOM.maxAmountLabel) {
            DOM.maxAmountLabel.textContent = `${AppState.maxAmount}`;
        }
        
        // 如果当前金额超出范围，调整
        if (AppState.amount < AppState.minAmount) {
            AppState.amount = AppState.minAmount;
        }
        if (AppState.amount > AppState.maxAmount) {
            AppState.amount = AppState.maxAmount;
        }
        
        // 更新输入框
        if (DOM.amountInput) {
            DOM.amountInput.min = AppState.minAmount;
            DOM.amountInput.max = AppState.maxAmount;
            DOM.amountInput.value = AppState.amount;
        }
        
        // 更新滑块
        if (DOM.amountSlider) {
            DOM.amountSlider.min = AppState.minAmount;
            DOM.amountSlider.max = AppState.maxAmount;
            DOM.amountSlider.value = AppState.amount;
        }
        
        // 更新显示
        updateAmountDisplay();
    }
    
    function updateAmountDisplay() {
        const currency = AppState.isTestMode ? 'tUSDT' : 'USDT';
        if (DOM.currentAmountDisplay) {
            DOM.currentAmountDisplay.textContent = `${AppState.amount} ${currency}`;
        }
    }
    
    function validateAmount(amount) {
        const currency = AppState.isTestMode ? 'tUSDT' : 'USDT';
        
        if (amount < AppState.minAmount) {
            showToast(t('error.amount_too_low', { min: AppState.minAmount, currency }), 'error');
            return false;
        }
        
        if (amount > AppState.maxAmount) {
            showToast(t('error.amount_too_high', { max: AppState.maxAmount, currency }), 'error');
            return false;
        }
        
        const currentBalance = AppState.isTestMode ? AppState.testBalance : AppState.userBalance;
        if (amount > currentBalance) {
            showToast(t('error.insufficient_balance'), 'error');
            return false;
        }
        
        return true;
    }
    
    function setAmount(value) {
        let newAmount = parseInt(value);
        if (isNaN(newAmount)) newAmount = AppState.minAmount;
        
        // 限制范围
        newAmount = Math.max(AppState.minAmount, Math.min(AppState.maxAmount, newAmount));
        
        AppState.amount = newAmount;
        
        // 更新输入框
        if (DOM.amountInput) DOM.amountInput.value = newAmount;
        if (DOM.amountSlider) DOM.amountSlider.value = newAmount;
        
        updateAmountDisplay();
    }
    
    function handleAmountInput(e) {
        let value = parseInt(e.target.value);
        if (isNaN(value)) value = AppState.minAmount;
        setAmount(value);
    }
    
    function handleAmountSlider(e) {
        let value = parseInt(e.target.value);
        if (isNaN(value)) value = AppState.minAmount;
        setAmount(value);
    }
    
    function handlePresetAmount(amount) {
        if (amount === 'max') {
            setAmount(AppState.maxAmount);
        } else {
            setAmount(parseInt(amount));
        }
    }

    // ==================== 倒计时 ====================
    function startCountdown() {
        if (!AppState.match || !AppState.match.match_time) return;
        
        const matchTime = new Date(AppState.match.match_time);
        if (isNaN(matchTime.getTime())) return;
        
        function updateCountdown() {
            const now = new Date();
            const diffMs = matchTime - now;
            
            if (diffMs <= 0) {
                if (DOM.countdownDisplay) {
                    DOM.countdownDisplay.textContent = t('match.started');
                    DOM.countdownDisplay.classList.add('started');
                }
                if (DOM.authorizeBtn) {
                    DOM.authorizeBtn.disabled = true;
                    DOM.authorizeBtn.innerHTML = `<i class="fas fa-lock"></i> ${t('match.started')}`;
                }
                if (AppState.countdownTimer) {
                    clearInterval(AppState.countdownTimer);
                    AppState.countdownTimer = null;
                }
                return;
            }
            
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            
            if (DOM.countdownDisplay) {
                DOM.countdownDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                DOM.countdownDisplay.classList.remove('started');
            }
        }
        
        updateCountdown();
        AppState.countdownTimer = setInterval(updateCountdown, 1000);
    }

    // ==================== 数据获取 ====================
    async function loadMatchDetails() {
        if (AppState.isLoading) return;
        AppState.isLoading = true;
        
        if (DOM.loadingState) DOM.loadingState.style.display = 'flex';
        if (DOM.matchContent) DOM.matchContent.style.display = 'none';
        if (DOM.errorState) DOM.errorState.style.display = 'none';
        
        try {
            const res = await APIClient.get(`/api/v1/matches/${matchId}`);
            const result = await res.json();
            
            if (result.success && result.data) {
                AppState.match = result.data;
                renderMatchDetails();
                startCountdown();
                
                // 更新金额限制
                AppState.minAmount = AppState.match.min_authorization || 100;
                AppState.maxAmount = AppState.match.match_limit || 500;
                
                updateAmountLimits();
                
                if (DOM.loadingState) DOM.loadingState.style.display = 'none';
                if (DOM.matchContent) DOM.matchContent.style.display = 'block';
            } else {
                throw new Error(result.error || 'Match not found');
            }
        } catch (error) {
            console.error('Failed to load match:', error);
            if (DOM.errorState) {
                DOM.errorState.style.display = 'flex';
                if (DOM.errorMessage) DOM.errorMessage.textContent = t('error.match_not_found');
            }
            if (DOM.loadingState) DOM.loadingState.style.display = 'none';
        } finally {
            AppState.isLoading = false;
        }
    }

    async function loadUserBalance() {
        try {
            const res = await APIClient.get('/api/v1/user/balance');
            const data = await res.json();
            
            if (data.success) {
                AppState.userBalance = parseFloat(data.data.balance) || 0;
                AppState.testBalance = parseFloat(data.data.test_balance) || 0;
                
                const modeRes = await APIClient.get('/api/v1/user/mode');
                const modeData = await modeRes.json();
                if (modeData.success) {
                    AppState.isTestMode = modeData.data.is_test_mode === true;
                    if (ThemeManager) ThemeManager.isTestMode = AppState.isTestMode;
                }
                
                updateModeUI();
                updateAmountLimits();
            }
        } catch (error) {
            console.error('Failed to load balance:', error);
        }
    }

    // ==================== 授权提交 ====================
    async function submitAuthorization() {
        if (!AppState.match) return;
        
        const matchTime = new Date(AppState.match.match_time);
        if (isNaN(matchTime.getTime()) || new Date() >= matchTime) {
            showToast(t('error.match_started'), 'error');
            return;
        }
        
        // 验证金额
        if (!validateAmount(AppState.amount)) {
            return;
        }
        
        if (DOM.authorizeBtn) {
            DOM.authorizeBtn.disabled = true;
            DOM.authorizeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('button.processing')}`;
        }
        
        try {
            const res = await APIClient.post('/api/v1/user/authorize/submit', {
                matchId: AppState.match.id,
                amount: AppState.amount
            });
            
            const result = await res.json();
            
            if (result.success) {
                localStorage.setItem('lastAuthId', result.data.authId);
                
                if (DOM.successModal) {
                    if (DOM.successTeams) {
                        DOM.successTeams.textContent = `${AppState.match.home_team} vs ${AppState.match.away_team}`;
                    }
                    if (DOM.successAmount) {
                        const currency = AppState.isTestMode ? 'tUSDT' : 'USDT';
                        DOM.successAmount.innerHTML = `
                            <div>Authorized Amount:</div>
                            <div style="font-weight: 700; font-size: var(--font-xl); margin-top: 8px;">${AppState.amount} ${currency}</div>
                            <div style="font-size: var(--font-xs); color: var(--text-muted); margin-top: 8px;">Deployed: ${(AppState.amount * AppState.executionRate / 100).toFixed(2)} ${currency} (${AppState.executionRate}%)</div>
                        `;
                    }
                    DOM.successModal.style.display = 'flex';
                }
                
                showToast(t('toast.success'), 'success');
            } else {
                let errorMsg = t('error.auth_failed');
                if (result.error === 'INSUFFICIENT_BALANCE') errorMsg = t('error.insufficient_balance');
                if (result.error === 'MATCH_STARTED') errorMsg = t('error.match_started');
                showToast(errorMsg, 'error');
            }
        } catch (error) {
            console.error('Authorization failed:', error);
            showToast(t('error.auth_failed'), 'error');
        } finally {
            if (DOM.authorizeBtn) {
                DOM.authorizeBtn.disabled = false;
                DOM.authorizeBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> ${t('button.authorize')}`;
            }
        }
    }

    // ==================== 事件绑定 ====================
function bindEvents() {
    // 金额预设按钮 - 确保正确绑定
    const presetBtns = document.querySelectorAll('.preset-btn');
    console.log('找到预设按钮数量:', presetBtns.length);
    
    presetBtns.forEach(btn => {
        // 移除旧事件避免重复
        btn.removeEventListener('click', handlePresetClick);
        btn.addEventListener('click', handlePresetClick);
    });
    
    // 金额输入框
    if (DOM.amountInput) {
        DOM.amountInput.removeEventListener('input', handleAmountInput);
        DOM.amountInput.addEventListener('input', handleAmountInput);
        DOM.amountInput.addEventListener('blur', () => {
            setAmount(parseInt(DOM.amountInput.value) || AppState.minAmount);
        });
    }
    
    // 金额滑块
    if (DOM.amountSlider) {
        DOM.amountSlider.removeEventListener('input', handleAmountSlider);
        DOM.amountSlider.addEventListener('input', handleAmountSlider);
    }
    
    // 授权按钮
    if (DOM.authorizeBtn) {
        DOM.authorizeBtn.removeEventListener('click', submitAuthorization);
        DOM.authorizeBtn.addEventListener('click', submitAuthorization);
    }
    
    // 模态框按钮
    if (DOM.viewDetailsBtn) {
        DOM.viewDetailsBtn.removeEventListener('click', () => {
            const authId = localStorage.getItem('lastAuthId');
            window.location.href = authId ? `/shell.html?page=transaction-detail&authId=${authId}` : '/shell.html?page=records';
        });
        DOM.viewDetailsBtn.addEventListener('click', () => {
            const authId = localStorage.getItem('lastAuthId');
            window.location.href = authId ? `/shell.html?page=transaction-detail&authId=${authId}` : '/shell.html?page=records';
        });
    }
    
    if (DOM.continueBtn) {
        DOM.continueBtn.removeEventListener('click', () => {
            window.location.href = '/shell.html?page=home';
        });
        DOM.continueBtn.addEventListener('click', () => {
            window.location.href = '/shell.html?page=home';
        });
    }
    
    // 主题切换
    if (DOM.themeToggle) {
        DOM.themeToggle.removeEventListener('click', () => ThemeManager.toggleTheme());
        DOM.themeToggle.addEventListener('click', () => ThemeManager.toggleTheme());
    }
    
    // 语言切换
    if (DOM.langToggle) {
        DOM.langToggle.removeEventListener('click', switchLanguage);
        DOM.langToggle.addEventListener('click', switchLanguage);
    }
    
    // 监听语言变化
    window.removeEventListener('languagechange', handleLanguageChange);
    window.addEventListener('languagechange', handleLanguageChange);
    
    // 监听主题变化
    window.removeEventListener('themechange', handleThemeChange);
    window.addEventListener('themechange', handleThemeChange);
    
    // 监听模式变化
    if (ThemeManager.addListener) {
        ThemeManager.removeListener?.(handleModeChange);
        ThemeManager.addListener(handleModeChange);
    }
}

// 提取事件处理函数
function handlePresetClick(e) {
    e.preventDefault();
    let value = e.currentTarget.dataset.amount;
    if (value === 'max') {
        value = AppState.maxAmount;
    } else {
        value = parseInt(value);
    }
    setAmount(value);
}

function handleAmountInput(e) {
    let value = parseInt(e.target.value);
    if (isNaN(value)) value = AppState.minAmount;
    setAmount(value);
}

function handleAmountSlider(e) {
    let value = parseInt(e.target.value);
    if (isNaN(value)) value = AppState.minAmount;
    setAmount(value);
}

function handleLanguageChange(e) {
    if (e.detail?.language) {
        currentLanguage = e.detail.language;
        updateModeUI();
        if (AppState.match) renderMatchDetails();
        updateAmountDisplay();
        if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
    }
}

function handleThemeChange(e) {
    if (DOM.themeToggle) {
        DOM.themeToggle.className = e.detail.isDarkMode ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    }
}

function handleModeChange(state) {
    AppState.isTestMode = state.isTestMode;
    updateModeUI();
    updateAmountLimits();
    loadUserBalance();
}

    // ==================== 清理定时器 ====================
    window.addEventListener('beforeunload', () => {
        if (AppState.countdownTimer) {
            clearInterval(AppState.countdownTimer);
        }
    });

    // ==================== 初始化 ====================
    async function init() {
        console.log('🎯 Authorize Controller initialized');
        
        if (!matchId) {
            if (DOM.errorState) {
                DOM.errorState.style.display = 'flex';
                if (DOM.errorMessage) DOM.errorMessage.textContent = 'Missing match ID';
            }
            return;
        }
        
        await ThemeManager.init();
        
        const savedLang = localStorage.getItem('language');
        if (savedLang === 'zh' || savedLang === 'en') currentLanguage = savedLang;
        if (DOM.langToggle) DOM.langToggle.textContent = currentLanguage === 'zh' ? '中' : 'EN';
        
        bindEvents();
        await loadUserBalance();
        await loadMatchDetails();
        
        console.log('✅ Authorize Controller ready');
    }
    
    document.addEventListener('DOMContentLoaded', init);
})();