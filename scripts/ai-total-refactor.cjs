const fs = require('fs');
const path = require('path');
const https = require('https');

const DEEPSEEK_API_KEY = 'sk-c8592d308c1342169ccb401c17718d13';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 配置
const CONFIG = {
    projectRoot: process.cwd(),
    publicDir: './public',
    cssDir: './public/css',
    backupDir: './backup_' + Date.now(),
    
    // 对标产品
    benchmark: 'Stripe + Coinbase + Linear',
    
    // 要重构的页面
    targetPages: [
        'index.html', 'match-market.html', 'profile.html', 'transaction-detail.html',
        'deposit.html', 'withdraw.html', 'authorizations.html', 'fund-detail.html',
        'support.html', 'settings.html', 'change-password.html', 'set-paypassword.html'
    ]
};

// 工具函数
function log(msg, type = 'info') {
    const icons = { info: '📘', success: '✅', error: '❌', warn: '⚠️', progress: '🔄', ai: '🤖' };
    console.log(`${icons[type] || '📘'} ${msg}`);
}

function callDeepSeek(prompt, systemPrompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt || '你是一位世界级的前端架构师和 UI/UX 设计专家。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 16000
        });

        const url = new URL(DEEPSEEK_API_URL);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result.choices[0].message.content);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// 读取所有需要重构的文件
function readAllFiles() {
    log('读取项目文件...', 'progress');
    
    const files = {
        html: {},
        css: {}
    };
    
    // 读取 HTML
    for (const page of CONFIG.targetPages) {
        const filePath = path.join(CONFIG.publicDir, page);
        if (fs.existsSync(filePath)) {
            files.html[page] = fs.readFileSync(filePath, 'utf8');
            log(`读取: ${page}`, 'info');
        }
    }
    
    // 读取 CSS
    function readCSS(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                readCSS(fullPath);
            } else if (item.name.endsWith('.css')) {
                const relativePath = fullPath.replace(CONFIG.publicDir + '/', '');
                files.css[relativePath] = fs.readFileSync(fullPath, 'utf8');
                log(`读取: ${relativePath}`, 'info');
            }
        }
    }
    readCSS(CONFIG.cssDir);
    
    log(`共读取 ${Object.keys(files.html).length} 个 HTML, ${Object.keys(files.css).length} 个 CSS`, 'success');
    return files;
}

// AI 分析并生成重构方案
async function aiAnalyzeAndDesign(files) {
    log('AI 正在分析项目并设计方案...', 'ai');
    
    // 准备文件摘要
    const htmlSummary = Object.entries(files.html).map(([name, content]) => {
        // 提取关键结构，不包含完整内容
        const headMatch = content.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] || '';
        return `### ${name}\nHead: ${headMatch.substring(0, 500)}\nBody: ${bodyMatch.substring(0, 800)}...`;
    }).join('\n\n');
    
    const cssSummary = Object.entries(files.css).map(([name, content]) => {
        return `### ${name}\n${content.substring(0, 800)}...`;
    }).join('\n\n');
    
    const prompt = `你是世界级前端架构师，请对 FOOTRADAPRO 项目进行全面分析并输出重构方案。

## 当前项目问题
用户反馈：样式布局"乱成一锅粥"

## 对标产品
${CONFIG.benchmark}

## 现有文件

### HTML 文件结构：
${htmlSummary}

### CSS 文件（共 ${Object.keys(files.css).length} 个）：
${cssSummary}

## 请输出完整的 JSON 方案：

{
    "analysis": {
        "problems": ["当前样式的主要问题"],
        "designLanguage": {
            "inspiration": "对标产品说明",
            "colors": {"primary": "#F97316", "background": "#0A0C12", ...},
            "spacing": "8px 网格系统",
            "typography": "字体方案",
            "borderRadius": "圆角方案",
            "animation": "动画方案"
        }
    },
    "newArchitecture": {
        "fileStructure": ["css/tokens/", "css/components/", "css/layouts/", "css/utilities/"],
        "componentList": ["Button", "Card", "Navigation", "Modal", "Form", "Table"]
    },
    "generatedCode": {
        "designTokens.css": "完整的 CSS 变量定义",
        "button.css": "按钮组件样式",
        "card.css": "卡片组件样式",
        "nav.css": "导航组件样式",
        "form.css": "表单组件样式",
        "utilities.css": "工具类样式",
        "main.css": "主入口文件",
        "example.html": "某个页面的重构示例"
    },
    "mobileStrategy": {
        "breakpoints": {"mobile": 375, "tablet": 768, "desktop": 1024},
        "approach": "移动端优先"
    }
}

注意：generatedCode 中的 CSS 代码要完整可用，直接对标世界级产品标准。`;

    const result = await callDeepSeek(prompt);
    log('AI 方案设计完成', 'success');
    return JSON.parse(result);
}

