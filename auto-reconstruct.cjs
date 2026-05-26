const fs = require('fs');
const path = require('path');
const https = require('https');

// ============ 配置区域 ============
const DEEPSEEK_API_KEY = 'sk-c8592d308c1342169ccb401c17718d13'; // 请替换成您的新Key
const PROJECT_ROOT = __dirname;
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public_reconstructed');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'reconstruct_backup_' + Date.now());

// 排除的文件/文件夹
const EXCLUDE_DIRS = ['uploads', 'sounds', 'css_backup', 'node_modules', 'admin'];
const EXCLUDE_FILES = ['.backup', '.bak', '.bak3', '.corrupt'];

// ============ 工具函数 ============
function log(message, type = 'INFO') {
    const icons = { INFO: '📘', SUCCESS: '✅', ERROR: '❌', WARNING: '⚠️', STEP: '🚀' };
    console.log(`${icons[type] || '📘'} ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 递归查找所有HTML文件
function findHTMLFiles(dir, baseDir = null) {
    let results = [];
    if (!baseDir) baseDir = dir;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(item)) {
                results = results.concat(findHTMLFiles(fullPath, baseDir));
            }
        } else if (item.endsWith('.html') && !EXCLUDE_FILES.some(ext => item.includes(ext))) {
            const relativePath = path.relative(baseDir, fullPath);
            results.push({
                fullPath: fullPath,
                relativePath: relativePath,
                dir: path.dirname(relativePath),
                name: item
            });
        }
    }
    return results;
}

// 查找对应的JS文件（基于HTML文件名）
function findCorrespondingJS(htmlFile) {
    const baseName = path.basename(htmlFile, '.html');
    const jsSearchPaths = [
        path.join(PUBLIC_DIR, 'js', 'user', `${baseName}_controller.js`),
        path.join(PUBLIC_DIR, 'js', 'user', `${baseName}.js`),
        path.join(PUBLIC_DIR, 'js', 'admin', `${baseName}_controller.js`),
        path.join(PUBLIC_DIR, 'js', 'admin', `${baseName}.js`),
        path.join(PUBLIC_DIR, 'js', 'core', `${baseName}.js`),
    ];
    
    for (const jsPath of jsSearchPaths) {
        if (fs.existsSync(jsPath)) {
            return jsPath;
        }
    }
    return null;
}

// 读取HTML文件内容
function readHTMLFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        log(`读取失败: ${filePath} - ${err.message}`, 'ERROR');
        return null;
    }
}

// 调用DeepSeek API
async function callDeepSeek(prompt) {
    const data = JSON.stringify({
        model: 'deepseek-chat',
        messages: [
            {
                role: 'system',
                content: `你是一个前端重构专家。根据HTML和JS代码，生成干净、现代化的HTML和CSS。
                
【重要规则】：
1. 保持所有 id、data-属性、onclick 事件完全不变
2. 保持所有表单的 name 属性不变
3. 不要修改任何业务逻辑相关的内容
4. 只优化布局、样式、class命名
5. 使用现代CSS（Flexbox/Grid、CSS变量）
6. 响应式设计，移动端优先
7. 深色主题，统一设计语言

输出格式：
---HTML---
[完整的HTML代码，保留body内所有内容]
---CSS---
[完整的CSS代码]`
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: 0.3,
        max_tokens: 8000
    });

    const options = {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.error) {
                        reject(new Error(result.error.message));
                    } else {
                        resolve(result.choices[0].message.content);
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// 从AI响应中提取HTML和CSS
function extractHTMLAndCSS(aiResponse) {
    let html = '';
    let css = '';
    
    const htmlMatch = aiResponse.match(/---HTML---\n([\s\S]*?)\n---CSS---/);
    const cssMatch = aiResponse.match(/---CSS---\n([\s\S]*?)$/);
    
    if (htmlMatch) html = htmlMatch[1].trim();
    if (cssMatch) css = cssMatch[1].trim();
    
    return { html, css };
}

// 重构单个页面
async function reconstructPage(htmlFileInfo, index, total) {
    log(`[${index}/${total}] 处理: ${htmlFileInfo.relativePath}`, 'STEP');
    
    // 读取HTML
    const htmlContent = readHTMLFile(htmlFileInfo.fullPath);
    if (!htmlContent) return false;
    
    // 查找对应的JS
    const jsPath = findCorrespondingJS(htmlFileInfo.fullPath);
    let jsContent = '';
    if (jsPath) {
        jsContent = fs.readFileSync(jsPath, 'utf-8');
        log(`  找到JS: ${path.basename(jsPath)}`);
    } else {
        log(`  未找到对应JS，将只基于HTML重构`, 'WARNING');
    }
    
    // 备份原文件
    const backupFilePath = path.join(BACKUP_DIR, htmlFileInfo.relativePath);
    const backupDir = path.dirname(backupFilePath);
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.copyFileSync(htmlFileInfo.fullPath, backupFilePath);
    
    // 构建提示词
    const prompt = `
请重构以下页面：

【HTML代码】：
${htmlContent.substring(0, 8000)}

${jsContent ? `【JS代码参考】：
${jsContent.substring(0, 3000)}` : ''}

【要求】：
1. 页面类型：${htmlFileInfo.relativePath.includes('admin') ? '管理后台页面' : '用户端页面'}
2. 保持所有id和事件绑定不变
3. 输出完整的HTML和CSS
`;
    
    try {
        log(`  调用DeepSeek API...`);
        const aiResponse = await callDeepSeek(prompt);
        const { html: newHTML, css: newCSS } = extractHTMLAndCSS(aiResponse);
        
        if (newHTML) {
            // 保存新HTML
            const outputPath = path.join(OUTPUT_DIR, htmlFileInfo.relativePath);
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(outputPath, newHTML);
            log(`  ✅ HTML已生成`, 'SUCCESS');
        }
        
        if (newCSS) {
            // 保存新CSS
            const cssFileName = `${path.basename(htmlFileInfo.name, '.html')}.css`;
            const cssOutputPath = path.join(OUTPUT_DIR, htmlFileInfo.dir, 'css', cssFileName);
            const cssDir = path.dirname(cssOutputPath);
            if (!fs.existsSync(cssDir)) {
                fs.mkdirSync(cssDir, { recursive: true });
            }
            fs.writeFileSync(cssOutputPath, newCSS);
            log(`  ✅ CSS已生成`, 'SUCCESS');
        }
        
        return true;
        
    } catch (err) {
        log(`  ❌ 失败: ${err.message}`, 'ERROR');
        return false;
    }
}

// 生成统一样式变量文件
async function generateGlobalStyles() {
    log('生成全局样式变量...', 'STEP');
    
    const globalCSS = `/* ========================================
   FOOTRADAPRO - 全局设计令牌
   ======================================== */

:root {
  /* 颜色系统 - 深色主题 */
  --bg-primary: #0a0c10;
  --bg-secondary: #13161c;
  --bg-card: #1a1f2a;
  --bg-hover: #232833;
  
  --text-primary: #ffffff;
  --text-secondary: #a0a8b8;
  --text-muted: #6c757d;
  
  --border-color: #2a3040;
  --border-light: #1e2430;
  
  /* 品牌色 */
  --brand-primary: #00d4ff;
  --brand-primary-dark: #0099cc;
  --brand-success: #00d68f;
  --brand-warning: #ffaa00;
  --brand-danger: #ff3b5c;
  
  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  
  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  
  /* 字体 */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  
  /* 阴影 */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
  --shadow-glow: 0 0 20px rgba(0, 212, 255, 0.3);
  
  /* 动画 */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.25s ease;
  --transition-slow: 0.4s ease;
}

/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  line-height: 1.5;
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--brand-primary);
}
`;
    
    const globalCSSPath = path.join(OUTPUT_DIR, 'css', 'global.css');
    const globalCSSDir = path.dirname(globalCSSPath);
    if (!fs.existsSync(globalCSSDir)) {
        fs.mkdirSync(globalCSSDir, { recursive: true });
    }
    fs.writeFileSync(globalCSSPath, globalCSS);
    log('✅ 全局样式已生成: css/global.css', 'SUCCESS');
}

// 生成报告
function generateReport(results) {
    const report = `# 前端重构报告

