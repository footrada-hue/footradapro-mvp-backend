/**
 * FOOTRADAPRO - 队徽验证定时任务
 * @description 每天检查标记为 ok 的球队是否有对应的队徽文件
 * @since 2026-04-01
 * @version 2.0.0 - 支持 PostgreSQL 和 SQLite 双数据库
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 队徽文件目录
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'teams');

// 环境判断
const isProduction = process.env.NODE_ENV === 'production';

/**
 * 生成球队对应的文件名
 */
function getTeamFileName(teamName) {
    return teamName
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * 验证并修复队徽状态
 */
export async function verifyAndFixTeamLogos() {
    console.log('🔄 开始验证队徽文件...');
    const startTime = Date.now();
    
    try {
        const { initDatabase, query, getDb } = await import('../database/connection.js');
        await initDatabase();
        
        let teams = [];
        
        if (isProduction) {
            // PostgreSQL 版本
            const result = await query(`
                SELECT team_name, logo_url FROM team_logos WHERE logo_status = 'ok'
            `);
            teams = result || [];
        } else {
            // SQLite 版本
            const db = getDb();
            teams = db.prepare(`
                SELECT team_name, logo_url FROM team_logos WHERE logo_status = 'ok'
            `).all();
        }
        
        console.log(`📋 共 ${teams.length} 支球队标记为 ok`);
        
        let missingCount = 0;
        let fixedCount = 0;
        const missingTeams = [];
        
        // 确保上传目录存在
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
            console.log(`📁 创建队徽目录: ${UPLOAD_DIR}`);
        }
        
        for (const team of teams) {
            const fileName = getTeamFileName(team.team_name);
            const filePath = path.join(UPLOAD_DIR, `${fileName}.png`);
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                // 也尝试检查其他常见格式
                const altPaths = [
                    path.join(UPLOAD_DIR, `${fileName}.jpg`),
                    path.join(UPLOAD_DIR, `${fileName}.jpeg`),
                    path.join(UPLOAD_DIR, `${fileName}.webp`),
                    path.join(UPLOAD_DIR, `${fileName}.svg`)
                ];
                
                const fileExists = altPaths.some(p => fs.existsSync(p));
                
                if (!fileExists) {
                    missingCount++;
                    missingTeams.push(team.team_name);
                    
                    // 更新状态为 missing
                    try {
                        if (isProduction) {
                            await query(`
                                UPDATE team_logos 
                                SET logo_status = 'missing', last_updated = NOW()
                                WHERE team_name = $1
                            `, [team.team_name]);
                        } else {
                            const db = getDb();
                            db.prepare(`
                                UPDATE team_logos 
                                SET logo_status = 'missing', last_updated = CURRENT_TIMESTAMP 
                                WHERE team_name = ?
                            `).run(team.team_name);
                        }
                        fixedCount++;
                        logger.info(`🔧 修复: ${team.team_name} -> missing (文件不存在)`);
                    } catch (err) {
                        // 如果 team_logos 表不存在，忽略错误
                        logger.debug(`更新队徽状态失败（表可能不存在）: ${err.message}`);
                    }
                }
            }
        }
        
        const duration = Date.now() - startTime;
        
        if (fixedCount > 0) {
            console.log(`✅ 验证完成: 发现 ${missingCount} 支缺少队徽，已修复 ${fixedCount} 支，耗时 ${duration}ms`);
            logger.info(`队徽验证完成: 发现 ${missingCount} 支缺少队徽，已修复 ${fixedCount} 支`);
        } else {
            console.log(`✅ 验证完成: 所有 ${teams.length} 支球队队徽文件正常，耗时 ${duration}ms`);
        }
        
        return { total: teams.length, missing: missingCount, fixed: fixedCount, missingTeams };
        
    } catch (error) {
        // 如果 team_logos 表不存在，这是正常的（新数据库），不需要报错
        if (error.message && error.message.includes('does not exist')) {
            console.log('📋 队徽表尚未创建，跳过验证');
            logger.info('队徽表尚未创建，跳过验证');
            return { total: 0, missing: 0, fixed: 0, missingTeams: [], skipped: true };
        }
        console.error('❌ 队徽验证失败:', error.message);
        logger.error('队徽验证失败:', error.message);
        return { error: error.message };
    }
}

/**
 * 手动执行验证（用于测试）
 */
export async function manualVerify() {
    console.log('🔧 手动触发队徽验证...');
    const result = await verifyAndFixTeamLogos();
    console.log('验证结果:', result);
    return result;
}

// 如果直接运行此文件，执行手动验证
if (import.meta.url === `file://${process.argv[1]}`) {
    manualVerify();
}

export default {
    verifyAndFixTeamLogos,
    manualVerify
};