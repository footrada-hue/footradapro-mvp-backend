/**
 * Admin Login - HttpOnly Cookie Authentication
 * @version 2.0.0
 * @description Production-ready login handler with i18n support
 * 
 * i18n Keys Used:
 * - login.error.username_required
 * - login.error.password_required  
 * - login.error.invalid_credentials
 * - login.error.network_error
 * - login.button.logging_in
 * - login.button.login
 */

(function() {
    'use strict';

    // ==================== i18n Translations ====================
    const I18N = {
        en: {
            // Error messages
            'login.error.username_required': 'Please enter username',
            'login.error.password_required': 'Please enter password',
            'login.error.invalid_credentials': 'Invalid username or password',
            'login.error.network_error': 'Network error, please check your connection',
            'login.error.session_expired': 'Session expired, please login again',
            // Button texts
            'login.button.logging_in': 'Logging in...',
            'login.button.login': 'Login',
            // Success messages
            'login.success.redirecting': 'Login successful, redirecting...'
        },
        zh: {
            'login.error.username_required': '请输入用户名',
            'login.error.password_required': '请输入密码',
            'login.error.invalid_credentials': '用户名或密码错误',
            'login.error.network_error': '网络错误，请检查网络连接',
            'login.error.session_expired': '会话已过期，请重新登录',
            'login.button.logging_in': '登录中...',
            'login.button.login': '登录',
            'login.success.redirecting': '登录成功，正在跳转...'
        },
        es: {
            'login.error.username_required': 'Por favor ingrese usuario',
            'login.error.password_required': 'Por favor ingrese contraseña',
            'login.error.invalid_credentials': 'Usuario o contraseña inválidos',
            'login.error.network_error': 'Error de red, verifique su conexión',
            'login.button.logging_in': 'Iniciando sesión...',
            'login.button.login': 'Iniciar sesión',
            'login.success.redirecting': 'Inicio de sesión exitoso, redirigiendo...'
        },
        fr: {
            'login.error.username_required': 'Veuillez entrer le nom d\'utilisateur',
            'login.error.password_required': 'Veuillez entrer le mot de passe',
            'login.error.invalid_credentials': 'Nom d\'utilisateur ou mot de passe invalide',
            'login.error.network_error': 'Erreur réseau, vérifiez votre connexion',
            'login.button.logging_in': 'Connexion en cours...',
            'login.button.login': 'Se connecter',
            'login.success.redirecting': 'Connexion réussie, redirection...'
        },
        ja: {
            'login.error.username_required': 'ユーザー名を入力してください',
            'login.error.password_required': 'パスワードを入力してください',
            'login.error.invalid_credentials': 'ユーザー名またはパスワードが無効です',
            'login.error.network_error': 'ネットワークエラー、接続を確認してください',
            'login.button.logging_in': 'ログイン中...',
            'login.button.login': 'ログイン',
            'login.success.redirecting': 'ログイン成功、リダイレクト中...'
        }
    };

    // Current language (default: English)
    let currentLang = 'en';

    // Get user's browser language
    function detectLanguage() {
        const browserLang = navigator.language?.split('-')[0] || 'en';
        return I18N[browserLang] ? browserLang : 'en';
    }

    // Translate function
    function t(key, fallback = '') {
        return I18N[currentLang]?.[key] || I18N.en[key] || fallback || key;
    }

    // Set language
    function setLanguage(lang) {
        if (I18N[lang]) {
            currentLang = lang;
            updateUILanguage();
        }
    }

    // Update UI elements with current language
    function updateUILanguage() {
        // Update login button text if not in loading state
        if (loginBtn && !loginBtn.disabled) {
            loginBtn.textContent = t('login.button.login');
        }
        
        // Update username placeholder if exists
        if (usernameInput && usernameInput.placeholder === 'Username' || usernameInput.placeholder === '用户名') {
            usernameInput.placeholder = t('login.placeholder.username', 'Username');
        }
        
        // Update password placeholder if exists
        if (passwordInput && passwordInput.placeholder === 'Password' || passwordInput.placeholder === '密码') {
            passwordInput.placeholder = t('login.placeholder.password', 'Password');
        }
    }

    // ==================== DOM Elements ====================
    const loginForm = document.getElementById('adminLoginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // ==================== Helper Functions ====================

    /**
     * Display error message
     * @param {string} messageKey - i18n key for the error message
     * @param {string} [fallback] - Fallback message if i18n key not found
     */
    function showError(messageKey, fallback = '') {
        if (loginError) {
            const message = t(messageKey, fallback);
            loginError.textContent = message;
            loginError.style.display = 'block';
            loginError.setAttribute('data-i18n', messageKey);
        }
        // Auto-hide error after 5 seconds
        setTimeout(() => {
            if (loginError) {
                loginError.style.display = 'none';
            }
        }, 5000);
    }

    /**
     * Show/hide loading state
     * @param {boolean} isLoading - Whether loading is active
     */
    function setLoading(isLoading) {
        if (loginBtn) {
            if (isLoading) {
                loginBtn.disabled = true;
                loginBtn.classList.add('loading');
                const loadingText = t('login.button.logging_in');
                loginBtn.setAttribute('data-original-text', loginBtn.textContent);
                loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
            } else {
                loginBtn.disabled = false;
                loginBtn.classList.remove('loading');
                const originalText = loginBtn.getAttribute('data-original-text');
                if (originalText) {
                    loginBtn.textContent = originalText;
                } else {
                    loginBtn.textContent = t('login.button.login');
                }
            }
        }
        
        if (loadingSpinner) {
            loadingSpinner.style.display = isLoading ? 'flex' : 'none';
        }
    }

    /**
     * Handle login form submission
     * @param {Event} event - Form submit event
     */
    async function handleLogin(event) {
        event.preventDefault();
        
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        
        // Input validation
        if (!username) {
            showError('login.error.username_required', 'Please enter username');
            usernameInput?.focus();
            return;
        }
        
        if (!password) {
            showError('login.error.password_required', 'Please enter password');
            passwordInput?.focus();
            return;
        }
        
        // Show loading state
        setLoading(true);
        
        // Hide previous error
        if (loginError) {
            loginError.style.display = 'none';
        }
        
        try {
            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            const response = await fetch('/api/v1/admin/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',  // Important: Ensure cookies are sent/received
                signal: controller.signal,
                body: JSON.stringify({ username, password })
            });
            
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Login successful - HttpOnly cookie already set by backend
                // Show success message (optional, before redirect)
                if (loginError) {
                    loginError.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                    loginError.style.border = '1px solid #22c55e';
                    loginError.style.color = '#22c55e';
                    loginError.textContent = t('login.success.redirecting', 'Login successful, redirecting...');
                    loginError.style.display = 'block';
                }
                
                // Redirect to dashboard
                // Small delay to show success message
                setTimeout(() => {
                    window.location.href = '/admin/dashboard.html';
                }, 500);
            } else {
                // Login failed
                const errorMsg = result.error || 'Invalid credentials';
                showError('login.error.invalid_credentials', errorMsg);
                setLoading(false);
                
                // Clear password field for security
                if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }
        } catch (err) {
            console.error('Login request failed:', err);
            
            if (err.name === 'AbortError') {
                showError('login.error.network_error', 'Request timeout, please try again');
            } else {
                showError('login.error.network_error', 'Network error, please check your connection');
            }
            setLoading(false);
        }
    }

    /**
     * Check if user already has valid session
     */
    async function checkExistingSession() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch('/api/v1/admin/verify', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    // Valid session exists, redirect to dashboard
                    window.location.href = '/admin/dashboard.html';
                }
            }
        } catch (err) {
            // Session invalid or expired, stay on login page
            console.debug('No active session or session check failed');
        }
    }

    /**
     * Initialize login page
     */
    function init() {
        // Detect and set language
        currentLang = detectLanguage();
        
        // Try to load saved language preference
        const savedLang = localStorage.getItem('preferred_language');
        if (savedLang && I18N[savedLang]) {
            currentLang = savedLang;
        }
        
        // Apply language to UI
        updateUILanguage();
        
        // Add event listeners
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        
        // Enter key submission
        const handleKeyPress = (e) => {
            if (e.key === 'Enter' && loginForm) {
                e.preventDefault();
                handleLogin(e);
            }
        };
        
        if (passwordInput) {
            passwordInput.addEventListener('keypress', handleKeyPress);
        }
        
        // Add language switcher if element exists
        const langSwitcher = document.getElementById('languageSwitcher');
        if (langSwitcher) {
            langSwitcher.addEventListener('change', (e) => {
                const newLang = e.target.value;
                if (I18N[newLang]) {
                    currentLang = newLang;
                    localStorage.setItem('preferred_language', newLang);
                    updateUILanguage();
                }
            });
            // Set current value
            langSwitcher.value = currentLang;
        }
        
        // Check for existing session
        checkExistingSession();
    }

    // ==================== Expose i18n for debugging (development only) ====================
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.__loginI18n = { t, setLanguage, currentLang: () => currentLang };
    }
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();