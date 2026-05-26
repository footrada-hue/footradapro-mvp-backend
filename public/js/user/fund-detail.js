/**
 * FOOTRADAPRO - 資金明細頁面控制器
 * @feature 支援沙盒用戶，顯示測試模式標記，支援 ID 定位高亮
 * @version 2.1.0
 * @description 優化真實模式交易類型顯示，支持提現退款、提現狀態等完整交易類型
 */

(function() {
    'use strict';

    const pageSize = 20;
    let currentPage = 1;
    let currentType = 'all';
    let hasMore = false;
    let allRecords = [];

    // 從 URL 獲取目標 ID
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    const DOM = {
        loadingState: document.getElementById('loadingState'),
        fundList: document.getElementById('fundList'),
        emptyState: document.getElementById('emptyState'),
        loadMore: document.getElementById('loadMore'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
        totalDeposit: document.getElementById('totalDeposit'),
        totalWithdraw: document.getElementById('totalWithdraw'),
        netFund: document.getElementById('netFund'),
        tabBtns: document.querySelectorAll('.filter-tab'),
        testModeBadge: document.getElementById('testModeBadge'),
        currencySymbols: document.querySelectorAll('.currency'),
        fourthStatLabel: document.getElementById('fourthStatLabel')
    };

    document.addEventListener('DOMContentLoaded', async function() {
        // 等待 ThemeManager 初始化
        if (window.ThemeManager) {
            await ThemeManager.init(true);
            console.log('✅ 資金明細頁面 ThemeManager 初始化完成，當前模式:', ThemeManager.isTestMode ? '測試' : '真實');
            
            updateModeUI(ThemeManager.isTestMode);
        }
        
        await loadFundStats();
        await loadFundRecords(true);
        bindEvents();
        
        // 監聽模式變化
        if (window.ThemeManager) {
            ThemeManager.addListener((state) => {
                console.log('🎨 資金明細頁面收到主題變化:', state);
                updateModeUI(state.isTestMode);
                loadFundStats();
                loadFundRecords(true);
            });
        }
    });

    // 更新模式 UI
    function updateModeUI(isTestMode) {
        document.body.classList.remove('test-mode', 'live-mode');
        document.body.classList.add(isTestMode ? 'test-mode' : 'live-mode');
        
        if (DOM.testModeBadge) {
            DOM.testModeBadge.style.display = isTestMode ? 'inline-flex' : 'none';
        }
        
        const currency = isTestMode ? 'tUSDT' : 'USDT';
        DOM.currencySymbols.forEach(el => {
            el.textContent = currency;
        });
    }

    // 加載資金統計
    async function loadFundStats() {
        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const mode = isTestMode ? 'test' : 'live';
            
            const res = await fetch(`/api/v1/user/stats/fund?mode=${mode}`, {
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.success) {
                if (data.data.mode === 'test') {
                    if (DOM.totalDeposit) DOM.totalDeposit.innerHTML = '—';
                    if (DOM.totalWithdraw) DOM.totalWithdraw.innerHTML = '—';
                    if (DOM.netFund) {
                        const testBalance = data.data.test_balance || 10000;
                        DOM.netFund.innerHTML = testBalance.toFixed(2) + ' <span class="currency">tUSDT</span>';
                    }
                    if (DOM.fourthStatLabel) DOM.fourthStatLabel.textContent = 'Test Balance';
                    
                    console.log('🧪 資金明細為測試模式');
                } else {
                    const currency = 'USDT';
                    if (DOM.totalDeposit) DOM.totalDeposit.innerHTML = (data.data.total_deposit || 0).toFixed(2) + ' <span class="currency">' + currency + '</span>';
                    if (DOM.totalWithdraw) DOM.totalWithdraw.innerHTML = (data.data.total_withdraw || 0).toFixed(2) + ' <span class="currency">' + currency + '</span>';
                    if (DOM.netFund) {
                        const netFund = data.data.net_fund || 0;
                        DOM.netFund.innerHTML = netFund.toFixed(2) + ' <span class="currency">' + currency + '</span>';
                    }
                    if (DOM.fourthStatLabel) DOM.fourthStatLabel.textContent = 'Net Fund';
                }
            }
        } catch (err) {
            console.error('加載資金統計失敗:', err);
        }
    }

    // 加載資金記錄
    async function loadFundRecords(reset = true) {
        if (reset) {
            currentPage = 1;
            allRecords = [];
            showLoading();
        }

        try {
            const isTestMode = window.ThemeManager ? ThemeManager.isTestMode : false;
            const currency = isTestMode ? 'tUSDT' : 'USDT';
            
            let url;
            if (isTestMode) {
                url = `/api/v1/user/test/balance/logs?type=${currentType}&page=${currentPage}&limit=${pageSize}`;
            } else {
                url = `/api/v1/user/balance/logs?type=${currentType}&page=${currentPage}&limit=${pageSize}`;
            }
            
            const res = await fetch(url, { credentials: 'include' });
            const data = await res.json();

            if (data.success) {
                const newRecords = data.data || [];
                
                if (reset) {
                    allRecords = newRecords;
                } else {
                    allRecords = [...allRecords, ...newRecords];
                }

                hasMore = data.pagination?.pages > currentPage;
                renderRecords(currency, isTestMode);
                
                if (targetId) {
                    setTimeout(() => scrollToTarget(targetId), 500);
                }
            } else {
                showEmpty();
            }
        } catch (err) {
            console.error('加載記錄失敗:', err);
            showEmpty();
        }
    }

    /**
     * 從 reason 字段提取提現狀態
     * @param {string} reason - 原因字段內容
     * @returns {string} 狀態文字
     */
    function getWithdrawStatusFromReason(reason) {
        if (!reason) return 'Processing';
        
        // Check for completed status
        if (reason.includes('completed') || reason.includes('已完成')) {
            return 'Completed';
        }
        
        // Check for approved status
        if (reason.includes('approved') || reason.includes('批准') || reason.includes('通过')) {
            return 'Completed';
        }
        
        // Check for rejected status
        if (reason.includes('rejected') || reason.includes('驳回')) {
            return 'Rejected';
        }
        
        // Check for pending status
        if (reason.includes('pending') || reason.includes('待审核')) {
            return 'Pending';
        }
        
        return 'Processing';
    }

    /**
     * 從 reason 字段提取描述信息
     * @param {object} record - 記錄對象
     * @returns {string} 描述文字
     */
    function getDescriptionFromRecord(record) {
        if (!record.reason) return '';
        
        if (record.type === 'withdraw') {
            // Extract amount
            const amountMatch = record.reason.match(/提現申請: ([\d.]+) USDT/);
            if (amountMatch) {
                return `Amount: ${amountMatch[1]} USDT`;
            }
            
            // Extract TxID
            const txMatch = record.reason.match(/TxID:\s*([^\s|]+)/);
            if (txMatch && txMatch[1] !== 'undefined') {
                const txId = txMatch[1];
                return `TxID: ${txId.length > 12 ? txId.substring(0, 12) + '...' : txId}`;
            }
            
            // Extract rejection reason
            const rejectMatch = record.reason.match(/驳回原因:\s*(.+)/);
            if (rejectMatch) {
                const reason = rejectMatch[1];
                return `Rejected: ${reason.length > 30 ? reason.substring(0, 30) + '...' : reason}`;
            }
            
            // Fallback to amount extraction
            const simpleAmount = record.reason.match(/([\d.]+)\s*USDT/);
            if (simpleAmount && !record.reason.includes('恢復')) {
                return `Amount: ${simpleAmount[1]} USDT`;
            }
        } else if (record.type === 'withdraw_reject') {
            const match = record.reason.match(/恢復: ([\d.]+) USDT/);
            if (match) return `Refund: ${match[1]} USDT`;
            
            const amountMatch = record.reason.match(/([\d.]+)\s*USDT/);
            if (amountMatch) {
                return `Refund: ${amountMatch[1]} USDT`;
            }
        } else if (record.type === 'deposit') {
            return 'Deposit credited';
        }
        
        return '';
    }

    // 渲染記錄
    function renderRecords(currency, isTestMode) {
        if (allRecords.length === 0) {
            showEmpty();
            return;
        }

        let html = '';
        
        allRecords.forEach(record => {
            // 過濾掉金額為 0 的記錄（如審核通過的佔位記錄）
            if (record.amount === 0) {
                return;
            }
            
            let typeText = '';
            let icon = '';
            let amountClass = '';
            let statusText = '';
            let description = '';
            
            if (isTestMode) {
                // ==================== 測試模式 ====================
                if (record.type === 'authorize') {
                    typeText = 'Authorization';
                    icon = 'key';
                    amountClass = record.amount > 0 ? 'deposit' : 'withdraw';
                } else if (record.type === 'settle') {
                    typeText = 'Settlement';
                    icon = 'calculator';
                    amountClass = record.amount > 0 ? 'deposit' : 'withdraw';
                } else if (record.type === 'reset') {
                    typeText = 'Reset';
                    icon = 'undo-alt';
                    amountClass = 'deposit';
                } else if (record.type === 'deposit') {
                    typeText = 'Test Deposit';
                    icon = 'arrow-down';
                    amountClass = 'deposit';
                } else if (record.type === 'withdraw') {
                    typeText = 'Test Withdraw';
                    icon = 'arrow-up';
                    amountClass = 'withdraw';
                } else {
                    typeText = record.amount > 0 ? 'Income' : 'Expense';
                    icon = record.amount > 0 ? 'arrow-down' : 'arrow-up';
                    amountClass = record.amount > 0 ? 'deposit' : 'withdraw';
                }
                
                statusText = 'Completed';
                description = record.description || '';
                
            } else {
                // ==================== 真實模式 ====================
                switch(record.type) {
                    case 'deposit':
                        typeText = 'Deposit';
                        icon = 'arrow-down';
                        amountClass = 'deposit';
                        statusText = 'Completed';
                        description = getDescriptionFromRecord(record) || 'Deposit credited';
                        break;
                        
                    case 'withdraw':
                        typeText = 'Withdraw';
                        icon = 'arrow-up';
                        amountClass = 'withdraw';
                        statusText = getWithdrawStatusFromReason(record.reason);
                        description = getDescriptionFromRecord(record);
                        
                        if (!description && record.reason) {
                            const amountMatch = record.reason.match(/([\d.]+)\s*USDT/);
                            if (amountMatch) {
                                description = `Amount: ${amountMatch[1]} USDT`;
                            }
                        }
                        break;
                        
                    case 'withdraw_reject':
                        typeText = 'Refund';
                        icon = 'undo-alt';
                        amountClass = 'deposit';
                        statusText = 'Refunded';
                        description = getDescriptionFromRecord(record);
                        
                        if (!description && record.reason) {
                            const amountMatch = record.reason.match(/([\d.]+)\s*USDT/);
                            if (amountMatch) {
                                description = `Refund: ${amountMatch[1]} USDT`;
                            } else {
                                description = 'Withdrawal rejected, funds refunded';
                            }
                        }
                        break;
                        case 'settlement':
    typeText = 'Settlement';
    icon = 'calculator';
    amountClass = record.amount > 0 ? 'deposit' : 'withdraw';
    statusText = 'Completed';
    description = record.reason || 'Match settlement completed';
    break;
                        
                    case 'withdraw_approved':
                        // 審核通過的記錄金額為 0，已在前面過濾，此處作為備用
                        if (record.amount === 0) return;
                        typeText = 'Withdraw Complete';
                        icon = 'check-circle';
                        amountClass = 'withdraw';
                        statusText = 'Completed';
                        description = getDescriptionFromRecord(record);
                        break;
                        
                    default:
                        // 兼容舊數據
                        if (record.amount > 0) {
                            typeText = 'Deposit';
                            icon = 'arrow-down';
                            amountClass = 'deposit';
                        } else {
                            typeText = 'Withdraw';
                            icon = 'arrow-up';
                            amountClass = 'withdraw';
                        }
                        statusText = 'Completed';
                        description = '';
                }
            }
            
            const amount = Math.abs(record.amount).toFixed(2);
            const amountPrefix = record.amount > 0 ? '+' : '-';
            
            const date = new Date(record.created_at);
            const dateStr = date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const isTarget = record.id == targetId ? ' data-target="true"' : '';
            
            html += `
                <div class="fund-item" data-id="${record.id}"${isTarget} onclick="viewDetail(${record.id})">
                    <div class="fund-icon ${amountClass}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="fund-info">
                        <div class="fund-type ${amountClass}">${escapeHtml(typeText)}</div>
                        ${description ? `<div class="fund-desc"><i class="fas fa-info-circle"></i> ${escapeHtml(description)}</div>` : ''}
                        <div class="fund-desc">
                            <i class="fas fa-clock"></i> ${escapeHtml(dateStr)}
                        </div>
                    </div>
                    <div class="fund-right">
                        <div class="fund-amount ${amountClass}">${amountPrefix}${amount} ${escapeHtml(currency)}</div>
                        ${statusText ? `<div class="fund-time">${escapeHtml(statusText)}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        // 如果過濾後沒有記錄
        if (html === '') {
            showEmpty();
            return;
        }

        DOM.fundList.innerHTML = html;
        DOM.fundList.style.display = 'block';
        DOM.loadingState.style.display = 'none';
        DOM.emptyState.style.display = 'none';
        DOM.loadMore.style.display = hasMore ? 'flex' : 'none';
    }
    
    /**
     * 簡單的 HTML 轉義函數，防止 XSS
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

    // 滾動到目標記錄並高亮
    function scrollToTarget(id) {
        const targetElement = document.querySelector(`.fund-item[data-id="${id}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            targetElement.classList.add('highlight');
            
            setTimeout(() => {
                targetElement.classList.remove('highlight');
            }, 2000);
            
            console.log(`📍 已定位到記錄 ID: ${id}`);
        } else {
            console.log(`⚠️ 未找到目標記錄 ID: ${id}`);
        }
    }

    // 顯示加載狀態
    function showLoading() {
        DOM.loadingState.style.display = 'flex';
        DOM.fundList.style.display = 'none';
        DOM.emptyState.style.display = 'none';
        DOM.loadMore.style.display = 'none';
    }

    // 顯示空狀態
    function showEmpty() {
        DOM.loadingState.style.display = 'none';
        DOM.fundList.style.display = 'none';
        DOM.emptyState.style.display = 'flex';
        DOM.loadMore.style.display = 'none';
    }

    // 加載更多
    function loadMore() {
        currentPage++;
        loadFundRecords(false);
    }

    // 切換類型
    function switchType(type) {
        currentType = type;
        currentPage = 1;
        
        DOM.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        showLoading();
        loadFundRecords(true);
    }

    // 綁定事件
    function bindEvents() {
        DOM.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchType(btn.dataset.type);
            });
        });

        if (DOM.loadMoreBtn) {
            DOM.loadMoreBtn.addEventListener('click', loadMore);
        }
    }

    // 查看詳情
    window.viewDetail = function(id) {
        console.log('查看詳情:', id);
        // 可選：跳轉到詳情頁面
        // window.location.href = `/fund-detail.html?id=${id}`;
    };
})();