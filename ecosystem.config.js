module.exports = {
  apps: [{
    name: 'banana-image-backend',
    script: 'start.js',
    instances: 1, // 改为单实例，避免端口冲突
    exec_mode: 'fork', // 改为fork模式
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 禁用PM2的日志，使用应用内的Winston日志
    out_file: '/dev/null',
    error_file: '/dev/null',
    combine_logs: true,
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024',
    // 添加重启策略
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000
  }]
};