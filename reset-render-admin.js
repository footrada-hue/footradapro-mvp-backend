import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;

// 你的 Render PostgreSQL 连接串
const DATABASE_URL = 'postgresql://footradapro_user:nWFqOw0Vs94IqNxiw1fsts85f5Rcy2ga@dpg-d8al2m0js32c739a39tg-a.oregon-postgres.render.com/footradapro';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const newPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(newPassword, 12);

async function resetAdmin() {
    try {
        console.log('🔍 正在连接数据库...');
        
        // 检查 admins 表是否存在
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admins'
            )
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('📋 admins 表不存在，正在创建...');
            await pool.query(`
                CREATE TABLE IF NOT EXISTS admins (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'admin',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ admins 表创建成功');
        }
        
        // 查找 admin 用户
        const adminResult = await pool.query(
            "SELECT id, username, role FROM admins WHERE username = 'admin'"
        );
        
        if (adminResult.rows.length === 0) {
            // 创建新管理员
            await pool.query(`
                INSERT INTO admins (username, password, role) 
                VALUES ('admin', $1, 'super_admin')
            `, [hashedPassword]);
            console.log('✅ 超级管理员账号创建成功！');
        } else {
            // 更新密码
            await pool.query(
                "UPDATE admins SET password = $1 WHERE username = 'admin'",
                [hashedPassword]
            );
            console.log('✅ 密码重置成功！');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📌 用户名: admin');
        console.log('📌 新密码: ' + newPassword);
        console.log('🔗 登录地址: https://footradapro-api.onrender.com/admin');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ 失败:', error.message);
        console.error('详细信息:', error);
    } finally {
        await pool.end();
    }
}

resetAdmin();