// 备份
function backup() {
    log('备份原文件...', 'progress');
    if (!fs.existsSync(CONFIG.backupDir)) {
        fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }
    if (fs.existsSync(CONFIG.cssDir)) {
        fs.cpSync(CONFIG.cssDir, path.join(CONFIG.backupDir, 'css'), { recursive: true });
    }
    for (const page of CONFIG.targetPages) {
        const src = path.join(CONFIG.publicDir, page);
        if (fs.existsSync(src)) {
            const dest = path.join(CONFIG.backupDir, page);
            fs.copyFileSync(src, dest);
        }
    }
    log('备份完成', 'success');
}

// 应用新样式
function applyNewStyles(design) {
    log('应用新样式...', 'progress');
    
    // 创建目录
    const newDirs = ['tokens', 'components', 'layouts', 'utilities'];
    for (const dir of newDirs) {
        const fullPath = path.join(CONFIG.cssDir, dir);
        if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    }
    
    // 写入生成的文件
    const files = design.generatedCode;
    for (const [name, content] of Object.entries(files)) {
        let filePath;
        if (name === 'designTokens.css') filePath = path.join(CONFIG.cssDir, 'tokens', name);
        else if (['button.css', 'card.css', 'nav.css', 'form.css'].includes(name)) {
            filePath = path.join(CONFIG.cssDir, 'components', name);
        } else if (name === 'utilities.css') {
            filePath = path.join(CONFIG.cssDir, 'utilities', name);
        } else if (name === 'main.css') {
            filePath = path.join(CONFIG.cssDir, name);
        } else {
            filePath = path.join(CONFIG.cssDir, name);
        }
        
        if (content && typeof content === 'string') {
            fs.writeFileSync(filePath, content);
            log(`写入: ${path.basename(filePath)}`, 'success');
        }
    }
    
    // 更新 HTML 文件
    for (const page of CONFIG.targetPages) {
        const filePath = path.join(CONFIG.publicDir, page);
        if (!fs.existsSync(filePath)) continue;
        
        let content = fs.readFileSync(filePath, 'utf8');
        
        // 移除所有旧 CSS 引用
        content = content.replace(/<link rel="stylesheet" href="\/css\/[^"]+\.css">/g, '');
        content = content.replace(/<link rel="stylesheet" href="\.\.\/css\/[^"]+\.css">/g, '');
        
        // 添加新 CSS
        if (!content.includes('main.css')) {
            content = content.replace('</head>', '    <link rel="stylesheet" href="/css/main.css">\n</head>');
        }
        
        // 添加 viewport
        if (!content.includes('viewport')) {
            content = content.replace('<head>', '<head>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">');
        }
        
        // 添加主题色
        if (!content.includes('theme-color')) {
            content = content.replace('</head>', '    <meta name="theme-color" content="#0A0C12">\n</head>');
        }
        
        fs.writeFileSync(filePath, content);
        log(`更新: ${page}`, 'success');
    }
}

// 生成报告
function generateReport(design) {
    const report = `# FOOTRADAPRO AI 全自动重构报告

## 重构时间
${new Date().toLocaleString()}

## 对标产品
${CONFIG.benchmark}

## AI 分析结果

### 发现的问题
${design.analysis.problems.map(p => `- ${p}`).join('\n')}

### 设计语言
- 主色: ${design.analysis.designLanguage.colors.primary}
- 间距系统: ${design.analysis.designLanguage.spacing}
- 圆角: ${design.analysis.designLanguage.borderRadius}

## 新架构
- CSS 文件: ${design.newArchitecture.fileStructure.join(', ')}
- 组件: ${design.newArchitecture.componentList.join(', ')}

## 移动端策略
- 断点: ${design.mobileStrategy.breakpoints.mobile}px / ${design.mobileStrategy.breakpoints.tablet}px / ${design.mobileStrategy.breakpoints.desktop}px
- 方案: ${design.mobileStrategy.approach}

## 备份位置
${CONFIG.backupDir}

## 恢复命令
cp -r ${CONFIG.backupDir}/* ${CONFIG.publicDir}/
`;

    fs.writeFileSync('./AI_REFACTOR_REPORT.md', report);
    log('报告已生成: AI_REFACTOR_REPORT.md', 'success');
}

// 主函数
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     FOOTRADAPRO AI 全自动重构 v4.0                            ║');
    console.log('║     对标 Stripe + Coinbase + Linear                           ║');
    console.log('║     DeepSeek 完全主导重构                                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // 1. 备份
        backup();
        
        // 2. 读取文件
        const files = readAllFiles();
        
        // 3. AI 分析和设计
        const design = await aiAnalyzeAndDesign(files);
        
        // 4. 保存 AI 方案
        fs.writeFileSync('./AI_DESIGN.json', JSON.stringify(design, null, 2));
        log('AI 设计方案已保存: AI_DESIGN.json', 'success');
        
        // 5. 应用新样式
        applyNewStyles(design);
        
        // 6. 生成报告
        generateReport(design);
        
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║     ✨ 重构完成！                                             ║');
        console.log('║     刷新页面查看效果                                           ║');
        console.log('║     备份位置: ' + CONFIG.backupDir);
        console.log('║     设计方案: AI_DESIGN.json                                  ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        
    } catch (err) {
        console.error('❌ 重构失败:', err.message);
    }
}