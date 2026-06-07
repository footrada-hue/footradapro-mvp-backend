/**
 * 数据库迁移脚本：添加双余额系统字段
 * 支持 SQLite 和 PostgreSQL
 * 
 * 执行方式：
 *   node src/database/migrations/030_add_dual_balance_fields.js
 */

import { getDb, query, initDatabase } from '../connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

// 日志颜色
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 初始化数据库（如果需要）
 */
async function ensureDatabase() {
    try {
        // 尝试获取数据库实例
        const db = getDb();
        if (db) {
            log('✅ 数据库已连接', 'green');
            return true;
        }
    } catch (err) {
        log(`⚠️ 数据库未初始化，正在初始化...`, 'yellow');
    }
    
    try {
        // 初始化数据库
        await initDatabase();
        log('✅ 数据库初始化成功', 'green');
        return true;
    } catch (err) {
        log(`❌ 数据库初始化失败: ${err.message}`, 'red');
        return false;
    }
}

/**
 * 检查 SQLite 表中是否存在某列
 */
function columnExistsSQLite(db, tableName, columnName) {
    try {
        const result = db.prepare(`PRAGMA table_info(${tableName})`).all();
        return result.some(col => col.name === columnName);
    } catch (err) {
        return false;
    }
}

/**
 * 检查 PostgreSQL 表中是否存在某列
 */
async function columnExistsPostgres(tableName, columnName) {
    try {
        const result = await query(`
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            ) as exists
        `, [tableName, columnName]);
        return result[0]?.exists === true;
    } catch (err) {
        return false;
    }
}

/**
 * SQLite 添加列
 */
function addColumnSQLite(db, tableName, columnName, columnType, defaultValue = null) {
    if (columnExistsSQLite(db, tableName, columnName)) {
        log(`  ⏭️  列 ${columnName} 已存在，跳过`, 'yellow');
        return true;
    }
    
    let sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
    if (defaultValue !== null) {
        sql += ` DEFAULT ${defaultValue}`;
    }
    
    try {
        db.prepare(sql).run();
        log(`  ✅ 添加列 ${columnName} 成功`, 'green');
        return true;
    } catch (err) {
        log(`  ❌ 添加列 ${columnName} 失败: ${err.message}`, 'red');
        return false;
    }
}

/**
 * PostgreSQL 添加列
 */
async function addColumnPostgres(tableName, columnName, columnType, defaultValue = null) {
    const exists = await columnExistsPostgres(tableName, columnName);
    if (exists) {
        log(`  ⏭️  列 ${columnName} 已存在，跳过`, 'yellow');
        return true;
    }
    
    let sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
    if (defaultValue !== null) {
        sql += ` DEFAULT ${defaultValue}`;
    }
    
    try {
        await query(sql);
        log(`  ✅ 添加列 ${columnName} 成功`, 'green');
        return true;
    } catch (err) {
        log(`  ❌ 添加列 ${columnName} 失败: ${err.message}`, 'red');
        return false;
    }
}

/**
 * 检查 SQLite 表是否存在
 */
