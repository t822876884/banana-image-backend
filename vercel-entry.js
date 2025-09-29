// vercel-entry.js
const { logger } = require('./src/utils/logger');
const app = require('./src/app');

// 在Vercel环境中，不需要主动连接数据库
// 数据库连接将在第一次请求时按需建立

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝:', reason);
});

// 导出app实例供Vercel使用
module.exports = app;