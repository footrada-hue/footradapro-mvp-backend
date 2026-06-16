/**
 * FOOTRADAPRO - SPA Router
 * 实现无刷新页面切换，跑马灯和导航栏固定
 * @version 2.0.0 - 修复页面脚本重新执行问题
 */

(function() {
    'use strict';

    // 路由配置
    const routes = {
        'home': {
            title: 'FootRadaPro · AI Trading Dashboard',
            contentUrl: '/index-content.html',
            scripts: []
        },
        'markets': {
            title: 'Match Market · FootRadaPro',
            contentUrl: '/match-market-content.html',
            scripts: ['/js/user/match-market_controller.js']
        },
        'records': {
            title: 'Records · FootRadaPro',
            contentUrl: '/transaction-list-content.html',
            scripts: []
        },
        'support': {
            title: 'Support · FootRadaPro',
            contentUrl: '/support-content.html',
            scripts: []
        },
        'profile': {
            title: 'Profile · FootRadaPro',
            contentUrl: '/profile-content.html',
            scripts: ['/js/user/profile_controller.js']
        },
        'transaction-detail': {
            title: 'Transaction Detail · FootRadaPro',
            contentUrl: '/transaction-detail-content.html',
            scripts: []
        },
        'authorize': {
            title: 'Authorize · FootRadaPro',
            contentUrl: '/authorize-content.html',
            scripts: ['/js/user/authorize_controller.js']
        },
        'register': {
            title: 'Create Account · FootRadaPro',
            contentUrl: '/register-content.html',
            scripts: []
        },
        'login': {
            title: 'Sign In · FootRadaPro',
            contentUrl: '/login-content.html',
            scripts: []
        },
        'deposit': {
            title: 'Deposit · FootRadaPro',
            contentUrl: '/deposit-content.html',
            scripts: []
        },
        'withdraw': {
            title: 'Withdraw · FootRadaPro',
            contentUrl: '/withdraw-content.html',
            scripts: []
        },
        'report-detail': {
            title: 'AI Analysis Report · FootRadaPro',
            contentUrl: '/report-detail-content.html',
            scripts: []
        },
        'support-chat': {
            title: 'Live Support · FootRadaPro',
            contentUrl: '/support-chat-content.html',
            scripts: []
        },
        'set-paypassword': {
            title: 'Set Payment Password · FootRadaPro',
            contentUrl: '/set-paypassword-content.html',
            scripts: []
        },
        'settings': {
            title: 'Settings · FootRadaPro',
            contentUrl: '/settings-content.html',
            scripts: []
        },
        'fund-detail': {
            title: 'Fund Details · FootRadaPro',
            contentUrl: '/fund-detail-content.html',
            scripts: ['/js/user/fund-detail.js']
        },
        'authorizations': {
            title: 'My Authorizations · FootRadaPro',
            contentUrl: '/records-content.html',
            scripts: []
        },
        'change-password': {
            title: 'Change Password · FootRadaPro',
            contentUrl: '/change-password-content.html',
            scripts: []
        },
        'notifications': {
            title: 'Notifications · FootRadaPro',
            contentUrl: '/notifications-content.html',
            scripts: []
        },
        'notification-detail': {
            title: 'Notification Details · FootRadaPro',
            contentUrl: '/notification-detail-content.html',
            scripts: []
        }
    };

    // 当前页面
    let currentPage = 'home';
    let isLoading = false;
    
    // 存储已加载的脚本（避免重复加载同一脚本）
    let loadedScripts = new Set();

    // 获取当前页面参数
    function getCurrentPage() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('page') || 'home';
    }

    // 更新导航栏高亮
    function updateNavHighlight(page) {
        document.querySelectorAll('.desktop-nav .nav-link, .nav-item-mobile').forEach(link => {
            const linkNav = link.dataset.nav;
            if (linkNav === page) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // 显示加载状态
    function showLoading() {
        const appContent = document.getElementById('app-content');
        if (appContent) {
            appContent.innerHTML = '<div class="content-loading"><i class="fas fa-spinner fa-pulse"></i> Loading...</div>';
        }
    }

    // 重新初始化页面组件
    function reinitializePageComponents(page) {
        // 触发页面特定的事件，让控制器重新初始化
        window.dispatchEvent(new CustomEvent('page-loaded', { detail: { page } }));
        
        // 如果页面有自己的初始化函数，调用它
        if (page === 'markets' && window.initMatchMarket) {
            window.initMatchMarket();
        }
    }

    // 加载页面内容
    async function loadPage(page, pushState = true) {
        if (isLoading) return;
        if (page === currentPage && pushState) return;

        const route = routes[page];
        if (!route) {
            console.error(`路由不存在: ${page}`);
            return;
        }

        isLoading = true;
        showLoading();

        try {
            // 加载内容 HTML
            const response = await fetch(route.contentUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();

            // 更新内容区域
            const appContent = document.getElementById('app-content');
            if (appContent) {
                appContent.innerHTML = html;
                
                // 执行 HTML 中的内联脚本
                const scripts = appContent.querySelectorAll('script');
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    if (oldScript.src) {
                        newScript.src = oldScript.src;
                    } else {
                        newScript.textContent = oldScript.textContent;
                    }
                    document.body.appendChild(newScript);
                    oldScript.remove();
                });
            }

            // 更新页面标题
            document.title = route.title;

            // 更新 URL
            if (pushState) {
                const newUrl = `/shell.html?page=${page}`;
                history.pushState({ page }, '', newUrl);
            }

            // 更新导航高亮
            updateNavHighlight(page);

            // 执行页面脚本
            await executePageScripts(route.scripts, page);

            // 重新初始化页面组件
            reinitializePageComponents(page);

            currentPage = page;
            console.log(`[Router] 页面切换成功: ${page}`);

        } catch (error) {
            console.error('[Router] 加载失败:', error);
            const appContent = document.getElementById('app-content');
            if (appContent) {
                appContent.innerHTML = '<div class="content-loading" style="color: var(--warning);"><i class="fas fa-exclamation-triangle"></i> Failed to load page. Please try again.</div>';
            }
        } finally {
            isLoading = false;
        }
    }

    // 执行页面脚本
    async function executePageScripts(scripts, page) {
        for (const scriptSrc of scripts) {
            try {
                // 检查是否已加载过（可选：每次都重新加载以确保状态最新）
                if (loadedScripts.has(scriptSrc)) {
                    // 移除旧的脚本实例
                    const oldScript = document.querySelector(`script[src="${scriptSrc}"]`);
                    if (oldScript) {
                        oldScript.remove();
                    }
                    loadedScripts.delete(scriptSrc);
                }
                
                await loadScript(scriptSrc);
                loadedScripts.add(scriptSrc);
                console.log(`[Router] 脚本加载成功: ${scriptSrc}`);
            } catch (err) {
                console.warn(`[Router] 脚本加载失败: ${scriptSrc}`, err);
            }
        }
    }

    // 动态加载脚本
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // 检查是否已存在相同脚本
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                existingScript.remove();
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`加载失败: ${src}`));
            document.body.appendChild(script);
        });
    }

    // 处理链接点击
    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // 只处理 shell.html 的链接
        if (href.includes('/shell.html') || href.includes('?page=')) {
            e.preventDefault();
            let page = null;
            if (href.includes('?page=')) {
                const match = href.match(/[?&]page=([^&]+)/);
                if (match) page = match[1];
            }
            if (page && routes[page]) {
                loadPage(page);
            }
        }
    }

    // 处理浏览器前进后退
    function handlePopState(e) {
        const page = getCurrentPage();
        if (routes[page] && page !== currentPage) {
            loadPage(page, false);
        }
    }

    // 初始化路由
    function initRouter() {
        console.log('[Router] 初始化...');
        
        // 绑定事件
        document.addEventListener('click', handleLinkClick);
        window.addEventListener('popstate', handlePopState);
        
        // 加载当前页面
        const initialPage = getCurrentPage();
        if (routes[initialPage]) {
            loadPage(initialPage, false);
        } else {
            loadPage('home', false);
        }
    }

    // 导出全局方法
    window.router = {
        navigate: loadPage,
        getCurrentPage: () => currentPage,
        refresh: () => loadPage(currentPage, false)
    };

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRouter);
    } else {
        initRouter();
    }
})();