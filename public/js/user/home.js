/* ===================================
FootRadaPro - 完整终极版 (GSAP动画增强)
保留所有原版功能 + API新闻 + 本托网格动态数据 + GSAP滚动动画
=================================== */


// 注册GSAP插件
gsap.registerPlugin(ScrollTrigger);

document.addEventListener("DOMContentLoaded", () => {
    // 初始化所有组件 - 完整保留原版功能
    initRadar();              // 雷达扫描系统
    initChart();              // 信号图表
    initNavbar();             // 导航栏效果
    initScrollReveal();       // 滚动动画（保留作为备用）
    initNews();               // 新闻系统（从API获取）
    initLiveUpdates();        // 实时数据更新
    initTerminalEffects();    // 终端特效
    initTimelineAnimation();  // 时间轴动画
    initLogStream();          // 审计日志流
    initAxiomInteractions();  // 公理卡片交互
    initVerificationEffects();// 验证特效
    initCounters();           // 计数器动画（将被GSAP取代，但保留作为备用）
    initSystemStatus();       // 系统状态更新
    initCharts();             // 性能图表
    loadStandings();          // 加载积分榜
    initNewsModule();         // 新闻标签切换
    loadSystemStats();        // 加载统计数据
    initBentoGrid();          // 初始化本托网格数据
    startBentoUpdates();      // 启动本托网格实时更新
    initGSAPAnimations();     // 新增：GSAP高级动画
});

/* ===================================
GSAP高级动画
=================================== */
function initGSAPAnimations() {
    // 检查GSAP是否可用
    if (typeof gsap === 'undefined') {
        console.warn('GSAP not loaded');
        return;
    }
    
    // 注册ScrollTrigger
    if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }
    
    // 数字增长动画 - 应用于所有指标数字
    gsap.utils.toArray('.metric-value, .trust-number, .badge-number, .stat-value, .hero-stats h3').forEach(element => {
        if (!element) return;
        
        const finalValue = element.innerText;
        const isPercentage = finalValue.includes('%');
        const isCurrency = finalValue.includes('¥');
        const isNumber = !isPercentage && !isCurrency;
        
        let startValue = 0;
        let endValue = parseFloat(finalValue.replace(/[^0-9.-]/g, ''));
        
        if (isNaN(endValue)) return;
        
        // 保存原始文本用于单位
        const originalText = finalValue;
        
        ScrollTrigger.create({
            trigger: element,
            start: 'top 85%',
            onEnter: () => {
                gsap.to({ value: startValue }, {
                    value: endValue,
                    duration: 2,
                    ease: 'power2.out',
                    onUpdate: function() {
                        const currentValue = Math.round(this.targets()[0].value);
                        if (isPercentage) {
                            element.innerText = currentValue + '%';
                        } else if (isCurrency) {
                            element.innerText = '¥' + currentValue.toLocaleString();
                        } else if (finalValue.includes('/100')) {
                            // 信任分数特殊处理
                            element.innerText = currentValue + '/100';
                        } else {
                            element.innerText = currentValue.toLocaleString();
                        }
                    },
                    onComplete: function() {
                        // 确保最终值正确
                        element.innerText = originalText;
                    }
                });
            },
            once: true
        });
    });

    // 卡片序列动画 - 仪表盘卡片依次出现
    gsap.utils.toArray('.dashboard-card').forEach((card, index) => {
        gsap.fromTo(card, 
            { opacity: 0, y: 30 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                delay: index * 0.1,
                scrollTrigger: {
                    trigger: card,
                    start: 'top 90%',
                    toggleActions: 'play none none none'
                }
            }
        );
    });

    // 脉冲动画 - 趋势指标
    gsap.to('.trend-indicator', {
        scale: 1.05,
        opacity: 0.8,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut'
    });

    // 进度条填充动画
    gsap.utils.toArray('.load-fill').forEach(fill => {
        const width = fill.style.width;
        fill.style.width = '0%';
        
        ScrollTrigger.create({
            trigger: fill,
            start: 'top 90%',
            onEnter: () => {
                gsap.to(fill, {
                    width: width,
                    duration: 1.5,
                    ease: 'power2.out'
                });
            },
            once: true
        });
    });

    // 事件条目依次出现
    gsap.utils.toArray('.event-item').forEach((item, index) => {
        gsap.fromTo(item, 
            { opacity: 0, x: -10 },
            {
                opacity: 1,
                x: 0,
                duration: 0.5,
                delay: index * 0.15,
                scrollTrigger: {
                    trigger: item.closest('.card-event'),
                    start: 'top 85%'
                }
            }
        );
    });

    // 验证徽章旋转动画
    gsap.to('.badge-ring', {
        rotation: 360,
        duration: 20,
        repeat: -1,
        ease: 'linear'
    });

    // 图表柱状图生长动画
    gsap.utils.toArray('.line-segment').forEach((segment, index) => {
        const targetHeight = segment.style.height;
        segment.style.height = '0%';
        
        ScrollTrigger.create({
            trigger: segment.closest('.card-trades'),
            start: 'top 80%',
            onEnter: () => {
                gsap.to(segment, {
                    height: targetHeight,
                    duration: 1,
                    delay: index * 0.05,
                    ease: 'back.out(1.2)'
                });
            },
            once: true
        });
    });

    // 视差效果 - 背景微动
    gsap.to('.global-bg img', {
        scale: 1.05,
        duration: 20,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });

    // 标题渐变出现
    gsap.utils.toArray('.section-header').forEach(header => {
        gsap.fromTo(header, 
            { opacity: 0, y: 20 },
            {
                opacity: 1,
                y: 0,
                duration: 1,
                scrollTrigger: {
                    trigger: header,
                    start: 'top 90%',
                    toggleActions: 'play none none none'
                }
            }
        );
    });
}

