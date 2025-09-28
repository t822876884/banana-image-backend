require('dotenv').config();
const mysql = require('mysql2/promise');
const redis = require('redis');
const { logger } = require('../utils/logger');

let dbPool = null;
let redisClient = null;

// 创建数据库连接池
// 在文件开头添加
let isConnecting = false;
let connectionPromise = null;

// 修改 connectDB 函数
async function connectDB() {
  // 如果已经有连接或正在连接，避免重复连接
  if (connectionPromise) {
    return connectionPromise;
  }
  
  if (isConnecting) {
    // 等待现有连接完成
    while (isConnecting && !connectionPromise) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return connectionPromise;
  }
  
  isConnecting = true;
  
  try {
    logger.info('正在连接数据库...');
    logger.info('数据库配置:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    });

    dbPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'banana_image',
      charset: 'utf8mb4',
      multipleStatements: true,
      connectionLimit: 10,
      queueLimit: 0,
      timeout: 60000,
      waitForConnections: true
      // 移除不支持的选项
      // reconnect: true
    });

    // 测试连接
    const connection = await dbPool.getConnection();
    await connection.ping();
    connection.release();
    
    logger.info('MySQL数据库连接成功');
    connectionPromise = Promise.resolve(dbPool);
    return dbPool;
  } catch (error) {
    logger.error('数据库连接失败:', error);
    throw error;
  } finally {
    isConnecting = false;
  }
}

// 创建Redis连接
async function connectRedis() {
  try {
    if (!process.env.REDIS_HOST) {
      logger.info('Redis配置未设置，跳过Redis连接');
      return null;
    }

    logger.info('Redis配置:', {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    });

    redisClient = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    });

    redisClient.on('error', (err) => {
      logger.error('Redis连接错误:', err);
    });

    await redisClient.connect();
    logger.info('Redis连接成功');
    return redisClient;
  } catch (error) {
    logger.error('Redis连接失败:', error);
    return null;
  }
}

// 获取数据库连接
function getDB() {
  if (!dbPool) {
    logger.error('尝试获取数据库连接失败: 数据库未连接');
    throw new Error('数据库未连接');
  }
  return dbPool;
}

// 获取Redis连接
function getRedis() {
  if (!redisClient) {
    logger.warn('尝试获取Redis连接，但Redis未连接');
  }
  return redisClient;
}

module.exports = {
  connectDB,
  connectRedis,
  getDB,
  getRedis
};