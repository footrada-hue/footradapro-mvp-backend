/**
 * 管理员登录
 * 使用 HttpOnly Cookie 进行身份验证，前端无需处理 token
 */

(function() {
    'use strict';

    // DOM 元素
    const loginForm = document.getElementById('adminLoginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // 显示错误信息
    function showError(message) {
        if (loginError) {
            loginError.textContent = message;
            loginError.style.display = 'block';
        }
        // 5秒后自动隐藏错误信息
        setTimeout(() => {
            if (loginError) {
                loginError.style.display = 'none';
            }
        }, 5000);
    }

    // 显示加载状态
    function setLoading(isLoading) {
        if (loginBtn) {
            if (isLoading) {
                loginBtn.disabled = true;
                loginBtn.classList.add('loading');
                const originalText = loginBtn.textContent;
                loginBtn.setAttribute('data-original-text', originalText);
                loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
            } else {
                loginBtn.disabled = false;
                loginBtn.classList.remove('loading');
                const originalText = loginBtn.getAttribute('data-original-text');
                if (originalText) {
                    loginBtn.textContent = originalText;
                }
            }
        }
        
        if (loadingSpinner) {
            loadingSpinner.style.display = isLoading ? 'flex' : 'none';
        }
    }

    // 处理登录
    async function handleLogin(event) {
        event.preventDefault();
        
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        
        // 验证输入
        if (!username) {
            showError('请输入用户名');
            usernameInput?.focus();
            return;
        }
        
        if (!password) {
            showError('请输入密码');
            passwordInput?.focus();
            return;
        }
        
        // 显示加载状态
        setLoading(true);
        
        // 隐藏之前的错误信息
        if (loginError) {
            loginError.style.display = 'none';
        }
        
        try {
            const response = await fetch('/api/v1/admin/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',  // 重要：确保携带 Cookie
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // 登录成功，跳转到后台仪表板
                // HttpOnly Cookie 已由后端自动设置，前端无需处理
                window.location.href = '/admin/dashboard.html';
            } else {
                // 登录失败
                const errorMsg = result.error || '用户名或密码错误';
                showError(errorMsg);
                setLoading(false);
                
                // 清空密码输入框
                if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }
        } catch (err) {
            console.error('登录请求失败:', err);
            showError('网络错误，请检查网络连接后重试');
            setLoading(false);
        }
    }

    // 初始化事件监听
    function init() {
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        
        // 回车键提交
        const handleKeyPress = (e) => {
            if (e.key === 'Enter' && loginForm) {
                e.preventDefault();
                handleLogin(e);
            }
        };
        
        if (passwordInput) {
            passwordInput.addEventListener('keypress', handleKeyPress);
        }
        
        // 检查是否已登录（可选：如果已登录则跳转到仪表板）
        checkExistingSession();
    }
    
    // 检查是否已有有效会话
    async function checkExistingSession() {
        try {
            const response = await fetch('/api/v1/admin/verify', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 已有有效会话，直接跳转
                    window.location.href = '/admin/dashboard.html';
                }
            }
        } catch (err) {
            // 会话无效，停留在登录页
            console.debug('No active session');
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();