/* ===================================
AI雷达扫描系统 - 完整保留
=================================== */
function initRadar() {
    const radar = document.getElementById("footballRadar");
    if (!radar) return;
    
    const ctx = radar.getContext("2d");
    const width = 420;
    const height = 420;
    
    radar.width = width;
    radar.height = height;
    
    let angle = 0;
    
    function drawRadar() {
        ctx.clearRect(0, 0, width, height);
        
        const centerX = width / 2;
        const centerY = height / 2;
        
        // 绘制同心圆网格
        ctx.strokeStyle = "rgba(255, 107, 0, 0.15)";
        ctx.lineWidth = 1;
        
        for (let r = 60; r <= 180; r += 30) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // 绘制十字线
        ctx.beginPath();
        ctx.moveTo(centerX - 180, centerY);
        ctx.lineTo(centerX + 180, centerY);
        ctx.moveTo(centerX, centerY - 180);
        ctx.lineTo(centerX, centerY + 180);
        ctx.strokeStyle = "rgba(255, 107, 0, 0.1)";
        ctx.stroke();
        
        // 绘制扫描线
        const rad = (angle * Math.PI) / 180;
        
        // 扫描扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, 180, rad - 0.1, rad + 0.1);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 107, 0, 0.15)";
        ctx.fill();
        
        // 扫描线
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + Math.cos(rad) * 180,
            centerY + Math.sin(rad) * 180
        );
        ctx.strokeStyle = "#FF6B00";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制探测点
        const points = [
            { angle: 30, distance: 120, intensity: 0.8 },
            { angle: 120, distance: 90, intensity: 0.6 },
            { angle: 210, distance: 150, intensity: 0.9 },
            { angle: 300, distance: 100, intensity: 0.4 }
        ];
        
        points.forEach(point => {
            const pointRad = (point.angle * Math.PI) / 180;
            const x = centerX + Math.cos(pointRad) * point.distance;
            const y = centerY + Math.sin(pointRad) * point.distance;
            
            // 光晕
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 107, 0, ${point.intensity * 0.3})`;
            ctx.fill();
            
            // 核心
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "#FF6B00";
            ctx.fill();
            ctx.shadowColor = "#FF6B00";
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        
        angle = (angle + 1) % 360;
        requestAnimationFrame(drawRadar);
    }
    
    drawRadar();
}

/* ===================================
信号图表 - 完整保留
=================================== */
function initChart() {
    const ctx = document.getElementById('signalChart');
    if (!ctx || typeof Chart === 'undefined') return;
    
    if (window.signalChartInstance) {
        window.signalChartInstance.destroy();
    }
    
    window.signalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['0\'', '10\'', '20\'', '30\'', '40\'', '50\'', '60\'', '70\'', '80\'', '90\''],
            datasets: [
                {
                    label: '预测信号',
                    data: [12, 19, 15, 25, 22, 30, 28, 35, 32, 38],
                    borderColor: '#FF6B00',
                    backgroundColor: 'rgba(255, 107, 0, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#FF6B00',
                    pointBorderColor: '#fff',
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: '实际表现',
                    data: [10, 18, 20, 22, 28, 25, 32, 30, 36, 35],
                    borderColor: '#94A3B8',
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false,
                    pointBackgroundColor: '#94A3B8',
                    pointBorderColor: '#fff',
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#151A28',
                    titleColor: '#F8FAFC',
                    bodyColor: '#94A3B8',
                    borderColor: 'rgba(255, 107, 0, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#64748B',
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748B',
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    min: 0,
                    max: 45
                }
            }
        }
    });
}

/* ===================================
导航栏滚动效果
=================================== */
function initNavbar() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;
    
    window.addEventListener("scroll", () => {
        if (window.scrollY > 20) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    });
}

/* ===================================
滚动显示动画 (保留作为备用)
=================================== */
function initScrollReveal() {
    const sections = document.querySelectorAll("section");
    
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = "1";
                    entry.target.style.transform = "translateY(0)";
                }
            });
        },
        {
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        }
    );
    
    sections.forEach((section) => {
        section.style.opacity = "0";
        section.style.transform = "translateY(20px)";
        section.style.transition = "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
        observer.observe(section);
    });
}

/* ===================================
新闻系统 - 从API获取真实数据
=================================== */
let newsUpdateInterval = null;

async function initNews() {
    await loadNewsFromAPI();
    
    if (newsUpdateInterval) {
        clearInterval(newsUpdateInterval);
    }
    newsUpdateInterval = setInterval(loadNewsFromAPI, 600000);
}

async function loadNewsFromAPI() {
    const container = document.getElementById("newsGrid");
    if (!container) return;
    
    container.innerHTML = '<div class="news-loading"><div class="spinner"></div><p>Loading latest news...</p></div>';
    
    try {
        const response = await fetch('/api/v1/news/news?category=all&limit=6&t=' + Date.now());
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            renderNewsFromAPI(result.data, container);
        } else {
            console.log('API返回空数据，使用备用新闻');
            fallbackNews(container);
        }
    } catch (error) {
        console.error("新闻API加载失败:", error);
        fallbackNews(container);
    }
}

function renderNewsFromAPI(articles, container) {
    container.innerHTML = "";
    
    articles.forEach(article => {
        const card = document.createElement("div");
        card.className = "news-card";
        
        const publishDate = new Date(article.publishedAt);
        const now = new Date();
        const diffHours = Math.floor((now - publishDate) / (1000 * 60 * 60));
        const timeStr = diffHours < 24 ? `${diffHours} hours ago` : publishDate.toLocaleDateString();
        
        card.innerHTML = `
            ${article.imageUrl ? `<div class="news-image" style="background-image: url('${article.imageUrl}')"></div>` : ''}
            <div class="news-content">
                <div class="news-source">${article.source}</div>
                <h4 class="news-title">${article.title}</h4>
                <p class="news-summary">${article.description ? article.description.substring(0, 100) + '...' : ''}</p>
                <div class="news-meta">
                    <span>${timeStr}</span>
                    <a href="${article.url}" target="_blank" class="news-link">Read more →</a>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function fallbackNews(container) {
    container.innerHTML = `
        <div class="news-card">
            <div class="news-content">
                <h4 class="news-title">Premier League Title Race</h4>
                <p class="news-summary">Liverpool, Man City, Arsenal separated by just 3 points</p>
                <div class="news-meta">
                    <span>2 hours ago</span>
                    <a href="#" class="news-link">Read more →</a>
                </div>
            </div>
        </div>
        <div class="news-card">
            <div class="news-content">
                <h4 class="news-title">Champions League Knockout Battles</h4>
                <p class="news-summary">Bayern, Real Madrid, Man City lead predictions</p>
                <div class="news-meta">
                    <span>5 hours ago</span>
                    <a href="#" class="news-link">Read more →</a>
                </div>
            </div>
        </div>
        <div class="news-card">
            <div class="news-content">
                <h4 class="news-title">Winter Transfer Window Watch</h4>
                <p class="news-summary">5 underrated players to watch</p>
                <div class="news-meta">
                    <span>yesterday</span>
                    <a href="#" class="news-link">Read more →</a>
                </div>
            </div>
        </div>
    `;
}

/* ===================================
实时数据更新模拟
=================================== */
function initLiveUpdates() {
    setInterval(() => {
        updateMatchSignals();
        updateMetrics();
    }, 5000);
}

function updateMatchSignals() {
    const signals = document.querySelectorAll(".match-card .signal-item.highlight .signal-value");
    const signalTypes = ["MOMENTUM_SHIFT", "PRESSURE_HIGH", "DEFENSIVE_LOCK", "COUNTER_READY", "ATTACK_BUILD"];
    
    signals.forEach(signal => {
        if (Math.random() > 0.7) {
            const randomSignal = signalTypes[Math.floor(Math.random() * signalTypes.length)];
            signal.textContent = randomSignal;
            
            signal.style.animation = "pulse 0.5s ease";
            setTimeout(() => {
                signal.style.animation = "";
            }, 500);
        }
    });
}

function updateMetrics() {
    const metrics = document.querySelectorAll(".metric-value");
    
    metrics.forEach(metric => {
        if (metric.closest('.card-footer')) return;
        
        if (Math.random() > 0.8) {
            const currentValue = metric.textContent;
            if (currentValue.includes('%')) {
                const num = parseFloat(currentValue);
                const change = (Math.random() * 2 - 1).toFixed(1);
                const newValue = (num + parseFloat(change)).toFixed(1);
                metric.textContent = newValue + '%';
            } else if (currentValue.includes('M')) {
                const num = parseFloat(currentValue);
                const change = (Math.random() * 0.2 - 0.1).toFixed(2);
                const newValue = (num + parseFloat(change)).toFixed(2);
                metric.textContent = newValue + 'M€';
            }
            
            const progressBar = metric.closest('.dashboard-card')?.querySelector('.progress-bar');
            if (progressBar) {
                const width = Math.min(100, Math.max(0, parseFloat(metric.textContent) || 50));
                progressBar.style.width = width + '%';
            }
        }
    });
}

/* ===================================
终端特效
=================================== */
function initTerminalEffects() {
    const terminalStatus = document.querySelector('.status-text');
    if (terminalStatus) {
        setInterval(() => {
            terminalStatus.style.opacity = terminalStatus.style.opacity === '0.5' ? '1' : '0.5';
        }, 500);
    }
    
    const streamContainer = document.querySelector('.stream-container');
    if (streamContainer) {
        const items = streamContainer.querySelectorAll('.stream-item');
        let currentIndex = 0;
        
        setInterval(() => {
            items.forEach((item, index) => {
                if (index === currentIndex) {
                    item.style.background = 'rgba(255, 107, 0, 0.05)';
                    item.style.transition = 'background 0.3s ease';
                } else {
                    item.style.background = 'transparent';
                }
            });
            
            currentIndex = (currentIndex + 1) % items.length;
        }, 2000);
    }
}

/* ===================================
图表选项卡切换
=================================== */
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('chart-tab')) {
        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        e.target.classList.add('active');
        
        if (window.signalChartInstance) {
            const tabIndex = Array.from(e.target.parentNode.children).indexOf(e.target);
            
            const datasets = [
                [12, 19, 15, 25, 22, 30, 28, 35, 32, 38],
                [18, 22, 25, 28, 30, 32, 35, 33, 36, 40],
                [15, 18, 20, 22, 25, 28, 30, 32, 35, 38]
            ];
            
            window.signalChartInstance.data.datasets[0].data = datasets[tabIndex % datasets.length];
            window.signalChartInstance.update();
        }
    }
});

