import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ 请在 .env 文件中配置 DEEPSEEK_API_KEY');
  process.exit(1);
}

const TEMPLATE_PATH = path.join(__dirname, '../v2/index.html');
const OUTPUT_DIR = path.join(__dirname, '../v2');
const JS_DIR = path.join(__dirname, '../v2/js/user');

const PAGES = [
  { name: 'market', title: 'Match Market | AI Football Trading', controller: 'match-market_controller.js', description: '比赛超市页面，展示所有可授权的足球比赛，支持筛选联赛、时间' },
  { name: 'profile', title: 'My Profile | FootRadaPro', controller: 'profile_controller.js', description: '个人资料页面，展示用户信息、账户设置' },
  { name: 'deposit', title: 'Deposit Funds | FootRadaPro', controller: 'deposit_controller.js', description: '存款页面，用户选择金额进行充值' },
  { name: 'withdraw', title: 'Withdraw | FootRadaPro', controller: 'withdraw.js', description: '提现页面，用户输入金额和地址提取资金' },
  { name: 'login', title: 'Sign In | FootRadaPro', controller: 'login_controller.js', description: '登录页面，用户输入凭证登录系统' },
  { name: 'register', title: 'Create Account | FootRadaPro', controller: 'register_controller.js', description: '注册页面，新用户创建账户' },
  { name: 'transaction-list', title: 'Transaction History | FootRadaPro', controller: 'transaction-list.js', description: '交易记录列表页面' },
  { name: 'transaction-detail', title: 'Transaction Detail | FootRadaPro', controller: 'transaction-detail.js', description: '交易详情页面' },
  { name: 'authorizations', title: 'My Authorizations | FootRadaPro', controller: 'authorizations.js', description: '我的授权列表页面' },
  { name: 'fund-detail', title: 'Fund Detail | FootRadaPro', controller: 'fund-detail.js', description: '资金明细页面' },
  { name: 'settings', title: 'Settings | FootRadaPro', controller: 'settings.js', description: '系统设置页面' },
  { name: 'support', title: 'Support Center | FootRadaPro', controller: 'support_controller.js', description: '客服支持页面' }
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function readJSFile(filename) {
  const filePath = path.join(JS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
}

async function callDeepSeek(prompt) {
  console.log('  🤖 调用 DeepSeek API...');
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个前端开发专家。请根据 JavaScript 控制器代码，反推出完整的 HTML 页面。

【重要规则】：
1. 输出完整的 HTML 文件（包含 <!DOCTYPE>、<html>、<head>、<body>、<script>）
2. 使用以下 CSS 类名：card, grid, row, amount, badge, event-btn, section-head, section-title, events-grid, event-card, mode-tabs, mode-tab
3. 保持玻璃质感设计（半透明背景、backdrop-filter: blur、渐变边框）
4. 深色/浅色主题兼容（使用 CSS 变量如 var(--card-bg), var(--accent)）
5. 响应式设计，移动端适配（桌面端三栏，移动端单列 + 底部导航）
6. 页面必须包含全局状态管理代码（appMode, theme 的 localStorage 读写和事件监听）
7. 所有样式内嵌在 <style> 标签中
8. 不要添加任何解释文字，只输出 HTML 代码`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 8192
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.choices[0].message.content;
}

async function generatePageContent(pageConfig) {
  console.log(`  📄 分析 JS: ${pageConfig.controller}`);
  
  const jsContent = readJSFile(pageConfig.controller);
  if (!jsContent) {
    console.log(`  ⚠️ 未找到 ${pageConfig.controller}`);
    return null;
  }
  
  const prompt = `请根据以下 JavaScript 控制器代码，反推出完整的 HTML 页面。

【第一步：分析 JS 代码】
请分析以下内容：
1. 页面的核心业务逻辑是什么？
2. 有哪些数据模型（变量、API 返回的数据结构）？
3. 有哪些 DOM 操作（getElementById、querySelector、innerHTML）？
4. 有哪些用户交互（点击、切换、输入）？
5. 调用了哪些 API？

JavaScript 代码：
\`\`\`javascript
${jsContent.substring(0, 6000)}
\`\`\`

页面说明：${pageConfig.description}

【第二步：设计要求】
1. 使用以下 CSS 类名：card, grid, row, amount, badge, event-btn, section-head, section-title, events-grid, event-card, mode-tabs, mode-tab
2. 保持玻璃质感设计（半透明背景、backdrop-filter: blur(20px)、渐变边框）
3. 深色/浅色主题兼容（使用 CSS 变量）
4. 响应式设计，移动端适配（桌面端显示侧边栏，移动端显示底部导航）
5. 包含跑马灯、顶部导航、侧边栏、底部导航、悬浮客服按钮

【第三步：必须包含全局状态管理】
在 <script> 中必须包含以下代码：
- getAppMode() / setAppMode() - 沙盒/实盘模式切换，存储到 localStorage
- getThemeMode() / setThemeMode() - 深色/浅色主题切换，存储到 localStorage
- 监听 appModeChanged 和 themeChanged 自定义事件
- 页面加载时从 localStorage 读取状态并应用到页面
- 所有页面共享同一套状态，确保首页切换模式后其他页面同步

【第四步：输出】
输出完整的 HTML 文件（包含 <!DOCTYPE>、<html>、<head>、<body>、<style>、<script>）。`;

  try {
    const htmlContent = await callDeepSeek(prompt);
    let cleanHtml = htmlContent;
    cleanHtml = cleanHtml.replace(/```html\n?/g, '').replace(/```\n?/g, '');
    return cleanHtml;
  } catch (err) {
    console.error(`  ❌ API 调用失败: ${err.message}`);
    return null;
  }
}

async function generatePage(pageConfig, index, total) {
  console.log(`\n[${index}/${total}] 生成: ${pageConfig.name}.html`);
  
  const htmlContent = await generatePageContent(pageConfig);
  
  if (!htmlContent) {
    console.log(`  ⚠️ 跳过: ${pageConfig.name}.html`);
    return false;
  }
  
  const outputPath = path.join(OUTPUT_DIR, `${pageConfig.name}.html`);
  fs.writeFileSync(outputPath, htmlContent, 'utf-8');
  console.log(`  ✅ 已保存: ${pageConfig.name}.html`);
  return true;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FootRadaPro AI 页面自动生成脚本 v4.2                    ║');
  console.log('║     基于 DeepSeek API 反推理 JS 控制器生成完整页面           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📄 模板参考: ${TEMPLATE_PATH}`);
  console.log(`📁 输出目录: ${OUTPUT_DIR}`);
  console.log(`🤖 DeepSeek API: 已从 .env 读取\n`);
  
  console.log(`开始生成 ${PAGES.length} 个页面...`);
  console.log(`⏳ 每个页面约需 5-10 秒，请耐心等待...\n`);
  
  let successCount = 0;
  for (let i = 0; i < PAGES.length; i++) {
    const success = await generatePage(PAGES[i], i + 1, PAGES.length);
    if (success) successCount++;
    await sleep(3000);
  }
  
  console.log(`\n✨ 完成！成功生成 ${successCount}/${PAGES.length} 个页面`);
  console.log(`📂 请查看 ${OUTPUT_DIR} 目录`);
}

main().catch(console.error);