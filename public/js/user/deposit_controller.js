/**
 * deposit_controller.js - 充值页面控制器
 * 功能：网络选择、地址复制、金额输入、截图上传（带压缩）
 * 版本：2.0.0
 */

(function() {
    'use strict';

    // DOM 元素引用
    let elements = {};

    // 存储从API获取的地址
    let depositAddresses = {};

    /**
     * 初始化页面
     */
    async function init() {
        console.log('充值页面初始化开始...');
        
        // 获取所有 DOM 元素
        elements = {
            testModeBadge: document.getElementById('testModeBadge'),
            testModeHint: document.getElementById('testModeHint'),
            currencySymbol: document.getElementById('currencySymbol'),
            minAmountHint: document.getElementById('minAmountHint'),
            modeSwitcher: document.getElementById('modeSwitcher'),
            modeBtns: document.querySelectorAll('.mode-btn'),
            networkSelect: document.getElementById('network'),
            addressSpan: document.getElementById('depositAddress'),
            warningP: document.getElementById('addressWarning'),
            noteP: document.getElementById('networkNote'),
            amountInput: document.getElementById('amount'),
            confirmCheck: document.getElementById('confirmCheck'),
            submitBtn: document.getElementById('submitBtn'),
            uploadArea: document.getElementById('uploadArea'),
            screenshotInput: document.getElementById('screenshot'),
            previewArea: document.getElementById('previewArea'),
            preview: document.getElementById('preview')
        };

        // 初始化主题管理器
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            updateModeUI(ThemeManager.isTestMode);
            
            ThemeManager.addListener((state) => {
                updateModeUI(state.isTestMode);
                loadDepositAddresses();
            });
        }
    // 检查模式锁定状态，控制切换按钮显示
    await checkModeLockStatus();
        // 绑定事件
        bindEvents();
        
        // 加载充值地址
        await loadDepositAddresses();
        
        console.log('充值页面初始化完成');
    }

    /**
     * 更新模式 UI
     */
    function updateModeUI(isTestMode) {
        document.body.classList.remove('test-mode', 'live-mode');
        document.body.classList.add(isTestMode ? 'test-mode' : 'live-mode');
        
        if (elements.testModeBadge) {
            elements.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
        if (elements.testModeHint) {
            elements.testModeHint.style.display = isTestMode ? 'flex' : 'none';
        }
        if (elements.currencySymbol) {
            elements.currencySymbol.textContent = isTestMode ? 'tUSDT' : 'USDT';
        }
        if (elements.minAmountHint) {
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            elements.minAmountHint.textContent = `Minimum deposit: 10 ${currency}`;
        }
        
        const confirmText = document.getElementById('confirmText');
        if (confirmText) {
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            confirmText.textContent = `I confirm that I have sent the funds to the address above (${currency})`;
        }
        
        document.querySelectorAll('.currency').forEach(el => {
            el.textContent = isTestMode ? 'tUSDT' : 'USDT';
        });
        
        if (elements.modeBtns && elements.modeBtns.length) {
            elements.modeBtns.forEach(btn => {
                const mode = btn.dataset.mode;
                if ((mode === 'test' && isTestMode) || (mode === 'live' && !isTestMode)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    /**
     * 加载充值地址
     */
    async function loadDepositAddresses() {
        try {
            console.log('开始加载充值地址...');
            const res = await fetch('/api/v1/user/network/deposit-addresses', {
                credentials: 'include'
            });
            const data = await res.json();
            console.log('API返回数据:', data);
            
            if (data.success && data.data) {
                depositAddresses = data.data;
                console.log('加载到充值地址:', depositAddresses);
                
                updateNetworkSelect();
                
                if (elements.networkSelect && elements.networkSelect.options.length > 0) {
                    const defaultNetwork = elements.networkSelect.options[0].value;
                    elements.networkSelect.value = defaultNetwork;
                    updateAddressForNetwork(defaultNetwork);
                }
            } else {
                console.error('获取充值地址失败:', data);
                useDefaultAddresses();
            }
        } catch (err) {
            console.error('加载充值地址失败:', err);
            useDefaultAddresses();
        }
    }

    /**
     * 更新网络选择下拉框
     */
    function updateNetworkSelect() {
        if (!elements.networkSelect) return;
        
        elements.networkSelect.innerHTML = '';
        const networkOrder = ['TRC20', 'ERC20', 'BEP20'];
        
        networkOrder.forEach(net => {
            if (depositAddresses[net]) {
                const option = document.createElement('option');
                option.value = net;
                option.textContent = net === 'TRC20' ? 'TRC20 (Tron) - Recommended' : 
                                    net === 'ERC20' ? 'ERC20 (Ethereum)' : 'BEP20 (BSC)';
                elements.networkSelect.appendChild(option);
            }
        });
    }

    /**
     * 根据网络更新地址显示
     */
    function updateAddressForNetwork(network) {
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        
        if (depositAddresses && depositAddresses[network]) {
            if (elements.addressSpan) {
                elements.addressSpan.textContent = depositAddresses[network].address;
            }
            if (elements.warningP) {
                elements.warningP.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Send only ${currency} (${network}) to this address`;
            }
            if (elements.noteP) {
                elements.noteP.innerHTML = `<i class="fas fa-info-circle"></i> ${depositAddresses[network].note || network + ' network'}`;
            }
        } else {
            useDefaultAddressForNetwork(network);
        }
    }

    /**
     * 使用默认地址（网络不存在时）
     */
    function useDefaultAddressForNetwork(network) {
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        
        const defaultAddresses = {
            'TRC20': isTestMode ? 'TEST_TXez8vPf1AbC3xYz7pQr2LmN9kHj5FgDsW' : 'TXez8vPf1AbC3xYz7pQr2LmN9kHj5FgDsW',
            'ERC20': isTestMode ? '0xTEST742d35Cc6634C0532925a3b844Bc454e4438f44e' : '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
            'BEP20': isTestMode ? '0xTEST8F3a91cA1d2Bc9E7F3d5aB8c4D6eF9a0b1c2d3e4' : '0x8F3a91cA1d2Bc9E7F3d5aB8c4D6eF9a0b1c2d3e4'
        };
        
        const defaultNotes = {
            'TRC20': 'TRC20 offers fast and low-cost transactions',
            'ERC20': 'ERC20 has higher gas fees, use only if necessary',
            'BEP20': 'BEP20 is fast and cheap, good alternative to TRC20'
        };
        
        if (elements.addressSpan) {
            elements.addressSpan.textContent = defaultAddresses[network] || defaultAddresses['TRC20'];
        }
        if (elements.warningP) {
            elements.warningP.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Send only ${currency} (${network}) to this address`;
        }
        if (elements.noteP) {
            elements.noteP.innerHTML = `<i class="fas fa-info-circle"></i> ${defaultNotes[network] || network + ' network'}`;
        }
    }

    /**
     * 使用默认地址（备用，当API完全失败时）
     */
    function useDefaultAddresses() {
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        
        depositAddresses = {
            'TRC20': { 
                address: isTestMode ? 'TEST_TXez8vPf1AbC3xYz7pQr2LmN9kHj5FgDsW' : 'TXez8vPf1AbC3xYz7pQr2LmN9kHj5FgDsW', 
                note: 'Tron network - Recommended' 
            },
            'ERC20': { 
                address: isTestMode ? '0xTEST742d35Cc6634C0532925a3b844Bc454e4438f44e' : '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 
                note: 'Ethereum network - Higher gas fees' 
            },
            'BEP20': { 
                address: isTestMode ? '0xTEST8F3a91cA1d2Bc9E7F3d5aB8c4D6eF9a0b1c2d3e4' : '0x8F3a91cA1d2Bc9E7F3d5aB8c4D6eF9a0b1c2d3e4', 
                note: 'BSC network - Fast and cheap' 
            }
        };
        
        updateNetworkSelect();
        
        if (elements.networkSelect && elements.networkSelect.options.length > 0) {
            const defaultNetwork = elements.networkSelect.options[0].value;
            elements.networkSelect.value = defaultNetwork;
            updateAddressForNetwork(defaultNetwork);
        }
    }

    /**
     * 压缩图片
     * @param {File} file - 原始图片文件
     * @returns {Promise<File>} - 压缩后的文件
     */
    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            // 如果文件小于1MB，不压缩直接返回
            if (file.size < 1024 * 1024) {
                console.log(`文件小于1MB，跳过压缩: ${(file.size / 1024).toFixed(2)} KB`);
                resolve(file);
                return;
            }
            
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 限制最大宽度 1080px（手机截图通常宽度在1080-1440之间）
                    let width = img.width;
                    let height = img.height;
                    const maxWidth = 1080;
                    const maxHeight = 1920;
                    
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 压缩质量 0.7，输出 JPEG 格式
                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name.replace(/\.(png|jpg|jpeg)$/i, '.jpg'), {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        console.log(`压缩前: ${(file.size / 1024).toFixed(2)} KB, 压缩后: ${(blob.size / 1024).toFixed(2)} KB, 压缩率: ${((1 - blob.size / file.size) * 100).toFixed(1)}%`);
                        resolve(compressedFile);
                    }, 'image/jpeg', 0.7);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    /**
     * 显示压缩提示
     */
    function showCompressingToast() {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(8px);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            white-space: nowrap;
            font-family: inherit;
        `;
        toast.innerHTML = '<i class="fas fa-compress-alt"></i> 正在压缩图片...';
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 2000);
    }

    /**
     * 处理文件上传预览（带压缩）
     */
    async function handleFileUpload(file) {
        if (!file) return;
        
        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件（PNG、JPG、JPEG格式）');
            return;
        }
        
        // 验证文件大小（限制10MB，压缩后会变小）
        if (file.size > 10 * 1024 * 1024) {
            alert('图片大小不能超过10MB');
            return;
        }
        
        // 显示压缩提示
        showCompressingToast();
        
        try {
            // 压缩图片
            const compressedFile = await compressImage(file);
            
            // 更新文件输入框中的文件
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(compressedFile);
            elements.screenshotInput.files = dataTransfer.files;
            
            // 显示预览
            const reader = new FileReader();
            reader.onload = function(e) {
                if (elements.preview) {
                    elements.preview.src = e.target.result;
                }
                if (elements.uploadArea) {
                    elements.uploadArea.style.display = 'none';
                }
                if (elements.previewArea) {
                    elements.previewArea.style.display = 'block';
                }
            };
            reader.readAsDataURL(compressedFile);
            
            // 触发表单检查
            checkForm();
            
        } catch (err) {
            console.error('压缩图片失败:', err);
            alert('图片处理失败，请重试');
        }
    }

    /**
     * 检查表单完整性（新增截图检查）
     */
    function checkForm() {
        const amount = elements.amountInput ? elements.amountInput.value : null;
        const checked = elements.confirmCheck ? elements.confirmCheck.checked : false;
        const hasScreenshot = elements.screenshotInput && elements.screenshotInput.files.length > 0;
        
        if (elements.submitBtn) {
            if (amount && checked && parseFloat(amount) >= 10 && hasScreenshot) {
                elements.submitBtn.disabled = false;
            } else {
                elements.submitBtn.disabled = true;
            }
        }
    }

    /**
     * 提交充值请求
     */
    async function submitDeposit() {
        const amount = elements.amountInput ? elements.amountInput.value : null;
        const network = elements.networkSelect ? elements.networkSelect.value : null;
        const file = elements.screenshotInput ? elements.screenshotInput.files[0] : null;
        const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
        
        if (!amount || parseFloat(amount) < 10) {
            alert(`Please enter a valid amount (minimum 10 ${isTestMode ? 'tUSDT' : 'USDT'})`);
            return;
        }
        
        if (!file) {
            alert('请上传转账截图，以便我们快速审核');
            return;
        }
        
        if (!elements.submitBtn) return;
        
        try {
            elements.submitBtn.disabled = true;
            elements.submitBtn.textContent = 'Submitting...';
            
            const formData = new FormData();
            formData.append('amount', amount);
            formData.append('network', network);
            formData.append('screenshot', file);
            
            const response = await fetch('/api/v1/user/deposit/submit-with-screenshot', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showSuccessToast(`Deposit request submitted successfully! Amount: ${amount} USDT. We will review within 24 hours.`);
                // 重置表单
                if (elements.amountInput) elements.amountInput.value = '';
                if (elements.confirmCheck) elements.confirmCheck.checked = false;
                if (elements.screenshotInput) {
                    elements.screenshotInput.value = '';
                    if (elements.previewArea) elements.previewArea.style.display = 'none';
                    if (elements.uploadArea) elements.uploadArea.style.display = 'block';
                    if (elements.preview) elements.preview.src = '';
                }
                checkForm();
            } else {
                alert(data.message || 'Submission failed');
            }
        } catch (err) {
            console.error('Deposit error:', err);
            alert('Submission failed. Please try again.');
        } finally {
            if (elements.submitBtn) {
                elements.submitBtn.disabled = false;
                elements.submitBtn.textContent = 'Submit Deposit';
            }
        }
    }

    /**
     * 显示成功提示
     */
    function showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #10b981;
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 14px;
            z-index: 1000;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 4000);
    }

    /**
     * 显示精美复制成功提示卡片
     */
    function showCopyToast(address, network) {
        const existingToast = document.querySelector('.copy-toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = 'copy-toast';
        
        const shortAddress = address.length > 20 
            ? `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
            : address;
        
        const networkNames = {
            'TRC20': 'TRC20 (Tron)',
            'ERC20': 'ERC20 (Ethereum)',
            'BEP20': 'BEP20 (BSC)'
        };
        const displayNetwork = networkNames[network] || network;
        
        toast.innerHTML = `
            <div class="copy-toast-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="copy-toast-content">
                <div class="copy-toast-title">Address Copied!</div>
                <div class="copy-toast-address">
                    <i class="fas fa-wallet"></i>
                    <span>${escapeHtml(shortAddress)}</span>
                </div>
                <div class="copy-toast-network">
                    <i class="fas fa-network-wired"></i>
                    <span>${escapeHtml(displayNetwork)}</span>
                </div>
                <div class="copy-toast-tip">
                    <i class="fas fa-shield-alt"></i>
                    <span>Double-check the address before sending</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 显示错误提示
     */
    function showErrorToast(message) {
        const existingToast = document.querySelector('.copy-toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = 'copy-toast error';
        toast.innerHTML = `
            <div class="copy-toast-icon">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="copy-toast-content">
                <div class="copy-toast-title">Cannot Copy</div>
                <div class="copy-toast-address">${escapeHtml(message)}</div>
            </div>
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * HTML 转义
     */
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
        /**
     * 检查模式锁定状态，控制切换按钮显示
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
                    console.log('模式切换按钮显示状态:', canSwitch ? '显示' : '隐藏');
                }
            }
        } catch (err) {
            console.error('检查模式锁定状态失败:', err);
            const modeSwitcher = document.getElementById('modeSwitcher');
            if (modeSwitcher) modeSwitcher.style.display = 'none';
        }
    }

    /**
     * 绑定事件（新增截图上传事件）
     */
    function bindEvents() {
        // 模式切换按钮事件
        if (elements.modeSwitcher && elements.modeBtns) {
            elements.modeBtns.forEach(btn => {
                btn.addEventListener('click', async function() {
                    const targetMode = this.dataset.mode === 'test';
                    if (window.ThemeManager && window.ThemeManager.isTestMode !== targetMode) {
                        await window.ThemeManager.toggleMode();
                    }
                });
            });
        }
        
        // 网络切换事件
        if (elements.networkSelect) {
            elements.networkSelect.addEventListener('change', function() {
                updateAddressForNetwork(this.value);
            });
        }
        
        // 表单输入事件
        if (elements.amountInput) {
            elements.amountInput.addEventListener('input', checkForm);
        }
        if (elements.confirmCheck) {
            elements.confirmCheck.addEventListener('change', checkForm);
        }
        
        // 截图上传事件
        if (elements.uploadArea && elements.screenshotInput) {
            // 点击上传区域
            elements.uploadArea.addEventListener('click', function() {
                elements.screenshotInput.click();
            });
            
            // 文件选择变化
            elements.screenshotInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) handleFileUpload(file);
                checkForm();
            });
            
            // 拖拽上传
            elements.uploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                if (elements.uploadArea) elements.uploadArea.style.borderColor = 'var(--accent)';
            });
            
            elements.uploadArea.addEventListener('dragleave', function(e) {
                e.preventDefault();
                if (elements.uploadArea) elements.uploadArea.style.borderColor = '';
            });
            
            elements.uploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                if (elements.uploadArea) elements.uploadArea.style.borderColor = '';
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    if (elements.screenshotInput) {
                        elements.screenshotInput.files = e.dataTransfer.files;
                        handleFileUpload(file);
                        checkForm();
                    }
                }
            });
        }
        
        // 提交按钮事件
        if (elements.submitBtn) {
            elements.submitBtn.addEventListener('click', submitDeposit);
        }
    }

    // 暴露全局函数
    window.copyAddress = function() {
        const addressSpan = document.getElementById('depositAddress');
        const address = addressSpan ? addressSpan.textContent : '';
        
        if (!address || address === 'Loading...') {
            showErrorToast('No address to copy');
            return;
        }
        
        const networkSelect = document.getElementById('network');
        let network = 'TRC20';
        if (networkSelect && networkSelect.options[networkSelect.selectedIndex]) {
            network = networkSelect.options[networkSelect.selectedIndex].value;
        }
        
        navigator.clipboard.writeText(address).then(() => {
            showCopyToast(address, network);
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = address;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showCopyToast(address, network);
        });
    };
    
    window.removeImage = function() {
        if (elements.screenshotInput) elements.screenshotInput.value = '';
        if (elements.previewArea) elements.previewArea.style.display = 'none';
        if (elements.uploadArea) elements.uploadArea.style.display = 'block';
        if (elements.preview) elements.preview.src = '';
        checkForm();
    };
    
    window.toggleFaq = function(element) {
        const answer = element.nextElementSibling;
        const icon = element.querySelector('i');
        
        if (answer.style.maxHeight) {
            answer.style.maxHeight = null;
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            answer.style.maxHeight = answer.scrollHeight + 'px';
            if (icon) icon.style.transform = 'rotate(180deg)';
        }
    };
    
    init();
})();