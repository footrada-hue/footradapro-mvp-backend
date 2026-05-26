/**
 * FOOTRADAPRO MVP - Configuration Loader (测试版)
 * @description 临时跳过验证，使用默认值
 */

import defaultConfig from './default.js';
import developmentConfig from './development.js';
import productionConfig from './production.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

// 加载环境特定配置
const envConfigs = {
    development: { ...defaultConfig, ...developmentConfig },
    production: { ...defaultConfig, ...productionConfig },
};

const baseConfig = envConfigs[NODE_ENV] || envConfigs.development;

// 环境变量覆盖
const ENV_OVERRIDES = [
    'NODE_ENV',
    'PORT',
    'SESSION_SECRET',
    'LOG_LEVEL',
    'ALLOWED_ORIGINS',
    'DB_PATH',
    'AUTHORIZATION_CUTOFF_MINUTES',
];

const envOverrides = {};
for (const key of ENV_OVERRIDES) {
    if (process.env[key] !== undefined) {
        envOverrides[key] = process.env[key];
    }
}

// 合并配置
const config = { ...baseConfig, ...envOverrides };

// 类型转换和默认值
config.PORT = config.PORT ? parseInt(config.PORT, 10) : 3000;
config.LOG_LEVEL = config.LOG_LEVEL || 'info';
config.AUTHORIZATION_CUTOFF_MINUTES = config.AUTHORIZATION_CUTOFF_MINUTES
    ? parseInt(config.AUTHORIZATION_CUTOFF_MINUTES, 10)
    : 5;

// 解析 ALLOWED_ORIGINS 为数组
if (config.ALLOWED_ORIGINS && typeof config.ALLOWED_ORIGINS === 'string') {
    config.ALLOWED_ORIGINS = config.ALLOWED_ORIGINS.split(',').map(s => s.trim());
} else if (!config.ALLOWED_ORIGINS) {
    config.ALLOWED_ORIGINS = ['http://localhost:3000'];
}

// 设置默认的 SESSION_SECRET（如果缺失）
if (!config.SESSION_SECRET) {
    config.SESSION_SECRET = process.env.SESSION_SECRET || 'footradapro-default-secret-key-2026';
    console.warn('⚠️  WARNING: Using default SESSION_SECRET. Set in .env for production!');
}

// API 前缀
config.apiPrefix = '/api/v1';

// 临时跳过验证，直接返回配置
console.log('✅ Configuration loaded');
console.log('📌 SESSION_SECRET:', config.SESSION_SECRET ? '***set***' : '***missing***');

export default config;