// network-addresses.js - 网络地址管理页面控制器（修复版）

(function() {
    'use strict';

    let currentNetwork = 'TRC20';
    let allConfigs = [];

    // DOM 元素
    const DOM = {
        networkTabs: document.getElementById('networkTabs'),
        addressForm: document.getElementById('addressForm'),
        networkInput: document.getElementById('network'),
        addressInput: document.getElementById('address'),
        noteInput: document.getElementById('note'),
        statusSelect: document.getElementById('status'),
        addressPreview: document.getElementById('addressPreview'),
        configList: document.getElementById('configList')
    };

    // 地址格式验证规则
    const ADDRESS_VALIDATION = {
        TRC20: {
            pattern: /^T[A-Za-z0-9]{33}$/,
            message: 'TRC20地址格式：以T开头，共34位字符'
        },
        ERC20: {
            pattern: /^0x[a-fA-F0-9]{40}$/,
            message: 'ERC20地址格式：0x开头，共42位十六进制字符'
        },
        BEP20: {
            pattern: /^0x[a-fA-F0-9]{40}$/,
            message: 'BEP20地址格式：0x开头，共42位十六进制字符'
        }
    };

    // 初始化
    document.addEventListener('DOMContentLoaded', function() {
        console.log('页面加载完成，开始加载配置...');
        loadAllConfigs();
        bindEvents();
    });

    // 绑定事件
    function bindEvents() {
        // 网络标签切换
        if (DOM.networkTabs) {
            DOM.networkTabs.querySelectorAll('.network-tab').forEach(tab => {
                tab.addEventListener('click', function(e) {
                    DOM.networkTabs.querySelectorAll('.network-tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    currentNetwork = this.dataset.network;
                    DOM.networkInput.value = currentNetwork;
                    loadConfigToForm(currentNetwork);
                    updateAddressValidationHint(currentNetwork);
                });
            });
        }
        
        // 表单提交 - 保存/更新
        if (DOM.addressForm) {
            DOM.addressForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                await saveOrUpdateConfig();
            });
        }
        
        // 实时预览和验证
        if (DOM.addressInput) {
            DOM.addressInput.addEventListener('input', function() {
                const address = this.value.trim();
                if (DOM.addressPreview) {
                    DOM.addressPreview.textContent = address || '地址将显示在此处';
                }
                validateAddress(address, currentNetwork);
            });
        }
        
        // 初始化地址验证提示
        updateAddressValidationHint(currentNetwork);
    }

    // 更新地址验证提示
    function updateAddressValidationHint(network) {
        const validation = ADDRESS_VALIDATION[network];
        if (validation) {
            let hint = document.getElementById('addressHint');
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'addressHint';
                hint.className = 'address-hint';
                hint.style.cssText = 'font-size: 12px; color: #94A3B8; margin-top: 8px;';
                DOM.addressInput.parentNode.appendChild(hint);
            }
            hint.innerHTML = `<i class="fas fa-info-circle"></i> ${validation.message}`;
        }
    }

    // 验证地址格式
    function validateAddress(address, network) {
        const validation = ADDRESS_VALIDATION[network];
        const hint = document.getElementById('addressHint');
        
        if (!address) {
            if (hint) hint.style.color = '#94A3B8';
            return false;
        }
        
        if (validation && validation.pattern) {
            const isValid = validation.pattern.test(address);
            if (hint) {
                if (isValid) {
                    hint.style.color = '#10b981';
                    hint.innerHTML = `<i class="fas fa-check-circle"></i> 地址格式正确`;
                } else {
                    hint.style.color = '#ef4444';
                    hint.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${validation.message}`;
                }
            }
            return isValid;
        }
        return true;
    }

    // 保存或更新配置
    async function saveOrUpdateConfig() {
        const address = DOM.addressInput.value.trim();
        const note = DOM.noteInput.value.trim();
        const status = DOM.statusSelect.value;
        
        if (!address) {
            showToast('❌ 请填写充值地址', 'error');
            DOM.addressInput.focus();
            return;
        }
        
        const isValid = validateAddress(address, currentNetwork);
        if (!isValid) {
            showToast(`❌ 地址格式不正确`, 'error');
            DOM.addressInput.focus();
            return;
        }
        
        // 获取旧配置
        const oldConfig = allConfigs.find(c => c.network === currentNetwork);
        
        let confirmMessage = '';
        if (oldConfig && oldConfig.deposit_address !== address) {
            confirmMessage = `⚠️ 敏感操作确认 ⚠️\n\n`;
            confirmMessage += `网络: ${currentNetwork}\n`;
            confirmMessage += `旧地址: ${oldConfig.deposit_address}\n`;
            confirmMessage += `新地址: ${address}\n\n`;
            confirmMessage += `⚠️ 此操作将影响所有用户的充值地址！\n`;
            confirmMessage += `确认修改吗？`;
        } else if (!oldConfig) {
            confirmMessage = `⚠️ 确认添加 ${currentNetwork} 配置吗？\n\n地址: ${address}`;
        } else {
            confirmMessage = `确认保存 ${currentNetwork} 的配置吗？`;
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        await saveConfig(address, note, status);
    }

    // 执行保存
    async function saveConfig(address, note, status) {
        const data = {
            deposit_address: address,
            notes: note,
            is_active: status === 'active' ? 1 : 0,
            withdraw_fee: 1,
            min_withdraw: 10,
            max_withdraw: 10000
        };
        
        const saveBtn = document.querySelector('.btn-save');
        const originalText = saveBtn.innerHTML;
        
        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
            
            const res = await fetch(`/api/v1/admin/network/networks/${currentNetwork}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            });
            
            const result = await res.json();
            
            if (result.success) {
                showToast('✅ 保存成功！', 'success');
                await loadAllConfigs();
                await loadConfigToForm(currentNetwork);
            } else {
                showToast('❌ 保存失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (err) {
            console.error('保存失败:', err);
            showToast('❌ 保存失败: ' + err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }

    // 禁用网络（软删除）
    async function disableNetwork(network) {
        const config = allConfigs.find(c => c.network === network);
        if (!config) return;
        
        const confirmMessage = `⚠️ 确认禁用 ${network} 网络吗？\n\n`;
        confirmMessage += `当前地址: ${config.deposit_address}\n`;
        confirmMessage += `禁用后，用户将无法使用此网络充值！\n\n`;
        confirmMessage += `确认禁用？`;
        
        if (!confirm(confirmMessage)) return;
        
        try {
            const res = await fetch(`/api/v1/admin/network/networks/${network}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    deposit_address: config.deposit_address,
                    notes: config.notes || '',
                    is_active: 0,
                    withdraw_fee: 1,
                    min_withdraw: 10,
                    max_withdraw: 10000
                })
            });
            
            const result = await res.json();
            
            if (result.success) {
                showToast(`✅ 已禁用 ${network} 网络`, 'success');
                await loadAllConfigs();
                if (currentNetwork === network) {
                    // 切换到第一个启用的网络
                    const activeNetwork = allConfigs.find(c => c.is_active === 1);
                    if (activeNetwork) {
                        const tab = document.querySelector(`.network-tab[data-network="${activeNetwork.network}"]`);
                        if (tab) tab.click();
                    }
                }
            } else {
                showToast('❌ 操作失败: ' + result.message, 'error');
            }
        } catch (err) {
            console.error('操作失败:', err);
            showToast('❌ 操作失败', 'error');
        }
    }

    // 启用网络
    async function enableNetwork(network) {
        const config = allConfigs.find(c => c.network === network);
        if (!config) return;
        
        if (!config.deposit_address) {
            showToast(`❌ 请先配置 ${network} 的充值地址`, 'error');
            return;
        }
        
        try {
            const res = await fetch(`/api/v1/admin/network/networks/${network}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    deposit_address: config.deposit_address,
                    notes: config.notes || '',
                    is_active: 1,
                    withdraw_fee: 1,
                    min_withdraw: 10,
                    max_withdraw: 10000
                })
            });
            
            const result = await res.json();
            
            if (result.success) {
                showToast(`✅ 已启用 ${network} 网络`, 'success');
                await loadAllConfigs();
            } else {
                showToast('❌ 操作失败: ' + result.message, 'error');
            }
        } catch (err) {
            console.error('操作失败:', err);
            showToast('❌ 操作失败', 'error');
        }
    }

    // 加载所有配置
    async function loadAllConfigs() {
        try {
            const res = await fetch('/api/v1/admin/network/networks', {
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.success && data.data) {
                allConfigs = data.data;
                renderConfigList(data.data);
                // 加载当前网络的配置到表单
                const currentConfig = data.data.find(item => item.network === currentNetwork);
                if (currentConfig) {
                    fillForm(currentConfig);
                }
            } else {
                DOM.configList.innerHTML = '<div class="empty-state">暂无配置</div>';
            }
        } catch (err) {
            console.error('加载配置失败:', err);
            DOM.configList.innerHTML = '<div class="empty-state">加载失败: ' + err.message + '</div>';
        }
    }

    // 加载单个网络配置到表单
    async function loadConfigToForm(network) {
        try {
            const res = await fetch(`/api/v1/admin/network/networks/${network}`, {
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.success && data.data) {
                fillForm(data.data);
            } else {
                clearForm();
            }
        } catch (err) {
            console.error('加载配置失败:', err);
            clearForm();
        }
    }

    // 清空表单
    function clearForm() {
        DOM.addressInput.value = '';
        DOM.noteInput.value = '';
        DOM.statusSelect.value = 'active';
        DOM.addressPreview.textContent = '地址将显示在此处';
    }

    // 填充表单
    function fillForm(config) {
        DOM.addressInput.value = config.deposit_address || '';
        DOM.noteInput.value = config.notes || '';
        DOM.statusSelect.value = config.is_active === 1 ? 'active' : 'inactive';
        DOM.addressPreview.textContent = config.deposit_address || '地址将显示在此处';
        
        if (config.deposit_address) {
            validateAddress(config.deposit_address, currentNetwork);
        }
    }

    // 渲染配置列表
    function renderConfigList(configs) {
        if (!DOM.configList) return;
        
        if (!configs || configs.length === 0) {
            DOM.configList.innerHTML = '<div class="empty-state">暂无配置</div>';
            return;
        }
        
        let html = '';
        configs.forEach(config => {
            const statusClass = config.is_active === 1 ? 'status-active' : 'status-inactive';
            const statusText = config.is_active === 1 ? '已启用' : '已禁用';
            const address = config.deposit_address || '未配置';
            const note = config.notes || '';
            const updatedAt = config.updated_at ? new Date(config.updated_at).toLocaleString() : '未知';
            
            html += `
                <div class="config-item" data-network="${config.network}">
                    <div class="config-header">
                        <span class="config-network">
                            <i class="fas fa-network-wired"></i> ${config.network}
                        </span>
                        <div class="config-actions">
                            <button class="config-edit-btn" onclick="window.editNetwork('${config.network}')" title="编辑">
                                <i class="fas fa-edit"></i> 编辑
                            </button>
                            ${config.is_active === 1 ? 
                                `<button class="config-disable-btn" onclick="window.disableNetwork('${config.network}')" title="禁用">
                                    <i class="fas fa-ban"></i> 禁用
                                </button>` :
                                `<button class="config-enable-btn" onclick="window.enableNetwork('${config.network}')" title="启用">
                                    <i class="fas fa-play"></i> 启用
                                </button>`
                            }
                        </div>
                    </div>
                    <div class="config-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="config-address">
                        <i class="fas fa-qrcode"></i> ${escapeHtml(address)}
                    </div>
                    ${note ? `<div class="config-note"><i class="fas fa-info-circle"></i> ${escapeHtml(note)}</div>` : ''}
                    <div class="config-meta">
                        <i class="fas fa-user-clock"></i> 最后更新: ${updatedAt}
                    </div>
                </div>
            `;
        });
        
        DOM.configList.innerHTML = html;
    }

    // 编辑网络
    window.editNetwork = function(network) {
        console.log('编辑网络:', network);
        // 切换到对应的标签页
        const tab = document.querySelector(`.network-tab[data-network="${network}"]`);
        if (tab) {
            tab.click();
        }
        // 滚动到表单区域
        const formElement = document.querySelector('.address-form');
        if (formElement) {
            formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        showToast(`正在编辑 ${network} 配置，请在下方表单中修改`, 'info');
    };
    
    // 禁用网络
    window.disableNetwork = function(network) {
        disableNetwork(network);
    };
    
    // 启用网络
    window.enableNetwork = function(network) {
        enableNetwork(network);
    };

    // 显示提示消息
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-width: 350px;
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // HTML 转义
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
})();