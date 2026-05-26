/**
 * 數據庫遷移執行腳本
 * 使用 better-sqlite3（同步操作）
 * 
 * 使用方法: 
 * node src/database/migrations/run.js
 * node src/database/migrations/run.js --specific=014_ticker_messages_upgrade.sql
 * node src/database/migrations/run.js 014_ticker_messages_upgrade.sql
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
    dbPath: path.join(__dirname, '..', 'data', 'footradapro.sqlite'),
    migrationsDir: __dirname,
    migrationsTable: 'migrations_log'
};

// 顏色輸出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

const log = (msg, color = colors.reset) => console.log(color + msg + colors.reset);

// 解析命令行參數
const args = process.argv.slice(2);
let specificMigration = null;

// 正確解析參數
args.forEach(arg => {
    // 處理 --specific=filename.sql 格式
    if (arg.startsWith('--specific=')) {
        specificMigration = arg.replace('--specific=', '');
    } 
    // 處理直接傳入 filename.sql 格式
    else if (arg.endsWith('.sql') && !arg.startsWith('--')) {
        specificMigration = arg;
    }
});

class MigrationRunner {
    constructor() {
        this.db = null;
        this.migrations = [];
    }

    // 初始化
    init() {
        log('\n📦 初始化遷移工具...', colors.cyan);
        
        // 檢查數據庫
        if (!fs.existsSync(CONFIG.dbPath)) {
            log(`❌ 數據庫不存在: ${CONFIG.dbPath}`, colors.red);
            log('請先啟動應用程序創建數據庫', colors.yellow);
            process.exit(1);
        }

        // 連接數據庫
        this.db = new Database(CONFIG.dbPath);
        log('✅ 數據庫連接成功', colors.green);

        // 啟用外鍵約束
        this.db.exec('PRAGMA foreign_keys = ON');
        
        // 創建遷移記錄表
        this.createMigrationsTable();
    }

    // 創建遷移記錄表
    createMigrationsTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${CONFIG.migrationsTable} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT,
                execution_time INTEGER
            )
        `);
        log('✅ 遷移記錄表已準備', colors.green);
    }

    // 獲取已執行的遷移
    getAppliedMigrations() {
        const stmt = this.db.prepare(`SELECT name FROM ${CONFIG.migrationsTable}`);
        return stmt.all().map(row => row.name);
    }

    // 計算文件校驗和
    calculateChecksum(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        // 簡單的校驗和
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) - hash) + content.charCodeAt(i);
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    // 獲取所有遷移文件
    loadMigrationFiles() {
        const files = fs.readdirSync(CONFIG.migrationsDir)
            .filter(f => f.endsWith('.sql') && f !== 'run.js')
            .sort(); // 按文件名排序確保順序

        log(`\n📋 找到 ${files.length} 個遷移文件`, colors.magenta);
        
        this.migrations = files.map(file => ({
            name: file,
            path: path.join(CONFIG.migrationsDir, file),
            applied: false
        }));
    }

    // 檢查遷移狀態
    checkMigrationStatus() {
        const applied = this.getAppliedMigrations();
        
        this.migrations.forEach(m => {
            m.applied = applied.includes(m.name);
        });

        log('\n📊 遷移狀態:', colors.cyan);
        this.migrations.forEach(m => {
            const status = m.applied ? '✅ 已執行' : '⏳ 待執行';
            const color = m.applied ? colors.green : colors.yellow;
            log(`  ${m.name}: ${status}`, color);
        });
    }

    // 執行單個遷移
    runMigration(migration) {
        log(`\n⚡ 執行: ${migration.name}`, colors.cyan);
        
        const startTime = Date.now();
        const checksum = this.calculateChecksum(migration.path);
        
        try {
            // 讀取 SQL
            const sql = fs.readFileSync(migration.path, 'utf8');
            
            // 分割 SQL 語句
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('SELECT'));
            
            log(`📋 執行 ${statements.length} 條 SQL 語句`, colors.magenta);
            
            // 開始事務
            this.db.exec('BEGIN TRANSACTION');
            
            // 執行每條語句
            let successCount = 0;
            for (let i = 0; i < statements.length; i++) {
                try {
                    this.db.exec(statements[i]);
                    successCount++;
                    
                    // 顯示進度
                    if (i % 5 === 0 || i === statements.length - 1) {
                        const percent = Math.round((i + 1) / statements.length * 100);
                        process.stdout.write(`\r  進度: ${percent}% (${i + 1}/${statements.length})`);
                    }
                } catch (err) {
                    // 如果是字段已存在或表已存在，忽略錯誤
                    if (err.message.includes('duplicate column name') || 
                        err.message.includes('already exists')) {
                        successCount++;
                    } else {
                        throw err;
                    }
                }
            }
            console.log(); // 換行
            
            // 記錄遷移
            const stmt = this.db.prepare(`
                INSERT INTO ${CONFIG.migrationsTable} (name, checksum, execution_time)
                VALUES (?, ?, ?)
            `);
            stmt.run(migration.name, checksum, Date.now() - startTime);
            
            // 提交事務
            this.db.exec('COMMIT');
            
            log(`✅ 完成: ${migration.name} (${Date.now() - startTime}ms)`, colors.green);
            log(`   📊 成功執行 ${successCount} 條語句`, colors.cyan);
            
            return true;
            
        } catch (err) {
            // 回滾事務
            this.db.exec('ROLLBACK');
            log(`❌ 失敗: ${migration.name}`, colors.red);
            log(`   ${err.message}`, colors.red);
            return false;
        }
    }

    // 執行所有待執行的遷移
    runPendingMigrations() {
        const pending = this.migrations.filter(m => !m.applied);
        
        if (specificMigration) {
            // 執行指定遷移
            const migration = this.migrations.find(m => m.name === specificMigration);
            if (!migration) {
                log(`❌ 找不到遷移文件: ${specificMigration}`, colors.red);
                return false;
            }
            return this.runMigration(migration);
            
        } else if (pending.length === 0) {
            log('\n✨ 所有遷移都已執行', colors.green);
            return true;
            
        } else {
            log(`\n🚀 開始執行 ${pending.length} 個待執行遷移...`, colors.cyan);
            
            for (const migration of pending) {
                const success = this.runMigration(migration);
                if (!success) {
                    log('\n❌ 遷移過程中斷', colors.red);
                    return false;
                }
            }
            
            return true;
        }
    }

    // 驗證遷移結果
    verifyMigration() {
        log('\n🔍 驗證遷移結果...', colors.cyan);
        
        try {
            // 檢查 ticker_messages 表是否存在
            const tableExists = this.db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='ticker_messages'
            `).get();
            
            if (!tableExists) {
                log('❌ ticker_messages 表不存在', colors.red);
                return false;
            }
            
            // 檢查 ticker_messages 表結構
            const tableInfo = this.db.prepare("PRAGMA table_info(ticker_messages)").all();
            
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
            
            // 統計數據
            const count = this.db.prepare('SELECT COUNT(*) as count FROM ticker_messages').get();
            log(`\n📈 當前動態數量: ${count.count} 條`, colors.cyan);
            
            return allFieldsExist;
            
        } catch (err) {
            log(`❌ 驗證失敗: ${err.message}`, colors.red);
            return false;
        }
    }

    // 備份數據庫
    backup() {
        const timestamp = Date.now();
        const backupPath = CONFIG.dbPath.replace('.sqlite', `_backup_${timestamp}.sqlite`);
        
        try {
            log(`\n💾 創建備份: ${backupPath}`, colors.cyan);
            
            // 使用 better-sqlite3 的備份功能
            // 修正：傳入字符串路徑
            this.db.backup(backupPath);
            
            // 驗證備份文件是否存在
            if (fs.existsSync(backupPath)) {
                const stats = fs.statSync(backupPath);
                log(`✅ 備份成功: ${backupPath} (${(stats.size / 1024).toFixed(2)} KB)`, colors.green);
                return backupPath;
            } else {
                throw new Error('備份文件未創建');
            }
            
        } catch (err) {
            log(`❌ 備份失敗: ${err.message}`, colors.red);
            return null;
        }
    }

    // 關閉連接
    close() {
        if (this.db) {
            this.db.close();
            log('\n📁 數據庫連接已關閉', colors.cyan);
        }
    }
}

// 主函數
async function main() {
    log('============================================', colors.cyan);
    log('        數據庫遷移工具 v2.0', colors.cyan);
    log('============================================', colors.cyan);
    
    if (specificMigration) {
        log(`🎯 指定執行: ${specificMigration}`, colors.magenta);
    }
    
    const runner = new MigrationRunner();
    
    try {
        // 初始化
        runner.init();
        
        // 加載遷移文件
        runner.loadMigrationFiles();
        
        // 檢查狀態
        runner.checkMigrationStatus();
        
        // 如果指定了遷移但已經執行過，詢問是否重新執行
        if (specificMigration) {
            const migration = runner.migrations.find(m => m.name === specificMigration);
            if (migration && migration.applied) {
                log(`\n⚠️  遷移 ${specificMigration} 已經執行過`, colors.yellow);
                
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const answer = await new Promise(resolve => {
                    rl.question('是否重新執行？(y/N): ', resolve);
                });
                rl.close();
                
                if (answer.toLowerCase() !== 'y') {
                    log('❌ 操作取消', colors.red);
                    runner.close();
                    return;
                }
            }
        }
        
        // 詢問是否繼續
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            rl.question('\n是否繼續執行遷移？(y/N): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== 'y') {
            log('❌ 操作取消', colors.red);
            runner.close();
            return;
        }
        
        // 備份
        const backupAnswer = await new Promise(resolve => {
            const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl2.question('是否創建數據庫備份？(Y/n): ', (ans) => {
                rl2.close();
                resolve(ans);
            });
        });
        
        if (backupAnswer.toLowerCase() !== 'n') {
            const backupPath = runner.backup();
            if (!backupPath) {
                const continueAnswer = await new Promise(resolve => {
                    const rl3 = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    rl3.question('備份失敗，是否繼續？(y/N): ', resolve);
                });
                
                if (continueAnswer.toLowerCase() !== 'y') {
                    log('❌ 操作取消', colors.red);
                    runner.close();
                    return;
                }
            }
        }
        
        // 執行遷移
        const success = runner.runPendingMigrations();
        
        if (success) {
            // 驗證結果
            if (specificMigration && specificMigration.includes('ticker_messages')) {
                runner.verifyMigration();
            }
            
            log('\n============================================', colors.green);
            log('      🎉 遷移完成！', colors.green);
            log('============================================', colors.green);
        }
        
    } catch (err) {
        log(`\n❌ 錯誤: ${err.message}`, colors.red);
        if (err.stack) {
            console.error(err.stack);
        }
        process.exit(1);
    } finally {
        runner.close();
    }
}

// 執行
main();