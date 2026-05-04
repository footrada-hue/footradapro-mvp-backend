/**
 * FOOTRADAPRO - 注册页控制器 (生产版)
 * @file /js/user/register_controller.js
 * @version 7.3.0
 * 修复：确保邮件验证码发送成功后正确跳转到步骤2
 */

(function() {
    'use strict';

    // 等待核心配置加载
    if (!window.FOOTRADAPRO) {
        console.error('[FATAL] Core config not loaded');
        showFatalError('System configuration error. Please refresh.');
        return;
    }

    var CONFIG = window.FOOTRADAPRO;
    var UTILS = CONFIG.UTILS;

    // ==================== 状态管理 ====================
    var AppState = {
        email: '',
        tempToken: null,
        countdownInterval: null,
        redirectCountdown: null,
        csrfToken: document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').getAttribute('content') : '',
        requestInProgress: false,
        debug: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        currentLang: 'en'
    };

    if (AppState.debug) window.AppState = AppState;

    // ==================== DOM 元素缓存 ====================
    var elements = {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        emailInput: document.getElementById('email'),
        sendCodeBtn: document.getElementById('sendCodeBtn'),
        displayEmail: document.getElementById('displayEmail'),
        codeInputs: document.querySelectorAll('.code-digit'),
        verifyCodeBtn: document.getElementById('verifyCodeBtn'),
        resendLink: document.getElementById('resendCode'),
        backToEmail: document.getElementById('backToEmail'),
        passwordModal: document.getElementById('passwordModal'),
        newPassword: document.getElementById('newPassword'),
        confirmNewPassword: document.getElementById('confirmNewPassword'),
        completeRegistrationBtn: document.getElementById('completeRegistrationBtn'),
        termsCheckbox: document.getElementById('termsCheckbox'),
        trustModal: document.getElementById('trustModal'),
        goToHomeBtn: document.getElementById('goToHomeBtn'),
        countdownSpan: document.getElementById('countdown'),
        step1Indicator: document.getElementById('step1-indicator'),
        step2Indicator: document.getElementById('step2-indicator'),
        captchaInput: document.getElementById('captchaInput'),
        captchaImage: document.getElementById('captchaImage')
    };

    // ==================== 多语言文案 ====================
    var I18N = {
        en: {
            emailInvalid: 'Please enter a valid email address',
            sending: 'Sending...',
            emailExists: 'Email already registered',
            sendFailed: 'Failed to send code',
            networkError: 'Network error, please try again',
            codeInvalid: 'Please enter a valid 6-digit code',
            sessionExpired: 'Session expired, please start over',
            verifying: 'Verifying...',
            codeExpired: 'Code expired, please request a new one',
            codeInvalidMsg: 'Invalid verification code',
            codeResent: 'New code sent',
            resendFailed: 'Failed to resend code',
            captchaRequired: 'Please enter the verification code',
            captchaInvalid: 'Invalid verification code, please try again',
            captchaPlaceholder: 'Enter code',
            refreshCaptcha: 'Click to refresh',
            passwordRequired: 'Password is required',
            passwordLength: 'At least 8 characters',
            passwordUppercase: 'At least 1 uppercase letter',
            passwordLowercase: 'At least 1 lowercase letter',
            passwordNumber: 'At least 1 number',
            passwordMismatch: 'Passwords do not match',
            termsRequired: 'You must agree to the Terms of Service',
            creating: 'Creating account...',
            registrationFailed: 'Registration failed',
            verificationExpired: 'Verification expired, please start over',
            codeAutoFilled: 'Code auto-filled!',
            resendCode: 'Resend code',
            resendWithCountdown: 'Resend ({seconds}s)',
            confirmClose: 'Are you sure? Your progress will be lost.',
            backToEmail: 'Use different email',
            verifyEmailTitle: 'Verify your email',
            verifyEmailDesc: 'Enter the code sent to',
            createAccountTitle: 'Create account',
            createAccountDesc: 'Start your journey with FootRada',
            welcomeTitle: 'Welcome!',
            welcomeDesc: 'Your account is ready',
            sandboxMode: 'Sandbox mode',
            testFunds: '10,000 tUSDT',
            testFundsDesc: 'Test funds',
            startExploring: 'Start exploring →',
            redirecting: 'Redirecting in',
            seconds: 's'
        },
        zh: {
            emailInvalid: '请输入有效的电子邮箱地址',
            sending: '发送中...',
            emailExists: '邮箱已被注册',
            sendFailed: '发送验证码失败',
            networkError: '网络错误，请重试',
            codeInvalid: '请输入有效的6位验证码',
            sessionExpired: '会话已过期，请重新开始',
            verifying: '验证中...',
            codeExpired: '验证码已过期，请重新获取',
            codeInvalidMsg: '验证码无效',
            codeResent: '新验证码已发送',
            resendFailed: '重发验证码失败',
            captchaRequired: '请输入图形验证码',
            captchaInvalid: '图形验证码错误，请重试',
            captchaPlaceholder: '输入验证码',
            refreshCaptcha: '点击刷新',
            passwordRequired: '请输入密码',
            passwordLength: '至少8个字符',
            passwordUppercase: '至少一个大写字母',
            passwordLowercase: '至少一个小写字母',
            passwordNumber: '至少一个数字',
            passwordMismatch: '两次输入的密码不一致',
            termsRequired: '您必须同意服务条款',
            creating: '创建账户中...',
            registrationFailed: '注册失败',
            verificationExpired: '验证已过期，请重新开始',
            codeAutoFilled: '验证码已自动填入！',
            resendCode: '重新发送',
            resendWithCountdown: '重新发送 ({seconds}秒)',
            confirmClose: '确定要取消吗？您的进度将会丢失。',
            backToEmail: '使用其他邮箱',
            verifyEmailTitle: '验证您的邮箱',
            verifyEmailDesc: '请输入发送至',
            createAccountTitle: '创建账户',
            createAccountDesc: '开启您的 FootRada 之旅',
            welcomeTitle: '欢迎！',
            welcomeDesc: '您的账户已准备就绪',
            sandboxMode: '沙箱模式',
            testFunds: '10,000 tUSDT',
            testFundsDesc: '测试资金',
            startExploring: '开始探索 →',
            redirecting: '正在跳转',
            seconds: '秒'
        },
        ms: {
            emailInvalid: 'Sila masukkan alamat e-mel yang sah',
            sending: 'Menghantar...',
            emailExists: 'E-mel sudah didaftarkan',
            sendFailed: 'Gagal menghantar kod',
            networkError: 'Ralat rangkaian, sila cuba lagi',
            codeInvalid: 'Sila masukkan kod 6 digit yang sah',
            sessionExpired: 'Sesi tamat, sila mulakan semula',
            verifying: 'Mengesahkan...',
            codeExpired: 'Kod tamat tempoh, sila minta yang baharu',
            codeInvalidMsg: 'Kod pengesahan tidak sah',
            codeResent: 'Kod baharu telah dihantar',
            resendFailed: 'Gagal menghantar semula kod',
            captchaRequired: 'Sila masukkan kod captcha',
            captchaInvalid: 'Kod captcha tidak sah, sila cuba lagi',
            captchaPlaceholder: 'Masukkan kod',
            refreshCaptcha: 'Klik untuk muat semula',
            passwordRequired: 'Kata laluan diperlukan',
            passwordLength: 'Sekurang-kurangnya 8 aksara',
            passwordUppercase: 'Sekurang-kurangnya 1 huruf besar',
            passwordLowercase: 'Sekurang-kurangnya 1 huruf kecil',
            passwordNumber: 'Sekurang-kurangnya 1 nombor',
            passwordMismatch: 'Kata laluan tidak sepadan',
            termsRequired: 'Anda mesti bersetuju dengan Terma Perkhidmatan',
            creating: 'Membuat akaun...',
            registrationFailed: 'Pendaftaran gagal',
            verificationExpired: 'Pengesahan tamat tempoh, sila mulakan semula',
            codeAutoFilled: 'Kod auto-diisi!',
            resendCode: 'Hantar semula',
            resendWithCountdown: 'Hantar semula ({seconds}s)',
            confirmClose: 'Adakah anda pasti? Kemajuan anda akan hilang.',
            backToEmail: 'Guna e-mel berbeza',
            verifyEmailTitle: 'Sahkan e-mel anda',
            verifyEmailDesc: 'Masukkan kod yang dihantar ke',
            createAccountTitle: 'Cipta akaun',
            createAccountDesc: 'Mulakan perjalanan anda dengan FootRada',
            welcomeTitle: 'Selamat datang!',
            welcomeDesc: 'Akaun anda sudah sedia',
            sandboxMode: 'Mod Kotak Pasir',
            testFunds: '10,000 tUSDT',
            testFundsDesc: 'Dana ujian',
            startExploring: 'Mula meneroka →',
            redirecting: 'Alih dalam',
            seconds: 's'
        }
    };

    function getText(key, args) {
        var lang = AppState.currentLang;
        var text = I18N[lang] ? I18N[lang][key] : I18N.en[key];
        if (!text) text = key;
        if (args !== undefined && typeof text === 'string') {
            return text.replace(/{seconds}/g, args);
        }
        return text;
    }

    function updatePageTexts() {
        var step1Title = document.querySelector('#step1 .header h1');
        var step1Desc = document.querySelector('#step1 .header p');
        if (step1Title) step1Title.textContent = getText('createAccountTitle');
        if (step1Desc) step1Desc.textContent = getText('createAccountDesc');
        
        var step2Title = document.querySelector('#step2 .header h1');
        var step2Desc = document.querySelector('#step2 .header p');
        if (step2Title) step2Title.textContent = getText('verifyEmailTitle');
        
        if (elements.captchaInput) {
            elements.captchaInput.placeholder = getText('captchaPlaceholder');
        }
        
        if (elements.sendCodeBtn && !elements.sendCodeBtn.disabled && !elements.sendCodeBtn.dataset.originalText) {
            elements.sendCodeBtn.textContent = getText('createAccountTitle');
        }
        
        var backLink = document.querySelector('#step2 .secondary-link a');
        if (backLink && backLink.id === 'backToEmail') {
            backLink.textContent = getText('backToEmail');
        }
        
        var welcomeTitle = document.querySelector('#trustModal .modal-content h2');
        var welcomeDesc = document.querySelector('#trustModal .modal-content > p');
        if (welcomeTitle) welcomeTitle.textContent = getText('welcomeTitle');
        if (welcomeDesc) welcomeDesc.textContent = getText('welcomeDesc');
        
        var trustItems = document.querySelectorAll('#trustModal .trust-item');
        if (trustItems.length >= 3) {
            var sandboxItem = trustItems[0].querySelector('span') || trustItems[0];
            var tUSDTItem = trustItems[1].querySelector('span') || trustItems[1];
            var testFundsItem = trustItems[2].querySelector('span') || trustItems[2];
            if (sandboxItem) sandboxItem.textContent = getText('sandboxMode');
            if (tUSDTItem) tUSDTItem.textContent = getText('testFunds');
            if (testFundsItem) testFundsItem.textContent = getText('testFundsDesc');
        }
        
        var startBtn = document.querySelector('#trustModal #goToHomeBtn');
        if (startBtn) startBtn.textContent = getText('startExploring');
        
        var redirectText = document.querySelector('#trustModal .auto-redirect');
        if (redirectText) {
            redirectText.innerHTML = getText('redirecting') + ' <span id="countdown">5</span> ' + getText('seconds');
        }
    }

    function showToast(message, type) {
        type = type || 'error';
        var toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    function showFatalError(message) {
        var errorOverlay = document.createElement('div');
        errorOverlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; text-align: center; padding: 20px;';
        errorOverlay.innerHTML = '<div><h2 style="color: #dc2626;">System Error</h2><p>' + message + '</p><button onclick="location.reload()" style="margin-top: 20px; padding: 8px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Refresh</button></div>';
        document.body.appendChild(errorOverlay);
    }

    function setLoading(btn, isLoading, loadingText) {
        loadingText = loadingText || 'Processing...';
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span> ' + loadingText;
            AppState.requestInProgress = true;
        } else {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
            AppState.requestInProgress = false;
        }
    }

    function openModal(modal) {
        if (!modal) return;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        email = email.trim();
        return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email);
    }

    function validatePassword(password) {
        var result = { valid: false, errors: [], strength: 0 };
        if (!password) {
            result.errors.push(getText('passwordRequired'));
            return result;
        }
        if (password.length >= 8) result.strength++;
        else result.errors.push(getText('passwordLength'));
        if (/[A-Z]/.test(password)) result.strength++;
        else result.errors.push(getText('passwordUppercase'));
        if (/[a-z]/.test(password)) result.strength++;
        else result.errors.push(getText('passwordLowercase'));
        if (/[0-9]/.test(password)) result.strength++;
        else result.errors.push(getText('passwordNumber'));
        result.valid = result.errors.length === 0;
        return result;
    }

    // 刷新图形验证码
    function refreshCaptcha() {
        if (!elements.captchaImage) return;
        
        var timestamp = new Date().getTime();
        
        fetch('/api/v1/captcha/generate', {
            headers: {
                'X-CSRF-Token': AppState.csrfToken,
                'Cache-Control': 'no-cache'
            },
            credentials: 'include'
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success && data.data) {
                if (data.data.image) {
                    elements.captchaImage.src = data.data.image + '?t=' + timestamp;
                }
                window.currentCaptchaId = data.data.captchaId || data.data.id || data.data.token;
                console.log('[Captcha] 加载成功, ID:', window.currentCaptchaId);
            }
        })
        .catch(function(err) {
            console.error('[Captcha] 请求错误:', err);
        });
    }

    function setupCodeInputs() {
        if (!elements.codeInputs || elements.codeInputs.length === 0) return;
        
        elements.codeInputs.forEach(function(input, idx) {
            input.addEventListener('input', function(e) {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
                
                if (e.target.value.length === 1 && idx < 5) {
                    elements.codeInputs[idx + 1].focus();
                }
                
                updateVerifyButtonState();
                
                var allFilled = Array.from(elements.codeInputs).every(function(inp) { return inp.value.length === 1; });
                if (allFilled && elements.verifyCodeBtn && !elements.verifyCodeBtn.disabled) {
                    setTimeout(function() { verifyCode(); }, 200);
                }
            });
            
            input.addEventListener('paste', function(e) {
                e.preventDefault();
                var paste = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                
                if (paste.length === 6) {
                    paste.split('').forEach(function(char, i) {
                        if (elements.codeInputs[i]) elements.codeInputs[i].value = char;
                    });
                    if (elements.codeInputs[5]) elements.codeInputs[5].focus();
                    updateVerifyButtonState();
                    setTimeout(function() { verifyCode(); }, 200);
                }
            });
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    elements.codeInputs[idx - 1].focus();
                }
                if (e.key === 'ArrowLeft' && idx > 0) elements.codeInputs[idx - 1].focus();
                if (e.key === 'ArrowRight' && idx < 5) elements.codeInputs[idx + 1].focus();
            });
        });
    }

    function updateVerifyButtonState() {
        if (!elements.verifyCodeBtn) return;
        var allFilled = Array.from(elements.codeInputs).every(function(inp) { return inp.value.length === 1; });
        elements.verifyCodeBtn.disabled = !allFilled;
    }

    function tryAutoFillCode() {
        if (window.OTPCredential) {
            navigator.credentials.get({
                otp: { transport: ['sms'] },
                signal: AbortSignal.timeout(30000)
            }).then(function(otp) {
                var code = otp.code;
                if (code && code.length === 6 && /^\d+$/.test(code)) {
                    fillVerificationCode(code);
                    setTimeout(function() { verifyCode(); }, 200);
                }
            }).catch(function(err) { console.debug('WebOTP unavailable:', err); });
        }
    }

    function fillVerificationCode(code) {
        if (!elements.codeInputs || code.length !== 6) return;
        code.split('').forEach(function(char, i) {
            if (elements.codeInputs[i]) elements.codeInputs[i].value = char;
        });
        if (elements.codeInputs[5]) elements.codeInputs[5].focus();
        updateVerifyButtonState();
        showToast(getText('codeAutoFilled'), 'success');
    }

    function checkFormValidity() {
        if (!elements.sendCodeBtn) return;
        var emailValid = validateEmail(elements.emailInput ? elements.emailInput.value.trim() : '');
        var captchaValid = elements.captchaInput ? elements.captchaInput.value.trim().length > 0 : true;
        elements.sendCodeBtn.disabled = !(emailValid && captchaValid);
    }

    // ==================== 发送验证码 ====================
    async function sendCode() {
        if (AppState.requestInProgress) return;
        
        var email = elements.emailInput.value.trim();
        if (!validateEmail(email)) {
            showToast(getText('emailInvalid'), 'error');
            return;
        }
        
        var captchaCode = elements.captchaInput ? elements.captchaInput.value.trim() : '';
        if (!captchaCode) {
            showToast(getText('captchaRequired'), 'error');
            return;
        }
        
        if (!window.currentCaptchaId) {
            showToast('验证码已过期，请刷新', 'error');
            refreshCaptcha();
            return;
        }

        setLoading(elements.sendCodeBtn, true, getText('sending'));

        try {
            // 验证图形验证码
            var verifyRes = await fetch('/api/v1/captcha/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({
                    captchaId: window.currentCaptchaId,
                    userInput: captchaCode
                })
            });
            
            var verifyData = await verifyRes.json();
            
            if (!verifyRes.ok || !verifyData.success) {
                showToast(getText('captchaInvalid'), 'error');
                refreshCaptcha();
                if (elements.captchaInput) elements.captchaInput.value = '';
                setLoading(elements.sendCodeBtn, false);
                return;
            }
            
            var captchaToken = verifyData.data ? verifyData.data.token : null;
            
            // 发送邮箱验证码
            var response = await fetch('/api/v1/auth/send-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({ 
                    email: email
                })
            });
            
            var data = await response.json();
            
            if (response.ok && data.success) {
                // 保存邮箱
                AppState.email = email;
                
                if (elements.displayEmail) {
                    elements.displayEmail.textContent = maskEmail(email);
                    var step2Desc = document.querySelector('#step2 .header p');
                    if (step2Desc) {
                        step2Desc.innerHTML = getText('verifyEmailDesc') + ' <strong>' + maskEmail(email) + '</strong>';
                    }
                }
                
                // 关键修复：切换到步骤2
                showStep(2);
                startResendCountdown(60);
                tryAutoFillCode();
                
                // 清空图形验证码
                if (elements.captchaInput) elements.captchaInput.value = '';
                window.currentCaptchaId = null;
                
                showToast('验证码已发送到您的邮箱', 'success');
                
                setTimeout(function() {
                    if (elements.codeInputs && elements.codeInputs[0]) {
                        elements.codeInputs[0].focus();
                    }
                }, 300);
            } else {
                var errorMessage = data.error || data.message || getText('sendFailed');
                if (data.error === 'EMAIL_ALREADY_REGISTERED') {
                    errorMessage = getText('emailExists');
                }
                showToast(errorMessage, 'error');
                refreshCaptcha();
                if (elements.captchaInput) elements.captchaInput.value = '';
            }
        } catch (error) {
            console.error('Send code error:', error);
            showToast(getText('networkError'), 'error');
        } finally {
            setLoading(elements.sendCodeBtn, false);
        }
    }

    function maskEmail(email) {
        var parts = email.split('@');
        var local = parts[0];
        var domain = parts[1];
        if (local.length <= 2) return email;
        return local.charAt(0) + '***' + local.charAt(local.length - 1) + '@' + domain;
    }

    // ==================== 验证邮箱验证码 ====================
    async function verifyCode() {
        if (AppState.requestInProgress) return;
        
        var code = '';
        for (var i = 0; i < elements.codeInputs.length; i++) {
            code += elements.codeInputs[i].value;
        }
        if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
            showToast(getText('codeInvalid'), 'error');
            return;
        }
        
        if (!AppState.email) {
            showToast(getText('sessionExpired'), 'error');
            showStep(1);
            return;
        }

        setLoading(elements.verifyCodeBtn, true, getText('verifying'));

        try {
            var response = await fetch('/api/v1/auth/verify-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: AppState.email,
                    code: code
                })
            });
            
            var data = await response.json();
            
            if (response.ok && data.success) {
                // 验证成功，保存临时token
                AppState.tempToken = data.data ? data.data.token : null;
                
                // 关闭验证码输入步骤的任何弹窗
                closeModal(null);
                
                // 打开密码设置弹窗
                openModal(elements.passwordModal);
                
                showToast('验证成功，请设置密码', 'success');
                
                setTimeout(function() {
                    if (elements.newPassword) elements.newPassword.focus();
                }, 300);
            } else {
                var errorMsg = data.error || data.message || 'Verification failed';
                if (errorMsg === 'INVALID_OR_EXPIRED_CODE' || errorMsg.indexOf('expired') !== -1) {
                    showToast(getText('codeExpired'), 'error');
                    resetCodeInputs();
                    startResendCountdown(60);
                } else {
                    showToast(getText('codeInvalidMsg'), 'error');
                    resetCodeInputs();
                }
            }
        } catch (error) {
            console.error('Verify code error:', error);
            showToast(getText('networkError'), 'error');
        } finally {
            setLoading(elements.verifyCodeBtn, false);
        }
    }

    function resetCodeInputs() {
        for (var i = 0; i < elements.codeInputs.length; i++) {
            elements.codeInputs[i].value = '';
        }
        if (elements.codeInputs[0]) elements.codeInputs[0].focus();
        updateVerifyButtonState();
    }

    // ==================== 重发验证码 ====================
    async function resendCode(e) {
        e.preventDefault();
        if (AppState.requestInProgress) return;
        
        if (!AppState.email) {
            showToast(getText('sessionExpired'), 'error');
            showStep(1);
            return;
        }

        setLoading(elements.resendLink, true, getText('sending'));

        try {
            var response = await fetch('/api/v1/auth/send-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({ email: AppState.email })
            });
            
            var data = await response.json();
            
            if (data.success) {
                showToast(getText('codeResent'), 'success');
                startResendCountdown(60);
                resetCodeInputs();
            } else {
                showToast(data.error || getText('resendFailed'), 'error');
            }
        } catch (error) {
            console.error('Resend code error:', error);
            showToast(getText('networkError'), 'error');
        } finally {
            setLoading(elements.resendLink, false);
        }
    }

    // ==================== 完成注册 ====================
    async function completeRegistration() {
        if (AppState.requestInProgress) return;
        
        var password = elements.newPassword ? elements.newPassword.value : '';
        var confirm = elements.confirmNewPassword ? elements.confirmNewPassword.value : '';
        var termsChecked = elements.termsCheckbox ? elements.termsCheckbox.checked : false;
        
        var pwdValidation = validatePassword(password);
        if (!pwdValidation.valid) {
            showToast(pwdValidation.errors[0], 'error');
            return;
        }
        
        if (password !== confirm) {
            showToast(getText('passwordMismatch'), 'error');
            return;
        }
        
        if (!termsChecked) {
            showToast(getText('termsRequired'), 'error');
            return;
        }

        if (!AppState.email || !AppState.tempToken) {
            showToast(getText('sessionExpired'), 'error');
            closeModal(elements.passwordModal);
            showStep(1);
            return;
        }

        setLoading(elements.completeRegistrationBtn, true, getText('creating'));

        try {
            var response = await fetch('/api/v1/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({
                    username: AppState.email,
                    password: password,
                    token: AppState.tempToken
                })
            });
            
            var data = await response.json();
            
            if (response.ok && data.success) {
                UTILS.setStorage('user', { email: AppState.email, username: AppState.email });
                if (data.data && data.data.token) UTILS.setStorage('authToken', data.data.token);
                if (data.data && data.data.userId) UTILS.setStorage('userId', data.data.userId);
                
                closeModal(elements.passwordModal);
                openModal(elements.trustModal);
                startRedirectCountdown(5);
            } else {
                var errorMsg = data.error || data.message || getText('registrationFailed');
                if (errorMsg === 'INVALID_TOKEN') {
                    showToast(getText('verificationExpired'), 'error');
                    closeModal(elements.passwordModal);
                    showStep(1);
                } else {
                    showToast(errorMsg, 'error');
                }
            }
        } catch (error) {
            console.error('Registration error:', error);
            showToast(getText('networkError'), 'error');
        } finally {
            setLoading(elements.completeRegistrationBtn, false);
        }
    }

    function startResendCountdown(seconds) {
        if (AppState.countdownInterval) clearInterval(AppState.countdownInterval);
        
        var link = elements.resendLink;
        if (!link) return;
        
        link.style.pointerEvents = 'none';
        link.textContent = getText('resendWithCountdown', seconds);

        AppState.countdownInterval = setInterval(function() {
            seconds--;
            if (seconds <= 0) {
                clearInterval(AppState.countdownInterval);
                link.style.pointerEvents = 'auto';
                link.textContent = getText('resendCode');
            } else {
                link.textContent = getText('resendWithCountdown', seconds);
            }
        }, 1000);
    }

    function startRedirectCountdown(seconds) {
        var countdownSpan = document.getElementById('countdown');
        if (!countdownSpan) return;
        countdownSpan.textContent = seconds;
        if (AppState.redirectCountdown) clearInterval(AppState.redirectCountdown);
        
        AppState.redirectCountdown = setInterval(function() {
            seconds--;
            if (seconds <= 0) {
                clearInterval(AppState.redirectCountdown);
                window.location.href = '/shell.html?page=home';
            } else {
                var span = document.getElementById('countdown');
                if (span) span.textContent = seconds;
            }
        }, 1000);
    }

    function showStep(step) {
        console.log('[showStep] 切换到步骤:', step);
        
        if (step === 1) {
            if (elements.step1) elements.step1.classList.add('active');
            if (elements.step2) elements.step2.classList.remove('active');
        } else if (step === 2) {
            if (elements.step1) elements.step1.classList.remove('active');
            if (elements.step2) elements.step2.classList.add('active');
        }
    }

    function handleLanguageChange(event) {
        var lang = event.detail.lang;
        AppState.currentLang = lang;
        updatePageTexts();
    }

    function bindEvents() {
        if (elements.emailInput) {
            elements.emailInput.addEventListener('input', checkFormValidity);
            elements.emailInput.addEventListener('blur', checkFormValidity);
        }
        
        if (elements.captchaInput) {
            elements.captchaInput.addEventListener('input', checkFormValidity);
        }
        
        if (elements.sendCodeBtn) elements.sendCodeBtn.addEventListener('click', sendCode);
        if (elements.resendLink) elements.resendLink.addEventListener('click', resendCode);
        
        if (elements.codeInputs && elements.codeInputs.length > 0) setupCodeInputs();
        if (elements.verifyCodeBtn) elements.verifyCodeBtn.addEventListener('click', verifyCode);
        if (elements.completeRegistrationBtn) elements.completeRegistrationBtn.addEventListener('click', completeRegistration);
        if (elements.goToHomeBtn) {
            elements.goToHomeBtn.addEventListener('click', function() { 
                window.location.href = '/shell.html?page=home';
            });
        }
        
        if (elements.captchaImage) {
            elements.captchaImage.addEventListener('click', function() {
                refreshCaptcha();
            });
        }
        
        if (elements.backToEmail) {
            elements.backToEmail.addEventListener('click', function(e) {
                e.preventDefault();
                showStep(1);
                if (elements.emailInput) {
                    elements.emailInput.value = '';
                    elements.emailInput.focus();
                }
                if (elements.captchaInput) elements.captchaInput.value = '';
                refreshCaptcha();
                checkFormValidity();
                // 重置状态
                AppState.email = '';
                AppState.tempToken = null;
            });
        }
        
        if (elements.passwordModal) {
            elements.passwordModal.addEventListener('click', function(e) {
                if (e.target === elements.passwordModal) {
                    if (confirm(getText('confirmClose'))) {
                        closeModal(elements.passwordModal);
                        showStep(1);
                    }
                }
            });
        }
        
        window.addEventListener('languageChanged', handleLanguageChange);
    }

    function init() {
        try {
            var savedLang = localStorage.getItem('lang') || localStorage.getItem('user_language') || 'en';
            AppState.currentLang = savedLang;
        } catch (e) {
            AppState.currentLang = 'en';
        }
        
        document.body.classList.remove('test-mode');
        document.documentElement.classList.remove('test-mode');
        
        console.log('[Init] Register controller initialized (v7.3.0)');
        
        refreshCaptcha();
        bindEvents();
        updatePageTexts();
        
        if (elements.step1 && elements.step2) {
            elements.step1.classList.add('active');
            elements.step2.classList.remove('active');
        }
        
        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                var active = document.activeElement;
                if (elements.step1 && elements.step1.classList.contains('active')) {
                    if (active === elements.emailInput || active === elements.captchaInput) {
                        if (elements.sendCodeBtn && !elements.sendCodeBtn.disabled) sendCode();
                    }
                } else if (elements.step2 && elements.step2.classList.contains('active') && active && active.classList.contains('code-digit')) {
                    var allFilled = true;
                    for (var i = 0; i < elements.codeInputs.length; i++) {
                        if (elements.codeInputs[i].value.length !== 1) {
                            allFilled = false;
                            break;
                        }
                    }
                    if (allFilled && elements.verifyCodeBtn && !elements.verifyCodeBtn.disabled) {
                        e.preventDefault();
                        verifyCode();
                    }
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (AppState.debug) {
        window.debug = { 
            verifyCode: verifyCode, 
            resendCode: resendCode, 
            showStep: showStep, 
            sendCode: sendCode, 
            completeRegistration: completeRegistration, 
            validatePassword: validatePassword,
            refreshCaptcha: refreshCaptcha,
            AppState: AppState, 
            elements: elements 
        };
    }
})();