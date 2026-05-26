/**
 * FOOTRADAPRO PROFILE CONTROLLER
 * Version: 6.0.0 - 优化logout弹窗，统一样式
 */

document.addEventListener("DOMContentLoaded", initProfile);

/* =====================================================
   INIT
   ===================================================== */
async function initProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('refresh') === 'paypassword') {
        showToast('Payment password updated successfully!', 'success');
        window.history.replaceState({}, document.title, '/profile.html');
    }
    
    if (window.ThemeManager) {
        await ThemeManager.init(true);
        console.log('✅ ThemeManager initialized, current mode:', ThemeManager.isTestMode ? 'Test' : 'Live');
    }
    
    bindNavigation();
    bindSecurity();
    initTestModeUI();
    initThemeListener();

    await loadUserProfile();
    await loadLockedFunds();
    await loadPayPasswordStatus();
    
    // 视觉增强
    initPullToRefresh();
    observeBalanceChanges();
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
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
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
                background: var(--bg-card);
                border-radius: 28px;
                width: 90%;
                max-width: 320px;
                padding: 24px;
                text-align: center;
                border: 1px solid var(--border-brand-light);
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                animation: scaleIn 0.2s ease;
            ">
                <div style="margin-bottom: 16px;">
                    <i class="fas fa-sign-out-alt" style="font-size: 48px; color: var(--brand-500);"></i>
                </div>
                <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">${title}</h3>
                <p style="font-size: 14px; color: var(--text-tertiary); margin-bottom: 24px;">${message}</p>
                <div style="display: flex; gap: 12px;">
                    <button class="confirm-cancel" style="
                        flex: 1;
                        padding: 12px;
                        background: rgba(0,0,0,0.2);
                        border: 1px solid var(--border-brand-light);
                        border-radius: 40px;
                        color: var(--text-secondary);
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">${cancelText}</button>
                    <button class="confirm-ok" style="
                        flex: 1;
                        padding: 12px;
                        background: var(--gradient-primary);
                        border: none;
                        border-radius: 40px;
                        color: white;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">${confirmText}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        const cancelBtn = modal.querySelector('.confirm-cancel');
        const confirmBtn = modal.querySelector('.confirm-ok');
        
        cancelBtn.onclick = () => {
            modal.remove();
            resolve(false);
        };
        
        confirmBtn.onclick = () => {
            modal.remove();
            resolve(true);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };
    });
}

/* =====================================================
   NAVIGATION & LOGOUT
   ===================================================== */
function bindNavigation() {
    const backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.onclick = () => window.history.back();

    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) settingsBtn.onclick = () => window.location.href = "/settings.html";

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            const confirmed = await showConfirmModal({
                title: 'Logout',
                message: 'Are you sure you want to logout?',
                confirmText: 'Logout',
                cancelText: 'Cancel'
            });
            
            if (confirmed) {
                try {
                    const response = await fetch('/api/v1/user/logout', {
                        method: 'POST',
                        credentials: 'include'
                    });
                    localStorage.removeItem("auth_token");
                    showToast('Logged out successfully', 'success');
                    setTimeout(() => {
                        window.location.href = "/login.html";
                    }, 500);
                } catch (err) {
                    console.error('Logout error:', err);
                    localStorage.removeItem("auth_token");
                    window.location.href = "/login.html";
                }
            }
        };
    }
    
    const authCard = document.getElementById("authCard");
    if (authCard) authCard.onclick = () => window.location.href = "/authorizations.html";

    // Fund Flow 卡片点击跳转
