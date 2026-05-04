/**
 * FOOTRADAPRO - Login Controller
 * @description Handles login form validation, authentication, and token storage
 * @version 2.0.0
 * @i18n Ready - All user-facing text marked for translation
 */

(function() {
    'use strict';

    // ==================== I18N Text Dictionary ====================
    const I18N_TEXTS = {
        en: {
            'error.invalid_email': 'Please enter a valid email address',
            'error.password_min': 'Password must be at least 6 characters',
            'error.login_failed': 'Login failed. Please check your credentials',
            'error.network': 'Network error. Please try again',
            'error.server': 'Server error. Please try again later',
            'error.unauthorized': 'Invalid email or password',
            'btn.signing_in': 'Signing in...',
            'btn.success': 'Success',
            'btn.login': 'Sign In',
            'success.login': 'Login successful! Redirecting...'
        },
        zh: {
            'error.invalid_email': '请输入有效的邮箱地址',
            'error.password_min': '密码至少需要6个字符',
            'error.login_failed': '登录失败，请检查您的账号信息',
            'error.network': '网络错误，请稍后重试',
            'error.server': '服务器错误，请稍后重试',
            'error.unauthorized': '邮箱或密码错误',
            'btn.signing_in': '登录中...',
            'btn.success': '成功',
            'btn.login': '登录',
            'success.login': '登录成功！正在跳转...'
        }
    };

    let currentLanguage = localStorage.getItem('language') || 'en';

    function t(key) {
        const locale = I18N_TEXTS[currentLanguage] || I18N_TEXTS.en;
        return locale[key] || key;
    }

const CONFIG = {
    TOKEN_STORAGE_KEYS: {
        COOKIE: 'footradapro_token',
        LOCAL_STORAGE: 'footradapro_token',
        LEGACY_AUTH: 'auth_token'
    },
    REDIRECT_URL: '/shell.html?page=home'  // ✅ 修改为 SPA 首页
};

    const Utils = {
        setCookie(name, value, days = 7) {
            const expires = new Date();
            expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
            document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
            console.log(`[Utils] Cookie set: ${name}=${value.substring(0, 20)}...`);
        },

        getCookie(name) {
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            return match ? match[2] : null;
        },

        storeToken(token) {
            if (!token) return;
            // 同時設置 Cookie 和 localStorage
            this.setCookie(CONFIG.TOKEN_STORAGE_KEYS.COOKIE, token);
            localStorage.setItem(CONFIG.TOKEN_STORAGE_KEYS.LOCAL_STORAGE, token);
            localStorage.setItem(CONFIG.TOKEN_STORAGE_KEYS.LEGACY_AUTH, token);
            console.log('[Login] Token stored successfully in both Cookie and localStorage');
        },

        showError(element, message) {
            if (element) {
                element.textContent = message;
                element.style.display = 'block';
            }
        },

        hideError(element) {
            if (element) {
                element.textContent = '';
                element.style.display = 'none';
            }
        },

        setButtonState(btn, isLoading, customText = null) {
            if (!btn) return;
            if (isLoading) {
                btn.disabled = true;
                btn.dataset.originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="spinner"></span> ${customText || t('btn.signing_in')}`;
            } else {
                btn.disabled = false;
                if (btn.dataset.originalHtml) {
                    btn.innerHTML = btn.dataset.originalHtml;
                } else {
                    btn.innerHTML = customText || t('btn.login');
                }
            }
        }
    };

    const AppState = {
        touched: { email: false, password: false },
        isSubmitting: false
    };

    const elements = {
        loginForm: document.getElementById('loginForm'),
        emailInput: document.getElementById('email'),
        passwordInput: document.getElementById('password'),
        loginBtn: document.getElementById('loginBtn'),
        passwordToggle: document.getElementById('passwordToggle'),
        emailError: document.getElementById('email-error'),
        passwordError: document.getElementById('password-error'),
        generalError: document.getElementById('general-error')
    };

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(password) {
        return password && password.length >= 6;
    }

    function validateForm() {
        const email = elements.emailInput?.value.trim() || '';
        const password = elements.passwordInput?.value || '';
        
        const isEmailValid = validateEmail(email);
        const isPasswordValid = validatePassword(password);
        const isFormValid = isEmailValid && isPasswordValid;
        
        if (elements.loginBtn) {
            elements.loginBtn.disabled = !isFormValid;
        }
        
        if (AppState.touched.email && email !== '') {
            if (!isEmailValid) {
                Utils.showError(elements.emailError, t('error.invalid_email'));
            } else {
                Utils.hideError(elements.emailError);
            }
        }
        
        if (AppState.touched.password && password !== '') {
            if (!isPasswordValid) {
                Utils.showError(elements.passwordError, t('error.password_min'));
            } else {
                Utils.hideError(elements.passwordError);
            }
        }
        
        return isFormValid;
    }

    function checkRedirect() {
        const token = Utils.getCookie(CONFIG.TOKEN_STORAGE_KEYS.COOKIE) || 
                      localStorage.getItem(CONFIG.TOKEN_STORAGE_KEYS.LOCAL_STORAGE);
        if (token) {
            console.log('[Login] User already logged in, redirecting...');
            window.location.href = CONFIG.REDIRECT_URL;
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (AppState.isSubmitting) return;
        
        AppState.touched.email = true;
        AppState.touched.password = true;
        
        if (!validateForm()) return;
        
        const email = elements.emailInput.value.trim();
        const password = elements.passwordInput.value;
        
        AppState.isSubmitting = true;
        Utils.setButtonState(elements.loginBtn, true);
        Utils.hideError(elements.generalError);
        Utils.hideError(elements.passwordError);
        
        try {
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ username: email, password: password }),
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                if (result.data?.token) {
                    Utils.storeToken(result.data.token);
                }
                
                Utils.setButtonState(elements.loginBtn, false, t('btn.success'));
                setTimeout(() => {
                    window.location.href = CONFIG.REDIRECT_URL;
                }, 800);
            } else {
                let errorMessage = t('error.login_failed');
                if (result.error === 'INVALID_CREDENTIALS') {
                    errorMessage = t('error.unauthorized');
                } else if (result.error === 'ACCOUNT_DISABLED') {
                    errorMessage = 'Your account has been disabled. Please contact support.';
                } else if (result.message) {
                    errorMessage = result.message;
                }
                throw new Error(errorMessage);
            }
        } catch (err) {
            console.error('[Login] Error:', err);
            Utils.showError(elements.passwordError, err.message || t('error.login_failed'));
            Utils.setButtonState(elements.loginBtn, false);
        } finally {
            AppState.isSubmitting = false;
        }
    }

    function bindEvents() {
        if (elements.passwordToggle) {
            elements.passwordToggle.addEventListener('click', () => {
                const input = elements.passwordInput;
                if (!input) return;
                const icon = elements.passwordToggle.querySelector('i');
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                if (icon) {
                    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
                }
            });
        }
        
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
        
        if (elements.loginForm) {
            elements.loginForm.addEventListener('submit', handleSubmit);
        }
        
        window.addEventListener('languagechange', (e) => {
            const { language } = e.detail;
            if (language && language !== currentLanguage) {
                currentLanguage = language;
                if (AppState.touched.email || AppState.touched.password) {
                    validateForm();
                }
            }
        });
    }

    function init() {
        const savedLanguage = localStorage.getItem('language');
        if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'zh')) {
            currentLanguage = savedLanguage;
        }
        bindEvents();
        checkRedirect();
        console.log('[Login] Controller initialized');
    }
    
    document.addEventListener('DOMContentLoaded', init);
})();