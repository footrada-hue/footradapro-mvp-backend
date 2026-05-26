/**
 * 為測試用戶添加 email 到 username 字段
 * 運行: node fix-test-users-email.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'src/database/data/footradapro.sqlite');
const db = new sqlite3.Database(dbPath);

async function fixTestUsers() {
    console.log('🔧 開始修復測試用戶...\n');

    const testUsers = [
        { id: 9991, username: '清算測試A', email: 'testa@footrada.com' },
        { id: 9992, username: '清算測試B', email: 'testb@footrada.com' },
        { id: 9993, username: '清算測試C', email: 'testc@footrada.com' },
        { id: 9994, username: '清算測試D', email: 'testd@footrada.com' }
    ];

    // 先檢查表結構
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('❌ 查詢表結構失敗:', err.message);
            db.close();
            return;
        }

        const hasEmail = columns.some(col => col.name === 'email');
        
        if (hasEmail) {
            // 如果有 email 字段，直接更新
            testUsers.forEach(user => {
                db.run(
                    'UPDATE users SET email = ? WHERE id = ?',
                    [user.email, user.id],
                    function(err) {
                        if (err) {
                            console.log(`❌ 更新用戶 ${user.id} 失敗:`, err.message);
                        } else if (this.changes > 0) {
                            console.log(`✅ 用戶 ${user.id} (${user.username}) 已設置 email: ${user.email}`);
                        }
                    }
                );
            });
        }

        // 更新 username 字段為 email（登錄需要）
        testUsers.forEach(user => {
            db.run(
                'UPDATE users SET username = ? WHERE id = ?',
                [user.email, user.id],
                function(err) {
                    if (err) {
                        console.log(`❌ 更新用戶名失敗 ${user.id}:`, err.message);
                    } else if (this.changes > 0) {
                        console.log(`✅ 用戶 ${user.id} 用戶名已改為: ${user.email}`);
                    }
                }
            );
        });

        // 確保密碼正確
        const hashPassword = async () => {
            const hashedPassword = await bcrypt.hash('password123', 12);
            testUsers.forEach(user => {
                db.run(
                    'UPDATE users SET password = ? WHERE id = ?',
                    [hashedPassword, user.id],
                    function(err) {
                        if (err) {
                            console.log(`❌ 更新密碼失敗 ${user.id}:`, err.message);
                        }
                    }
                );
            });
        };

        hashPassword();

        setTimeout(() => {
            console.log('\n📋 修復後的測試用戶信息：');
            testUsers.forEach(user => {
                console.log(`   ID: ${user.id}`);
                console.log(`   登錄名: ${user.email}`);
                console.log(`   密碼: password123`);
                console.log('---');
            });
            db.close();
        }, 1000);
    });
}

fixTestUsers();