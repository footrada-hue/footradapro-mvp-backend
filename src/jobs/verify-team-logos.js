/**
 * FOOTRADAPRO - 队徽验证定时任务
 * @description 每天检查标记为 ok 的球队是否有对应的队徽文件
 * @since 2026-04-01
 */

import { getDb, initDatabase } from '../database/connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 队徽文件目录
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'teams');

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
        await initDatabase();
        const db = getDb();
        
        // 获取所有标记为 ok 的球队
        const teams = db.prepare(`
            SELECT team_name, logo_url FROM team_logos WHERE logo_status = 'ok'
        `).all();
        
        console.log(`📋 共 ${teams.length} 支球队标记为 ok`);
        
        let missingCount = 0;
        let fixedCount = 0;
        const missingTeams = [];
        
        for (const team of teams) {
            const fileName = getTeamFileName(team.team_name);
            const filePath = path.join(UPLOAD_DIR, `${fileName}.png`);
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                // 也尝试检查其他常见格式
                const altPaths = [
                    path.join(UPLOAD_DIR, `${fileName}.jpg`),
                    path.join(UPLOAD_DIR, `${fileName}.jpeg`),
                    path.join(UPLOAD_DIR, `${fileName}.webp`)
                ];
                
                const fileExists = altPaths.some(p => fs.existsSync(p));
                
                if (!fileExists) {
                    missingCount++;
                    missingTeams.push(team.team_name);
                    
                    // 更新状态为 missing
                    db.prepare(`
                        UPDATE team_logos 
                        SET logo_status = 'missing', last_updated = CURRENT_TIMESTAMP 
                        WHERE team_name = ?
                    `).run(team.team_name);
                    
                    fixedCount++;
                    logger.info(`🔧 修复: ${team.team_name} -> missing (文件不存在)`);
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
        console.error('❌ 队徽验证失败:', error);
        logger.error('队徽验证失败:', error);
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