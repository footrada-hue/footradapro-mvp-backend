/**
 * FOOTRADAPRO - 性能优化工具
 */
(function() {
    'use strict';
    
    // 滚动优化
    function initScrollOptimization() {
        let ticking = false;
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    document.body.classList.add('is-scrolling');
                    clearTimeout(window.scrollTimeout);
                    window.scrollTimeout = setTimeout(() => {
                        document.body.classList.remove('is-scrolling');
                    }, 150);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }
    
    // 图片懒加载
    function initLazyLoading() {
        if ('loading' in HTMLImageElement.prototype) {
            document.querySelectorAll('img[data-src]').forEach(img => {
                img.src = img.dataset.src;
            });
        }
    }
    
    // 页面可见性优化
    function initVisibilityOptimization() {
        const style = document.createElement('style');
        style.textContent = '.page-hidden * { animation-play-state: paused !important; }';
        document.head.appendChild(style);
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                document.body.classList.add('page-hidden');
            } else {
                document.body.classList.remove('page-hidden');
            }
        });
    }
    
    function init() {
        initScrollOptimization();
        initLazyLoading();
        initVisibilityOptimization();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();