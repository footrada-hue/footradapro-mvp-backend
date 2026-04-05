/**
 * FOOTRADAPRO MVP - Application Entry Point
 * @description Express应用入口，生产环境标准配置
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import http from 'http';

// ==================== 环境变量加载 ====================
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;

// ==================== 确保日志目录存在 ====================
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ==================== 导入配置 ====================
import config from '../config/index.js';
import logger from './utils/logger.js';

// ==================== 导入路由 ====================
import './jobs/auto-update-match-status.js';
import authRoutes from './api/v1/auth.routes.js';
import userRoutes from './api/v1/user.routes.js';
import claimRoutes from './api/v1/user/claim.routes.js';
import bonusRoutes from './api/v1/user/bonus.routes.js';
import historyRoutes from './api/v1/user/history.routes.js';
import userReportRoutes from './api/v1/user/report.routes.js';
import matchesRoutes from './api/v1/front/matches.routes.js';
import adminMatchesRoutes from './api/v1/admin/matches.routes.js';
import adminSettleRoutes from './api/v1/admin/settle.routes.js';
import reportRoutes from './api/v1/admin/report.routes.js';
import adminFinanceRoutes from './api/v1/admin/finance.routes.js';
import adminAuthRoutes from './api/v1/admin/auth.routes.js';
import adminUsersRoutes from './api/v1/admin/users.routes.js';
import adminStatsRoutes from './api/v1/admin/stats.routes.js';
import adminAdminsRoutes from './api/v1/admin/admins.routes.js';
import captchaRoutes from './api/v1/captcha.routes.js';
import adminNotificationRoutes from './api/v1/admin/notification.routes.js';
import userNotificationRoutes from './api/v1/user/notification.routes.js';
import adminTickerManagerRoutes from './api/v1/admin/ticker-manager.routes.js';
import tickerRoutes from './api/v1/ticker.routes.js';
import userTransactionsRoutes from './api/v1/user/transactions.routes.js';
import userVipRoutes from './api/v1/user/vip.routes.js';
import withdrawRoutes from './api/v1/admin/withdraw.routes.js';
import depositRoutes from './api/v1/admin/deposit.routes.js';
import userDepositRoutes from './api/v1/user/deposit.routes.js';
import depositAdminRoutes from './api/v1/admin/deposit.routes.js';
import adminNetworkRoutes from './api/v1/admin/network.routes.js';
import userNetworkRoutes from './api/v1/user/network.routes.js';
import newsRoutes from './api/v1/news.routes.js';
import adminUploadRoutes from './api/v1/admin/upload.routes.js';
import authorizeRoutes from './api/v1/user/authorize.routes.js';
import withdrawUserRoutes from './api/v1/user/withdraw.user.routes.js';
import statsRoutes from './api/v1/user/stats.routes.js';
import balanceLogsRoutes from './api/v1/user/balance.logs.routes.js';
import modeRoutes from './api/v1/user/mode.routes.js';
import balanceRoutes from './api/v1/user/balance.routes.js';
import supportRoutes from './api/v1/user/support.routes.js';
import adminSupportRoutes from './api/v1/admin/support-admin.routes.js';
import uploadRoutes from './api/v1/upload.routes.js';
import { verifyAndFixTeamLogos } from './jobs/verify-team-logos.js';
import { initSocket } from './socket/index.js';
import './jobs/auto-fetch-scores.js';
import depositNotifyRoutes from './api/v1/user/deposit-notify.routes.js';
import './services/emailservice.js';
import SQLiteStore from 'connect-sqlite3';
// ==================== 导入数据库 ====================
import database from './database/connection.js';

// ==================== 导入定时任务 ====================
import { startDataCleanup } from './jobs/data-cleanup.js';
import { startAutoFetchJob } from './jobs/auto-fetch-matches.js';

// ==================== 初始化 Express ====================
const app = express();
// ==================== 显式 JS 文件路由（解决 500 错误） ====================
app.get('/js/core/config.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'js', 'core', 'config.js'));
});

app.get('/js/user/register_controller.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'js', 'user', 'register_controller.js'));
});

app.get('/js/user/index_controller.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'js', 'user', 'index_controller.js'));
});

app.get('/js/user/home.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'js', 'user', 'home.js'));
});

app.get('/js/core/theme.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'js', 'core', 'theme.js'));
});
// ==================== 安全中间件 ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://www.gstatic.com",
                
                
            ],
            fontSrc: [
                "'self'", 
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
                
                
            ],
scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://cdnjs.cloudflare.com",
    "https://www.gstatic.com",
    "https://challenges.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://cdn.socket.io",
    "https://www.footradapro.com",
    "https://api.footradapro.com"
],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: [
                "'self'", 
                "data:", 
                "https:",
                
            ],
connectSrc: [
    "'self'", 
    "https://cdn.jsdelivr.net",
    "https://api.footradapro.com",
    "https://www.footradapro.com",
    "ws://localhost:*",
    "wss://localhost:*"
],
            frameSrc: [
                "'self'",
                
            ],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// ==================== CORS 配置 ====================
const corsOptions = {
    origin: function(origin, callback) {
        // 允许的域名列表（生产环境）
        const allowedOrigins = [
            'https://www.footradapro.com',
            'https://footradapro.com',
            'https://api.footradapro.com',
            'http://localhost:3000',
            'http://localhost:5500'
        ];
        
        // 开发环境允许所有
        if (NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        // 允许没有 origin 的请求（如 Postman、服务器内部调用）
        if (!origin) {
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// ==================== 标准中间件 ====================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== Session 配置 ====================

const SQLiteStoreSession = SQLiteStore(session);

app.use(session({
    store: new SQLiteStoreSession({
        db: 'sessions.db',
        dir: './src/database/data',
        table: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'footradapro-super-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    name: 'footradapro.sid'
}));

app.use(cookieParser());

// ==================== 请求日志 ====================
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));
// 仪表盘页面
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});
// 官网首页

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'home.html'));
});
// ==================== 静态文件服务 ====================
app.use(express.static(path.join(process.cwd(), 'public'), config.staticOptions));

// ==================== 多页面应用路由 ====================



// 认证相关
app.get('/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'register.html'));
});

// 用户相关
app.get('/profile', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'profile.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'settings.html'));
});

app.get('/change-password', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'change-password.html'));
});

app.get('/set-paypassword', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'set-paypassword.html'));
});

// 资金相关
app.get('/deposit', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'deposit.html'));
});

app.get('/withdraw', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'withdraw.html'));
});

app.get('/fund-detail', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'fund-detail.html'));
});

// 交易相关
app.get('/match-market', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'match-market.html'));
});

app.get('/transaction-list', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'transaction-list.html'));
});

app.get('/transaction-detail', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'transaction-detail.html'));
});

// 报表相关
app.get('/platform-reports', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'platform-reports.html'));
});

app.get('/historical-reports', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'historical-reports.html'));
});

app.get('/report-detail', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'report-detail.html'));
});

// 授权相关
app.get('/authorizations', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'authorizations.html'));
});

app.get('/authorize-submit', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'authorize-submit.html'));
});

// FAQ 相关
app.get('/faq-list', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'faq-list.html'));
});

app.get('/faq-detail', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'faq-detail.html'));
});

app.get('/faq-auth', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'faq-auth.html'));
});

// 客服相关
app.get('/support', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'support.html'));
});

app.get('/support-chat', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'support-chat.html'));
});

// VIP
app.get('/vip-details', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'vip-details.html'));
});

// 其他
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'terms.html'));
});

app.get('/result', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'result.html'));
});

app.get('/notification-demo', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'notification-demo.html'));
});

// 健康检查
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV
    });
});

// ==================== 用户活动记录中间件 ====================
app.use('/api/v1/user', (req, res, next) => {
    if (req.session && req.session.userId) {
        const db = database.get();
        setImmediate(() => {
            try {
                db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.session.userId);
                logger.debug(`更新用户最后活动时间: userId=${req.session.userId}`);
            } catch (err) {
                logger.error('更新用户最后活动时间失败:', err);
            }
        });
    }
    next();
});

app.use('/api/v1/admin', (req, res, next) => {
    if (req.session && req.session.userId) {
        const db = database.get();
        setImmediate(() => {
            try {
                db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.session.userId);
                logger.debug(`更新管理员最后活动时间: userId=${req.session.userId}`);
            } catch (err) {
                logger.error('更新管理员最后活动时间失败:', err);
            }
        });
    }
    next();
});

// ==================== API 路由 ====================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/user', claimRoutes);
app.use('/api/v1/user', bonusRoutes);
app.use('/api/v1/user/history', historyRoutes);
app.use('/api/v1/user/report', userReportRoutes);
app.use('/api/v1/matches', matchesRoutes);
app.use('/api/v1/admin/matches', adminMatchesRoutes);
app.use('/api/v1/admin/settle', adminSettleRoutes);
app.use('/api/v1/admin/report', reportRoutes);
app.use('/api/v1/admin/finance', adminFinanceRoutes);
app.use('/api/v1/admin', adminAuthRoutes);
app.use('/api/v1/admin/users', adminUsersRoutes);
app.use('/api/v1/admin/stats', adminStatsRoutes);
app.use('/api/v1/admin/admins', adminAdminsRoutes);
app.use('/api/v1/captcha', captchaRoutes);
app.use('/api/v1/admin/notifications', adminNotificationRoutes);
app.use('/api/v1/user/notifications', userNotificationRoutes);
app.use('/api/v1/admin/ticker-manager', adminTickerManagerRoutes);
app.use('/api/v1/ticker', tickerRoutes);
app.use('/api/v1/user/transactions', userTransactionsRoutes);
app.use('/api/v1/user/vip', userVipRoutes);
app.use('/api/v1/admin/withdraw', withdrawRoutes);
app.use('/api/v1/admin/deposit', depositRoutes);
app.use('/api/v1/user/deposit', userDepositRoutes);
app.use('/api/v1/admin/deposit', depositAdminRoutes);
app.use('/api/v1/admin/network', adminNetworkRoutes);
app.use('/api/v1/user/network', userNetworkRoutes);
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/admin/upload', adminUploadRoutes);
app.use('/api/v1/user/authorize', authorizeRoutes);
app.use('/api/v1/user/withdraw/user', withdrawUserRoutes);
app.use('/api/v1/user/stats', statsRoutes);
app.use('/api/v1/user/balance/logs', balanceLogsRoutes);
app.use('/api/v1/user/mode', modeRoutes);
app.use('/api/v1/user/balance', balanceRoutes);
app.use('/api/v1/user/support', supportRoutes);
app.use('/api/v1/admin/support', adminSupportRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/user/deposit', depositNotifyRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// ==================== 404 处理 ====================
app.use((req, res) => {
    res.status(404).sendFile(path.join(process.cwd(), 'public', '404.html'));
});

// ==================== 全局错误处理 ====================
app.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    const errorResponse = {
        success: false,
        error: err.name || 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        ...(NODE_ENV === 'development' && { stack: err.stack })
    };

    if (statusCode >= 500) {
        logger.error(`Server Error: ${err.message}`, { 
            stack: err.stack,
            url: req.url,
            method: req.method,
            ip: req.ip
        });
    } else {
        logger.warn(`Client Error: ${err.message}`, {
            url: req.url,
            method: req.method,
            ip: req.ip
        });
    }

    res.status(statusCode).json(errorResponse);
});

// ==================== 启动服务器 ====================
const startServer = async () => {
    try {
        // 初始化数据库
        await database.init();
        logger.info('Database initialized successfully');

        // ===== 測試模式相關表初始化 =====
        const db = database.get();
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS mode_switch_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                from_mode INTEGER NOT NULL,
                to_mode INTEGER NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS test_balance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                balance_before REAL NOT NULL,
                balance_after REAL NOT NULL,
                type TEXT NOT NULL,
                reference_id INTEGER,
                match_id TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS test_reset_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                previous_balance REAL NOT NULL,
                new_balance REAL NOT NULL,
                reset_count INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        const tableInfo = db.prepare("PRAGMA table_info(users)").all();
        const hasTestMode = tableInfo.some(col => col.name === 'is_test_mode');
        const hasTestBalance = tableInfo.some(col => col.name === 'test_balance');
        
        if (!hasTestMode) {
            db.exec("ALTER TABLE users ADD COLUMN is_test_mode INTEGER DEFAULT 1");
            logger.info('✅ Added is_test_mode column to users table');
        }
        
        if (!hasTestBalance) {
            db.exec("ALTER TABLE users ADD COLUMN test_balance REAL DEFAULT 10000");
            logger.info('✅ Added test_balance column to users table');
        }

        const authTableInfo = db.prepare("PRAGMA table_info(authorizations)").all();
        const hasAuthTest = authTableInfo.some(col => col.name === 'is_test');
        
        if (!hasAuthTest) {
            db.exec("ALTER TABLE authorizations ADD COLUMN is_test INTEGER DEFAULT 0");
            logger.info('✅ Added is_test column to authorizations table');
        }

        db.exec(`
            UPDATE users 
            SET test_balance = 10000 
            WHERE test_balance IS NULL OR test_balance = 0
        `);
        
        logger.info('✅ Test mode initialization complete');

        // ===== 创建 HTTP 服务器并集成 WebSocket =====
        const server = http.createServer(app);
        
        // 初始化 Socket.io
        initSocket(server);
        
        server.listen(PORT, () => {
            logger.info(`Server started on port ${PORT} (${NODE_ENV} mode)`);
            logger.info(`Health check: http://localhost:${PORT}/health`);
            logger.info(`WebSocket server ready on port ${PORT}`);
            
            // 启动数据清理定时任务
            startDataCleanup();
            logger.info('🧹 Data cleanup service started');

            // 启动自动获取比赛定时任务
            startAutoFetchJob();
            logger.info('🤖 Auto-fetch matches service started');
        });
        
        // 启动队徽验证定时任务
        setInterval(async () => {
            const now = new Date();
            if (now.getHours() === 2 && now.getMinutes() === 0) {
                logger.info('⏰ Running scheduled team logo verification...');
                await verifyAndFixTeamLogos();
            }
        }, 60000);

        setTimeout(async () => {
            logger.info('🔍 Running initial team logo verification...');
            await verifyAndFixTeamLogos();
        }, 5000);

        logger.info('🪙 Team logo verification service started');

        // ==================== 优雅关闭 ====================
        const gracefulShutdown = (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            server.close(() => {
                logger.info('HTTP server closed');
                database.close();
                logger.info('Database connection closed');
                process.exit(0);
            });

            setTimeout(() => {
                logger.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise);
            logger.error('Reason:', reason);
            console.error('=== 完整错误堆栈 ===');
            console.error(reason?.stack || reason);
            console.error('===================');
        });

        process.on('uncaughtException', (err) => {
            logger.error('Uncaught Exception:', err);
            gracefulShutdown('uncaughtException');
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// 启动服务器
startServer();

export default app;