/**
 * FOOTRADAPRO - 轻量 PJAX
 * 无刷新加载页面，只替换 main 内容
 */

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        // 内容容器选择器（只替换这个区域）
        containerSelector: 'main',
        // 排除的链接（不需要 PJAX 处理）
        excludeLinks: ['/logout', '/api/', 'http://', 'https://', 'mailto:', 'tel:', '#'],
        // 动画时长
        animationDuration: 200
    };

    // 当前 URL
    let currentUrl = window.location.pathname;

    // 是否正在加载
    let isLoading = false;

    // 进度条元素
    let progressBar = null;

    // 创建进度条
    function createProgressBar() {
        if (progressBar) return;
        progressBar = document.createElement('div');
        progressBar.id = 'pjax-progress';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 3px;
            background: linear-gradient(90deg, #2563eb, #4f46e5, #8b5cf6);
            z-index: 10000;
            transition: width 0.3s ease-out;
            box-shadow: 0 0 8px rgba(37, 99, 235, 0.5);
        `;
        document.body.appendChild(progressBar);
    }

    // 显示进度条
    function showProgress() {
        if (!progressBar) createProgressBar();
        progressBar.style.width = '60%';
    }

    // 完成进度条
    function finishProgress() {
        if (progressBar) {
            progressBar.style.width = '100%';
            setTimeout(() => {
                if (progressBar) progressBar.style.width = '0%';
            }, 200);
        }
    }

    // 隐藏进度条
    function hideProgress() {
        if (progressBar) {
            setTimeout(() => {
                if (progressBar) progressBar.style.width = '0%';
            }, 100);
        }
    }

    // 加载页面内容
    async function loadContent(url) {
        if (isLoading) return false;
        if (url === currentUrl) return false;

        isLoading = true;
        showProgress();

        try {
            // 添加淡出效果
            const main = document.querySelector(CONFIG.containerSelector);
            if (main) {
                main.style.transition = `opacity ${CONFIG.animationDuration}ms ease-out`;
                main.style.opacity = '0';
                await new Promise(r => setTimeout(r, CONFIG.animationDuration / 2));
            }

            // 请求新页面
            const response = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 提取新的 main 内容
            const newContent = doc.querySelector(CONFIG.containerSelector);
            if (!newContent) throw new Error('未找到 main 内容');

            // 替换内容
            if (main) {
                main.innerHTML = newContent.innerHTML;
            }

            // 更新标题
            const newTitle = doc.querySelector('title');
            if (newTitle) document.title = newTitle.innerText;

            // 更新 URL
            history.pushState({ url }, '', url);
            currentUrl = url;

            // 重新初始化页面组件
            reinitPageComponents();

            // 淡入效果
            if (main) {
                main.style.opacity = '1';
                setTimeout(() => {
                    if (main) main.style.transition = '';
                }, CONFIG.animationDuration);
            }

            finishProgress();
            console.log(`[PJAX] 页面加载完成: ${url}`);
            return true;

        } catch (error) {
            console.error('[PJAX] 加载失败:', error);
            // 降级：直接跳转
            window.location.href = url;
            return false;
        } finally {
            isLoading = false;
            hideProgress();
        }
    }

    // 重新初始化页面组件
    function reinitPageComponents() {
        console.log('[PJAX] 重新初始化组件...');

        // 重新绑定模式切换事件
        const modeTabs = document.querySelectorAll('.mode-tab');
        modeTabs.forEach(tab => {
            // 移除旧事件，添加新事件
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            newTab.addEventListener('click', function(e) {
                const mode = this.dataset.mode;
                if (window.getAppMode && mode === window.getAppMode()) return;
                if (window.setAppMode) window.setAppMode(mode);
            });
        });

        // 重新初始化图表（如果在首页）
        if (window.updateChartFromAPI) {
            window.updateChartFromAPI('1m');
        }

        // 重新加载比赛数据（如果在比赛页面）
        if (window.loadMatches && window.location.pathname.includes('match-market')) {
            window.loadMatches();
        }

        // 重新加载 Spotlight（如果在首页）
        if (window.loadSpotlight && !window.location.pathname.includes('match-market')) {
            window.loadSpotlight();
        }

        // 重新绑定筛选按钮（比赛页面）
        const filterChips = document.querySelectorAll('.filter-chip, .time-chip');
        filterChips.forEach(chip => {
            const newChip = chip.cloneNode(true);
            chip.parentNode.replaceChild(newChip, chip);
            newChip.addEventListener('click', function() {
                const parent = this.parentElement;
                if (parent) {
                    parent.querySelectorAll('.filter-chip, .time-chip').forEach(c => c.classList.remove('active'));
                }
                this.classList.add('active');
                if (window.applyFilters) window.applyFilters();
            });
        });

        // 重新绑定联赛选择器
        const leagueSelect = document.getElementById('leagueSelect');
        if (leagueSelect && window.updateLeagueSelect) {
            window.updateLeagueSelect();
        }

        // 重新高亮导航栏
        if (window.highlightCurrentNav) {
            window.highlightCurrentNav();
        }

        console.log('[PJAX] 组件重新初始化完成');
    }

function handleLinkClick(e) {
    if (!e || !e.target || typeof e.target.closest !== 'function') return;
    
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
        loadContent(url);
    }
}

    // 处理浏览器前进后退
    function handlePopState(e) {
        const url = window.location.pathname;
        if (url !== currentUrl) {
            loadContent(url);
        }
    }

// 预加载链接（悬停时）
let preloadTimeout;
function handleLinkHover(e) {
    // 确保 e.target 存在且有 closest 方法
    if (!e || !e.target || typeof e.target.closest !== 'function') return;
    
    const link = e.target.closest('a');
    if (!link) return;

    const url = link.getAttribute('href');
    if (!url || !url.startsWith('/') || url === currentUrl) return;

    clearTimeout(preloadTimeout);
    preloadTimeout = setTimeout(() => {
        console.log(`[PJAX] 预加载: ${url}`);
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .catch(err => console.warn('[PJAX] 预加载失败:', err));
    }, 100);
}
    // 初始化
    function init() {
        console.log('[PJAX] 初始化...');
        createProgressBar();
        document.addEventListener('click', handleLinkClick);
        document.addEventListener('mouseenter', handleLinkHover);
        window.addEventListener('popstate', handlePopState);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 导出全局方法
    window.PJAX = {
        load: loadContent,
        refresh: () => loadContent(currentUrl)
    };
})();