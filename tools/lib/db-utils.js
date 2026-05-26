// tools/lib/db-utils.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库路径
const DB_PATH = path.join(__dirname, '../../../src/database/data/footradapro.sqlite');

// 创建readline接口
export function createPrompt() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// 获取数据库连接
export function getDb() {
    return new Database(DB_PATH);
}

// 生成强密码
export function generateStrongPassword(length = 12) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < length - 4; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

// 密码加密
export async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

// 安全打印凭证
export function printCredentials(username, password, role) {
    console.log('\n' + '='.repeat(60));
    console.log('🔐 管理员凭证（请立即保存！）');
    console.log('='.repeat(60));
    console.log(`用户名: ${username}`);
    console.log(`密  码: ${password}`);
    console.log(`角  色: ${role}`);
    console.log('='.repeat(60));
    console.log('⚠️  此密码只会显示一次，关闭后无法找回！');
    console.log('='.repeat(60) + '\n');
}

// 列出所有管理员
export function listAdmins(db) {
    return db.prepare('SELECT id, username, name, role FROM admins ORDER BY id').all();
}