生成时间: ${new Date().toISOString()}

## 统计信息

| 项目 | 数量 |
|-----|------|
| 总页面数 | ${results.total} |
| 成功重构 | ${results.success} |
| 失败 | ${results.failed} |
| 成功率 | ${((results.success / results.total) * 100).toFixed(1)}% |

## 处理详情

${results.details.map(d => `- ${d.file}: ${d.status}`).join('\n')}

## 输出位置

- 重构文件: \`public_reconstructed/\`
- 原文件备份: \`${path.basename(BACKUP_DIR)}/\`
- 全局样式: \`public_reconstructed/css/global.css\`

## 下一步操作

1. 检查 \`public_reconstructed/\` 目录中的文件
2. 确认样式正确后，替换原 \`public/\` 目录
3. 运行项目测试所有功能
`;
    
    const reportPath = path.join(PROJECT_ROOT, 'RECONSTRUCT_REPORT.md');
    fs.writeFileSync(reportPath, report);
    log(`报告已生成: RECONSTRUCT_REPORT.md`, 'SUCCESS');
}

// ============ 主函数 ============
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     FOOTRADAPRO AI 全自动前端重构 v1.0                   ║');
    console.log('║     基于 DeepSeek API 反推 HTML/CSS                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // 检查API Key
    if (DEEPSEEK_API_KEY === '您的DeepSeek API Key') {
        log('请先配置您的 DeepSeek API Key！', 'ERROR');
        log('在脚本顶部的 DEEPSEEK_API_KEY 变量中填入您的密钥', 'WARNING');
        return;
    }
    
    // 创建输出和备份目录
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // 查找所有HTML文件
    log('扫描HTML文件...', 'STEP');
    const htmlFiles = findHTMLFiles(PUBLIC_DIR);
    log(`找到 ${htmlFiles.length} 个HTML文件`, 'SUCCESS');
    
    if (htmlFiles.length === 0) {
        log('未找到HTML文件，请确认项目路径正确', 'ERROR');
        return;
    }
    
    // 显示文件列表
    console.log('\n📋 待处理文件:');
    htmlFiles.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.relativePath}`);
    });
    
    console.log('\n');
    log('开始重构...', 'STEP');
    log('注意: 每个页面需要几秒钟，请耐心等待', 'WARNING');
    
    const results = {
        total: htmlFiles.length,
        success: 0,
        failed: 0,
        details: []
    };
    
    // 逐个处理
    for (let i = 0; i < htmlFiles.length; i++) {
        const success = await reconstructPage(htmlFiles[i], i + 1, htmlFiles.length);
        if (success) {
            results.success++;
            results.details.push({ file: htmlFiles[i].relativePath, status: '✅ 成功' });
        } else {
            results.failed++;
            results.details.push({ file: htmlFiles[i].relativePath, status: '❌ 失败' });
        }
        await sleep(2000); // 避免API限流
    }
    
    // 生成全局样式
    await generateGlobalStyles();
    
    // 生成报告
    generateReport(results);
    
    // 输出总结
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     ✨ 重构完成！                                          ║');
    console.log(`║     成功: ${results.success} / 失败: ${results.failed}                    ║`);
    console.log(`║     输出目录: public_reconstructed/                        ║`);
    console.log(`║     备份目录: ${path.basename(BACKUP_DIR)}/`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// 运行
main().catch(console.error);