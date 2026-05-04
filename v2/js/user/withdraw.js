/**
 * FOOTRADAPRO - 提現頁面控制器
 * @version 2.4.0 - 优化支付密码弹窗样式
 */

(function() {
    'use strict';

    // ==================== 支付密码弹窗（优化版） ====================
    function showPayPasswordModal(onConfirm) {
        const modalHTML = `
            <div class="modal-overlay" id="payPasswordModal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            ">
                <div class="pay-password-modal" style="
                    background: var(--bg-card);
                    border-radius: 32px;
                    width: 90%;
                    max-width: 360px;
                    overflow: hidden;
                    animation: scaleIn 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1);
                    border: 1px solid var(--border-brand-light);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                ">
                    <!-- 头部 -->
                    <div style="
                        padding: 20px 20px 0;
                        text-align: center;
                    ">
                        <div style="
                            width: 56px;
                            height: 56px;
                            background: rgba(var(--brand-rgb), 0.1);
                            border-radius: 28px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 12px;
                        ">
                            <i class="fas fa-lock" style="font-size: 28px; color: var(--brand-500);"></i>
                        </div>
                        <h3 style="
                            font-size: 20px;
                            font-weight: 700;
                            margin: 0 0 6px;
                            background: linear-gradient(135deg, var(--text-primary), var(--brand-400));
                            -webkit-background-clip: text;
                            background-clip: text;
                            color: transparent;
                        ">Verify Payment</h3>
                        <p style="
                            font-size: 13px;
                            color: var(--text-tertiary);
                            margin: 0;
                            line-height: 1.4;
                        ">Enter your payment password to confirm withdrawal</p>
                    </div>
                    
                    <!-- 密码输入区 -->
                    <div style="padding: 24px 20px 20px;">
                        <div style="
                            background: rgba(0, 0, 0, 0.2);
                            border: 1px solid var(--border-brand-light);
                            border-radius: 20px;
                            transition: all 0.2s;
                            position: relative;
                        " id="passwordInputWrapper">
                            <input type="password" id="payPasswordInput" class="pay-password-input" placeholder="Enter payment password" style="
                                width: 100%;
                                padding: 16px 18px;
                                background: transparent;
                                border: none;
                                color: var(--text-primary);
                                font-size: 16px;
                                font-weight: 500;
                                font-family: var(--font-mono);
                                letter-spacing: 1px;
                                outline: none;
                            ">
                            <div style="
                                position: absolute;
                                right: 16px;
                                top: 50%;
                                transform: translateY(-50%);
                                cursor: pointer;
                                color: var(--text-tertiary);
                                transition: color 0.2s;
                            " class="toggle-password-visibility">
                                <i class="fas fa-eye-slash" style="font-size: 18px;"></i>
                            </div>
                        </div>
                        <div id="passwordError" style="
                            color: var(--danger-500);
                            font-size: 12px;
                            margin-top: 10px;
                            margin-left: 4px;
                            display: none;
                            align-items: center;
                            gap: 6px;
                        ">
                            <i class="fas fa-exclamation-circle" style="font-size: 12px;"></i>
                            <span></span>
                        </div>
                    </div>
                    
                    <!-- 按钮区 -->
                    <div style="
                        display: flex;
                        gap: 12px;
                        padding: 0 20px 20px;
                    ">
                        <button class="pay-password-cancel" style="
                            flex: 1;
                            padding: 14px;
                            background: transparent;
                            border: 1px solid var(--border-brand-light);
                            border-radius: 40px;
                            color: var(--text-secondary);
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">Cancel</button>
                        <button class="pay-password-confirm" id="confirmPayPasswordBtn" style="
                            flex: 1;
                            padding: 14px;
                            background: var(--gradient-primary);
                            border: none;
                            border-radius: 40px;
                            color: white;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 添加动画样式
        if (!document.getElementById('payPasswordModalStyles')) {
            const style = document.createElement('style');
            style.id = 'payPasswordModalStyles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to { 
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .pay-password-input:focus {
                    outline: none;
                }
                #passwordInputWrapper:focus-within {
                    border-color: var(--brand-500);
                    box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.2);
                }
                .pay-password-cancel:hover {
                    border-color: var(--brand-500);
                    color: var(--brand-500);
                }
                .pay-password-confirm:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--neon-glow);
                }
                .pay-password-confirm:disabled {
                    opacity: 0.6;
                    transform: none;
                    cursor: not-allowed;
                }
            `;
            document.head.appendChild(style);
        }
        
        const modal = document.getElementById('payPasswordModal');
        const confirmBtn = document.getElementById('confirmPayPasswordBtn');
        const passwordInput = document.getElementById('payPasswordInput');
        const errorDiv = document.getElementById('passwordError');
        const toggleVisibility = modal?.querySelector('.toggle-password-visibility');
        
        let isPasswordVisible = false;
        
        // 切换密码可见性
        if (toggleVisibility) {
            toggleVisibility.addEventListener('click', () => {
                isPasswordVisible = !isPasswordVisible;
                passwordInput.type = isPasswordVisible ? 'text' : 'password';
                const icon = toggleVisibility.querySelector('i');
                if (icon) {
                    icon.className = isPasswordVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
                }
            });
        }
        
        // 输入框聚焦时清除错误
        passwordInput.addEventListener('focus', () => {
            errorDiv.style.display = 'none';
            const wrapper = document.getElementById('passwordInputWrapper');
            if (wrapper) wrapper.style.borderColor = 'var(--border-brand-light)';
        });
        
        confirmBtn.onclick = async () => {
            const password = passwordInput.value;
            if (!password) {
                errorDiv.style.display = 'flex';
                errorDiv.querySelector('span').textContent = 'Please enter your payment password';
                passwordInput.focus();
                return;
            }
            
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Verifying...';
            
            try {
                const response = await fetch('/api/v1/user/profile/paypassword/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ password: password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    modal.remove();
                    onConfirm(password);
                } else {
                    errorDiv.style.display = 'flex';
                    errorDiv.querySelector('span').textContent = data.message || 'Incorrect payment password';
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                    passwordInput.value = '';
                    passwordInput.focus();
                    
                    const wrapper = document.getElementById('passwordInputWrapper');
                    if (wrapper) wrapper.style.borderColor = 'var(--danger-500)';
                }
            } catch (err) {
                console.error('Password verification error:', err);
                errorDiv.style.display = 'flex';
                errorDiv.querySelector('span').textContent = 'Verification failed. Please try again.';
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm';
            }
        };
        
        // Enter 键提交
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') confirmBtn.click();
        });
        
        // 关闭弹窗
        const closeModal = () => modal.remove();
        
        const cancelBtn = modal.querySelector('.pay-password-cancel');
        if (cancelBtn) cancelBtn.onclick = closeModal;
        
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
    }

    // ==================== 错误模态框（优化版） ====================
    function showErrorModal(message, showSetPasswordBtn = false) {
        const existingModal = document.getElementById('errorModal');
        if (existingModal) existingModal.remove();
        
        let footerButtons = '';
        if (showSetPasswordBtn) {
            footerButtons = `
                <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <button class="error-cancel-btn" style="flex: 1; padding: 14px; background: transparent; border: 1px solid var(--border-brand-light); border-radius: 40px; color: var(--text-secondary); font-weight: 600; cursor: pointer;">Cancel</button>
                    <button class="error-set-btn" id="setPasswordBtn" style="flex: 1; padding: 14px; background: var(--gradient-primary); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">Set Password</button>
                </div>
            `;
        } else {
            footerButtons = `<button class="error-gotit-btn" style="width: 100%; padding: 14px; background: var(--gradient-primary); border: none; border-radius: 40px; color: white; font-weight: 600; cursor: pointer;">Got it</button>`;
        }
        
        const modalHTML = `
            <div class="modal-overlay" id="errorModal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            ">
                <div class="error-modal" style="
                    background: var(--bg-card);
                    border-radius: 32px;
                    width: 90%;
                    max-width: 340px;
                    padding: 28px 24px;
                    text-align: center;
                    border: 1px solid var(--border-brand-light);
                    animation: scaleIn 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1);
                ">
                    <div style="
                        width: 64px;
                        height: 64px;
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 16px;
                    ">
                        <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: var(--danger-500);"></i>
                    </div>
                    <h3 style="
                        font-size: 20px;
                        font-weight: 700;
                        margin: 0 0 8px;
                        color: var(--text-primary);
                    ">${showSetPasswordBtn ? 'Payment Password Required' : 'Error'}</h3>
                    <p style="
                        font-size: 14px;
                        color: var(--text-tertiary);
                        margin: 0 0 20px;
                        line-height: 1.5;
                    ">${message}</p>
                    ${footerButtons}
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 添加动画样式（如果还没有）
        if (!document.getElementById('payPasswordModalStyles')) {
            const style = document.createElement('style');
            style.id = 'payPasswordModalStyles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .error-cancel-btn:hover {
                    border-color: var(--brand-500);
                    color: var(--brand-500);
                }
                .error-set-btn:hover, .error-gotit-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--neon-glow);
                }
            `;
            document.head.appendChild(style);
        }
        
        const modal = document.getElementById('errorModal');
        
        const closeModal = () => modal.remove();
        
        if (showSetPasswordBtn) {
            const setPasswordBtn = document.getElementById('setPasswordBtn');
            const cancelBtn = modal.querySelector('.error-cancel-btn');
            if (setPasswordBtn) {
                setPasswordBtn.onclick = () => {
                    modal.remove();
                    window.location.href = '/set-paypassword.html?from=withdraw';
                };
            }
            if (cancelBtn) cancelBtn.onclick = closeModal;
        } else {
            const gotItBtn = modal.querySelector('.error-gotit-btn');
            if (gotItBtn) gotItBtn.onclick = closeModal;
        }
        
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
    }

    window.closeErrorModal = function() {
        const modal = document.getElementById('errorModal');
        if (modal) modal.remove();
    };

    document.addEventListener('DOMContentLoaded', async function() {
        // DOM 元素
        const networkSelect = document.getElementById('network');
        const amountInput = document.getElementById('amount');
        const addressInput = document.getElementById('address');
        const receiveSpan = document.getElementById('receiveAmount');
        const feeSpan = document.getElementById('feeAmount');
        const amountHint = document.getElementById('amountHint');
        const confirmCheck = document.getElementById('confirmCheck');
        const submitBtn = document.getElementById('submitBtn');
        const balanceSpan = document.getElementById('balance');
        const testModeWarning = document.getElementById('testModeWarning');
        const switchToLiveBtn = document.getElementById('switchToLiveBtn');
        const balanceInsufficient = document.getElementById('balanceInsufficient');
        const currencySymbols = document.querySelectorAll('.currency');

        // 固定网络配置
        const NETWORKS = {
            'TRC20': { withdraw_fee: 1, min_withdraw: 10, is_active: 1 },
            'ERC20': { withdraw_fee: 1, min_withdraw: 10, is_active: 1 },
            'BEP20': { withdraw_fee: 1, min_withdraw: 10, is_active: 1 }
        };

        // 等待 ThemeManager 初始化
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            initModeSwitcher();
            await checkModeLockStatus();
            if (ThemeManager.isTestMode) {
                showTestModeWarning();
            }
        }

        /**
         * 检查支付密码是否已设置
         */
        async function checkPayPasswordStatus() {
            try {
                const response = await fetch('/api/v1/user/profile/paypassword/status', {
                    credentials: 'include'
                });
                const data = await response.json();
                if (data.success) {
                    return data.data.has_paypassword === true;
                }
                return false;
            } catch (err) {
                console.error('Failed to check payment password status:', err);
                return false;
            }
        }

        /**
         * 检查模式锁定状态
         */
        async function checkModeLockStatus() {
            try {
                const res = await fetch('/api/v1/user/mode/status', {
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success && data.data) {
                    const canSwitch = data.data.can_switch;
                    const modeSwitcher = document.getElementById('modeSwitcher');
                    if (modeSwitcher) {
                        modeSwitcher.style.display = canSwitch ? 'flex' : 'none';
                    }
                }
            } catch (err) {
                console.error('检查模式锁定状态失败:', err);
                const modeSwitcher = document.getElementById('modeSwitcher');
                if (modeSwitcher) modeSwitcher.style.display = 'none';
            }
        }

        function initModeSwitcher() {
            const modeBtns = document.querySelectorAll('.mode-btn');
            const testModeBadge = document.getElementById('testModeBadge');
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            
            modeBtns.forEach(btn => {
                const mode = btn.dataset.mode;
                if ((mode === 'test' && isTestMode) || (mode === 'live' && !isTestMode)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
                
                btn.addEventListener('click', async function() {
                    const targetMode = this.dataset.mode === 'test';
                    if (window.ThemeManager && window.ThemeManager.isTestMode !== targetMode) {
                        await window.ThemeManager.toggleMode();
                        window.location.reload();
                    }
                });
            });
            
            if (testModeBadge) {
                testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
            }
            updateCurrencySymbols(isTestMode);
        }

        function updateCurrencySymbols(isTestMode) {
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            currencySymbols.forEach(el => {
                el.textContent = currency;
            });
        }

        function showTestModeWarning() {
            if (testModeWarning) {
                testModeWarning.style.display = 'flex';
            }
            if (submitBtn) submitBtn.disabled = true;
            if (networkSelect) networkSelect.disabled = true;
            if (amountInput) amountInput.disabled = true;
            if (addressInput) addressInput.disabled = true;
            if (confirmCheck) confirmCheck.disabled = true;
        }

        if (switchToLiveBtn) {
            switchToLiveBtn.addEventListener('click', async function() {
                if (window.ThemeManager && ThemeManager.isTestMode) {
                    try {
                        if (amountInput) amountInput.value = '';
                        if (addressInput) addressInput.value = '';
                        if (confirmCheck) confirmCheck.checked = false;
                        if (receiveSpan) receiveSpan.innerHTML = '0.00 <span class="currency">USDT</span>';
                        
                        const response = await fetch('/api/v1/user/mode/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ is_test_mode: false })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            setTimeout(() => window.location.reload(), 50);
                        }
                    } catch (err) {
                        console.error('切换模式失败:', err);
                    }
                }
            });
        }

        async function loadBalance() {
            try {
                const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
                const currency = isTestMode ? 'tUSDT' : 'USDT';
                
                const response = await fetch('/api/v1/user/balance', { credentials: 'include' });
                const data = await response.json();
                
                if (data.success) {
                    const balance = isTestMode ? (data.data.test_balance || 0) : (data.data.balance || 0);
                    balanceSpan.innerHTML = balance.toFixed(2) + ' <span class="currency">' + currency + '</span>';
                    
                    if (balance <= 0 && !isTestMode) {
                        if (balanceInsufficient) balanceInsufficient.style.display = 'flex';
                        if (submitBtn) submitBtn.disabled = true;
                    }
                }
            } catch (err) {
                console.error('Failed to load balance:', err);
            }
        }

        function loadWithdrawRules() {
            updateNetworkSelect();
        }

        function updateNetworkSelect() {
            if (!networkSelect) return;
            networkSelect.innerHTML = '';
            const networkOrder = ['TRC20', 'ERC20', 'BEP20'];
            
            networkOrder.forEach(net => {
                if (NETWORKS[net] && NETWORKS[net].is_active === 1) {
                    const option = document.createElement('option');
                    option.value = net;
                    option.textContent = net === 'TRC20' ? 'TRC20 (Tron) - Recommended' : 
                                        net === 'ERC20' ? 'ERC20 (Ethereum)' : 'BEP20 (BSC)';
                    networkSelect.appendChild(option);
                }
            });
            networkSelect.disabled = false;
            updateNetworkInfo();
        }

        function updateNetworkInfo() {
            const network = networkSelect ? networkSelect.value : 'TRC20';
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            
            if (NETWORKS[network]) {
                const netConfig = NETWORKS[network];
                const fee = netConfig.withdraw_fee || 1;
                const minWithdraw = netConfig.min_withdraw || 10;
                
                if (feeSpan) feeSpan.innerHTML = fee + ' <span class="currency">' + currency + '</span>';
                if (amountHint) amountHint.innerHTML = `Minimum withdrawal: ${minWithdraw} ${currency}`;
                if (amountInput) amountInput.min = minWithdraw;
                calculateReceive();
            }
        }

        function calculateReceive() {
            const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
            const network = networkSelect ? networkSelect.value : 'TRC20';
            let fee = 1;
            if (NETWORKS[network]) fee = NETWORKS[network].withdraw_fee || 1;
            
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            const receive = Math.max(0, amount - fee);
            if (receiveSpan) receiveSpan.innerHTML = receive.toFixed(2) + ' <span class="currency">' + currency + '</span>';
            if (feeSpan) feeSpan.innerHTML = fee + ' <span class="currency">' + currency + '</span>';
        }

        function checkForm() {
            if (window.ThemeManager && ThemeManager.isTestMode) {
                if (submitBtn) submitBtn.disabled = true;
                return;
            }
            
            const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
            const address = addressInput ? addressInput.value.trim() : '';
            const checked = confirmCheck ? confirmCheck.checked : false;
            const balanceText = balanceSpan ? balanceSpan.textContent.split(' ')[0] : '0';
            const balance = parseFloat(balanceText) || 0;
            const network = networkSelect ? networkSelect.value : 'TRC20';
            let minWithdraw = NETWORKS[network]?.min_withdraw || 10;
            
            if (amount >= minWithdraw && address && checked && amount <= balance) {
                if (submitBtn) submitBtn.disabled = false;
            } else {
                if (submitBtn) submitBtn.disabled = true;
            }
        }

        // 事件绑定
        if (networkSelect) {
            networkSelect.addEventListener('change', function() {
                updateNetworkInfo();
                checkForm();
            });
        }

        if (amountInput) {
            amountInput.addEventListener('input', function() {
                calculateReceive();
                checkForm();
            });
        }

        if (addressInput) {
            addressInput.addEventListener('input', checkForm);
        }

        if (confirmCheck) {
            confirmCheck.addEventListener('change', checkForm);
        }

        function showWithdrawSuccessModal() {
            const modal = document.getElementById('withdrawSuccessModal');
            if (modal) modal.classList.add('show');
        }

        // ========== 提交按钮 - 支付密码弹窗流程 ==========
        if (submitBtn) {
            submitBtn.addEventListener('click', async function() {
                if (window.ThemeManager && ThemeManager.isTestMode) {
                    showErrorModal('Withdrawals are disabled in Test Mode. Please switch to Live Mode.', false);
                    return;
                }
                
                const amount = parseFloat(amountInput ? amountInput.value : 0);
                const address = addressInput ? addressInput.value.trim() : '';
                const network = networkSelect ? networkSelect.value : '';
                
                const balanceText = balanceSpan ? balanceSpan.textContent.split(' ')[0] : '0';
                const balance = parseFloat(balanceText) || 0;

                if (!network || !NETWORKS[network]) {
                    showErrorModal('Please select a valid network', false);
                    return;
                }

                const minWithdraw = NETWORKS[network].min_withdraw || 10;

                if (amount > balance) {
                    showErrorModal('Insufficient balance', false);
                    return;
                }

                if (!address) {
                    showErrorModal('Please enter withdrawal address', false);
                    return;
                }

                if (amount < minWithdraw) {
                    showErrorModal(`Minimum withdrawal amount is ${minWithdraw} USDT`, false);
                    return;
                }

                // ========== 第一步：检查是否设置了支付密码 ==========
                const hasPayPassword = await checkPayPasswordStatus();
                
                if (!hasPayPassword) {
                    showErrorModal(
                        'You need to set a payment password before withdrawing funds. This is required for security.',
                        true
                    );
                    return;
                }
                
                // ========== 第二步：弹出支付密码输入框 ==========
                showPayPasswordModal(async (password) => {
                    // 密码验证通过后，提交提现请求
                    try {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Processing...';
                        
                        const response = await fetch('/api/v1/user/withdraw/user/submit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                amount: amount,
                                address: address,
                                network: network,
                                pay_password: password
                            })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showWithdrawSuccessModal();
                            if (amountInput) amountInput.value = '';
                            if (addressInput) addressInput.value = '';
                            if (confirmCheck) confirmCheck.checked = false;
                            if (receiveSpan) receiveSpan.innerHTML = '0.00 <span class="currency">USDT</span>';
                            loadBalance();
                        } else {
                            showErrorModal(data.message || 'Withdrawal failed', false);
                        }
                    } catch (err) {
                        console.error('Withdrawal error:', err);
                        showErrorModal('Withdrawal failed. Please try again.', false);
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Confirm Withdrawal';
                    }
                });
            });
        }

        await loadBalance();
        loadWithdrawRules();
        checkForm();
    });

    window.toggleFaq = function(element) {
        const answer = element.nextElementSibling;
        const icon = element.querySelector('i');
        if (answer.style.maxHeight) {
            answer.style.maxHeight = null;
            icon.style.transform = 'rotate(0deg)';
        } else {
            answer.style.maxHeight = answer.scrollHeight + 'px';
            icon.style.transform = 'rotate(180deg)';
        }
    };
})();