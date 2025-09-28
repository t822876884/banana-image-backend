// vercel-entry.js
const { connectDB } = require('./src/database/connection');
const app = require('./src/app');
const { logger } = require('./src/utils/logger');

// 确保在 Vercel 环境中数据库连接正确初始化
(async () => {
  try {
    logger.info('Vercel 环境初始化数据库连接...');
    await connectDB();
    logger.info('数据库连接成功');
  } catch (error) {
    logger.error('数据库连接失败:', error);
    // 在 Vercel 环境中不要因为数据库连接失败而阻止应用启动
  }
})();

// 导出 app 实例供 Vercel 使用
module.exports = app;