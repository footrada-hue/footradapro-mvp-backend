// scripts/deep-refactor.cjs

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEEPSEEK_API_KEY = 'sk-c8592d308c1342169ccb401c17718d13';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 读取所有相关文件
function readAllFiles() {
    const publicDir = './public';
    const files = {
        html: [],
        css: [],
        js: []
    };
    
    // 读取 HTML
    const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
    for (const file of htmlFiles) {
        if (file.includes('admin')) continue; // 跳过后台
        files.html.push({
            name: file,
            content: fs.readFileSync(`${publicDir}/${file}`, 'utf8')
        });
    }
    
    // 读取 CSS
    function readCSS(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = `${dir}/${item.name}`;
            if (item.isDirectory()) {
                readCSS(fullPath);
            } else if (item.name.endsWith('.css')) {
                files.css.push({
                    name: fullPath.replace('./public/', ''),
                    content: fs.readFileSync(fullPath, 'utf8')
                });
            }
        }
    }
    readCSS('./public/css');
    
    return files;
}

// 调用 DeepSeek
function callDeepSeek(prompt, systemPrompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt || '你是一位世界级的前端架构师，擅长代码重构和设计系统建设。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 8000
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

async function main() {
    console.log('\n🔍 分析项目文件...\n');
    const files = readAllFiles();
    
    console.log(`📄 找到 ${files.html.length} 个 HTML 文件`);
    console.log(`🎨 找到 ${files.css.length} 个 CSS 文件`);
    console.log(`📜 找到 ${files.js.length} 个 JS 文件（不会修改）\n`);
    
    // 准备分析内容
    const cssSummary = files.css.map(f => `### ${f.name}\n${f.content.substring(0, 500)}...`).join('\n\n');
    const htmlSummary = files.html.map(f => `### ${f.name}\n${f.content.substring(0, 800)}...`).join('\n\n');
    
    console.log('🤖 向 DeepSeek 发送分析请求...\n');
    
    const analysisPrompt = `请分析以下 FOOTRADAPRO 项目的前端代码：

## HTML 文件摘要：
${htmlSummary}

## CSS 文件摘要：
${cssSummary}

请回答：
1. 当前设计系统的问题（样式混乱、重复、不一致的地方）
2. 应该统一的设计语言（颜色、间距、字体、圆角）
3. 可抽取的公共组件
4. 移动端适配的问题
5. 重构方案（具体步骤）

输出格式：JSON
{
    "problems": ["问题1", "问题2"],
    "designTokens": { "colors": {}, "spacing": {}, "typography": {} },
    "components": ["组件1", "组件2"],
    "mobileIssues": ["问题1"],
    "refactorPlan": ["步骤1", "步骤2"]
}`;

    const analysis = await callDeepSeek(analysisPrompt);
    console.log('📊 分析结果：\n', analysis);
    
    // 生成重构代码
    console.log('\n🔧 生成重构代码...\n');
    
    const codePrompt = `基于以下分析结果，生成完整的重构代码：

${analysis}

要求：
1. 生成统一的 design-tokens.css
2. 生成 button.css, card.css, nav.css, form.css
3. 生成 utilities.css（工具类）
4. 生成 main.css（主入口）
5. 生成一个示例 HTML 的修改版本

所有代码使用 CSS 变量，对标 Stripe/Coinbase 风格。
输出格式：JSON，每个文件内容作为字符串。`;

    const code = await callDeepSeek(codePrompt);
    console.log('✅ 代码生成完成\n');
    
    // 保存结果
    fs.writeFileSync('./AI_ANALYSIS.json', analysis);
    fs.writeFileSync('./AI_CODE.json', code);
    
    console.log('📁 结果已保存：');
    console.log('   - AI_ANALYSIS.json (分析报告)');
    console.log('   - AI_CODE.json (生成的代码)');
}

main().catch(console.error);