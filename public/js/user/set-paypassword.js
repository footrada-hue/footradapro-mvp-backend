/**
 * FOOTRADAPRO - Set Payment Password Controller
 * Real users only, test users are redirected with warning
 * Version: 2.4.0 - SPA 架构适配
 */

(function() {
    'use strict';

    const DOM = {
        mainContent: document.getElementById('mainContent'),
        testModeWarning: document.getElementById('testModeWarning'),
        pageTitle: document.getElementById('pageTitle'),
        infoBox: document.getElementById('infoBox'),
        infoText: document.getElementById('infoText'),
        oldPasswordField: document.getElementById('oldPasswordField'),
        oldPassword: document.getElementById('oldPassword'),
        newPassword: document.getElementById('newPassword'),
        confirmPassword: document.getElementById('confirmPassword'),
        newPasswordLabel: document.getElementById('newPasswordLabel'),
        confirmPasswordLabel: document.getElementById('confirmPasswordLabel'),
        passwordHint: document.getElementById('passwordHint'),
        footerText: document.getElementById('footerText'),
        submitBtn: document.getElementById('submitBtn'),
        errorMsg: document.getElementById('errorMsg'),
        successMsg: document.getElementById('successMsg'),
    };

    // 從 URL 獲取模式和來源
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || 'set'; // 'set' 或 'change'
    const from = urlParams.get('from'); // 來源頁面

    // 初始化時檢查用戶模式和支付密碼狀態
    document.addEventListener('DOMContentLoaded', async () => {
        const [isTestMode, hasPayPassword] = await checkUserStatus();
        
        if (isTestMode) {
            showTestModeWarning();
            return;
        }

        // 根據模式檢查
        if (mode === 'set' && hasPayPassword) {
            showError('Payment password already set. Redirecting to change page...');
            setTimeout(() => {
                window.location.href = '/shell.html?page=set-paypassword&mode=change&from=profile';
            }, 2000);
            return;
        }

        if (mode === 'change' && !hasPayPassword) {
            showError('Payment password not set. Redirecting to set page...');
            setTimeout(() => {
                window.location.href = '/shell.html?page=set-paypassword&from=profile';
            }, 2000);
            return;
        }

        // 正常初始化表單
        initForm();
    });

    // 檢查用戶模式和支付密碼狀態
    async function checkUserStatus() {
        try {
            const [modeRes, statusRes] = await Promise.all([
                fetch('/api/v1/user/mode', { credentials: 'include' }),
                fetch('/api/v1/user/profile/paypassword/status', { credentials: 'include' })
            ]);
            
            const modeData = await modeRes.json();
            const statusData = await statusRes.json();
            
            const isTestMode = modeData.success ? modeData.data.is_test_mode : false;
            const hasPayPassword = statusData.success ? statusData.data.has_paypassword : false;
            
            return [isTestMode, hasPayPassword];
        } catch (err) {
            console.error('Failed to check user status:', err);
            return [false, false];
        }
    }

    // 顯示測試模式警告 - 修改為 SPA 跳轉
    function showTestModeWarning() {
        if (DOM.mainContent) DOM.mainContent.style.display = 'none';
        if (DOM.testModeWarning) DOM.testModeWarning.style.display = 'block';
        
        const backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.onclick = () => window.location.href = '/shell.html?page=profile';
        }
    }

    // 初始化表單
    function initForm() {
        // 根據模式更新 UI
        updateUIByMode();
        
        // 綁定事件
        if (DOM.oldPassword) {
            DOM.oldPassword.addEventListener('input', checkForm);
        }
        DOM.newPassword.addEventListener('input', checkForm);
        DOM.confirmPassword.addEventListener('input', checkForm);
        DOM.submitBtn.addEventListener('click', submitPassword);

        // 顯示/隱藏密碼功能
        window.togglePassword = togglePassword;
    }

    // 根據模式更新 UI
    function updateUIByMode() {
        const isChangeMode = mode === 'change';
        
        // 更新標題
        if (DOM.pageTitle) {
            DOM.pageTitle.textContent = isChangeMode ? 'Change Payment Password' : 'Set Payment Password';
        }
        
        // 更新信息框文字
        if (DOM.infoText) {
            DOM.infoText.textContent = isChangeMode 
                ? 'Enter your current payment password to set a new one. This password is required for withdrawals and authorizations.'
                : 'Set a payment password for withdrawals and transaction authorization. This adds an extra layer of security to your account.';
        }
        
        // 顯示/隱藏舊密碼字段
        if (DOM.oldPasswordField) {
            DOM.oldPasswordField.style.display = isChangeMode ? 'block' : 'none';
        }
        
        // 更新標籤文字
        if (DOM.newPasswordLabel) {
            DOM.newPasswordLabel.textContent = isChangeMode ? 'New Payment Password' : 'Payment Password';
        }
        if (DOM.confirmPasswordLabel) {
            DOM.confirmPasswordLabel.textContent = isChangeMode ? 'Confirm New Password' : 'Confirm Password';
        }
        
        // 提示文字
        if (DOM.passwordHint) {
            DOM.passwordHint.innerHTML = '<i class="fas fa-info-circle"></i> 6 digits, numbers only';
        }
        
        // 更新底部文字
        if (DOM.footerText) {
            DOM.footerText.textContent = isChangeMode 
                ? 'Changing your payment password will affect withdrawals and authorizations'
                : 'This password is required for withdrawals and authorizations';
        }
        
        // 更新按鈕文字
        if (DOM.submitBtn) {
            DOM.submitBtn.textContent = isChangeMode ? 'Change Payment Password' : 'Set Payment Password';
        }
    }

    // 檢查表單
    function checkForm() {
        const isChangeMode = mode === 'change';
        
        // 檢查舊密碼（修改模式）
        if (isChangeMode && (!DOM.oldPassword || !DOM.oldPassword.value)) {
            DOM.submitBtn.disabled = true;
            return;
        }
        
        const pwd = DOM.newPassword.value;
        const confirm = DOM.confirmPassword.value;
        
        // 6位數字驗證
        const isValid = /^\d{6}$/.test(pwd) && pwd === confirm;
        
        DOM.submitBtn.disabled = !isValid;
        hideMessages();
    }

    // 隱藏消息
    function hideMessages() {
        if (DOM.errorMsg) {
            DOM.errorMsg.style.display = 'none';
            DOM.errorMsg.textContent = '';
        }
        if (DOM.successMsg) {
            DOM.successMsg.style.display = 'none';
            DOM.successMsg.textContent = '';
        }
    }

    // 顯示錯誤
    function showError(message) {
        if (DOM.errorMsg) {
            DOM.errorMsg.textContent = message;
            DOM.errorMsg.style.display = 'flex';
        }
        if (DOM.successMsg) DOM.successMsg.style.display = 'none';
    }

    // 顯示成功
    function showSuccess(message) {
        if (DOM.successMsg) {
            DOM.successMsg.textContent = message;
            DOM.successMsg.style.display = 'flex';
        }
        if (DOM.errorMsg) DOM.errorMsg.style.display = 'none';
    }

    // 提交密碼
    async function submitPassword() {
        const isChangeMode = mode === 'change';
        const pwd = DOM.newPassword.value;
        const confirm = DOM.confirmPassword.value;

        // 再次驗證
        if (pwd !== confirm) {
            showError('Passwords do not match');
            return;
        }
        
        // 6位數字驗證
        if (!/^\d{6}$/.test(pwd)) {
            showError('Payment password must be 6 digits');
            return;
        }

        // 修改模式需要舊密碼
        if (isChangeMode && (!DOM.oldPassword || !DOM.oldPassword.value)) {
            showError('Please enter current password');
            return;
        }

        // 禁用按鈕
        DOM.submitBtn.disabled = true;
        DOM.submitBtn.textContent = isChangeMode ? 'Changing...' : 'Setting...';

        try {
            // 根據模式選擇不同的 API
            const url = isChangeMode 
                ? '/api/v1/user/profile/paypassword/change'
                : '/api/v1/user/profile/paypassword/set';
            
            // 構建請求體
            const body = isChangeMode
                ? { 
                    old_password: DOM.oldPassword.value,
                    new_password: pwd, 
                    confirm_password: confirm 
                  }
                : { 
                    password: pwd, 
                    confirm_password: confirm 
                  };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                credentials: 'include'
            });

            const data = await res.json();

            if (data.success) {
                // 成功提示
                const successMessage = isChangeMode 
                    ? 'Payment password changed successfully!' 
                    : 'Payment password set successfully!';
                showSuccess(successMessage);

                // ✅ 修改：2秒後返回 SPA 個人中心
                setTimeout(() => {
                    window.location.href = '/shell.html?page=profile&refresh=paypassword';
                }, 2000);
            } else {
                // 錯誤處理
                let errorMsg = data.message || 'Operation failed';
                
                switch (data.error) {
                    case 'ALREADY_SET':
                        errorMsg = 'Payment password already set';
                        break;
                    case 'TEST_MODE_USER':
                        errorMsg = 'Test mode users cannot set payment password';
                        break;
                    case 'INVALID_OLD_PASSWORD':
                        errorMsg = 'Current password is incorrect';
                        break;
                    case 'PASSWORD_MISMATCH':
                        errorMsg = 'Passwords do not match';
                        break;
                    case 'INVALID_PASSWORD_FORMAT':
                        errorMsg = 'Payment password must be 6 digits';
                        break;
                }
                
                showError(errorMsg);
                
                // 恢復按鈕
                DOM.submitBtn.disabled = false;
                DOM.submitBtn.textContent = isChangeMode ? 'Change Payment Password' : 'Set Payment Password';
            }

        } catch (err) {
            showError('Network error. Please try again.');
            console.error('Password operation error:', err);
            
            DOM.submitBtn.disabled = false;
            DOM.submitBtn.textContent = isChangeMode ? 'Change Payment Password' : 'Set Payment Password';
        }
    }

    // 顯示/隱藏密碼
    function togglePassword(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        
        if (input && icon) {
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    }

    // 暴露全局函數
    window.togglePassword = togglePassword;
})();