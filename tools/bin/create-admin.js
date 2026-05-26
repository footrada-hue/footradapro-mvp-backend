#!/usr/bin/env node
// tools/bin/create-admin.js

import { getDb, generateStrongPassword, hashPassword, printCredentials, createPrompt, listAdmins } from '../lib/db-utils.js';

async function main() {
    const db = getDb();
    const rl = createPrompt();

    console.log('\n🔧 创建新管理员\n');

    // 显示现有管理员
    const admins = listAdmins(db);
    if (admins.length > 0) {
        console.log('现有管理员:');
        admins.forEach(a => console.log(`  ${a.id}. ${a.username} - ${a.role}`));
        console.log('');
    }

    rl.question('用户名: ', async (username) => {
        if (!username.trim()) {
            console.log('❌ 用户名不能为空');
            rl.close();
            db.close();
            return;
        }
        
        rl.question('姓名: ', async (name) => {
            if (!name.trim()) {
                console.log('❌ 姓名不能为空');
                rl.close();
                db.close();
                return;
            }
            
            rl.question('邮箱: ', async (email) => {
                rl.question('角色 [super_admin/admin/operator/auditor]: ', async (role) => {
                    const validRoles = ['super_admin', 'admin', 'operator', 'auditor'];
                    if (!validRoles.includes(role)) {
                        console.log('❌ 无效的角色');
                        rl.close();
                        db.close();
                        return;
                    }
                    
                    // 检查用户名
                    const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
                    if (existing) {
                        console.log('❌ 用户名已存在');
                        rl.close();
                        db.close();
                        return;
                    }
                    
                    const password = generateStrongPassword();
                    const hashedPassword = await hashPassword(password);
                    
                    db.prepare(`
                        INSERT INTO admins (username, password, name, email, role, is_active)
                        VALUES (?, ?, ?, ?, ?, 1)
                    `).run(username, hashedPassword, name, email, role);
                    
                    printCredentials(username, password, role);
                    
                    rl.close();
                    db.close();
                });
            });
        });
    });
}

main().catch(console.error);