/* ===================================
时间轴动画
=================================== */
function initTimelineAnimation() {
    const timelines = document.querySelectorAll(".timeline");
    
    timelines.forEach(timeline => {
        const progress = timeline.querySelector(".timeline-progress");
        if (!progress) return;
        
        let width = 40;
        setInterval(() => {
            width = (width + 0.1) % 100;
            progress.style.background = `linear-gradient(90deg, var(--accent-primary) ${width}%, var(--border-color) ${width}%)`;
        }, 100);
    });
}

/* ===================================
审计日志流
=================================== */
function initLogStream() {
    const logEntries = document.querySelector(".log-entries");
    if (!logEntries) return;
    
    const actions = [
        { action: "Authorization deadline triggered", status: "Locked" },
        { action: "Match ended", status: "Recorded" },
        { action: "Settlement gate opened", status: "Executed" },
        { action: "History snapshot created", status: "Stored" },
        { action: "Data integrity verified", status: "Passed" },
        { action: "Risk threshold checked", status: "Normal" },
        { action: "Liquidity reallocated", status: "Completed" },
        { action: "Strategy execution finished", status: "Success" }
    ];
    
    let index = 0;
    
    setInterval(() => {
        const time = new Date();
        const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
        
        const action = actions[index % actions.length];
        
        const newEntry = document.createElement("div");
        newEntry.className = "log-entry";
        newEntry.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-action">${action.action}</span>
            <span class="log-status">${action.status}</span>
        `;
        
        newEntry.style.background = "rgba(255, 107, 0, 0.1)";
        setTimeout(() => {
            newEntry.style.background = "";
        }, 500);
        
        logEntries.insertBefore(newEntry, logEntries.firstChild);
        
        if (logEntries.children.length > 10) {
            logEntries.removeChild(logEntries.lastChild);
        }
        
        index++;
    }, 4000);
}

/* ===================================
公理卡片交互
=================================== */
function initAxiomInteractions() {
    const axiomCards = document.querySelectorAll(".axiom-card");
    
    axiomCards.forEach(card => {
        card.addEventListener("mouseenter", () => {
            const badge = card.querySelector(".axiom-badge");
            if (badge) {
                badge.style.transform = "scale(1.05)";
            }
        });
        
        card.addEventListener("mouseleave", () => {
            const badge = card.querySelector(".axiom-badge");
            if (badge) {
                badge.style.transform = "scale(1)";
            }
        });
    });
}

/* ===================================
验证特效
=================================== */
function initVerificationEffects() {
    const verificationFeatures = document.querySelectorAll(".verif-feature");
    
    verificationFeatures.forEach(feature => {
        feature.addEventListener("mouseenter", () => {
            const icon = feature.querySelector(".verif-icon");
            if (icon) {
                icon.style.transform = "scale(1.1)";
                icon.style.transition = "transform 0.2s ease";
            }
        });
        
        feature.addEventListener("mouseleave", () => {
            const icon = feature.querySelector(".verif-icon");
            if (icon) {
                icon.style.transform = "scale(1)";
            }
        });
    });
}

/* ===================================
计数器动画 (将被GSAP取代，但保留作为备用)
=================================== */
function initCounters() {
    const counters = document.querySelectorAll(".metric-value");
    
    counters.forEach(counter => {
        if (!counter.closest('.card-footer') && !counter.closest('.hero-metrics')) {
            return;
        }
        
        const text = counter.textContent;
        let target = 0;
        let suffix = '';
        
        if (text.includes('%')) {
            target = parseFloat(text) || 0;
            suffix = '%';
        } else if (text.includes('M')) {
            target = parseFloat(text) || 0;
            suffix = 'M€';
        } else if (text.includes('σ')) {
            target = parseFloat(text) || 0;
            suffix = 'σ';
        } else {
            target = parseInt(text) || 0;
        }
        
        if (target === 0) return;
        
        let current = 0;
        const increment = target / 50;
        let animated = false;
        
        const updateCounter = () => {
            if (!animated) return;
            
            current += increment;
            if (current < target) {
                if (suffix) {
                    if (suffix === '%') {
                        counter.textContent = Math.round(current) + suffix;
                    } else if (suffix === 'M€') {
                        counter.textContent = current.toFixed(1) + suffix;
                    } else {
                        counter.textContent = current.toFixed(2) + suffix;
                    }
                } else {
                    counter.textContent = Math.round(current);
                }
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target + suffix;
            }
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !animated) {
                    animated = true;
                    current = 0;
                    requestAnimationFrame(updateCounter);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(counter);
    });
}

/* ===================================
系统状态更新
=================================== */
function initSystemStatus() {
    const statusIndicators = document.querySelectorAll(".status-indicator, .status-dot");
    
    setInterval(() => {
        statusIndicators.forEach(indicator => {
            const random = Math.random();
            if (random > 0.95) {
                indicator.style.background = "var(--warning)";
                indicator.style.boxShadow = "0 0 10px var(--warning)";
                
                setTimeout(() => {
                    indicator.style.background = "var(--success)";
                    indicator.style.boxShadow = "0 0 10px var(--success)";
                }, 2000);
            }
        });
    }, 30000);
    
    const versionElements = document.querySelectorAll('.status-badge.system');
    versionElements.forEach(el => {
        if (el.textContent.includes('v')) {
            // 版本号已存在
        }
    });
}

/* ===================================
性能优化
=================================== */
let ticking = false;
window.addEventListener('scroll', () => {
    if (!ticking) {
        requestAnimationFrame(() => {
            ticking = false;
        });
        ticking = true;
    }
});

/* ===================================
新增：性能图表 (修复版本)
=================================== */
function initCharts() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx || typeof Chart === 'undefined') return;
    
    // 检查是否已有图表实例，如果有则销毁
    if (window.performanceChartInstance) {
        window.performanceChartInstance.destroy();
    }
    
    // 创建新的图表实例
    window.performanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['2021', '2022', '2023', '2024', '2025', '2026'],
            datasets: [{
                data: [1.0, 1.12, 1.25, 1.41, 1.58, 1.73],
                borderColor: '#FF6B00',
                backgroundColor: 'rgba(255,107,0,0.05)',
                borderWidth: 3,
                pointBackgroundColor: '#FF6B00',
                pointBorderColor: '#fff',
                pointRadius: 4,
                tension: 0.2,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#B0B8C5' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#B0B8C5' } }
            }
        }
    });
}

/* ===================================
新增：加载英超积分榜
=================================== */
async function loadStandings() {
    const grid = document.getElementById('standingsGrid');
    if (!grid) return;
    
    try {
        const response = await fetch('/api/v1/news/standings');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            grid.innerHTML = result.data.map(item => `
                <div class="standing-item">
                    <span class="standing-position">${item.position}</span>
                    <span class="standing-team">${item.team}</span>
                    <span class="standing-points">${item.points} pts</span>
                    <span class="standing-played">${item.played} played</span>
                </div>
            `).join('');
        } else {
            loadFallbackStandings(grid);
        }
    } catch (error) {
        console.error('加载积分榜失败:', error);
        loadFallbackStandings(grid);
    }
}

function loadFallbackStandings(grid) {
    const fallback = [
        { position: 1, team: 'Liverpool', points: 67, played: 28 },
        { position: 2, team: 'Manchester City', points: 65, played: 28 },
        { position: 3, team: 'Arsenal', points: 61, played: 28 },
        { position: 4, team: 'Aston Villa', points: 56, played: 28 },
        { position: 5, team: 'Tottenham', points: 53, played: 28 },
        { position: 6, team: 'Manchester United', points: 47, played: 28 }
    ];
    
    grid.innerHTML = fallback.map(item => `
        <div class="standing-item">
            <span class="standing-position">${item.position}</span>
            <span class="standing-team">${item.team}</span>
            <span class="standing-points">${item.points} pts</span>
            <span class="standing-played">${item.played} played</span>
        </div>
    `).join('');
}

/* ===================================
新增：新闻标签切换模块
=================================== */
let currentCategory = 'all';

function initNewsModule() {
    loadNews('all');
    
    document.querySelectorAll('.news-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.news-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.dataset.category;
            loadNews(currentCategory);
        });
    });
    
    document.getElementById('refreshNews')?.addEventListener('click', () => {
        loadNews(currentCategory);
    });
    
    setInterval(() => {
        loadNews(currentCategory);
    }, 600000);
}

async function loadNews(category) {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="news-loading">
            <div class="spinner"></div>
            <p>Loading latest news...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/v1/news/news?category=${category}&limit=6&t=${Date.now()}`);
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            grid.innerHTML = result.data.map(article => `
                <div class="news-card" onclick="window.open('${article.url}', '_blank')">
                    ${article.imageUrl ? `
                        <div class="news-image" style="background-image: url('${article.imageUrl}')"></div>
                    ` : ''}
                    <div class="news-content">
                        <div class="news-source">${article.source}</div>
                        <h3 class="news-title">${article.title}</h3>
                        <p class="news-summary">${article.description?.substring(0, 100) || ''}...</p>
                        <div class="news-meta">
                            <span>${timeAgo(article.publishedAt)}</span>
                            <span class="news-link">Read more →</span>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            loadFallbackNews(grid);
        }
    } catch (error) {
        console.error('新闻加载失败:', error);
        loadFallbackNews(grid);
    }
}

function loadFallbackNews(grid) {
    const fallback = [
        { title: 'Man City make €120m offer for Musiala', source: 'Sky Sports', time: Date.now() - 7200000 },
        { title: 'Real Madrid agree Mbappe deal', source: 'Marca', time: Date.now() - 18000000 }
    ];
    
    grid.innerHTML = fallback.map(item => `
        <div class="news-card">
            <div class="news-content">
                <div class="news-source">${item.source}</div>
                <h3 class="news-title">${item.title}</h3>
                <div class="news-meta">
                    <span>${timeAgo(item.time)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

/* ===================================
新增：加载系统统计数据
=================================== */
function loadSystemStats() {
    const elements = {
        totalVolume: '¥1.28B',
        avgReturn: '15.3%',
        maxDrawdown: '2.1%'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        } else {
            console.warn(`Element with id '${id}' not found`);
        }
    });
}

/* ===================================
新增：本托网格动态数据 (适配最新HTML结构)
=================================== */
function initBentoGrid() {
    updateBentoData();
}

function updateBentoData() {
    // 更新系统状态卡片
    updateSystemStatus();
    
    // 更新事件卡片
    updateEventCards();
    
    // 更新交易图表
    updateTradeChart();
    
    // 更新统计卡片
    updateStatCards();
}

function updateSystemStatus() {
    // 这里可以从API获取真实数据
    const systemData = {
        activeNodes: 12,
        uptime: '99.3',
        todayVolume: '¥124M',
        activeUsers: 1284,
        systemLoad: 78
    };
    
    // 更新数值 - 适配最新的HTML结构
    const nodesEl = document.querySelector('.card-primary .metric-item:first-child .metric-value');
    const uptimeEl = document.querySelector('.card-primary .metric-item:nth-child(2) .metric-value');
    const volumeEl = document.querySelector('.card-primary .metric-group:nth-child(2) .metric-item:first-child .metric-value');
    const usersEl = document.querySelector('.card-primary .metric-group:nth-child(2) .metric-item:nth-child(2) .metric-value');
    const loadEl = document.querySelector('.card-primary .load-fill');
    const loadLabelEl = document.querySelector('.card-primary .load-value');
    
    if (nodesEl) nodesEl.textContent = systemData.activeNodes;
    if (uptimeEl) uptimeEl.textContent = systemData.uptime + '%';
    if (volumeEl) volumeEl.textContent = systemData.todayVolume;
    if (usersEl) usersEl.textContent = systemData.activeUsers;
    if (loadEl) loadEl.style.width = systemData.systemLoad + '%';
    if (loadLabelEl) loadLabelEl.textContent = systemData.systemLoad + '%';
}

function updateEventCards() {
    const events = [
        { time: '15:23:04', event: 'Authorization deadline', status: 'success', statusText: 'LOCKED' },
        { time: '16:30:00', event: 'Match settlement', status: 'pending', statusText: 'PENDING' },
        { time: '17:45:00', event: 'Liquidity reallocation', status: '', statusText: 'SCHEDULED' }
    ];
    
    const eventItems = document.querySelectorAll('.event-item');
    
    eventItems.forEach((item, index) => {
        if (events[index]) {
            const timeEl = item.querySelector('.event-time');
            const nameEl = item.querySelector('.event-name');
            const badgeEl = item.querySelector('.event-badge');
            
            if (timeEl) timeEl.textContent = events[index].time;
            if (nameEl) nameEl.textContent = events[index].event;
            if (badgeEl) {
                badgeEl.textContent = events[index].statusText;
                badgeEl.className = 'event-badge';
                if (events[index].status) {
                    badgeEl.classList.add(events[index].status);
                }
            }
        }
    });
}

function updateTradeChart() {
    // 随机生成柱状图高度，模拟实时数据
    const segments = document.querySelectorAll('.line-segment');
    const trendEl = document.querySelector('.trend-indicator');
    const volumeEl = document.querySelector('.chart-footer span:last-child');
    
    // 随机生成今日涨跌幅 (-5% 到 +15%)
    const randomChange = (Math.random() * 20 - 5).toFixed(1);
    if (trendEl) {
        trendEl.textContent = (randomChange > 0 ? '+' : '') + randomChange + '%';
        trendEl.style.color = randomChange >= 0 ? 'var(--success)' : 'var(--error)';
    }
    
    // 随机更新柱状图高度
    segments.forEach(segment => {
        const newHeight = Math.floor(Math.random() * 70) + 30; // 30% 到 100%
        segment.style.height = newHeight + '%';
    });
    
    // 随机更新成交量
    const volumeChange = Math.floor(Math.random() * 200) + 50;
    if (volumeEl) volumeEl.textContent = '+' + volumeChange + '% volume';
}

function updateStatCards() {
    // 更新验证数卡片
    const verifiedEl = document.querySelector('.card-badge .badge-number');
    const verifiedDescEl = document.querySelector('.card-badge .badge-desc');
    
    // 随机生成验证数 (1000-1500)
    const verifiedCount = Math.floor(Math.random() * 500) + 1000;
    if (verifiedEl) verifiedEl.textContent = verifiedCount.toLocaleString();
    if (verifiedDescEl) verifiedDescEl.textContent = 'transactions today';
    
    // 更新信任得分卡片
    const trustEl = document.querySelector('.card-trust .trust-number');
    
    // 随机生成信任得分 (95-100)
    const trustScore = (Math.random() * 5 + 95).toFixed(1);
    if (trustEl) trustEl.textContent = trustScore;
}

function startBentoUpdates() {
    // 每10秒更新一次本托网格数据
    setInterval(() => {
        updateBentoData();
    }, 10000);
}

// 导出模块（如果需要）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initRadar,
        initChart,
        initNavbar,
        initScrollReveal,
        initNews,
        initLiveUpdates,
        initTerminalEffects,
        initTimelineAnimation,
        initLogStream,
        initAxiomInteractions,
        initVerificationEffects,
        initCounters,
        initSystemStatus,
        initCharts,
        loadStandings,
        initNewsModule,
        loadSystemStats,
        initBentoGrid,
        startBentoUpdates,
        initGSAPAnimations
    };
}