/**
 * FOOTRADAPRO 前端全自动重构脚本（AI 增强版）
 * 集成 DeepSeek API 自动优化样式
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ==================== DeepSeek API 配置 ====================
const DEEPSEEK_API_KEY = 'sk-c8592d308c1342169ccb401c17718d13';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// ==================== 配置 ====================
const CONFIG = {
    projectRoot: process.cwd(),
    publicDir: process.cwd() + '/public',
    cssDir: process.cwd() + '/public/css',
    backupDir: process.cwd() + '/css_backup_' + Date.now(),
    
    targetPages: [
        'index.html', 'match-market.html', 'profile.html', 'transaction-detail.html',
        'deposit.html', 'withdraw.html', 'authorizations.html', 'fund-detail.html',
        'support.html', 'settings.html', 'change-password.html', 'set-paypassword.html'
    ]
};

// ==================== 工具函数 ====================
function log(msg, type = 'info') {
    const icons = { info: '📘', success: '✅', error: '❌', warn: '⚠️', progress: '🔄', ai: '🤖' };
    console.log(`${icons[type] || '📘'} ${msg}`);
}

// ==================== DeepSeek API 调用 ====================
async function callDeepSeek(prompt, systemPrompt = '你是一个世界级的前端设计专家，擅长 Stripe/Coinbase 风格') {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 4000
        });

        const url = new URL(DEEPSEEK_API_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.choices && result.choices[0]) {
                        resolve(result.choices[0].message.content);
                    } else {
                        reject(new Error(result.error?.message || 'API 返回错误'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ==================== AI 生成设计令牌 ====================
async function aiGenerateDesignTokens() {
    log('🤖 AI 正在生成设计令牌...', 'ai');
    
    const prompt = `请为 FOOTRADAPRO 足球交易平台生成完整的设计令牌 CSS。
要求：
- 对标 Stripe + Coinbase 风格
- 暗色主题
- 品牌色橙色 #F97316，测试模式蓝色 #3B82F6
- 8px 网格系统
- 毛玻璃效果
- 大圆角设计
- 移动端优先响应式

输出完整的 :root 和 body.test-mode 变量定义，包含颜色、间距、圆角、字体、阴影、动画。只输出 CSS，不要解释。`;

    try {
        const css = await callDeepSeek(prompt);
        const dir = CONFIG.cssDir + '/tokens';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + '/design-tokens.css', css);
        log('AI 设计令牌生成完成', 'success');
        return true;
    } catch (err) {
        log('AI 生成失败，使用内置模板: ' + err.message, 'warn');
        return false;
    }
}

// ==================== AI 生成组件样式 ====================
async function aiGenerateComponents() {
    log('🤖 AI 正在生成组件样式...', 'ai');
    
    const components = ['button', 'card', 'nav', 'form'];
    let successCount = 0;
    
    for (const component of components) {
        const prompt = `请生成 ${component} 组件的完整 CSS 代码。
对标 Stripe/Coinbase 风格，暗色主题，毛玻璃效果，圆润设计。
包含所有变体（尺寸、状态、悬停效果）。
使用设计令牌中的变量。只输出 CSS。`;

        try {
            const css = await callDeepSeek(prompt);
            const dir = CONFIG.cssDir + '/components';
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(dir + `/${component}.css`, css);
            log(`AI 生成 ${component}.css 完成`, 'success');
            successCount++;
        } catch (err) {
            log(`${component} 组件 AI 生成失败: ${err.message}`, 'warn');
        }
    }
    
    return successCount;
}

// ==================== AI 优化现有 CSS ====================
async function aiOptimizeCSS() {
    log('🤖 AI 正在分析并优化 CSS...', 'ai');
    
    // 收集现有 CSS
    let existingCSS = '';
    if (fs.existsSync(CONFIG.cssDir)) {
        const files = fs.readdirSync(CONFIG.cssDir);
        for (const file of files) {
            if (file.endsWith('.css')) {
                const content = fs.readFileSync(CONFIG.cssDir + '/' + file, 'utf8');
                existingCSS += `\n/* ${file} */\n${content}\n`;
            }
        }
    }
    
    const prompt = `请分析以下 CSS 代码，提供优化建议并输出优化后的版本。
要求：
1. 删除重复代码
2. 合并相同选择器
3. 使用设计令牌变量
4. 添加移动端适配
5. 保持原有功能不变

现有 CSS:
${existingCSS.substring(0, 8000)}

输出优化后的 CSS，按类别组织。`;

    try {
        const optimized = await callDeepSeek(prompt);
        const dir = CONFIG.cssDir + '/optimized';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + '/optimized.css', optimized);
        log('AI CSS 优化完成', 'success');
        return true;
    } catch (err) {
        log('AI 优化失败: ' + err.message, 'warn');
        return false;
    }
}

// ==================== AI 自我调试反馈 ====================
async function aiSelfDebug() {
    log('🤖 AI 正在自我调试...', 'ai');
    
    const mainCSS = CONFIG.cssDir + '/main.css';
    if (!fs.existsSync(mainCSS)) {
        log('main.css 不存在，跳过调试', 'warn');
        return;
    }
    
    const cssContent = fs.readFileSync(mainCSS, 'utf8');
    
    const prompt = `请检查以下 CSS 代码的问题：
1. 语法错误
2. 选择器冲突
3. 性能问题
4. 移动端兼容性
5. 浏览器兼容性

CSS 代码:
${cssContent}

