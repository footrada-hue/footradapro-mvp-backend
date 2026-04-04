module.exports = {
  apps: [{
    name: 'footradapro-mvp',
    script: './src/app.js',
    
    // 实例配置 - WebSocket 需要 sticky session
    instances: 1,  // 暂时保持1个实例，WebSocket 多实例需要 Redis adapter
    exec_mode: 'fork',  // 使用 fork 模式确保 WebSocket 正常工作
    
    // 自动重启配置
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // 启动延迟（避免同时重启）
    restart_delay: 4000,
    
    // 监听文件变化（开发环境可开启）
    ignore_watch: [
      'node_modules',
      'logs',
      'public/uploads',
      'src/database/data/*.sqlite',
      'src/database/data/*.sqlite-*'
    ],
    
    // 环境变量
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      WS_PING_INTERVAL: 25000,
      WS_PING_TIMEOUT: 20000,
      UPLOAD_MAX_SIZE: 10485760
    },
    
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      WS_PING_INTERVAL: 25000,
      WS_PING_TIMEOUT: 20000,
      UPLOAD_MAX_SIZE: 10485760,
      // 生产环境建议使用 Redis 作为 socket.io 的 adapter 以支持多实例
      // REDIS_URL: 'redis://localhost:6379'
    },
    
    // 日志配置
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true,
    
    // 优雅关闭
    kill_timeout: 10000,
    listen_timeout: 3000,
    shutdown_with_message: true,
    
    // 性能监控
    instance_var: 'INSTANCE_ID',
    
    // 自动重启条件
    min_uptime: '10s',
    max_restarts: 10,
    
    // CPU 和内存限制
    max_memory_restart: '1G',
    
    // 禁用 cron 重启
    cron_restart: null
  }],
  
  // 部署配置（可选）
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/footradapro-mvp.git',
      path: '/var/www/footradapro-mvp',
      'post-deploy': 'npm install && npm run db:migrate && pm2 reload ecosystem.config.cjs --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};