function tableExistsSQLite(db, tableName) {
    try {
        const result = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name=?
        `).get(tableName);
        return !!result;
    } catch (err) {
        return false;
    }
}

/**
 * 检查 PostgreSQL 表是否存在
 */
async function tableExistsPostgres(tableName) {
    try {
        const result = await query(`
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.tables 
                WHERE table_name = $1
            ) as exists
        `, [tableName]);
        return result[0]?.exists === true;
    } catch (err) {
        return false;
    }
}

/**
 * 为 withdraw_requests 表添加 mode 字段
 */
async function addModeToWithdrawRequests() {
    log('\n📋 处理 withdraw_requests 表...', 'blue');
    
    if (isProduction) {
        const exists = await tableExistsPostgres('withdraw_requests');
        if (!exists) {
            log('  ⚠️ withdraw_requests 表不存在，跳过', 'yellow');
            return true;
        }
        return await addColumnPostgres('withdraw_requests', 'mode', 'VARCHAR(10)', "'real'");
    } else {
        const db = getDb();
        const exists = tableExistsSQLite(db, 'withdraw_requests');
        if (!exists) {
            log('  ⚠️ withdraw_requests 表不存在，跳过', 'yellow');
            return true;
        }
        return addColumnSQLite(db, 'withdraw_requests', 'mode', 'VARCHAR(10)', "'real'");
    }
}

/**
 * 初始化现有用户的 test_balance 和 real_balance
 * 将现有 balance 值复制到 real_balance，test_balance 设为 0
 */
async function initializeUserBalances() {
    log('\n📋 初始化用户余额数据...', 'blue');
    
    if (isProduction) {
        try {
            const realExists = await columnExistsPostgres('users', 'real_balance');
            const testExists = await columnExistsPostgres('users', 'test_balance');
            
            if (!realExists && !testExists) {
                log('  ⚠️ 余额列尚未添加，跳过初始化', 'yellow');
                return true;
            }
            
            const result = await query(`
                UPDATE users 
                SET real_balance = COALESCE(real_balance, balance)
                WHERE real_balance IS NULL OR real_balance = 0
            `);
            log(`  ✅ 初始化了 ${result.rowCount} 个用户的 real_balance`, 'green');
            
            await query(`
                UPDATE users 
                SET test_balance = COALESCE(test_balance, 0)
                WHERE test_balance IS NULL
            `);
            log('  ✅ 初始化 test_balance 完成', 'green');
            
            return true;
        } catch (err) {
            log(`  ❌ 初始化失败: ${err.message}`, 'red');
            return false;
        }
    } else {
        const db = getDb();
        try {
            const realExists = columnExistsSQLite(db, 'users', 'real_balance');
            const testExists = columnExistsSQLite(db, 'users', 'test_balance');
            
            if (!realExists && !testExists) {
                log('  ⚠️ 余额列尚未添加，跳过初始化', 'yellow');
                return true;
            }
            
            const result = db.prepare(`
                UPDATE users 
                SET real_balance = COALESCE(real_balance, balance)
                WHERE real_balance IS NULL OR real_balance = 0
            `).run();
            log(`  ✅ 初始化了 ${result.changes} 个用户的 real_balance`, 'green');
            
            db.prepare(`
                UPDATE users 
                SET test_balance = COALESCE(test_balance, 0)
                WHERE test_balance IS NULL
            `).run();
            log('  ✅ 初始化 test_balance 完成', 'green');
            
            return true;
        } catch (err) {
            log(`  ❌ 初始化失败: ${err.message}`, 'red');
            return false;
        }
    }
}

/**
 * 验证迁移结果
 */
async function verifyMigration() {
    log('\n📋 验证迁移结果...', 'blue');
    
    let allSuccess = true;
    
    if (isProduction) {
        const tables = ['users', 'balance_logs', 'withdraw_requests'];
        
        for (const table of tables) {
            const exists = await tableExistsPostgres(table);
            if (!exists) {
                log(`  ⚠️ 表 ${table} 不存在`, 'yellow');
                continue;
            }
            
            if (table === 'users') {
                const hasReal = await columnExistsPostgres('users', 'real_balance');
                const hasTest = await columnExistsPostgres('users', 'test_balance');
                log(`  ${hasReal && hasTest ? '✅' : '❌'} users 表: real_balance=${hasReal}, test_balance=${hasTest}`, hasReal && hasTest ? 'green' : 'red');
                if (!hasReal || !hasTest) allSuccess = false;
            } else if (table === 'balance_logs') {
                const hasMode = await columnExistsPostgres('balance_logs', 'mode');
                log(`  ${hasMode ? '✅' : '❌'} balance_logs 表: mode=${hasMode}`, hasMode ? 'green' : 'red');
                if (!hasMode) allSuccess = false;
            } else if (table === 'withdraw_requests') {
                const hasMode = await columnExistsPostgres('withdraw_requests', 'mode');
                log(`  ${hasMode ? '✅' : '❌'} withdraw_requests 表: mode=${hasMode}`, hasMode ? 'green' : 'red');
                if (!hasMode) allSuccess = false;
            }
        }
    } else {
        const db = getDb();
        const tables = ['users', 'balance_logs', 'withdraw_requests'];
        
        for (const table of tables) {
            const exists = tableExistsSQLite(db, table);
            if (!exists) {
                log(`  ⚠️ 表 ${table} 不存在`, 'yellow');
                continue;
            }
            
            if (table === 'users') {
                const hasReal = columnExistsSQLite(db, 'users', 'real_balance');
                const hasTest = columnExistsSQLite(db, 'users', 'test_balance');
                log(`  ${hasReal && hasTest ? '✅' : '❌'} users 表: real_balance=${hasReal}, test_balance=${hasTest}`, hasReal && hasTest ? 'green' : 'red');
                if (!hasReal || !hasTest) allSuccess = false;
            } else if (table === 'balance_logs') {
                const hasMode = columnExistsSQLite(db, 'balance_logs', 'mode');
                log(`  ${hasMode ? '✅' : '❌'} balance_logs 表: mode=${hasMode}`, hasMode ? 'green' : 'red');
                if (!hasMode) allSuccess = false;
            } else if (table === 'withdraw_requests') {
                const hasMode = columnExistsSQLite(db, 'withdraw_requests', 'mode');
                log(`  ${hasMode ? '✅' : '❌'} withdraw_requests 表: mode=${hasMode}`, hasMode ? 'green' : 'red');
                if (!hasMode) allSuccess = false;
            }
        }
    }
    
    return allSuccess;
}

/**
 * 主函数
 */
async function main() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
    log('║       双余额系统数据库迁移脚本 v1.0.0                      ║', 'blue');
    log('╚════════════════════════════════════════════════════════════╝', 'blue');
    
    log(`\n📌 运行环境: ${isProduction ? '生产环境 (PostgreSQL)' : '开发环境 (SQLite)'}`, 'yellow');
    
    // 确保数据库已初始化
    const dbInitialized = await ensureDatabase();
    if (!dbInitialized) {
        log('\n❌ 无法初始化数据库，请检查数据库配置', 'red');
        process.exit(1);
    }
    
    let hasError = false;
    
    // 1. 为 users 表添加 test_balance 和 real_balance
    log('\n📋 处理 users 表...', 'blue');
    
    if (isProduction) {
        const exists = await tableExistsPostgres('users');
        if (!exists) {
            log('  ❌ users 表不存在！', 'red');
            hasError = true;
        } else {
            const testAdded = await addColumnPostgres('users', 'test_balance', 'DECIMAL(20,2)', '0');
            const realAdded = await addColumnPostgres('users', 'real_balance', 'DECIMAL(20,2)', '0');
            if (!testAdded || !realAdded) hasError = true;
        }
    } else {
        const db = getDb();
        const exists = tableExistsSQLite(db, 'users');
        if (!exists) {
            log('  ❌ users 表不存在！', 'red');
            hasError = true;
        } else {
            const testAdded = addColumnSQLite(db, 'users', 'test_balance', 'DECIMAL(20,2)', '0');
            const realAdded = addColumnSQLite(db, 'users', 'real_balance', 'DECIMAL(20,2)', '0');
            if (!testAdded || !realAdded) hasError = true;
        }
    }
    
    // 2. 为 balance_logs 表添加 mode 字段
    log('\n📋 处理 balance_logs 表...', 'blue');
    
    if (isProduction) {
        const exists = await tableExistsPostgres('balance_logs');
        if (!exists) {
            log('  ⚠️ balance_logs 表不存在，跳过', 'yellow');
        } else {
            const modeAdded = await addColumnPostgres('balance_logs', 'mode', 'VARCHAR(10)', "'real'");
            if (!modeAdded) hasError = true;
        }
    } else {
        const db = getDb();
        const exists = tableExistsSQLite(db, 'balance_logs');
        if (!exists) {
            log('  ⚠️ balance_logs 表不存在，跳过', 'yellow');
        } else {
            const modeAdded = addColumnSQLite(db, 'balance_logs', 'mode', 'VARCHAR(10)', "'real'");
            if (!modeAdded) hasError = true;
        }
    }
    
    // 3. 为 withdraw_requests 表添加 mode 字段
    const withdrawModeAdded = await addModeToWithdrawRequests();
    if (!withdrawModeAdded) hasError = true;
    
    // 4. 初始化现有用户余额
    const initSuccess = await initializeUserBalances();
    if (!initSuccess) hasError = true;
    
    // 5. 验证迁移结果
    const verifySuccess = await verifyMigration();
    
    // 输出总结
    log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
    if (!hasError && verifySuccess) {
        log('║                   ✅ 迁移完成！                          ║', 'green');
        log('║                                                          ║', 'green');
        log('║  已添加字段:                                             ║', 'green');
        log('║    - users.test_balance (测试模式余额)                   ║', 'green');
        log('║    - users.real_balance (真实模式余额)                   ║', 'green');
        log('║    - balance_logs.mode (记录模式)                        ║', 'green');
        log('║    - withdraw_requests.mode (提现模式)                   ║', 'green');
        log('╚════════════════════════════════════════════════════════════╝', 'green');
    } else {
        log('║                   ❌ 迁移过程中出现错误                    ║', 'red');
        log('║                                                          ║', 'red');
        log('║  请检查：                                                ║', 'red');
        log('║    1. 数据库连接是否正常                                  ║', 'red');
        log('║    2. 是否有足够的权限                                    ║', 'red');
        log('║    3. 表结构是否与脚本预期一致                            ║', 'red');
        log('╚════════════════════════════════════════════════════════════╝', 'red');
        process.exit(1);
    }
    
    log('\n💡 提示: 如果数据库已有部分字段，脚本会自动跳过\n', 'yellow');
}

// 执行迁移
main().catch(err => {
    log(`\n❌ 迁移脚本执行失败: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});