输出 JSON 格式：
{
    "hasError": true/false,
    "errors": ["错误1", "错误2"],
    "warnings": ["警告1", "警告2"],
    "suggestions": ["建议1", "建议2"]
}`;

    try {
        const result = await callDeepSeek(prompt);
        log('AI 调试完成', 'success');
        
        // 尝试解析 JSON
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                if (analysis.hasError) {
                    log('发现 ' + analysis.errors?.length + ' 个错误', 'warn');
                    analysis.errors?.forEach(e => log('  - ' + e, 'warn'));
                }
                if (analysis.suggestions?.length) {
                    log('优化建议:', 'info');
                    analysis.suggestions.forEach(s => log('  - ' + s, 'info'));
                }
            }
        } catch (e) {
            // 不是 JSON，直接输出
            console.log(result);
        }
        return true;
    } catch (err) {
        log('AI 调试失败: ' + err.message, 'warn');
        return false;
    }
}

// ==================== 备份 ====================
function backup() {
    log('备份原文件...', 'progress');
    if (!fs.existsSync(CONFIG.backupDir)) {
        fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }
    if (fs.existsSync(CONFIG.cssDir)) {
        fs.cpSync(CONFIG.cssDir, CONFIG.backupDir + '/css', { recursive: true });
    }
    log('备份完成: ' + CONFIG.backupDir, 'success');
}

// ==================== 创建主入口 ====================
function createMainCSS() {
    const css = `/* FOOTRADAPRO 主样式文件 - AI 增强版 */
@import url('/css/tokens/design-tokens.css');
@import url('/css/components/button.css');
@import url('/css/components/card.css');
@import url('/css/components/nav.css');
@import url('/css/components/form.css');

/* 基础重置 */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.5;
    min-height: 100vh;
}

/* 容器 */
.container { max-width: 1200px; margin: 0 auto; padding: 0 var(--space-4); }
.content-scrollable { flex: 1; overflow-y: auto; padding-bottom: 80px; }

/* 工具类 */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: var(--space-2); }
.gap-4 { gap: var(--space-4); }
.w-full { width: 100%; }
.text-center { text-align: center; }
.text-brand { color: var(--brand); }
.cursor-pointer { cursor: pointer; }
.glass { background: rgba(17, 24, 39, 0.8); backdrop-filter: blur(12px); }`;

    fs.writeFileSync(CONFIG.cssDir + '/main.css', css);
    log('主入口创建完成', 'success');
}

// ==================== 迁移 HTML ====================
function migrateHTML() {
    log('迁移 HTML 文件...', 'progress');
    
    let count = 0;
    for (const page of CONFIG.targetPages) {
        const filePath = CONFIG.publicDir + '/' + page;
        if (!fs.existsSync(filePath)) continue;
        
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/<link rel="stylesheet" href="\/css\/[^"]+\.css">/g, '');
        content = content.replace(/<link rel="stylesheet" href="\.\.\/css\/[^"]+\.css">/g, '');
        
        if (!content.includes('main.css')) {
            content = content.replace('</head>', '    <link rel="stylesheet" href="/css/main.css">\n</head>');
        }
        
        if (!content.includes('viewport')) {
            content = content.replace('<head>', '<head>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">');
        }
        
        fs.writeFileSync(filePath, content);
        log(page + ' 迁移完成', 'success');
        count++;
    }
    
    log('共迁移 ' + count + ' 个页面', 'success');
}

// ==================== 生成报告 ====================
function generateReport(aiResults) {
    const report = `# FOOTRADAPRO 前端重构报告（AI 增强版）

## 重构时间
${new Date().toLocaleString()}

## AI 优化结果
- 设计令牌生成: ${aiResults.tokens ? '✅ 成功' : '⚠️ 使用模板'}
- 组件生成: ${aiResults.components} 个成功
- CSS 优化: ${aiResults.optimize ? '✅ 完成' : '⚠️ 跳过'}
- 自我调试: ${aiResults.debug ? '✅ 完成' : '⚠️ 跳过'}

## 备份位置
${CONFIG.backupDir}

## 恢复命令
cp -r ${CONFIG.backupDir}/css/* ${CONFIG.cssDir}/
`;
    fs.writeFileSync(process.cwd() + '/AI_REFACTOR_REPORT.md', report);
    log('报告已生成: AI_REFACTOR_REPORT.md', 'success');
}

// ==================== 主函数 ====================
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     FOOTRADAPRO AI 全自动重构脚本 v3.0                    ║');
    console.log('║     集成 DeepSeek API 自动优化样式                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const aiResults = { tokens: false, components: 0, optimize: false, debug: false };
    
    try {
        // 1. 备份
        backup();
        
        // 2. 创建目录
        const dirs = ['tokens', 'components', 'base', 'utilities'];
        dirs.forEach(d => {
            const p = CONFIG.cssDir + '/' + d;
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });
        
        // 3. AI 生成设计令牌
        aiResults.tokens = await aiGenerateDesignTokens();
        if (!aiResults.tokens) {
            // 使用内置模板
            const fallbackCSS = `:root { --brand: #F97316; --bg-primary: #0A0C12; --text-primary: #FFFFFF; }`;
            fs.writeFileSync(CONFIG.cssDir + '/tokens/design-tokens.css', fallbackCSS);
        }
        
        // 4. AI 生成组件
        aiResults.components = await aiGenerateComponents();
        
        // 5. AI 优化 CSS
        aiResults.optimize = await aiOptimizeCSS();
        
        // 6. 创建主入口和迁移
        createMainCSS();
        migrateHTML();
        
        // 7. AI 自我调试
        aiResults.debug = await aiSelfDebug();
        
        // 8. 生成报告
        generateReport(aiResults);
        
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║     ✨ AI 重构完成！                                      ║');
        console.log('║     AI 已自动优化样式并生成反馈                            ║');
        console.log('║     备份位置: ' + CONFIG.backupDir);
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        
    } catch (err) {
        console.error('❌ 重构失败:', err.message);
    }
}

main();