/**
 * FOOTRADAPRO - 轻量 SPA 路由
 * 实现无刷新页面切换，接近 APP 体验
 */

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        // 需要缓存的页面（最多3个）
        cacheSize: 3,
        // 切换动画时长（毫秒）
        animationDuration: 300,
        // 内容容器选择器
        contentSelector: '.content, main',
        // 排除的链接（不需要 SPA 处理）
        excludeLinks: ['/logout', '/api/', 'http://', 'https://', 'mailto:', 'tel:']
    };

    // 页面缓存
    const pageCache = new Map();

    // 当前 URL
    let currentUrl = window.location.pathname;

    // 加载状态
    let isLoading = false;

    /**
     * 获取页面内容
     */
    async function fetchPage(url) {
        // 检查缓存
        if (pageCache.has(url)) {
            console.log(`[SPA] 从缓存加载: ${url}`);
            return pageCache.get(url);
        }

        console.log(`[SPA] 请求页面: ${url}`);
        const response = await fetch(url, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 提取需要的内容
        const content = doc.querySelector(CONFIG.contentSelector);
        const title = doc.querySelector('title')?.innerText || '';
        
        // 提取需要重新执行的脚本（排除外部库和已加载的）
        const scripts = [];
        doc.querySelectorAll('script:not([src*="chart.js"]):not([src*="font-awesome"]):not([src*="theme.js"]):not([src*="api-client.js"]):not([src*="match-market_controller.js"])').forEach(script => {
            if (script.src) {
                scripts.push({ src: script.src, async: true });
            } else if (script.textContent && !script.textContent.includes('SPA')) {
                scripts.push({ code: script.textContent });
            }
        });
        
        const pageData = {
            url,
            content: content?.innerHTML || '',
            title,
            scripts,
            timestamp: Date.now()
        };
        
        // 缓存管理（限制大小）
        if (pageCache.size >= CONFIG.cacheSize) {
            const oldest = [...pageCache.keys()][0];
            pageCache.delete(oldest);
            console.log(`[SPA] 清理缓存: ${oldest}`);
        }
        pageCache.set(url, pageData);
        
        return pageData;
    }

    /**
     * 执行页面脚本
     */
    function executeScripts(scripts) {
        scripts.forEach(script => {
            if (script.src) {
                const newScript = document.createElement('script');
                newScript.src = script.src;
                newScript.async = script.async;
                document.body.appendChild(newScript);
            } else if (script.code) {
                try {
                    // 使用 eval 执行脚本（注意安全，但这里只执行自己的代码）
                    new Function(script.code)();
                } catch (err) {
                    console.error('[SPA] 脚本执行错误:', err);
                }
            }
        });
    }

    /**
     * 重新初始化页面组件
     */
function reinitPageComponents() {
    console.log('[SPA] 重新初始化页面组件...');
    
    // 检查当前页面是否需要重新加载比赛数据
    const isMatchMarketPage = window.location.pathname.includes('match-market');
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.includes('index');
    
    // 只在首次加载比赛页面时获取数据
    if (isMatchMarketPage && !window._matchesLoaded) {
        if (window.loadMatches) {
            window.loadMatches();
            window._matchesLoaded = true;
        }
    }
    
    // 首页的 Spotlight 需要刷新（因为可能从比赛页面返回）
    if (isIndexPage && window.loadSpotlight) {
        window.loadSpotlight();
    }
    
    // 重新初始化图表（图表数据需要刷新）
    if (window.updateChartFromAPI) {
        window.updateChartFromAPI('1m');
    }
    
    // 重新绑定模式切换事件
    const modeTabs = document.querySelectorAll('.mode-tab');
    modeTabs.forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        newTab.addEventListener('click', function(e) {
            const mode = this.dataset.mode;
            if (window.getAppMode && mode === window.getAppMode()) return;
            if (window.setAppMode) window.setAppMode(mode);
        });
    });
    
    // 重新绑定筛选按钮事件（仅在比赛页面）
    if (isMatchMarketPage) {
        const filterChips = document.querySelectorAll('.filter-chip, .time-chip');
        filterChips.forEach(chip => {
            const newChip = chip.cloneNode(true);
            chip.parentNode.replaceChild(newChip, chip);
            newChip.addEventListener('click', function() {
                const parent = this.parentElement;
                parent.querySelectorAll('.filter-chip, .time-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                if (window.applyFilters) window.applyFilters();
            });
        });
    }
    
    console.log('[SPA] 组件重新初始化完成');
}

    /**
     * 显示加载动画
     */
    function showLoading() {
        const main = document.querySelector('main');
        if (main && !document.querySelector('.spa-loading')) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'spa-loading';
            loadingDiv.innerHTML = '<div class="spa-loading-spinner"></div><span>Loading...</span>';
            loadingDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--card-bg);
                backdrop-filter: blur(16px);
                padding: 12px 24px;
                border-radius: 60px;
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 1000;
                font-size: 14px;
                border: 1px solid var(--glass-border);
                box-shadow: var(--glass-shadow);
            `;
            main.style.position = 'relative';
            main.appendChild(loadingDiv);
        }
    }

    /**
     * 隐藏加载动画
     */
    function hideLoading() {
        const loading = document.querySelector('.spa-loading');
        if (loading) loading.remove();
        const main = document.querySelector('main');
        if (main) main.style.position = '';
    }

    /**
     * 切换页面（带动画）
     */
    async function navigateTo(url, pushState = true) {
        if (isLoading) return;
        if (url === currentUrl) return;
        
        isLoading = true;
        showLoading();
        
        try {
            const pageData = await fetchPage(url);
            
            // 添加淡出动画
            const main = document.querySelector('main');
            if (main) {
                main.style.transition = `opacity ${CONFIG.animationDuration}ms ease-out`;
                main.style.opacity = '0';
                await new Promise(r => setTimeout(r, 150));
            }
            
            // 更新内容
            const contentContainer = document.querySelector(CONFIG.contentSelector);
            if (contentContainer) {
                contentContainer.innerHTML = pageData.content;
            }
            
            // 更新标题
            document.title = pageData.title || 'FootRadaPro';
            
            // 执行页面脚本
            executeScripts(pageData.scripts);
            
            // 重新初始化组件
            reinitPageComponents();
            
            // 淡入动画
            if (main) {
                main.style.opacity = '1';
                setTimeout(() => {
                    main.style.transition = '';
                }, CONFIG.animationDuration);
            }
            
            // 更新当前 URL
            if (pushState) {
                history.pushState({ url }, '', url);
                currentUrl = url;
            }
            
            // 更新导航栏高亮
            if (window.highlightCurrentNav) {
                window.highlightCurrentNav();
            }
            
            console.log(`[SPA] 页面切换完成: ${url}`);
            
        } catch (error) {
            console.error('[SPA] 页面切换失败:', error);
            // 降级：直接跳转
            window.location.href = url;
        } finally {
            isLoading = false;
            hideLoading();
        }
    }

    /**
     * 处理链接点击
     */
    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link) return;
        
        const url = link.getAttribute('href');
        if (!url) return;
        
        // 检查是否需要排除
        const shouldExclude = CONFIG.excludeLinks.some(exclude => url.includes(exclude));
        if (shouldExclude) return;
        
        // 只处理同源链接
        if (url.startsWith('/') && !url.startsWith('//')) {
            e.preventDefault();
            navigateTo(url);
        }
    }

    /**
     * 处理浏览器前进后退
     */
    function handlePopState(e) {
        const url = window.location.pathname;
        if (url !== currentUrl) {
            navigateTo(url, false);
        }
    }

    /**
     * 预加载链接（悬停时）
     */
    let preloadTimeout;
    function handleLinkHover(e) {
        const link = e.target.closest('a');
        if (!link) return;
        
        const url = link.getAttribute('href');
        if (!url || !url.startsWith('/') || pageCache.has(url)) return;
        
        clearTimeout(preloadTimeout);
        preloadTimeout = setTimeout(() => {
            console.log(`[SPA] 预加载: ${url}`);
            fetch(url).then(r => r.text()).then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const content = doc.querySelector(CONFIG.contentSelector);
                if (content) {
                    pageCache.set(url, {
                        url,
                        content: content.innerHTML,
                        title: doc.querySelector('title')?.innerText || '',
                        scripts: [],
                        timestamp: Date.now()
                    });
                }
            }).catch(err => console.warn('[SPA] 预加载失败:', err));
        }, 100);
    }

    /**
     * 初始化 SPA
     */
    function init() {
        console.log('[SPA] 初始化...');
        
        // 绑定事件
        document.addEventListener('click', handleLinkClick);
        document.addEventListener('mouseenter', handleLinkHover);
        window.addEventListener('popstate', handlePopState);
        
        // 添加全局 CSS 动画
        const style = document.createElement('style');
        style.textContent = `
            .spa-loading-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid var(--border-light);
                border-top-color: var(--accent);
                border-radius: 50%;
                animation: spa-spin 0.6s linear infinite;
            }
            @keyframes spa-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        // 记录当前页面
        currentUrl = window.location.pathname;
        
        // 缓存当前页面
        const main = document.querySelector('main');
        if (main) {
            pageCache.set(currentUrl, {
                url: currentUrl,
                content: main.innerHTML,
                title: document.title,
                scripts: [],
                timestamp: Date.now()
            });
        }
        
        console.log('[SPA] 初始化完成');
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // 导出全局方法
    window.SPA = {
        navigateTo,
        preload: (url) => fetchPage(url),
        clearCache: () => pageCache.clear()
    };
})();