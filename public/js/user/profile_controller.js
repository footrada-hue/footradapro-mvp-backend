/**
 * FOOTRADAPRO PROFILE CONTROLLER
 * Version: 7.2.0 - 修复余额显示 + Quick Stats 模块 + 充值弹窗+Telegram通知
 */

// 防止重复初始化 - 使用 window 属性避免重复声明
if (typeof window.__profileInitialized === 'undefined') {
    window.__profileInitialized = false;
}

document.addEventListener("DOMContentLoaded", () => {
    if (!window.__profileInitialized) initProfile();
});

/* =====================================================
   INIT - SPA 入口
   ===================================================== */
async function initProfile() {
    if (window.__profileInitialized) {
        console.log('Profile already initialized, refreshing data only');
        await refreshAllData();
        return;
    }
    
    console.log('🚀 Initializing Profile Controller...');
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('refresh') === 'paypassword') {
        showToast('Payment password updated successfully!', 'success');
        window.history.replaceState({}, document.title, '/profile.html');
    }
    
    if (window.ThemeManager) {
        await ThemeManager.init(true);
        console.log('✅ ThemeManager initialized, mode:', ThemeManager.isTestMode ? 'Test' : 'Live');
    }
    
    bindEvents();
    initModeListener();
    initThemeListenerForProfile();

    await loadUserProfile();
    await loadLockedFunds();
    await loadPayPasswordStatus();
    await loadQuickStats();
    
    updateModeUI();
    
    window.__profileInitialized = true;
    console.log('✅ Profile Controller initialized');
}

/* =====================================================
   TOAST 提示組件
   ===================================================== */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 24px;
        border-radius: 40px;
        z-index: 9999;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/* =====================================================
   自定义确认模态框 - 优雅的退出确认
   ===================================================== */
