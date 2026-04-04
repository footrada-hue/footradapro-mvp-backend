/**
 * FOOTRADAPRO MVP - Logger Utility
 * @description Winston日志配置
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import * as config from '../../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 自定义日志格式（开发环境用）
const myFormat = printf(({ level, message, timestamp, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
    }`;
});

// 创建 logger 实例
const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
    format: combine(
        timestamp(),
        config.NODE_ENV === 'production' ? json() : myFormat
    ),
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp(),
                myFormat
            )
        }),
        // 错误日志文件
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // 所有日志文件
        new winston.transports.File({ 
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

export default logger;