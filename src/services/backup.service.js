// src/services/backup.service.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger');

class BackupService {
    constructor(dbPath, backupDir) {
        this.dbPath = dbPath;
        this.backupDir = backupDir;
        this.logger = logger;
    }
    
    // 初始化备份目录
    async initialize() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            await fs.mkdir(path.join(this.backupDir, 'daily'), { recursive: true });
            await fs.mkdir(path.join(this.backupDir, 'weekly'), { recursive: true });
            await fs.mkdir(path.join(this.backupDir, 'manual'), { recursive: true });
            
            this.logger.info('备份目录初始化完成');
        } catch (error) {
            this.logger.error('备份目录初始化失败:', error);
            throw error;
        }
    }
    
    // 创建备份
    async createBackup(type = 'manual') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const backupFileName = `footradapro_${type}_${timestamp}.db`;
        
        let backupSubDir;
        switch (type) {
            case 'daily':
                backupSubDir = 'daily';
                break;
            case 'weekly':
                backupSubDir = 'weekly';
                break;
            default:
                backupSubDir = 'manual';
        }
        
        const backupPath = path.join(this.backupDir, backupSubDir, backupFileName);
        
        try {
            // 使用 SQLite 的备份命令
            await execPromise(`sqlite3 ${this.dbPath} ".backup '${backupPath}'"`);
            
            // 获取文件信息
            const stats = await fs.stat(backupPath);
            
            // 记录备份信息
            await this.logBackup({
                fileName: backupFileName,
                path: backupPath,
                size: stats.size,
                type,
                createdAt: new Date().toISOString()
            });
            
            this.logger.info(`备份成功: ${backupFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            
            // 清理旧备份
            await this.cleanOldBackups(type);
            
            return {
                success: true,
                fileName: backupFileName,
                path: backupPath,
                size: stats.size
            };
            
        } catch (error) {
            this.logger.error('备份失败:', error);
            throw error;
        }
    }
    
    // 记录备份日志
    async logBackup(backupInfo) {
        const logFile = path.join(this.backupDir, 'backup_log.json');
        
        try {
            let logs = [];
            try {
                const data = await fs.readFile(logFile, 'utf8');
                logs = JSON.parse(data);
            } catch (err) {
                // 文件不存在，使用空数组
            }
            
            logs.push(backupInfo);
            
            // 只保留最近100条记录
            if (logs.length > 100) {
                logs = logs.slice(-100);
            }
            
            await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
        } catch (error) {
            this.logger.error('记录备份日志失败:', error);
        }
    }
    
    // 清理旧备份
    async cleanOldBackups(type) {
        const retentionDays = {
            daily: 7,    // 每日备份保留7天
            weekly: 30,  // 每周备份保留30天
            manual: 90   // 手动备份保留90天
        };
        
        const backupSubDir = type === 'manual' ? 'manual' : type;
        const backupPath = path.join(this.backupDir, backupSubDir);
        
        try {
            const files = await fs.readdir(backupPath);
            const now = new Date();
            
            for (const file of files) {
                if (!file.endsWith('.db')) continue;
                
                const filePath = path.join(backupPath, file);
                const stats = await fs.stat(filePath);
                const daysOld = (now - stats.mtime) / (1000 * 60 * 60 * 24);
                
                if (daysOld > retentionDays[type]) {
                    await fs.unlink(filePath);
                    this.logger.info(`删除旧备份: ${file}`);
                }
            }
        } catch (error) {
            this.logger.error('清理旧备份失败:', error);
        }
    }
    
    // 恢复备份
    async restoreBackup(backupFileName, type = 'manual') {
        const backupSubDir = type === 'manual' ? 'manual' : type;
        const backupPath = path.join(this.backupDir, backupSubDir, backupFileName);
        
        try {
            // 检查备份文件是否存在
            await fs.access(backupPath);
            
            // 创建当前数据库的备份（以防万一）
            const preRestoreBackup = await this.createBackup('pre_restore');
            
            // 恢复备份
            await execPromise(`sqlite3 ${this.dbPath} ".restore '${backupPath}'"`);
            
            this.logger.info(`恢复成功: ${backupFileName}`);
            
            return {
                success: true,
                message: '恢复成功',
                preRestoreBackup: preRestoreBackup.fileName
            };
            
        } catch (error) {
            this.logger.error('恢复失败:', error);
            throw error;
        }
    }
    
    // 获取备份列表
    async getBackupList(type = 'all') {
        const backups = [];
        const types = type === 'all' ? ['daily', 'weekly', 'manual'] : [type];
        
        for (const t of types) {
            const backupPath = path.join(this.backupDir, t);
            
            try {
                const files = await fs.readdir(backupPath);
                
                for (const file of files) {
                    if (!file.endsWith('.db')) continue;
                    
                    const filePath = path.join(backupPath, file);
                    const stats = await fs.stat(filePath);
                    
                    backups.push({
                        fileName: file,
                        path: filePath,
                        size: stats.size,
                        type: t,
                        createdAt: stats.mtime.toISOString()
                    });
                }
            } catch (err) {
                // 目录可能不存在
            }
        }
        
        // 按创建时间倒序排序
        return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    // 启动定时备份
    startScheduledBackups() {
        const cron = require('node-cron');
        
        // 每日备份 - 凌晨3点
        cron.schedule('0 3 * * *', async () => {
            this.logger.info('开始每日备份...');
            try {
                await this.createBackup('daily');
            } catch (error) {
                this.logger.error('每日备份失败:', error);
            }
        });
        
        // 每周备份 - 周日凌晨4点
        cron.schedule('0 4 * * 0', async () => {
            this.logger.info('开始每周备份...');
            try {
                await this.createBackup('weekly');
            } catch (error) {
                this.logger.error('每周备份失败:', error);
            }
        });
        
        this.logger.info('定时备份服务已启动');
    }
}

module.exports = BackupService;