function showConfirmModal(options) {
    return new Promise((resolve) => {
        const { title, message, confirmText = 'Confirm', cancelText = 'Cancel' } = options;
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        `;
        
        modal.innerHTML = `
            <div class="confirm-modal" style="
                background: var(--card-bg, #fff);
                border-radius: 28px;
                width: 90%;
                max-width: 320px;
                padding: 24px;
                text-align: center;
                border: 1px solid var(--glass-border, rgba(59,130,246,0.18));
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                animation: scaleIn 0.2s ease;
            ">
                <div style="margin-bottom: 16px;">
                    <i class="fas fa-sign-out-alt" style="font-size: 48px; color: var(--accent, #2563eb);"></i>
                </div>
                <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary, #0f172a);">${escapeHtml(title)}</h3>
                <p style="font-size: 14px; color: var(--text-muted, #64748b); margin-bottom: 24px;">${escapeHtml(message)}</p>
                <div style="display: flex; gap: 12px;">
                    <button class="confirm-cancel" style="
                        flex: 1;
                        padding: 12px;
                        background: rgba(0,0,0,0.05);
                        border: 1px solid var(--glass-border, rgba(59,130,246,0.18));
                        border-radius: 40px;
                        color: var(--text-secondary, #334155);
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">${escapeHtml(cancelText)}</button>
                    <button class="confirm-ok" style="
                        flex: 1;
                        padding: 12px;
                        background: linear-gradient(135deg, #2563eb, #4f46e5);
                        border: none;
                        border-radius: 40px;
                        color: white;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const cancelBtn = modal.querySelector('.confirm-cancel');
        const confirmBtn = modal.querySelector('.confirm-ok');
        
        cancelBtn.onclick = () => { modal.remove(); resolve(false); };
        confirmBtn.onclick = () => { modal.remove(); resolve(true); };
        modal.onclick = (e) => { if (e.target === modal) { modal.remove(); resolve(false); } };
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

/* =====================================================
   測試模式提現精美彈框
   ===================================================== */
function showTestModeWithdrawHint() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.8); 
        backdrop-filter: blur(8px); 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        z-index: 10000; 
        animation: fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="
            background: var(--card-bg, #fff);
            border-radius: 32px;
            max-width: 340px;
            width: 90%;
            padding: 32px 24px;
            border: 1px solid var(--glass-border, rgba(59,130,246,0.18));
            text-align: center;
            animation: scaleIn 0.2s ease;
        ">
            <div class="modal-icon" style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #f97316, #ea580c);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
            ">
                <i class="fas fa-flask" style="font-size: 40px; color: white;"></i>
            </div>
            <h2 style="
                font-size: 24px; 
                font-weight: 700; 
                margin-bottom: 12px;
                background: linear-gradient(135deg, #f97316, #ea580c);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            ">Test Mode</h2>
            <p style="
                color: var(--text-secondary, #334155);
                line-height: 1.6;
                margin-bottom: 24px;
                font-size: 14px;
            ">
                You are currently in <strong>Test Mode</strong> using virtual funds (tUSDT).<br>
                Virtual funds cannot be withdrawn.<br><br>
                <strong>Please switch to Live Mode to withdraw real funds.</strong>
            </p>
            <button id="withdrawConfirmBtn" style="
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #f97316, #ea580c);
                border: none;
                border-radius: 60px;
                color: white;
                font-weight: 600;
                cursor: pointer;
            ">I Understand</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    if (!document.querySelector('#modal-animation-style')) {
        const style = document.createElement('style');
        style.id = 'modal-animation-style';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.getElementById('withdrawConfirmBtn').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

/* =====================================================
   測試模式充值精美彈框
   ===================================================== */
function showTestModeDepositHint() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.8); 
        backdrop-filter: blur(8px); 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        z-index: 10000; 
        animation: fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="
            background: var(--card-bg, #fff);
            border-radius: 32px;
            max-width: 340px;
            width: 90%;
            padding: 32px 24px;
            border: 1px solid var(--glass-border, rgba(59,130,246,0.18));
            text-align: center;
            animation: scaleIn 0.2s ease;
        ">
            <div class="modal-icon" style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #10b981, #059669);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
            ">
                <i class="fas fa-flask" style="font-size: 40px; color: white;"></i>
            </div>
            <h2 style="
                font-size: 24px; 
                font-weight: 700; 
                margin-bottom: 12px;
                background: linear-gradient(135deg, #10b981, #059669);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            ">Test Mode</h2>
            <p style="
                color: var(--text-secondary, #334155);
                line-height: 1.6;
                margin-bottom: 24px;
                font-size: 14px;
            ">
                You are currently in <strong>Test Mode</strong> using virtual funds (tUSDT).<br>
                No real deposit is needed.<br><br>
                <strong>Switch to Live Mode to deposit real funds.</strong>
            </p>
            <div style="display: flex; gap: 12px;">
                <button id="depositCancelBtn" style="
                    flex: 1; 
                    padding: 14px; 
                    background: var(--badge-soft, rgba(0,0,0,0.05)); 
                    border: 1px solid var(--glass-border, rgba(59,130,246,0.18)); 
                    border-radius: 60px; 
                    color: var(--text-secondary, #334155); 
                    font-weight: 600; 
                    cursor: pointer;
                ">Cancel</button>
                <button id="depositSwitchBtn" style="
                    flex: 1; 
                    padding: 14px; 
                    background: linear-gradient(135deg, #10b981, #059669); 
                    border: none; 
                    border-radius: 60px; 
                    color: white; 
                    font-weight: 600; 
                    cursor: pointer;
                ">Switch to Live</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('depositCancelBtn').onclick = () => modal.remove();
    document.getElementById('depositSwitchBtn').onclick = async () => {
        modal.remove();
        if (window.ThemeManager && ThemeManager.isTestMode) {
            showToast('Switching to Live Mode...', 'success');
            const success = await ThemeManager.toggleMode();
            if (success) window.location.href = '/shell.html?page=deposit';
            else showToast('Failed to switch mode, please try again', 'error');
        }
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function showTestModePayPasswordInfo() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="
            background: var(--card-bg, #fff);
            border-radius: 28px;
            max-width: 320px;
            width: 90%;
            padding: 24px;
            text-align: center;
            border: 1px solid var(--glass-border, rgba(59,130,246,0.18));
        ">
            <i class="fas fa-flask" style="font-size: 48px; color: #8b5cf6; margin-bottom: 16px;"></i>
            <h3 style="margin-bottom: 8px; font-size: 18px; color: var(--text-primary, #0f172a);">Test Mode</h3>
            <p style="color: var(--text-muted, #64748b); margin-bottom: 20px; font-size: 14px;">
                You are in <strong>Test Mode</strong>.<br>
                Test mode users do not need to set a payment password.
            </p>
            <button onclick="this.closest('div').parentElement.remove()" style="
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 40px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
            ">Got it</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

/* =====================================================
   事件绑定
   ===================================================== */
function bindEvents() {
    // ========== 充值按钮（带弹窗+Telegram通知）==========
    const depositBtn = document.getElementById('depositBtn');
    const mobileDepositBtn = document.getElementById('mobileDepositBtn');
    
    const handleDeposit = async () => {
        const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
        
        if (isTestMode) {
            showTestModeDepositHint();
            return;
        }
        
        const amount = await showDepositAmountModal();
        
        if (amount && amount >= 10) {
            showToast('Sending deposit request...', 'info');
            await sendDepositIntentNotification(amount);
            showToast(`✨ Deposit intent of ${amount} USDT notified! Redirecting...`, 'success');
            setTimeout(() => {
                window.location.href = `/shell.html?page=deposit&amount=${amount}`;
            }, 800);
        }
    };
    
    if (depositBtn) {
        depositBtn.onclick = handleDeposit;
    }
    if (mobileDepositBtn) {
        mobileDepositBtn.onclick = handleDeposit;
    }
    
    // ========== 提现按钮 ==========
    const withdrawBtn = document.getElementById('withdrawBtn');
    const mobileWithdrawBtn = document.getElementById('mobileWithdrawBtn');
    if (withdrawBtn) {
        withdrawBtn.onclick = () => {
            const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
            if (isTestMode) {
                showTestModeWithdrawHint();
            } else {
                window.location.href = '/shell.html?page=withdraw';
            }
        };
    }
    if (mobileWithdrawBtn) {
        mobileWithdrawBtn.onclick = () => {
            const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
            if (isTestMode) {
                showTestModeWithdrawHint();
            } else {
                window.location.href = '/shell.html?page=withdraw';
            }
        };
    }
    
    // ========== 资金流水 ==========
    const fundFlowCard = document.getElementById('fundFlowCard');
    const mobileFundFlowCard = document.getElementById('mobileFundFlowCard');
    if (fundFlowCard) fundFlowCard.onclick = () => window.location.href = '/shell.html?page=fund-detail';
    if (mobileFundFlowCard) mobileFundFlowCard.onclick = () => window.location.href = '/shell.html?page=fund-detail';
    
    // ========== 授权记录 ==========
    const authCard = document.getElementById('authCard');
    const mobileAuthCard = document.getElementById('mobileAuthCard');
    if (authCard) authCard.onclick = () => window.location.href = '/shell.html?page=records';
    if (mobileAuthCard) mobileAuthCard.onclick = () => window.location.href = '/shell.html?page=records';
    
    // ========== 客服支持 ==========
    const supportCard = document.getElementById('supportCard');
    const mobileSupportCard = document.getElementById('mobileSupportCard');
    if (supportCard) supportCard.onclick = () => window.location.href = '/shell.html?page=support-chat';
    if (mobileSupportCard) mobileSupportCard.onclick = () => window.location.href = '/shell.html?page=support-chat';
    
    // ========== 安全设置 ==========
    const securityCard = document.getElementById('securityCardBtn');
    const mobileSecurityCard = document.getElementById('mobileSecurityBtn');
    const settingsCard = document.getElementById('settingsCard');
    const mobileSettingsCard = document.getElementById('mobileSettingsCard');
    
    const handleSecurityClick = async () => {
        const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
        if (isTestMode) {
            showTestModePayPasswordInfo();
            return;
        }
        try {
            const res = await fetch('/api/v1/user/profile/paypassword/status', { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data.has_paypassword) {
                window.location.href = '/shell.html?page=settings';
            } else {
                window.location.href = '/shell.html?page=set-paypassword&from=profile';
            }
        } catch (err) {
            console.error('Failed to check payment password status:', err);
            window.location.href = '/shell.html?page=set-paypassword&from=profile';
        }
    };
    
    if (securityCard) securityCard.onclick = handleSecurityClick;
    if (mobileSecurityCard) mobileSecurityCard.onclick = handleSecurityClick;
    if (settingsCard) settingsCard.onclick = () => {
        window.location.href = '/shell.html?page=settings';
    };
    if (mobileSettingsCard) mobileSettingsCard.onclick = () => {
        window.location.href = '/shell.html?page=settings';
    };
    
    // ========== 退出登录 ==========
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try {
                await fetch('/api/v1/user/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (err) {
                console.error('Logout error:', err);
            }
            localStorage.removeItem('auth_token');
            localStorage.removeItem('footradapro_token');
            window.location.href = '/login.html';
        };
    }
}

/* =====================================================
   数字动画函数
   ===================================================== */
function animateNumber(element, start, end, duration = 500) {
    if (!element) return;
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;
        element.innerText = current.toFixed(2);
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.innerText = end.toFixed(2);
            element.classList.add('amount-flash');
            setTimeout(() => element.classList.remove('amount-flash'), 300);
        }
    }
    requestAnimationFrame(update);
}

function animateInteger(element, start, end, duration = 500) {
    if (!element) return;
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * easeOut);
        element.innerText = current;
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.innerText = end;
            element.classList.add('amount-flash');
            setTimeout(() => element.classList.remove('amount-flash'), 300);
        }
    }
    requestAnimationFrame(update);
}

/* =====================================================
   Quick Stats 模块 - 更新柱状图
   ===================================================== */
function updateBars(trades, wins, winRate) {
    const tradesBar = document.getElementById('tradesBar');
    const winsBar = document.getElementById('winsBar');
    const winRateBar = document.getElementById('winRateBar');
    
    const maxTrades = 100;
    const tradesPercent = Math.min((trades / maxTrades) * 100, 100);
    const winsPercent = trades > 0 ? (wins / trades) * 100 : 0;
    
    if (tradesBar) tradesBar.style.height = `${Math.max(tradesPercent, 5)}%`;
    if (winsBar) winsBar.style.height = `${Math.max(winsPercent, 5)}%`;
    if (winRateBar) winRateBar.style.height = `${Math.max(winRate, 5)}%`;
}

/* =====================================================
   数据加载
   ===================================================== */
async function loadUserProfile() {
    try {
        const timestamp = Date.now();
        const [profileRes, balanceRes] = await Promise.all([
            fetch(`/api/v1/user/profile?_=${timestamp}`, { credentials: 'include', cache: 'no-cache' }),
            fetch(`/api/v1/user/balance?_=${timestamp}`, { credentials: 'include', cache: 'no-cache' })
        ]);
        const profileData = await profileRes.json();
        const balanceData = await balanceRes.json();
        
        console.log('Profile API:', profileData);
        console.log('Balance API:', balanceData);
        
        if (profileData.success && profileData.data) {
            const userData = profileData.data;
            
            const usernameEl = document.getElementById('username');
            const uidEl = document.getElementById('uid');
            const mobileUsernameEl = document.getElementById('mobileUsername');
            const mobileUidEl = document.getElementById('mobileUid');
            
            if (usernameEl) usernameEl.textContent = userData.username || '—';
            if (uidEl) uidEl.innerHTML = `<i class="fas fa-id-card"></i> UID: ${userData.uid || '—'}`;
            if (mobileUsernameEl) mobileUsernameEl.textContent = userData.username || '—';
            if (mobileUidEl) mobileUidEl.innerHTML = `<i class="fas fa-id-card"></i> UID: ${userData.uid || '—'}`;
        }
        
        if (balanceData.success && balanceData.data) {
            const balance = balanceData.data.balance || 0;
            console.log('💰 当前余额:', balance);
            
            const totalEl = document.getElementById('totalAssets');
            const availableEl = document.getElementById('availableBalance');
            const mobileTotalEl = document.getElementById('mobileTotalAssets');
            
            if (totalEl) animateNumber(totalEl, parseFloat(totalEl.textContent) || 0, balance);
            if (availableEl) animateNumber(availableEl, parseFloat(availableEl.textContent) || 0, balance);
            if (mobileTotalEl) animateNumber(mobileTotalEl, parseFloat(mobileTotalEl.textContent) || 0, balance);
        }
    } catch (err) {
        console.error('Failed to load user profile:', err);
    }
}

async function loadLockedFunds() {
    try {
        const timestamp = Date.now();
        const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
        const mode = isTestMode ? 'test' : 'live';
        const res = await fetch(`/api/v1/user/stats/locked?mode=${mode}&_=${timestamp}`, { 
            credentials: 'include',
            cache: 'no-cache'
        });
        const data = await res.json();
        
        console.log('🔒 Locked Funds API:', data);
        
        const lockedEl = document.getElementById('lockedFunds');
        if (lockedEl && data.success) {
            const newValue = data.data?.total || 0;
            animateNumber(lockedEl, parseFloat(lockedEl.textContent) || 0, newValue);
        }
    } catch (err) {
        console.error('Failed to load locked funds:', err);
        const lockedEl = document.getElementById('lockedFunds');
        if (lockedEl) lockedEl.textContent = '0.00';
    }
}

async function loadPayPasswordStatus() {
    try {
        const statusEl = document.getElementById('payPasswordStatus');
        const securityBtnText = document.getElementById('securityBtnText');
        const mobileStatusEl = document.getElementById('mobilePayPasswordStatus');
        const mobileSecurityBtnText = document.getElementById('mobileSecurityBtnText');
        
        if (!statusEl && !mobileStatusEl) return;
        
        const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
        
        if (isTestMode) {
            if (statusEl) {
                statusEl.textContent = 'N/A';
                statusEl.className = 'status-badge na';
            }
            if (securityBtnText) securityBtnText.textContent = 'N/A';
            if (mobileStatusEl) {
                mobileStatusEl.textContent = 'N/A';
                mobileStatusEl.className = 'status-badge na';
            }
            if (mobileSecurityBtnText) mobileSecurityBtnText.textContent = 'N/A';
            return;
        }
        
        const res = await fetch('/api/v1/user/profile/paypassword/status', { credentials: 'include' });
        const data = await res.json();
        
        if (data.success) {
            const hasPassword = data.data.has_paypassword;
            const statusText = hasPassword ? 'Set' : 'Not Set';
            const statusClass = hasPassword ? 'set' : 'not-set';
            const btnText = hasPassword ? 'Change' : 'Set';
            
            if (statusEl) {
                statusEl.textContent = statusText;
                statusEl.className = `status-badge ${statusClass}`;
            }
            if (securityBtnText) securityBtnText.textContent = btnText;
            if (mobileStatusEl) {
                mobileStatusEl.textContent = statusText;
                mobileStatusEl.className = `status-badge ${statusClass}`;
            }
            if (mobileSecurityBtnText) mobileSecurityBtnText.textContent = btnText;
        }
    } catch (err) {
        console.error('Failed to load payment password status:', err);
    }
}

async function loadQuickStats() {
    try {
        const timestamp = Date.now();
        const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
        const mode = isTestMode ? 'test' : 'live';
        
        const res = await fetch(`/api/v1/user/stats/trade?mode=${mode}&_=${timestamp}`, {
            credentials: 'include',
            cache: 'no-cache'
        });
        const data = await res.json();
        
        console.log('📊 Quick Stats API:', data);
        
        if (data.success && data.data) {
            const totalTrades = data.data.total || 0;
            const winRate = data.data.win_rate || 0;
            const wins = Math.round(totalTrades * winRate / 100);
            const totalProfit = data.data.total_profit || 0;
            
            console.log(`📈 交易统计: 总交易=${totalTrades}, 胜率=${winRate}%, 获胜数=${wins}, 总盈亏=${totalProfit}`);
            
            const totalTradesEl = document.getElementById('totalTrades');
            const winCountEl = document.getElementById('winCount');
            const winRateEl = document.getElementById('winRate');
            
            if (totalTradesEl) animateInteger(totalTradesEl, 0, totalTrades);
            if (winCountEl) animateInteger(winCountEl, 0, wins);
            if (winRateEl) animateNumber(winRateEl, 0, winRate);
            
            updateBars(totalTrades, wins, winRate);
            
            const mobileTotalTrades = document.getElementById('mobileTotalTrades');
            const mobileWinCount = document.getElementById('mobileWinCount');
            const mobileWinRate = document.getElementById('mobileWinRate');
            
            if (mobileTotalTrades) mobileTotalTrades.textContent = totalTrades;
            if (mobileWinCount) mobileWinCount.textContent = wins;
            if (mobileWinRate) mobileWinRate.textContent = winRate + '%';
        }
    } catch (err) {
        console.error('Failed to load quick stats:', err);
    }
}

async function refreshAllData() {
    await Promise.all([
        loadUserProfile(),
        loadLockedFunds(),
        loadPayPasswordStatus(),
        loadQuickStats()
    ]);
}

/* =====================================================
   UI 更新
   ===================================================== */
function updateModeUI() {
    const isTestMode = ThemeManager ? ThemeManager.isTestMode : false;
    
    const modeText = document.getElementById('currentModeText');
    const testBadge = document.getElementById('testModeBadge');
    const mobileTestBadge = document.getElementById('mobileTestModeBadge');
    
    if (modeText) {
        modeText.textContent = isTestMode ? 'Sandbox' : 'Live';
        modeText.className = isTestMode ? 'mode-text sandbox' : 'mode-text live';
    }
    if (testBadge) {
        testBadge.style.display = isTestMode ? 'inline-flex' : 'none';
    }
    if (mobileTestBadge) {
        mobileTestBadge.style.display = isTestMode ? 'inline-flex' : 'none';
    }
    
    const currency = isTestMode ? 'tUSDT' : 'USDT';
    
    document.querySelectorAll('.currency-unit').forEach(el => el.remove());
    const totalEl = document.getElementById('totalAssets');
    const availableEl = document.getElementById('availableBalance');
    const lockedEl = document.getElementById('lockedFunds');
    
    const addUnit = (el) => {
        if (el && el.parentNode && !el.parentNode.querySelector('.currency-unit')) {
            const unitSpan = document.createElement('span');
            unitSpan.className = 'currency-unit';
            unitSpan.style.marginLeft = '4px';
            unitSpan.style.fontSize = '12px';
            unitSpan.style.color = 'var(--text-muted)';
            unitSpan.textContent = currency;
            el.parentNode.appendChild(unitSpan);
        }
    };
    addUnit(totalEl);
    addUnit(availableEl);
    addUnit(lockedEl);
    
    const mobileBalanceCurrency = document.getElementById('mobileBalanceCurrency');
    if (mobileBalanceCurrency) {
        mobileBalanceCurrency.textContent = currency;
    }
}

/* =====================================================
   模式监听
   ===================================================== */
function initModeListener() {
    if (window.ThemeManager) {
        ThemeManager.addListener(async (state) => {
            console.log('🔄 Mode changed:', state.isTestMode ? 'Test' : 'Live');
            updateModeUI();
            bindEvents();
            await refreshAllData();
        });
    }
}

/* =====================================================
   主题监听
   ===================================================== */
function initThemeListenerForProfile() {
    if (window.ThemeManager) {
        ThemeManager.addThemeListener((state) => {
            console.log('🎨 Theme changed:', state.isDarkMode ? 'Dark' : 'Light');
            document.body.classList.toggle('dark', state.isDarkMode);
        });
        
        const isDark = ThemeManager.getTheme() === 'dark';
        document.body.classList.toggle('dark', isDark);
    }
}

/* =====================================================
   充值金额输入弹窗（带Telegram通知）
   ===================================================== */

function showDepositAmountModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'deposit-amount-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.25s ease;
        `;
        
        modal.innerHTML = `
            <div style="
                background: var(--card-bg, linear-gradient(135deg, #fff 0%, #f8fafc 100%));
                border-radius: 32px;
                max-width: 420px;
                width: 90%;
                padding: 28px 24px;
                border: 1px solid var(--glass-border, rgba(59,130,246,0.2));
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                animation: scaleIn 0.25s ease;
            ">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="
                        width: 64px;
                        height: 64px;
                        background: linear-gradient(135deg, #10b981, #059669);
                        border-radius: 50%;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 16px;
                    ">
                        <i class="fas fa-hand-holding-usd" style="font-size: 28px; color: white;"></i>
                    </div>
                    <h3 style="font-size: 22px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">
                        Enter Deposit Amount
                    </h3>
                    <p style="font-size: 13px; color: #64748b; margin: 0;">
                        Minimum deposit: 10 USDT
                    </p>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="
                        display: flex;
                        align-items: center;
                        border: 2px solid #e2e8f0;
                        border-radius: 20px;
                        background: #ffffff;
                        transition: all 0.2s;
                        overflow: hidden;
                    " id="amountInputWrapper">
                        <span style="
                            padding: 0 16px;
                            font-size: 20px;
                            font-weight: 700;
                            color: #0f172a;
                            background: #f1f5f9;
                            height: 56px;
                            display: flex;
                            align-items: center;
                            border-right: 1px solid #e2e8f0;
                        ">USDT</span>
                        <input type="number" id="depositAmountInput" step="10" min="10" placeholder="Enter amount" style="
                            flex: 1;
                            padding: 0 16px;
                            height: 56px;
                            border: none;
                            background: #ffffff;
                            color: #0f172a;
                            font-size: 18px;
                            font-weight: 500;
                            outline: none;
                        ">
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;">
                        ${[50, 100, 200, 500, 1000].map(amount => `
                            <button type="button" class="quick-amount-btn" data-amount="${amount}" style="
                                flex: 1;
                                min-width: 70px;
                                padding: 10px 0;
                                background: rgba(16,185,129,0.1);
                                border: 1px solid rgba(16,185,129,0.3);
                                border-radius: 40px;
                                color: #10b981;
                                font-weight: 600;
                                font-size: 14px;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">${amount}</button>
                        `).join('')}
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="depositModalCancel" style="
                        flex: 1;
                        padding: 14px;
                        background: #f1f5f9;
                        border: 1px solid #e2e8f0;
                        border-radius: 60px;
                        color: #334155;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">Cancel</button>
                    <button id="depositModalConfirm" style="
                        flex: 1;
                        padding: 14px;
                        background: linear-gradient(135deg, #10b981, #059669);
                        border: none;
                        border-radius: 60px;
                        color: white;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">Continue to Deposit</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const amountInput = modal.querySelector('#depositAmountInput');
        setTimeout(() => amountInput?.focus(), 100);
        
        modal.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.onmouseenter = () => {
                btn.style.background = 'rgba(16,185,129,0.2)';
                btn.style.transform = 'scale(1.02)';
            };
            btn.onmouseleave = () => {
                btn.style.background = 'rgba(16,185,129,0.1)';
                btn.style.transform = 'scale(1)';
            };
            btn.onclick = () => {
                amountInput.value = btn.dataset.amount;
                amountInput.dispatchEvent(new Event('input'));
            };
        });
        
        const wrapper = modal.querySelector('#amountInputWrapper');
        amountInput.onfocus = () => {
            wrapper.style.borderColor = '#10b981';
            wrapper.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.1)';
        };
        amountInput.onblur = () => {
            wrapper.style.borderColor = '#e2e8f0';
            wrapper.style.boxShadow = 'none';
        };
        
        const confirmBtn = modal.querySelector('#depositModalConfirm');
        const cancelBtn = modal.querySelector('#depositModalCancel');
        
        confirmBtn.onclick = async () => {
            const amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount < 10) {
                showToast('Please enter a valid amount (minimum 10 USDT)', 'error');
                amountInput.style.border = '1px solid #ef4444';
                setTimeout(() => { amountInput.style.border = ''; }, 2000);
                return;
            }
            if (amount > 100000) {
                showToast('Maximum deposit amount is 100,000 USDT', 'error');
                return;
            }
            modal.remove();
            resolve(amount);
        };
        
        cancelBtn.onclick = () => {
            modal.remove();
            resolve(null);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        };
        
        amountInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        };
    });
}
async function sendDepositIntentNotification(amount) {
    try {
        const profileRes = await fetch('/api/v1/user/profile', { credentials: 'include' });
        const profileData = await profileRes.json();
        
        let username = 'User';
        let uid = 'Unknown';
        let email = '';
        
        if (profileData.success && profileData.data) {
            username = profileData.data.username || 'User';
            uid = profileData.data.uid || 'Unknown';
            email = profileData.data.email || '';
        }
        
        const response = await fetch('/api/v1/user/deposit/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ amount, username, uid, email })
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('✅ Deposit intent notification sent to Telegram');
        } else {
            console.warn('⚠️ Failed to send Telegram notification:', data);
        }
    } catch (err) {
        console.error('❌ Error sending Telegram notification:', err);
    }
}

// 暴露全局函数供 SPA 调用
window.initProfile = initProfile;
window.refreshProfileData = refreshAllData;deposit-notify.routes.js