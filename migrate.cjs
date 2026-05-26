const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html') && !f.includes('admin'));

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // 删除所有旧的 CSS 链接
  content = content.replace(/<link rel="stylesheet" href="\/css\/[^"]+\.css">/g, '');

  // 插入新的 main.css（如果还没有）
  if (!content.includes('main.css')) {
    content = content.replace('</head>', '  <link rel="stylesheet" href="/css/main.css">\n</head>');
  }

  // 可选：为 body 添加一个类（便于调试）
  if (!content.includes('class="modern-ui"')) {
    content = content.replace('<body>', '<body class="modern-ui">');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ 已处理: ${file}`);
});

console.log('🎉 迁移完成！');