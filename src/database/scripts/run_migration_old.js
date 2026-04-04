/**
 * 數據庫遷移執行腳本
 * 支持 ES Modules 語法
 * 使用方法: node src/database/run_migration.js
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
    dbPath: path.join(__dirname, 'data', 'footradapro.sqlite'),
    migrationsDir: path.join(__dirname, 'migrations'),
    migrationTable: 'migrations',
    targetMigration: '014_ticker_messages_upgrade.sql'
};

// 創建命令行交互界面
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 顏色輸出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = colors.reset) {
    console.log(color + message + colors.reset);
}

async function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function checkDatabase() {
    log('\n📁 檢查數據庫...', colors.cyan);
    
    if (!fs.existsSync(CONFIG.dbPath)) {
        log(`❌ 數據庫文件不存在: ${CONFIG.dbPath}`, colors.red);
        log('請確認數據庫路徑是否正確', colors.yellow);
        return false;
    }
    
    const stats = fs.statSync(CONFIG.dbPath);
    log(`✅ 數據庫文件存在: ${CONFIG.dbPath}`, colors.green);
    log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)} KB`, colors.cyan);
    return true;
}

async function checkMigrationFile() {
    log('\n📄 檢查遷移文件...', colors.cyan);
    
    const migrationPath = path.join(CONFIG.migrationsDir, CONFIG.targetMigration);
    
    if (!fs.existsSync(migrationPath)) {
        log(`❌ 遷移文件不存在: ${migrationPath}`, colors.red);
        return false;
    }
    
    const content = fs.readFileSync(migrationPath, 'utf8');
    const lineCount = content.split('\n').length;
    
    log(`✅ 遷移文件存在: ${migrationPath}`, colors.green);
    log(`📝 文件大小: ${content.length} 字符, ${lineCount} 行`, colors.cyan);
    
    // 預覽 SQL（只顯示前5行）
    const preview = content.split('\n').slice(0, 5).join('\n');
    log('\n📋 SQL預覽 (前5行):', colors.magenta);
    console.log(preview + '...\n');
    
    return true;
}

async function createMigrationTable(db) {
    log('\n📦 創建遷移記錄表...', colors.cyan);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum TEXT
        )
    `);
    
    log('✅ 遷移記錄表已就緒', colors.green);
}

async function isMigrationApplied(db) {
    const result = await db.get(
        'SELECT * FROM migrations WHERE name = ?',
        CONFIG.targetMigration
    );
    return !!result;
}

async function calculateChecksum() {
    const migrationPath = path.join(CONFIG.migrationsDir, CONFIG.targetMigration);
    const content = fs.readFileSync(migrationPath, 'utf8');
    
    // 簡單的 checksum（移除註釋和空白行）
    const cleanContent = content
        .replace(/--.*$/gm, '') // 移除註釋
        .replace(/\s+/g, ' ')    // 壓縮空白
        .trim();
    
    let hash = 0;
    for (let i = 0; i < cleanContent.length; i++) {
        const char = cleanContent.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return hash.toString(16);
}

async function backupDatabase() {
    log('\n💾 創建數據庫備份...', colors.cyan);
    
    const backupPath = CONFIG.dbPath.replace('.sqlite', `_backup_${Date.now()}.sqlite`);
    
    try {
        fs.copyFileSync(CONFIG.dbPath, backupPath);
        log(`✅ 備份成功: ${backupPath}`, colors.green);
        return backupPath;
    } catch (err) {
        log(`❌ 備份失敗: ${err.message}`, colors.red);
        return null;
    }
}

async function executeMigration(db, backupPath) {
    log('\n⚡ 執行遷移...', colors.cyan);
    
    const migrationPath = path.join(CONFIG.migrationsDir, CONFIG.targetMigration);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // 分割 SQL 語句
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('SELECT'));
    
    log(`📋 準備執行 ${statements.length} 條 SQL 語句`, colors.magenta);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    try {
        // 開始事務
        await db.run('BEGIN TRANSACTION');
        log('📦 開始事務', colors.cyan);
        
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            try {
                await db.run(stmt);
                successCount++;
                
                // 顯示進度
                if (i % 5 === 0 || i === statements.length - 1) {
                    const percent = Math.round((i + 1) / statements.length * 100);
                    process.stdout.write(`\r  進度: ${percent}% (${i + 1}/${statements.length})`);
                }
            } catch (err) {
                // 如果是字段已存在的錯誤，可以忽略
                if (err.message.includes('duplicate column name')) {
                    successCount++;
                } else {
                    errorCount++;
                    errors.push(`語句 ${i + 1}: ${err.message}`);
                }
            }
        }
        
        console.log(); // 換行
        
        if (errorCount === 0) {
            // 記錄遷移
            const checksum = await calculateChecksum();
            await db.run(
                'INSERT INTO migrations (name, checksum) VALUES (?, ?)',
                CONFIG.targetMigration,
                checksum
            );
            
            // 提交事務
            await db.run('COMMIT');
            log('✅ 事務提交成功', colors.green);
            
        } else {
            throw new Error(`有 ${errorCount} 條語句執行失敗`);
        }
        
    } catch (err) {
        // 回滾事務
        await db.run('ROLLBACK');
        log('❌ 事務回滾', colors.red);
        
        // 如果有備份，提示恢復
        if (backupPath) {
            log(`\n⚠️  建議恢復備份: ${backupPath}`, colors.yellow);
        }
        
        log('\n❌ 錯誤詳情:', colors.red);
        errors.forEach(err => log(`  • ${err}`, colors.red));
        
        throw err;
    }
    
    log(`\n✅ 執行完成: ${successCount} 條成功, ${errorCount} 條失敗`, colors.green);
}

async function verifyMigration(db) {
    log('\n🔍 驗證遷移結果...', colors.cyan);
    
    try {
        // 檢查表結構
        const tableInfo = await db.all("PRAGMA table_info(ticker_messages)");
        
        log('\n📋 ticker_messages 表現有字段:', colors.magenta);
        
        const expectedFields = [
            'id', 'type', 'message', 'match_id', 'display_name', 
            'amount', 'profit', 'weight', 'is_active', 'created_by',
            'created_at', 'updated_at', 'expires_at'
        ];
        
        let allFieldsExist = true;
        
        expectedFields.forEach(field => {
            const exists = tableInfo.some(col => col.name === field);
            const mark = exists ? '✅' : '❌';
            const color = exists ? colors.green : colors.red;
            log(`  ${mark} ${field}`, color);
            
            if (!exists) allFieldsExist = false;
        });
        
        if (allFieldsExist) {
            log('\n✅ 所有字段驗證通過', colors.green);
        } else {
            log('\n⚠️  部分字段缺失', colors.yellow);
        }
        
        // 檢查索引
        const indexes = await db.all("PRAGMA index_list(ticker_messages)");
        log('\n📊 現有索引:', colors.cyan);
        indexes.forEach(idx => {
            log(`  • ${idx.name}`, colors.green);
        });
        
        // 統計數據
        const stats = await db.get('SELECT COUNT(*) as count FROM ticker_messages');
        log(`\n📈 當前動態數量: ${stats.count} 條`, colors.magenta);
        
    } catch (err) {
        log(`❌ 驗證失敗: ${err.message}`, colors.red);
    }
}

async function main() {
    log('============================================', colors.cyan);
    log('      ticker_messages 表升級遷移工具       ', colors.cyan);
    log('============================================', colors.cyan);
    
    try {
        // 1. 檢查環境
        if (!await checkDatabase()) process.exit(1);
        if (!await checkMigrationFile()) process.exit(1);
        
        // 2. 連接數據庫
        const db = await open({
            filename: CONFIG.dbPath,
            driver: sqlite3.Database
        });
        
        log('\n🔌 已連接到數據庫', colors.green);
        
        // 3. 創建遷移記錄表
        await createMigrationTable(db);
        
        // 4. 檢查是否已執行
        const applied = await isMigrationApplied(db);
        if (applied) {
            log(`\n⚠️  遷移 ${CONFIG.targetMigration} 已經執行過`, colors.yellow);
            
            const answer = await askQuestion('是否重新執行？(y/N): ');
            if (answer.toLowerCase() !== 'y') {
                log('❌ 操作取消', colors.red);
                await db.close();
                rl.close();
                return;
            }
        }
        
        // 5. 備份數據庫
        const answer = await askQuestion('是否創建數據庫備份？(Y/n): ');
        let backupPath = null;
        if (answer.toLowerCase() !== 'n') {
            backupPath = await backupDatabase();
        }
        
        // 6. 執行遷移
        await executeMigration(db, backupPath);
        
        // 7. 驗證結果
        await verifyMigration(db);
        
        // 8. 關閉連接
        await db.close();
        
        log('\n============================================', colors.green);
        log('      🎉 遷移完成！', colors.green);
        log('============================================', colors.green);
        
    } catch (err) {
        log(`\n❌ 遷移失敗: ${err.message}`, colors.red);
        if (err.stack) {
            log(err.stack, colors.red);
        }
        process.exit(1);
    } finally {
        rl.close();
    }
}

// 執行遷移
main();