const fundFlowCard = document.getElementById("fundFlowCard");
if (fundFlowCard) fundFlowCard.onclick = () => window.location.href = "/fund-detail.html";
    
    
    const securityCard = document.getElementById("securityCard");
    if (securityCard) {
        securityCard.onclick = async () => {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            if (isTestMode) {
                showTestModePayPasswordInfo();
                return;
            }
            try {
                const res = await fetch('/api/v1/user/profile/paypassword/status', { credentials: 'include' });
                const data = await res.json();
                if (data.success && data.data.has_paypassword) {
                    window.location.href = "/settings.html";
                } else {
                    window.location.href = "/set-paypassword.html?from=profile";
                }
            } catch (err) {
                console.error('Failed to check payment password status:', err);
                window.location.href = "/set-paypassword.html?from=profile";
            }
        };
    }
    
    const supportCard = document.getElementById("supportCard");
    if (supportCard) supportCard.onclick = () => window.location.href = "/support.html";
    
    const availableCard = document.getElementById("availableCard");
    if (availableCard) availableCard.onclick = () => window.location.href = "/fund-detail.html";
    
    const lockedCard = document.getElementById("lockedCard");
    if (lockedCard) lockedCard.onclick = () => window.location.href = "/authorizations.html";
}

function bindSecurity() {}

function showTestModePayPasswordInfo() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
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
        <div style="background: var(--bg-card); border-radius: 28px; max-width: 320px; width: 90%; padding: 24px; text-align: center; border: 1px solid var(--border-brand-light);">
            <i class="fas fa-flask" style="font-size: 48px; color: #2563EB; margin-bottom: 16px;"></i>
            <h3 style="margin-bottom: 8px; font-size: 18px; color: var(--text-primary);">Test Mode</h3>
            <p style="color: var(--text-tertiary); margin-bottom: 20px; font-size: 14px;">You are in <strong>Test Mode</strong>.<br>Test mode users do not need to set a payment password.</p>
            <button onclick="this.closest('.modal-overlay').remove()" style="background: var(--gradient-primary); color: white; border: none; padding: 12px 24px; border-radius: 40px; font-weight: 600; cursor: pointer; width: 100%;">Got it</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function initTestModeUI() {
    const withdrawAction = document.getElementById('withdrawAction');
    const testModeHint = document.getElementById('testModeHint');
    if (window.ThemeManager) {
        const isTestMode = ThemeManager.isTestMode;
        if (testModeHint) testModeHint.style.display = isTestMode ? 'flex' : 'none';
        if (withdrawAction) {
            if (isTestMode) {
                withdrawAction.classList.add('test-mode-disabled');
                withdrawAction.href = 'javascript:void(0)';
                withdrawAction.onclick = (e) => {
                    e.preventDefault();
                    showTestModeWithdrawHint();
                };
            } else {
                withdrawAction.classList.remove('test-mode-disabled');
                withdrawAction.onclick = null;
                withdrawAction.href = '/withdraw.html';
            }
        }
    }
}

