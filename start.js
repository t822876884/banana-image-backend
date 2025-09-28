const { connectDB } = require('./src/database/connection');
const app = require('./src/app');
const { logger, overrideConsole } = require('./src/utils/logger');

// 重写console方法，将日志输出到Winston
overrideConsole();

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    logger.info('正在启动服务器...');
    
    // 只连接数据库，不执行初始化
    logger.info('连接数据库...');
    await connectDB();
    logger.info('数据库连接成功');
    
    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`服务器已启动，端口: ${PORT}`);
      logger.info(`API文档: http://127.0.0.1:${PORT}/api-docs`);
      logger.info(`健康检查: http://127.0.0.1:${PORT}/health`);
    });
    
  } catch (error) {
    logger.error('启动服务器失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});

// 捕获未处理的异常和拒绝
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
});

startServer();