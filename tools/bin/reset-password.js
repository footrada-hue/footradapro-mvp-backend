#!/usr/bin/env node
// tools/bin/reset-password.js

import { getDb, generateStrongPassword, hashPassword, printCredentials, createPrompt, listAdmins } from '../lib/db-utils.js';

async function main() {
    const db = getDb();
    const rl = createPrompt();

    console.log('\n🔐 重置管理员密码\n');

    const admins = listAdmins(db);
    if (admins.length === 0) {
        console.log('❌ 没有管理员，请先创建');
        rl.close();
        db.close();
        return;
    }

    console.log('管理员列表:');
    admins.forEach(a => console.log(`  ${a.id}. ${a.username} - ${a.role}`));
    console.log('');

    rl.question('请输入管理员ID: ', async (input) => {
        const adminId = parseInt(input);
        const admin = admins.find(a => a.id === adminId);
        
        if (!admin) {
            console.log('❌ 管理员ID不存在');
            rl.close();
            db.close();
            return;
        }
        
        const newPassword = generateStrongPassword();
        const hashedPassword = await hashPassword(newPassword);
        
        db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashedPassword, adminId);
        
        printCredentials(admin.username, newPassword, admin.role);
        
        rl.close();
        db.close();
    });
}

main().catch(console.error);