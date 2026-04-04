import { initDatabase, getDb } from '../connection.js';
import logger from '../../utils/logger.js';

async function migrate() {
    try {
        // 先初始化数据库
        await initDatabase();
        
        const db = getDb();
        
        // 检查字段是否存在
        const tableInfo = db.prepare("PRAGMA table_info(users)").all();
        const hasModeLocked = tableInfo.some(col => col.name === 'is_mode_locked');
        
        if (!hasModeLocked) {
            db.exec("ALTER TABLE users ADD COLUMN is_mode_locked INTEGER DEFAULT 0");
            logger.info('✅ 添加 is_mode_locked 字段到 users 表');
        } else {
            logger.info('⏭️ is_mode_locked 字段已存在，跳过');
        }
        
        logger.info('✅ 迁移 022_add_mode_locked 完成');
        process.exit(0);
    } catch (error) {
        logger.error('❌ 迁移失败:', error);
        process.exit(1);
    }
}

migrate();