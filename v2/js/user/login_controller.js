/**
 * FOOTRADAPRO MVP - 登录页控制器
 * @description 处理登录表单验证
 * 主題切換已移至 HTML 獨立管理，此文件僅處理登錄邏輯
 */

(function() {
    'use strict';

    // 等待全局配置加载
    if (!window.FOOTRADAPRO) {
        console.error('FOOTRADAPRO config not loaded');
        return;
    }

    const CONFIG = window.FOOTRADAPRO;
    const UTILS = CONFIG.UTILS;

    // ==================== 应用状态 ====================
    const AppState = {
        touched: { email: false, password: false }
    };

    // ==================== DOM 元素 ====================
    const elements = {
        loginForm: document.getElementById('loginForm'),
        emailInput: document.getElementById('email'),
        passwordInput: document.getElementById('password'),
        loginBtn: document.getElementById('loginBtn'),
        passwordToggle: document.getElementById('passwordToggle'),
        emailError: document.getElementById('email-error'),
        passwordError: document.getElementById('password-error')
    };

    // ==================== 初始化 ====================
    function init() {
        bindEvents();
        checkRedirect();
    }

    // ==================== 表单验证 ====================
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validateForm() {
        const email = elements.emailInput?.value.trim() || '';
        const password = elements.passwordInput?.value || '';
        
        const isEmailValid = validateEmail(email);
        const isPasswordValid = password.length >= 6;
        
        // 启用/禁用登录按钮
        if (elements.loginBtn) {
            elements.loginBtn.disabled = !(isEmailValid && isPasswordValid);
        }
        
        // 显示错误信息（如果已触摸）
        if (AppState.touched.email && !isEmailValid && email !== '') {
            showError(elements.emailError, 'Invalid email format');
        } else {
            hideError(elements.emailError);
        }
        
        if (AppState.touched.password && !isPasswordValid && password !== '') {
            showError(elements.passwordError, 'Password must be at least 6 characters');
        } else {
            hideError(elements.passwordError);
        }
        
        return isEmailValid && isPasswordValid;
    }

    function showError(element, message) {
        if (element) {
            element.textContent = message;
        }
    }

    function hideError(element) {
        if (element) {
            element.textContent = '';
        }
    }

    // ==================== 检查是否已登录（重定向）====================
    function checkRedirect() {
        const token = UTILS.getStorage('token');
        if (token) {
            window.location.href = '/index.html';
        }
    }

    // ==================== 处理登录提交 ====================
    async function handleSubmit(e) {
        e.preventDefault();
        
        // 标记所有字段为已触摸
        AppState.touched.email = true;
        AppState.touched.password = true;
        
        // 验证表单
        if (!validateForm()) return;
        
        const email = elements.emailInput.value.trim();
        const password = elements.passwordInput.value;
        const btn = elements.loginBtn;
        
        const originalHTML = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Signing in...';
        
        try {
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: email, 
                    password: password 
                }),
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                btn.innerHTML = '<span>✓ Success</span>';
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 800);
            } else {
                throw new Error(result.error || 'Login failed');
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            showError(elements.passwordError, err.message);
        }
    }

    // ==================== 绑定事件 ====================
    function bindEvents() {
        // 密码显示切换
        if (elements.passwordToggle) {
            elements.passwordToggle.addEventListener('click', () => {
                const input = elements.passwordInput;
                const icon = elements.passwordToggle.querySelector('i');
                const isPassword = input.type === 'password';
                
                input.type = isPassword ? 'text' : 'password';
                icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
            });
        }
        
        // 输入框失焦事件（标记已触摸）
        if (elements.emailInput) {
            elements.emailInput.addEventListener('blur', () => {
                AppState.touched.email = true;
                validateForm();
            });
            elements.emailInput.addEventListener('input', validateForm);
        }
        
        if (elements.passwordInput) {
            elements.passwordInput.addEventListener('blur', () => {
                AppState.touched.password = true;
                validateForm();
            });
            elements.passwordInput.addEventListener('input', validateForm);
        }
        
        // 表单提交
        if (elements.loginForm) {
            elements.loginForm.addEventListener('submit', handleSubmit);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();   