function showTestModeWithdrawHint() {
    const modal = document.createElement('div');
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease;`;
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 28px; max-width: 340px; width: 90%; padding: 28px 24px; border: 1px solid var(--border-brand-light);">
            <div style="text-align: center; margin-bottom: 20px;">
                <i class="fas fa-bolt" style="font-size: 48px; color: var(--brand-500); margin-bottom: 16px;"></i>
                <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">Switch to Live Mode</h2>
                <p style="color: var(--text-tertiary); font-size: 14px;">To withdraw funds, you need to switch to Live Mode</p>
            </div>
            <div style="display: flex; gap: 12px;">
                <button id="withdrawCancelBtn" style="flex: 1; padding: 14px; background: transparent; border: 1px solid var(--border-brand-light); border-radius: 40px; color: var(--text-secondary); font-weight: 600; cursor: pointer;">Cancel</button>
                <button id="withdrawSwitchBtn" style="flex: 1; padding: 14px; background: var(--gradient-primary); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">Switch & Withdraw</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('withdrawCancelBtn').onclick = () => modal.remove();
    document.getElementById('withdrawSwitchBtn').onclick = async function() {
        modal.remove();
        if (window.ThemeManager && ThemeManager.isTestMode) {
            showToast('Switching to Live Mode...', 'success');
            const success = await ThemeManager.toggleMode();
            if (success) window.location.href = '/withdraw.html';
            else alert('Failed to switch mode, please try again');
        }
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function loadPayPasswordStatus() {
    try {
        const statusEl = document.getElementById('payPasswordStatus');
        if (!statusEl) return;
        const [modeRes, statusRes] = await Promise.all([
            fetch('/api/v1/user/mode', { credentials: 'include' }),
            fetch('/api/v1/user/profile/paypassword/status', { credentials: 'include' })
        ]);
        const modeData = await modeRes.json();
        const statusData = await statusRes.json();
        const isTestMode = modeData.success ? modeData.data.is_test_mode : false;
        if (isTestMode) {
            statusEl.textContent = 'N/A';
            statusEl.className = 'feature-badge';
            return;
        }
        if (statusData.success) {
            const hasPayPassword = statusData.data.has_paypassword;
            statusEl.textContent = hasPayPassword ? 'Set' : 'Not Set';
            statusEl.className = hasPayPassword ? 'feature-badge set' : 'feature-badge';
        }
    } catch (err) {
        console.error('Failed to load payment password status:', err);
    }
}

async function loadUserProfile() {
    try {
        const [profileRes, balanceRes] = await Promise.all([
            fetch("/api/v1/user/profile", { credentials: 'include' }),
            fetch("/api/v1/user/balance", { credentials: 'include' })
        ]);
        const profileData = await profileRes.json();
        const balanceData = await balanceRes.json();
        if (!profileData.success) return;
        const userData = profileData.data;
        const userBalance = balanceData.success ? balanceData.data : null;
        if (userData) {
            updateProfileUI(userData, userBalance);
            const currentMode = window.ThemeManager ? window.ThemeManager.isTestMode : userData.is_test_mode;
            const testBadge = document.getElementById('testModeHint');
            if (testBadge) testBadge.style.display = currentMode ? 'flex' : 'none';
            updateCurrencySymbol(currentMode);
            initTestModeUI();
        }
    } catch(err) {
        console.error("Profile load failed:", err);
    }
}

function updateProfileUI(user, balanceData) {
    const username = document.getElementById("username");
    const uid = document.getElementById("uid");
    const totalAssetsEl = document.getElementById("totalAssets");
    const availableBalanceEl = document.getElementById("availableBalance");
    const isTestMode = window.ThemeManager ? window.ThemeManager.isTestMode : user.is_test_mode;
    if (username && user.username) username.textContent = user.username;
    if (uid && user.uid) uid.innerHTML = `<i class="fas fa-id-card"></i> <span>UID: ${user.uid}</span>`;
    if (totalAssetsEl) {
        let balance = isTestMode ? (balanceData?.test_balance || 0) : (balanceData?.balance || 0);
        totalAssetsEl.innerHTML = parseFloat(balance).toFixed(2);
    }
    if (availableBalanceEl) {
        let availableBalance = isTestMode ? (balanceData?.test_balance || 0) : (balanceData?.balance || 0);
        availableBalanceEl.innerHTML = parseFloat(availableBalance).toFixed(2);
    }
}

async function loadLockedFunds() {
    try {
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        const mode = isTestMode ? 'test' : 'live';
        const res = await fetch(`/api/v1/user/stats/locked?mode=${mode}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            const lockedFundsEl = document.getElementById('lockedFunds');
            if (lockedFundsEl) {
                lockedFundsEl.innerHTML = (data.data.total || 0).toFixed(2);
            }
        }
    } catch (err) {
        console.error('Failed to load locked funds:', err);
        const lockedFundsEl = document.getElementById('lockedFunds');
        if (lockedFundsEl) lockedFundsEl.innerHTML = '0.00';
    }
}

function initThemeListener() {
    if (window.ThemeManager) {
        ThemeManager.addListener((state) => {
            updateCurrencySymbol(state.isTestMode);
            loadUserProfile();
            loadLockedFunds();
            loadPayPasswordStatus();
            initTestModeUI();
        });
        updateCurrencySymbol(ThemeManager.isTestMode);
    } else {
        setTimeout(initThemeListener, 1000);
    }
}

