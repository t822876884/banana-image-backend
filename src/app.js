const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
const { connectDB } = require('./database/connection');

require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const imageRoutes = require('./routes/image');
const sceneRoutes = require('./routes/scene');
const modelRoutes = require('./routes/model');
const historyRoutes = require('./routes/history');
const uploadRoutes = require('./routes/upload');
const settingsRoutes = require('./routes/settings');

const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);
// 尝试连接数据库
// 移除 app.js 中的数据库连接尝试，因为这会在 vercel-entry.js 中处理
// 删除或注释掉以下代码块:
/*
(async () => {
  try {
    await connectDB();
    console.log('数据库连接成功');
  } catch (error) {
    console.error('数据库连接失败:', error);
  }
})();
*/

// 在文件末尾添加导出
// 移除数据库连接尝试代码块
// 确保在文件末尾导出app
module.exports = app;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false // 允许Swagger UI加载
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://127.0.0.1:8080'],
  credentials: true
}));

// 限流中间件
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 每分钟最多60次请求
  message: {
    code: 429,
    message: '请求过于频繁，请稍后再试'
  }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 登录接口每分钟最多5次
  message: {
    code: 429,
    message: '登录尝试过于频繁，请稍后再试'
  }
});

app.use(limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static('uploads'));

// API文档
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Nano Banana API文档'
}));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: 健康检查
 *     description: 检查服务器运行状态
 *     tags: [系统]
 *     responses:
 *       200:
 *         description: 服务器运行正常
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: 服务器运行时间（秒）
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在'
  });
});

// 错误处理中间件
app.use(errorHandler);
// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 不要在生产环境立即退出
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// 未处理的 Promise 拒绝处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

// 导出 app 实例
module.exports = app;