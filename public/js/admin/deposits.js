/**
 * deposits.js - 充值审核页面控制器（手动审核版）
 * @version 2.0.0
 */

(function() {
    'use strict';

    let allDeposits = [];
    let checkInterval = null;

    let elements = {};

    async function init() {
        console.log('充值审核页面初始化...');
        
        elements = {
            pendingCount: document.getElementById('pendingCount'),
            completedCount: document.getElementById('completedCount'),
            rejectedCount: document.getElementById('rejectedCount'),
            pendingAmount: document.getElementById('pendingAmount'),
            statusFilter: document.getElementById('statusFilter'),
            searchInput: document.getElementById('searchInput'),
            depositTableBody: document.getElementById('depositTableBody'),
            notificationBar: document.getElementById('notificationBar'),
            notificationMessage: document.getElementById('notificationMessage'),
            reviewModal: document.getElementById('reviewModal'),
            reviewId: document.getElementById('reviewId'),
            reviewUser: document.getElementById('reviewUser'),
            reviewAmount: document.getElementById('reviewAmount'),
            reviewNetwork: document.getElementById('reviewNetwork'),
            adminNote: document.getElementById('adminNote'),
            rejectReasonGroup: document.getElementById('rejectReasonGroup'),
            rejectReason: document.getElementById('rejectReason'),
            confirmRejectBtn: document.getElementById('confirmRejectBtn')
        };

        bindEvents();
        await loadDeposits();
        startNotificationCheck();
        
        console.log('充值审核页面初始化完成');
    }

    function bindEvents() {
        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', filterDeposits);
        }
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', filterDeposits);
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.location.href = '/admin/index.html';
            });
        }
        
        if (elements.reviewModal) {
            elements.reviewModal.addEventListener('click', function(e) {
                if (e.target === elements.reviewModal) {
                    window.closeReviewModal();
                }
            });
        }
    }

    function startNotificationCheck() {
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(checkNewDeposits, 15000);
        
        window.addEventListener('beforeunload', () => {
            if (checkInterval) clearInterval(checkInterval);
        });
    }

    async function checkNewDeposits() {
        try {
            const res = await adminRequest('/api/v1/admin/deposit/stats');
            if (res.success && res.data) {
                const pendingCount = res.data.pending_count || 0;
                const lastCount = parseInt(localStorage.getItem('lastPendingCount') || '0');
                
                if (pendingCount > lastCount && lastCount > 0) {
                    const newCount = pendingCount - lastCount;
                    showNotification(`\uD83D\uDD14 有 ${newCount} 个新的充值申请，请及时处理`);
                    document.title = `(${pendingCount}) 充值审核 - FOOTRADAPRO`;
                } else {
                    document.title = `充值审核 - FOOTRADAPRO`;
                }
                
                localStorage.setItem('lastPendingCount', pendingCount);
            }
        } catch (err) {
            console.error('检查新充值失败:', err);
        }
    }

    function showNotification(message) {
        if (!elements.notificationBar) return;
        
        if (elements.notificationMessage) {
            elements.notificationMessage.textContent = message;
        }
        elements.notificationBar.style.display = 'flex';
        
        setTimeout(() => {
            if (elements.notificationBar) {
                elements.notificationBar.style.display = 'none';
            }
        }, 8000);
    }

    window.closeNotification = function() {
        if (elements.notificationBar) {
            elements.notificationBar.style.display = 'none';
        }
    };

    async function adminRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        
        try {
            const response = await fetch(endpoint, { ...defaultOptions, ...options });
            return await response.json();
        } catch (err) {
            console.error('API请求失败:', err);
            throw err;
        }
    }

    async function loadDeposits() {
        if (elements.depositTableBody) {
            elements.depositTableBody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...<\/td><\/tr>';
        }
        
        try {
            const statsRes = await adminRequest('/api/v1/admin/deposit/stats');
            if (statsRes.success) {
                if (elements.pendingCount) elements.pendingCount.textContent = statsRes.data.pending_count || 0;
                if (elements.completedCount) elements.completedCount.textContent = statsRes.data.completed_count || 0;
                if (elements.rejectedCount) elements.rejectedCount.textContent = statsRes.data.rejected_count || 0;
                if (elements.pendingAmount) elements.pendingAmount.innerHTML = (statsRes.data.pending_amount || 0).toFixed(2) + ' USDT';
                
                localStorage.setItem('lastPendingCount', statsRes.data.pending_count || 0);
            }
            
            const depositsRes = await adminRequest('/api/v1/admin/deposit/all');
            if (depositsRes.success) {
                allDeposits = depositsRes.data || [];
                filterDeposits();
            }
        } catch (err) {
            console.error('加载充值列表失败:', err);
            if (elements.depositTableBody) {
                elements.depositTableBody.innerHTML = '<tr><td colspan="7" class="loading" style="color: var(--danger);">加载失败，请刷新重试<\/td><\/tr>';
            }
        }
    }

    function filterDeposits() {
        const status = elements.statusFilter ? elements.statusFilter.value : 'all';
        const search = elements.searchInput ? elements.searchInput.value.toLowerCase() : '';
        
        let filtered = [...allDeposits];
        
        if (status !== 'all') {
            filtered = filtered.filter(d => d.status === status);
        }
        if (search) {
            filtered = filtered.filter(d => 
                (d.username && d.username.toLowerCase().includes(search)) ||
                (d.uid && d.uid.toLowerCase().includes(search)) ||
                String(d.user_id).includes(search)
            );
        }
        
        renderTable(filtered);
    }

    function renderTable(deposits) {
        if (!elements.depositTableBody) return;
        
        if (deposits.length === 0) {
            elements.depositTableBody.innerHTML = '<tr><td colspan="7" class="loading">暂无记录<\/td><\/tr>';
            return;
        }
        
        let html = '';
        deposits.forEach(d => {
            const date = new Date(d.created_at).toLocaleString();
            const statusClass = d.status === 'pending' ? 'status-pending' : 
                               d.status === 'completed' ? 'status-completed' : 'status-rejected';
            const statusText = d.status === 'pending' ? '待审核' :
                              d.status === 'completed' ? '已完成' : '已驳回';
            
            html += `
                <tr>
                    <td>${escapeHtml(String(d.id))}</td>
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(d.username || d.user_id)}<br><small style="color: var(--text-tertiary);">UID: ${escapeHtml(d.uid || '-')}</small></td>
                    <td><strong>${d.amount} USDT</strong></td>
                    <td>${escapeHtml(d.network || '-')}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        ${d.status === 'pending' ? 
                            `<button class="action-btn" onclick="window.openReviewModal(${d.id})">审核</button>` : 
                            `<button class="action-btn" onclick="window.viewDetail(${d.id})">查看</button>`}
                    </td>
                </tr>
            `;
        });
        
        elements.depositTableBody.innerHTML = html;
    }

    window.openReviewModal = async function(id) {
        try {
            const res = await adminRequest(`/api/v1/admin/deposit/detail/${id}`);
            if (res.success) {
                const d = res.data;
                            // 添加调试日志
            console.log('充值详情:', d);
            console.log('截图路径:', d.screenshot);
                
                if (elements.reviewId) elements.reviewId.value = d.id;
                if (elements.reviewUser) elements.reviewUser.textContent = `${d.username} (UID: ${d.uid})`;
                if (elements.reviewAmount) elements.reviewAmount.textContent = d.amount + ' USDT';
                if (elements.reviewNetwork) elements.reviewNetwork.textContent = d.network || '-';
                
                const screenshotImg = document.getElementById('reviewScreenshot');
                const noScreenshot = document.getElementById('noScreenshot');
                if (screenshotImg && noScreenshot) {
                    if (d.screenshot) {
                        screenshotImg.src = d.screenshot;
                        screenshotImg.style.display = 'block';
                        noScreenshot.style.display = 'none';
                    } else {
                        screenshotImg.style.display = 'none';
                        noScreenshot.style.display = 'block';
                    }
                }
                
                const actualAmountInput = document.getElementById('actualAmount');
                if (actualAmountInput) actualAmountInput.value = '';
                if (elements.adminNote) elements.adminNote.value = '';
                if (elements.rejectReason) elements.rejectReason.value = '';
                
                if (elements.rejectReasonGroup) elements.rejectReasonGroup.style.display = 'none';
                if (elements.confirmRejectBtn) elements.confirmRejectBtn.style.display = 'none';
                
                if (elements.reviewModal) elements.reviewModal.classList.add('show');
            }
        } catch (err) {
            alert('获取详情失败');
        }
    };

    window.closeReviewModal = function() {
        if (elements.reviewModal) elements.reviewModal.classList.remove('show');
    };

    window.showRejectReason = function() {
        if (elements.rejectReasonGroup) elements.rejectReasonGroup.style.display = 'block';
        if (elements.confirmRejectBtn) elements.confirmRejectBtn.style.display = 'inline-block';
    };

    window.approveDeposit = async function() {
        const id = elements.reviewId ? elements.reviewId.value : null;
        const note = elements.adminNote ? elements.adminNote.value : '';
        const actualAmountInput = document.getElementById('actualAmount');
        const actualAmount = actualAmountInput ? actualAmountInput.value : null;
        
        if (!actualAmount || parseFloat(actualAmount) <= 0) {
            alert('请填写实际到账金额');
            return;
        }
        
        const confirmMsg = `确认通过此充值申请？\n\n实际到账金额: ${actualAmount} USDT\n\n将给用户增加 ${actualAmount} USDT`;
        if (!confirm(confirmMsg)) return;
        
        try {
            const res = await adminRequest(`/api/v1/admin/deposit/${id}/confirm`, {
                method: 'POST',
                body: JSON.stringify({ 
                    admin_note: note,
                    actual_amount: parseFloat(actualAmount)
                })
            });
            
            if (res.success) {
                alert(`充值已确认，已为用户增加 ${actualAmount} USDT`);
                window.closeReviewModal();
                await loadDeposits();
            } else {
                alert(res.message || '操作失败');
            }
        } catch (err) {
            alert('操作失败');
        }
    };

    window.rejectDeposit = async function() {
        const id = elements.reviewId ? elements.reviewId.value : null;
        const reason = elements.rejectReason ? elements.rejectReason.value : '';
        const note = elements.adminNote ? elements.adminNote.value : '';
        
        if (!reason) {
            alert('请输入驳回原因');
            return;
        }
        
        if (!confirm('确认驳回此充值申请？')) return;
        
        try {
            const res = await adminRequest(`/api/v1/admin/deposit/${id}/reject`, {
                method: 'POST',
                body: JSON.stringify({ 
                    admin_note: note,
                    reject_reason: reason 
                })
            });
            
            if (res.success) {
                alert('充值已驳回');
                window.closeReviewModal();
                await loadDeposits();
            } else {
                alert(res.message || '操作失败');
            }
        } catch (err) {
            alert('操作失败');
        }
    };

    window.viewDetail = async function(id) {
        try {
            const res = await adminRequest(`/api/v1/admin/deposit/detail/${id}`);
            if (res.success) {
                const d = res.data;
                alert(`
用户: ${d.username} (UID: ${d.uid})
申请金额: ${d.amount} USDT
实际到账: ${d.actual_amount || '未填写'} USDT
网络: ${d.network || '-'}
状态: ${d.status}
时间: ${new Date(d.created_at).toLocaleString()}
备注: ${d.admin_note || '无'}
                `);
            }
        } catch (err) {
            alert('获取详情失败');
        }
    };

    window.loadDeposits = function() {
        loadDeposits();
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', init);
})();