function updateCurrencySymbol(isTestMode) {
    const currency = isTestMode ? 'tUSDT' : 'USDT';
    document.querySelectorAll('.currency-unit').forEach(el => el.remove());
    const totalAssetsEl = document.getElementById('totalAssets');
    const availableBalanceEl = document.getElementById('availableBalance');
    const lockedFundsEl = document.getElementById('lockedFunds');
    const addUnit = (el) => {
        if (el && el.parentNode) {
            const unitSpan = document.createElement('span');
            unitSpan.className = 'currency-unit';
            unitSpan.textContent = currency;
            el.parentNode.appendChild(unitSpan);
        }
    };
    addUnit(totalAssetsEl);
    addUnit(availableBalanceEl);
    addUnit(lockedFundsEl);
    const testBadge = document.getElementById('testModeHint');
    if (testBadge) testBadge.style.display = isTestMode ? 'flex' : 'none';
}

// ===== 视觉增强功能 =====
function animateNumber(element) {
    if (!element) return;
    element.classList.add('update');
    setTimeout(() => element.classList.remove('update'), 300);
    element.style.transform = 'scale(1.02)';
    setTimeout(() => { element.style.transform = ''; }, 200);
}

function initPullToRefresh() {
    const scrollable = document.querySelector('.content-scrollable');
    if (!scrollable) return;
    let startY = 0, isRefreshing = false;
    const refreshIndicator = document.createElement('div');
    refreshIndicator.className = 'pull-to-refresh';
    refreshIndicator.innerHTML = '<i class="fas fa-arrow-down"></i><span>Pull to refresh</span>';
    scrollable.insertBefore(refreshIndicator, scrollable.firstChild);
    scrollable.addEventListener('touchstart', (e) => {
        if (scrollable.scrollTop === 0) startY = e.touches[0].clientY;
    });
    scrollable.addEventListener('touchmove', (e) => {
        if (scrollable.scrollTop === 0 && !isRefreshing) {
            const pullDistance = e.touches[0].clientY - startY;
            if (pullDistance > 0) {
                refreshIndicator.style.transform = `translateY(${Math.min(pullDistance * 0.5, 60)}px)`;
                refreshIndicator.innerHTML = pullDistance > 60 ? '<i class="fas fa-sync-alt"></i><span>Release to refresh</span>' : '<i class="fas fa-arrow-down"></i><span>Pull to refresh</span>';
            }
        }
    });
    scrollable.addEventListener('touchend', async () => {
        const pullValue = parseInt(refreshIndicator.style.transform) || 0;
        if (pullValue > 60 && !isRefreshing) {
            isRefreshing = true;
            refreshIndicator.classList.add('loading');
            refreshIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Refreshing...</span>';
            try {
                await Promise.all([loadUserProfile(), loadLockedFunds(), loadPayPasswordStatus()]);
            } catch (err) { console.debug('Refresh error:', err); }
            setTimeout(() => {
                refreshIndicator.classList.remove('loading');
                refreshIndicator.style.transform = '';
                refreshIndicator.innerHTML = '<i class="fas fa-arrow-down"></i><span>Pull to refresh</span>';
                isRefreshing = false;
                showToast('Data updated', 'success');
            }, 500);
        } else {
            refreshIndicator.style.transform = '';
        }
    });
}

function observeBalanceChanges() {
    const totalAssets = document.getElementById('totalAssets');
    const availableBalance = document.getElementById('availableBalance');
    const lockedFunds = document.getElementById('lockedFunds');
    let lastTotal = parseFloat(totalAssets?.textContent) || 0;
    let lastAvailable = parseFloat(availableBalance?.textContent) || 0;
    let lastLocked = parseFloat(lockedFunds?.textContent) || 0;
    const observer = new MutationObserver(() => {
        const newTotal = parseFloat(totalAssets?.textContent) || 0;
        const newAvailable = parseFloat(availableBalance?.textContent) || 0;
        const newLocked = parseFloat(lockedFunds?.textContent) || 0;
        if (Math.abs(newTotal - lastTotal) > 0.01) animateNumber(totalAssets);
        if (Math.abs(newAvailable - lastAvailable) > 0.01) animateNumber(availableBalance);
        if (Math.abs(newLocked - lastLocked) > 0.01) animateNumber(lockedFunds);
        lastTotal = newTotal;
        lastAvailable = newAvailable;
        lastLocked = newLocked;
    });
    if (totalAssets) observer.observe(totalAssets, { childList: true, subtree: true, characterData: true });
}