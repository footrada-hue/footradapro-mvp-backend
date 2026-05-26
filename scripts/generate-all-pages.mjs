import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ 请在 .env 文件中配置 DEEPSEEK_API_KEY');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '../v2');
const JS_DIR = path.join(__dirname, '../v2/js/user');

const PAGES = [
  { name: 'profile', title: 'My Profile · FootRadaPro', controller: 'profile_controller.js', description: '个人资料页面' },
  { name: 'deposit', title: 'Deposit Funds · FootRadaPro', controller: 'deposit_controller.js', description: '存款页面' },
  { name: 'withdraw', title: 'Withdraw · FootRadaPro', controller: 'withdraw.js', description: '提现页面' },
  { name: 'login', title: 'Sign In · FootRadaPro', controller: 'login_controller.js', description: '登录页面' },
  { name: 'register', title: 'Create Account · FootRadaPro', controller: 'register_controller.js', description: '注册页面' },
  { name: 'transaction-list', title: 'Transaction History · FootRadaPro', controller: 'transaction-list.js', description: '交易记录列表页面' },
  { name: 'transaction-detail', title: 'Transaction Detail · FootRadaPro', controller: 'transaction-detail.js', description: '交易详情页面' },
  { name: 'authorizations', title: 'My Authorizations · FootRadaPro', controller: 'authorizations.js', description: '授权列表页面' },
  { name: 'fund-detail', title: 'Fund Detail · FootRadaPro', controller: 'fund-detail.js', description: '资金明细页面' },
  { name: 'settings', title: 'Settings · FootRadaPro', controller: 'settings.js', description: '系统设置页面' },
  { name: 'support', title: 'Support Center · FootRadaPro', controller: 'support_controller.js', description: '客服支持页面' }
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
          content: `你是一个前端开发专家。根据 JavaScript 控制器代码，智能重构出该页面的 HTML 结构。

【核心原则】：
1. 只继承首页的**设计系统**（颜色变量、玻璃质感、圆角、阴影），不继承首页的布局
2. 根据 JS 代码分析出的功能，自主设计合理的布局（该有多少边框就多少边框）
3. 使用以下 CSS 变量：--bg-primary, --card-bg, --accent, --glass-shadow, --border-radius
4. 玻璃质感：background: var(--card-bg); backdrop-filter: blur(20px); border-radius: 24px;
5. 响应式设计，移动端适配
6. 只输出 <main class="content"> 内部的内容，不要输出外部框架
7. 不要添加任何解释文字`
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
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

async function generatePage(pageConfig) {
  console.log(`\n📄 生成: ${pageConfig.name}.html`);
  
  const jsContent = readJSFile(pageConfig.controller);
  if (!jsContent) {
    console.log(`  ⚠️ 未找到 ${pageConfig.controller}`);
    return false;
  }
  
  const prompt = `请根据以下 JavaScript 代码，智能重构 ${pageConfig.description}。

JavaScript 代码：
${jsContent.substring(0, 6000)}

【分析步骤】：
1. 这个页面有哪些功能模块？
2. 需要展示什么数据？
3. 用户能进行什么操作？

【设计要求】：
- 根据功能模块数量，设计合理的布局（单列/两列/网格）
- 使用玻璃质感设计风格
- 使用以下 CSS 类名：card, grid, row, amount, badge, event-btn
- 只输出 HTML 代码`;

  try {
    console.log(`  🤖 调用 DeepSeek API 分析...`);
    const content = await callDeepSeek(prompt);
    
    // 读取模板（只取样式和全局状态，不取布局）
    const template = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
  <title>${pageConfig.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    /* 从首页复制的完整样式（变量、玻璃质感、响应式） */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px;
      --font-xs: 0.75rem; --font-sm: 0.875rem; --font-base: 1rem; --font-lg: 1.125rem; --font-xl: 1.25rem;
      --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    }
    :root {
      --bg-gradient-start: rgba(248, 250, 252, 0.92);
      --bg-gradient-end: rgba(241, 245, 249, 0.96);
      --glass-bg: rgba(255, 255, 255, 0.48);
      --glass-border: rgba(59, 130, 246, 0.18);
      --glass-shadow: 0 4px 16px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.01), inset 0 1px 0 rgba(255,255,255,0.9);
      --accent: #2563eb;
      --accent-gradient: linear-gradient(135deg, #2563eb, #4f46e5);
      --success: #10b981;
      --text-primary: #0f172a;
      --text-secondary: #334155;
      --text-muted: #64748b;
      --border-light: rgba(148,163,184,0.18);
      --card-bg: rgba(255,255,255,0.62);
      --ticker-bg: rgba(37,99,235,0.92);
      --badge-soft: rgba(37,99,235,0.1);
    }
    body.dark {
      --bg-gradient-start: rgba(10,16,30,0.94);
      --bg-gradient-end: rgba(2,6,18,0.98);
      --glass-bg: rgba(20,28,44,0.52);
      --glass-border: rgba(59,130,246,0.28);
      --accent: #3b82f6;
      --accent-gradient: linear-gradient(135deg, #3b82f6, #8b5cf6);
      --success: #34d399;
      --text-primary: #f1f5f9;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      --card-bg: rgba(20,28,44,0.58);
    }
    body {
      background: radial-gradient(ellipse at 30% 40%, var(--bg-gradient-start), var(--bg-gradient-end));
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
    }
    body::before {
      content: ''; position: fixed; top:0; left:0; width:100%; height:100%;
      background-image: repeating-linear-gradient(90deg, rgba(59,130,246,0.02) 0px, rgba(59,130,246,0.02) 1px, transparent 1px, transparent 40px);
      pointer-events: none; z-index:0;
    }
    .app-wrapper { position: relative; z-index:1; min-height:100vh; display:flex; flex-direction:column; }
    .ticker { background: var(--ticker-bg); backdrop-filter: blur(16px); color: white; padding: 10px 0; font-size: var(--font-sm); white-space: nowrap; overflow: hidden; }
    .ticker-content { display: inline-block; animation: ticker 32s linear infinite; padding-left: 100%; }
    @keyframes ticker { to { transform: translateX(-100%); } }
    .header { background: var(--glass-bg); backdrop-filter: blur(24px); border-bottom: 1px solid var(--glass-border); padding: var(--space-4) var(--space-6); position: sticky; top:0; z-index:50; display: flex; justify-content: space-between; align-items: center; }
    .logo { display: flex; align-items: center; gap: var(--space-3); }
    .logo-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .logo-text { font-size: var(--font-xl); font-weight: 700; background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .header-actions { display: flex; gap: var(--space-5); align-items: center; }
    .user-badge { width: 38px; height: 38px; border-radius: 50%; background: var(--badge-soft); display: flex; align-items: center; justify-content: center; font-weight: 600; border: 1px solid var(--glass-border); }
    .container { display: flex; flex:1; padding: var(--space-6); gap: var(--space-6); max-width: 1400px; margin: 0 auto; width: 100%; }
    .content { flex:1; }
    .card { background: var(--card-bg); backdrop-filter: blur(28px); border-radius: 28px; border: 1px solid var(--glass-border); padding: var(--space-6); transition: all 0.2s; }
    .card-title { font-size: var(--font-lg); font-weight: 600; margin-bottom: var(--space-5); display: flex; align-items: center; gap: var(--space-2); }
    .card-title i { color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-6); }
    .row { display: flex; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--border-light); font-size: var(--font-sm); }
    .amount { font-size: var(--font-3xl); font-weight: 700; font-family: monospace; background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; margin: var(--space-3) 0; }
    .badge { display: inline-flex; align-items: center; gap: var(--space-2); padding: 6px 14px; border-radius: 60px; font-size: var(--font-xs); font-weight: 500; backdrop-filter: blur(8px); }
    .badge.success { background: rgba(16,185,129,0.12); color: var(--success); }
    .event-btn { width: 100%; padding: 12px; border-radius: 60px; background: var(--accent-gradient); color: white; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s; }
    .amount-input { display: flex; gap: 12px; background: var(--badge-soft); border-radius: 60px; padding: 12px 20px; }
    .amount-input input { flex:1; background: none; border: none; color: var(--text-primary); font-size: 16px; outline: none; }
    .amount-presets { display: flex; gap: 12px; margin: 20px 0; }
    .amount-preset { background: rgba(30,38,50,0.6); border: none; padding: 10px; border-radius: 40px; color: var(--text-secondary); font-weight: 500; cursor: pointer; flex:1; text-align: center; }
    .amount-preset.active { background: var(--accent); color: white; }
    .fab { position: fixed; bottom: 28px; right: 28px; width: 56px; height: 56px; border-radius: 30px; background: var(--accent-gradient); display: flex; align-items: center; justify-content: center; z-index: 55; cursor: pointer; }
    .bottom-nav { display: none; position: fixed; bottom:0; left:0; right:0; background: var(--card-bg); backdrop-filter: blur(32px); border-top: 1px solid var(--glass-border); padding: var(--space-3) var(--space-5); z-index:60; }
    .bottom-nav-items { display: flex; justify-content: space-around; max-width:500px; margin:0 auto; }
    .nav-item { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); font-size: var(--font-xs); color: var(--text-muted); cursor: pointer; }
    .nav-item.active { color: var(--accent); }
    .nav-item i { font-size: 22px; }
    @media (max-width: 899px) { .bottom-nav { display: block; } body { padding-bottom: 70px; } .fab { bottom: 80px; } .grid { grid-template-columns: 1fr; } }
    @media (max-width: 599px) { .header { padding: var(--space-3) var(--space-4); } .logo-text { font-size: var(--font-lg); } }
  </style>
</head>
<body>
<div class="app-wrapper">
  <div class="ticker"><div class="ticker-content">⚡ SYSTEM STATUS: ACTIVE · AI POWERED TRADING</div></div>
  <div class="header">
    <div class="logo"><div class="logo-icon">⚽</div><div class="logo-text">FootRadaPro</div></div>
    <div class="header-actions"><i class="fa-regular fa-moon" id="themeToggle"></i><div class="user-badge">EN</div></div>
  </div>
  <div class="container">
    <main class="content">
      ${content}
    </main>
  </div>
  <div class="bottom-nav"><div class="bottom-nav-items"><div class="nav-item" data-nav="home"><i class="fa-solid fa-home"></i><span>Home</span></div><div class="nav-item active" data-nav="market"><i class="fa-solid fa-chart-line"></i><span>Market</span></div><div class="nav-item" data-nav="profile"><i class="fa-solid fa-user"></i><span>Profile</span></div></div></div>
  <div class="fab" onclick="alert('Support')"><i class="fa-solid fa-comment-dots"></i></div>
</div>
<script>
  function getThemeMode() { return localStorage.getItem('theme') || 'light'; }
  function setThemeMode(theme) { localStorage.setItem('theme', theme); updateThemeUI(); }
  function updateThemeUI() { if (getThemeMode() === 'dark') document.body.classList.add('dark'); else document.body.classList.remove('dark'); const icon = document.getElementById('themeToggle'); if (icon) icon.classList.toggle('fa-sun', getThemeMode() === 'dark'); else icon.classList.toggle('fa-moon', getThemeMode() !== 'dark'); }
  document.getElementById('themeToggle')?.addEventListener('click', () => setThemeMode(getThemeMode() === 'dark' ? 'light' : 'dark'));
  updateThemeUI();
</script>
</body>
</html>`;
    
    const outputPath = path.join(OUTPUT_DIR, `${pageConfig.name}.html`);
    fs.writeFileSync(outputPath, template, 'utf-8');
    console.log(`  ✅ 已保存: ${pageConfig.name}.html`);
    return true;
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FootRadaPro AI 页面生成脚本 v7.0                        ║');
  console.log('║     智能重构：继承设计系统，自主设计布局                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  let successCount = 0;
  for (let i = 0; i < PAGES.length; i++) {
    const success = await generatePage(PAGES[i]);
    if (success) successCount++;
    await sleep(3000);
  }
  
  console.log(`\n✨ 完成！成功生成 ${successCount}/${PAGES.length} 个页面`);
}

main().catch(console.error);