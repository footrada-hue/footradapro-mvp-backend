const fs = require('fs');
const path = require('path');

// 备份路径
const backupPath = 'C:/Users/T100/footradapro-mvp/css_backup_1775392937741';
const projectPath = 'C:/Users/T100/footradapro-mvp';

// 复制所有文件从备份到项目（强制覆盖）
function restoreAll() {
    const files = fs.readdirSync(backupPath);
    
    files.forEach(file => {
        const backupFile = path.join(backupPath, file);
        const targetFile = path.join(projectPath, file);
        
        if (fs.statSync(backupFile).isFile()) {
            fs.copyFileSync(backupFile, targetFile);
            console.log(`✅ 恢复: ${file}`);
        }
    });
    
    console.log('\n🎉 恢复完成！');
    console.log('如果还是乱，说明HTML文件被改了，请告诉我，我帮您恢复HTML');
}

restoreAll();