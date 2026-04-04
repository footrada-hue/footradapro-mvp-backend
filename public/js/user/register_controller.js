/**
 * FOOTRADAPRO - 注册页控制器 (生产版)
 * @file /js/user/register_controller.js
 * @version 7.0.0
 * 优化流程：Email + 图形验证码 → 邮箱验证码 → 密码 → 完成
 * 支援多语言切换事件监听
 * 生产标准：包含图形验证码防机器人攻击
 * 
 * ==================== 多语言文案标记说明 ====================
 * 所有用户可见文案均通过 I18N 对象管理，便于后期批量翻译
 * 标记格式：KEY: 说明
 * - emailInvalid: 邮箱格式错误提示
 * - sending: 发送中状态
 * - emailExists: 邮箱已注册提示
 * - sendFailed: 发送失败提示
 * - networkError: 网络错误提示
 * - codeInvalid: 验证码格式错误
 * - sessionExpired: 会话过期提示
 * - verifying: 验证中状态
 * - codeExpired: 验证码过期提示
 * - codeInvalidMsg: 验证码错误提示
 * - codeResent: 重发成功提示
 * - resendFailed: 重发失败提示
 * - captchaRequired: 图形验证码必填提示
 * - captchaInvalid: 图形验证码错误提示
 * - passwordRequired: 密码必填提示
 * - passwordLength: 密码长度要求
 * - passwordUppercase: 大写字母要求
 * - passwordLowercase: 小写字母要求
 * - passwordNumber: 数字要求
 * - passwordMismatch: 密码不一致提示
 * - termsRequired: 条款同意提示
 * - creating: 创建账户中
 * - registrationFailed: 注册失败提示
 * - verificationExpired: 验证过期提示
 * - codeAutoFilled: 自动填充成功
 * - resendCode: 重新发送按钮
 * - resendWithCountdown: 倒计时重发按钮
 * - confirmClose: 关闭确认弹窗
 * - captchaPlaceholder: 图形验证码输入框占位符
 * - refreshCaptcha: 刷新验证码提示
 * - backToEmail: 返回上一步
 * - verifyEmailTitle: 验证邮箱标题
 * - verifyEmailDesc: 验证邮箱描述
 * - createAccountTitle: 创建账户标题
 * - createAccountDesc: 创建账户描述
 * ==================== 多语言文案标记结束 ====================
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
        currentLang: 'en'  // 默认英文，面向全球用户
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
        // 图形验证码相关元素
        captchaInput: document.getElementById('captchaInput'),
        captchaImage: document.getElementById('captchaImage')
    };

    // ==================== 多语言文案（默认英文，面向全球用户）====================
    var I18N = {
        en: {
            // 邮箱相关
            emailInvalid: 'Please enter a valid email address',
            sending: 'Sending...',
            emailExists: 'Email already registered',
            sendFailed: 'Failed to send code',
            networkError: 'Network error, please try again',
            // 验证码相关
            codeInvalid: 'Please enter a valid 6-digit code',
            sessionExpired: 'Session expired, please start over',
            verifying: 'Verifying...',
            codeExpired: 'Code expired, please request a new one',
            codeInvalidMsg: 'Invalid verification code',
            codeResent: 'New code sent',
            resendFailed: 'Failed to resend code',
            // 图形验证码相关
            captchaRequired: 'Please enter the verification code',
            captchaInvalid: 'Invalid verification code, please try again',
            captchaPlaceholder: 'Enter code',
            refreshCaptcha: 'Click to refresh',
            // 密码相关
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
            // 自动填充
            codeAutoFilled: 'Code auto-filled!',
            // 按钮和链接
            resendCode: 'Resend code',
            resendWithCountdown: 'Resend ({seconds}s)',
            confirmClose: 'Are you sure? Your progress will be lost.',
            backToEmail: 'Use different email',
            // 页面标题
            verifyEmailTitle: 'Verify your email',
            verifyEmailDesc: 'Enter the code sent to',
            createAccountTitle: 'Create account',
            createAccountDesc: 'Start your journey with FootRada',
            // 成功页面
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

    // 更新页面所有动态文案
    function updatePageTexts() {
        // 更新 step1 文案
        var step1Title = document.querySelector('#step1 .header h1');
        var step1Desc = document.querySelector('#step1 .header p');
        if (step1Title) step1Title.textContent = getText('createAccountTitle');
        if (step1Desc) step1Desc.textContent = getText('createAccountDesc');
        
        // 更新 step2 文案
        var step2Title = document.querySelector('#step2 .header h1');
        var step2Desc = document.querySelector('#step2 .header p');
        if (step2Title) step2Title.textContent = getText('verifyEmailTitle');
        if (step2Desc && elements.displayEmail) {
            step2Desc.innerHTML = getText('verifyEmailDesc') + ' <strong>' + (elements.displayEmail.textContent || '') + '</strong>';
        }
        
        // 更新图形验证码占位符
        if (elements.captchaInput) {
            elements.captchaInput.placeholder = getText('captchaPlaceholder');
        }
        
        // 更新按钮文案
        if (elements.sendCodeBtn && !elements.sendCodeBtn.disabled && !elements.sendCodeBtn.dataset.originalText) {
            elements.sendCodeBtn.textContent = getText('createAccountTitle');
        }
        
        // 更新返回链接
        var backLink = document.querySelector('#step2 .secondary-link a');
        if (backLink && backLink.id === 'backToEmail') {
            backLink.textContent = getText('backToEmail');
        }
        
        // 更新成功弹窗文案
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

    // ==================== 工具函数 ====================

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
    
    fetch('/api/v1/captcha/generate', {
        headers: {
            'X-CSRF-Token': AppState.csrfToken
        }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success && data.data && data.data.image) {
            elements.captchaImage.src = data.data.image;
            // 存储 captchaId 用于后续验证（如果需要）
            window.currentCaptchaId = data.data.captchaId;
        } else {
            console.error('Failed to load captcha:', data);
        }
    })
    .catch(function(err) {
        console.error('Captcha fetch error:', err);
    });
    
    if (elements.captchaImage.parentElement) {
        var tooltip = elements.captchaImage.getAttribute('title');
        if (!tooltip) {
            elements.captchaImage.setAttribute('title', getText('refreshCaptcha'));
        }
    }
}

    // ==================== 验证码输入框自动处理 ====================
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
                if (e.key === 'Enter') {
                    var allFilled = Array.from(elements.codeInputs).every(function(inp) { return inp.value.length === 1; });
                    if (allFilled && elements.verifyCodeBtn && !elements.verifyCodeBtn.disabled) {
                        e.preventDefault();
                        verifyCode();
                    }
                }
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
            var abortController = new AbortController();
            navigator.credentials.get({
                otp: { transport: ['sms'] },
                signal: abortController.signal
            }).then(function(otp) {
                var code = otp.code;
                if (code && code.length === 6 && /^\d+$/.test(code)) {
                    fillVerificationCode(code);
                    setTimeout(function() { verifyCode(); }, 200);
                }
            }).catch(function(err) { console.debug('WebOTP unavailable:', err); });
            setTimeout(function() { abortController.abort(); }, 30000);
        }
        
        document.addEventListener('paste', function(e) {
            var text = e.clipboardData ? e.clipboardData.getData('text') : '';
            if (text && /^\d{6}$/.test(text)) {
                fillVerificationCode(text);
                setTimeout(function() { verifyCode(); }, 200);
            }
        });
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

    // ==================== 发送验证码（包含图形验证码）====================
    function checkFormValidity() {
        if (!elements.sendCodeBtn) return;
        var emailValid = validateEmail(elements.emailInput ? elements.emailInput.value.trim() : '');
        var captchaValid = elements.captchaInput ? elements.captchaInput.value.trim().length > 0 : true;
        elements.sendCodeBtn.disabled = !(emailValid && captchaValid);
    }

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
        showToast(getText('captchaRequired'), 'error');
        refreshCaptcha();
        return;
    }

    setLoading(elements.sendCodeBtn, true, getText('sending'));

    try {
        // 第一步：验证图形验证码，获取临时令牌
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
            var errorMsg = getText('captchaInvalid');
            if (verifyData.error === 'CAPTCHA_EXPIRED') {
                errorMsg = 'Captcha expired, please refresh';
            }
            showToast(errorMsg, 'error');
            refreshCaptcha();
            if (elements.captchaInput) elements.captchaInput.value = '';
            setLoading(elements.sendCodeBtn, false);
            return;
        }
        
        var captchaToken = verifyData.data.token;
        
        // 第二步：发送邮箱验证码
        var response = await fetch('/api/v1/auth/send-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ 
                email: email,
                captchaToken: captchaToken
            })
        });
        
        var data = await response.json();
        
        if (data.success) {
            AppState.email = email;
            if (elements.displayEmail) {
                elements.displayEmail.textContent = maskEmail(email);
                var step2Desc = document.querySelector('#step2 .header p');
                if (step2Desc) {
                    step2Desc.innerHTML = getText('verifyEmailDesc') + ' <strong>' + maskEmail(email) + '</strong>';
                }
            }
            
            showStep(2);
            startResendCountdown(60);
            tryAutoFillCode();
            
            setTimeout(function() {
                if (elements.codeInputs && elements.codeInputs[0]) {
                    elements.codeInputs[0].focus();
                }
            }, 300);
        } else {
            if (data.error === 'EMAIL_ALREADY_REGISTERED') {
                showToast(getText('emailExists'), 'error');
            } else {
                showToast(data.error || getText('sendFailed'), 'error');
            }
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
                AppState.tempToken = data.data ? data.data.token : null;
                openModal(elements.passwordModal);
                setTimeout(function() {
                    if (elements.newPassword) elements.newPassword.focus();
                }, 300);
            } else {
                var errorMsg = data.error || data.message || 'Verification failed';
                if (errorMsg === 'CODE_EXPIRED' || errorMsg === '验证码已过期' || errorMsg.indexOf('expired') !== -1) {
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

        setLoading(elements.sendCodeBtn, true, getText('sending'));

        try {
            var response = await fetch('/api/v1/auth/resend-code', {
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
            setLoading(elements.sendCodeBtn, false);
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
                if (errorMsg.indexOf('token') !== -1 || errorMsg.indexOf('验证') !== -1 || errorMsg.indexOf('expired') !== -1) {
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

    // ==================== 倒计时 ====================
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
                window.location.href = '/index.html';
            } else {
                var span = document.getElementById('countdown');
                if (span) span.textContent = seconds;
            }
        }, 1000);
    }

    // ==================== 步骤切换 ====================
    function showStep(step) {
        if (step === 1) {
            if (elements.step1) elements.step1.classList.add('active');
            if (elements.step2) elements.step2.classList.remove('active');
        } else {
            if (elements.step1) elements.step1.classList.remove('active');
            if (elements.step2) elements.step2.classList.add('active');
        }
    }

    // ==================== 语言切换处理 ====================
    function handleLanguageChange(event) {
        var lang = event.detail.lang;
        AppState.currentLang = lang;
        updatePageTexts();
        console.log('[Register] Language changed to:', lang);
    }

    // ==================== 事件绑定 ====================
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
        if (elements.goToHomeBtn) elements.goToHomeBtn.addEventListener('click', function() { window.location.href = '/index.html'; });
        
        // 图形验证码刷新
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
                // 清空图形验证码
                if (elements.captchaInput) elements.captchaInput.value = '';
                refreshCaptcha();
                checkFormValidity();
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

    // ==================== 初始化 ====================
    function init() {
        try {
            var savedLang = localStorage.getItem('lang') || localStorage.getItem('user_language') || 'en';
            AppState.currentLang = savedLang;
        } catch (e) {
            AppState.currentLang = 'en';
        }
        
        document.body.classList.remove('test-mode');
        document.documentElement.classList.remove('test-mode');
        
        console.log('Register controller initialized (v7.0.0) - Production ready with CAPTCHA');
        
        // 初始化图形验证码
        refreshCaptcha();
        
        bindEvents();
        updatePageTexts();
        
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