/**
 * FOOTRADAPRO - 修改密碼頁面控制器
 * @description 管理修改登錄密碼功能
 */

(function() {
    'use strict';

    const DOM = {
        // 表單元素
        currentPassword: document.getElementById('currentPassword'),
        newPassword: document.getElementById('newPassword'),
        confirmPassword: document.getElementById('confirmPassword'),
        passwordForm: document.getElementById('passwordForm'),
        submitBtn: document.getElementById('submitBtn'),
        
        // 提示元素
        testModeBadge: document.getElementById('testModeBadge'),
        testModeHint: document.getElementById('testModeHint'),
        errorMessage: document.getElementById('errorMessage'),
        errorText: document.getElementById('errorText'),
        successMessage: document.getElementById('successMessage'),
        successText: document.getElementById('successText'),
        
        // 密碼強度元素
        strengthBars: [
            document.getElementById('strengthBar1'),
            document.getElementById('strengthBar2'),
            document.getElementById('strengthBar3'),
            document.getElementById('strengthBar4')
        ],
        strengthText: document.getElementById('strengthText'),
        
        // 規則元素
        ruleLength: document.getElementById('ruleLength'),
        ruleUppercase: document.getElementById('ruleUppercase'),
        ruleLowercase: document.getElementById('ruleLowercase'),
        ruleNumber: document.getElementById('ruleNumber'),
        ruleMatch: document.getElementById('ruleMatch')
    };

    // 初始化
    document.addEventListener('DOMContentLoaded', async function() {
        // 等待 ThemeManager 初始化
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ 修改密碼頁面 ThemeManager 初始化完成，當前模式:', ThemeManager.isTestMode ? '測試' : '真實');
            
            // 更新測試模式UI
            updateTestModeUI(ThemeManager.isTestMode);
        }

        // 綁定事件
        bindEvents();
    });

    // 更新測試模式UI
    function updateTestModeUI(isTestMode) {
        // 更新測試模式徽章
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
        
        // 更新測試模式提示
        if (DOM.testModeHint) {
            DOM.testModeHint.style.display = isTestMode ? 'flex' : 'none';
        }
        
        // 測試模式下禁用所有輸入和提交按鈕
        if (isTestMode) {
            if (DOM.submitBtn) DOM.submitBtn.disabled = true;
            [DOM.currentPassword, DOM.newPassword, DOM.confirmPassword].forEach(input => {
                if (input) input.disabled = true;
            });
        }
    }

    // 綁定事件
    function bindEvents() {
        // 密碼輸入監聽
        if (DOM.newPassword) {
            DOM.newPassword.addEventListener('input', function() {
                checkPasswordStrength();
                validateForm();
            });
        }

        if (DOM.confirmPassword) {
            DOM.confirmPassword.addEventListener('input', function() {
                updateRuleMatch();
                validateForm();
            });
        }

        if (DOM.currentPassword) {
            DOM.currentPassword.addEventListener('input', validateForm);
        }

        // 表單提交
        if (DOM.passwordForm) {
            DOM.passwordForm.addEventListener('submit', handleSubmit);
        }
    }

    // 切換密碼可見性（全局函數）
    window.togglePassword = function(inputId) {
        const input = document.getElementById(inputId);
        const icon = event.currentTarget.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    };

    // 檢查密碼強度
    function checkPasswordStrength() {
        const password = DOM.newPassword?.value || '';
        
        // 規則檢查
        const hasLength = password.length >= 8;
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        
        // 更新規則圖標
        updateRule(DOM.ruleLength, hasLength);
        updateRule(DOM.ruleUppercase, hasUppercase);
        updateRule(DOM.ruleLowercase, hasLowercase);
        updateRule(DOM.ruleNumber, hasNumber);
        
        // 計算強度
        let strength = 0;
        if (hasLength) strength++;
        if (hasUppercase) strength++;
        if (hasLowercase) strength++;
        if (hasNumber) strength++;
        
        // 更新強度條
        DOM.strengthBars.forEach((bar, index) => {
            if (bar) {
                if (index < strength) {
                    bar.classList.add('active');
                } else {
                    bar.classList.remove('active');
                }
            }
        });
        
        // 更新強度文字
        if (DOM.strengthText) {
            if (password.length === 0) {
                DOM.strengthText.textContent = 'Enter new password';
                DOM.strengthText.className = 'strength-text';
            } else if (strength <= 2) {
                DOM.strengthText.textContent = 'Weak password';
                DOM.strengthText.className = 'strength-text weak';
            } else if (strength === 3) {
                DOM.strengthText.textContent = 'Medium password';
                DOM.strengthText.className = 'strength-text medium';
            } else {
                DOM.strengthText.textContent = 'Strong password';
                DOM.strengthText.className = 'strength-text strong';
            }
        }
    }

    // 更新規則匹配
    function updateRuleMatch() {
        const newPassword = DOM.newPassword?.value || '';
        const confirmPassword = DOM.confirmPassword?.value || '';
        const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
        
        updateRule(DOM.ruleMatch, passwordsMatch);
    }

    // 更新規則圖標
    function updateRule(ruleElement, isValid) {
        if (!ruleElement) return;
        
        const icon = ruleElement.querySelector('i');
        if (isValid) {
            ruleElement.classList.add('valid');
            ruleElement.classList.remove('invalid');
            icon.className = 'fas fa-check-circle';
        } else {
            ruleElement.classList.add('invalid');
            ruleElement.classList.remove('valid');
            icon.className = 'fas fa-circle';
        }
    }

    // 驗證表單
    function validateForm() {
        const currentPassword = DOM.currentPassword?.value || '';
        const newPassword = DOM.newPassword?.value || '';
        const confirmPassword = DOM.confirmPassword?.value || '';
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        
        // 檢查密碼匹配
        const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
        
        // 檢查所有條件
        const hasLength = newPassword.length >= 8;
        const hasUppercase = /[A-Z]/.test(newPassword);
        const hasLowercase = /[a-z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        
        const isValid = !isTestMode && 
                       currentPassword.length > 0 &&
                       hasLength && 
                       hasUppercase && 
                       hasLowercase && 
                       hasNumber && 
                       passwordsMatch;
        
        if (DOM.submitBtn) {
            DOM.submitBtn.disabled = !isValid;
        }
    }

    // 處理表單提交
    async function handleSubmit(event) {
        event.preventDefault();
        
        const currentPassword = DOM.currentPassword?.value || '';
        const newPassword = DOM.newPassword?.value || '';

        // 隱藏之前的提示
        if (DOM.errorMessage) DOM.errorMessage.style.display = 'none';
        if (DOM.successMessage) DOM.successMessage.style.display = 'none';

        try {
            if (DOM.submitBtn) {
                DOM.submitBtn.disabled = true;
                DOM.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }

            const response = await fetch('/api/v1/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });

            const data = await response.json();

            if (data.success) {
                // 顯示成功提示
                if (DOM.successText) DOM.successText.textContent = 'Password changed successfully!';
                if (DOM.successMessage) DOM.successMessage.style.display = 'flex';
                
                // 清空表單
                if (DOM.currentPassword) DOM.currentPassword.value = '';
                if (DOM.newPassword) DOM.newPassword.value = '';
                if (DOM.confirmPassword) DOM.confirmPassword.value = '';
                
                // 重置密碼強度顯示
                checkPasswordStrength();
                
                // 2秒後跳轉回設置頁面
                setTimeout(() => {
                    window.location.href = '/settings.html';
                }, 2000);
            } else {
                // 顯示錯誤提示
                if (DOM.errorText) DOM.errorText.textContent = data.message || 'Failed to change password';
                if (DOM.errorMessage) DOM.errorMessage.style.display = 'flex';
                
                if (DOM.submitBtn) {
                    DOM.submitBtn.disabled = false;
                    DOM.submitBtn.innerHTML = '<i class="fas fa-key"></i><span>Change Password</span>';
                }
            }
        } catch (err) {
            console.error('Change password error:', err);
            if (DOM.errorText) DOM.errorText.textContent = 'Network error, please try again';
            if (DOM.errorMessage) DOM.errorMessage.style.display = 'flex';
            
            if (DOM.submitBtn) {
                DOM.submitBtn.disabled = false;
                DOM.submitBtn.innerHTML = '<i class="fas fa-key"></i><span>Change Password</span>';
            }
        }
    }
})();