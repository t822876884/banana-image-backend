const jwt = require('jsonwebtoken');
const { getDB } = require('../database/connection');

// 验证JWT Token
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        code: 401,
        message: '访问令牌缺失'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 验证用户是否存在且状态正常
    const db = getDB();
    const [users] = await db.execute(
      'SELECT id, username, status FROM users WHERE id = ? AND status = "active"',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        code: 401,
        message: '用户不存在或已被禁用'
      });
    }

    req.user = {
      id: decoded.userId,
      username: users[0].username
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: '访问令牌已过期',
        error: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        code: 401,
        message: '访问令牌无效',
        error: 'TOKEN_INVALID'
      });
    } else {
      console.error('Token验证错误:', error);
      return res.status(500).json({
        code: 500,
        message: '服务器内部错误'
      });
    }
  }
}

// 可选的身份验证（不强制要求登录）
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const db = getDB();
      const [users] = await db.execute(
        'SELECT id, username FROM users WHERE id = ? AND status = "active"',
        [decoded.userId]
      );

      if (users.length > 0) {
        req.user = {
          id: decoded.userId,
          username: users[0].username
        };
      }
    }

    next();
  } catch (error) {
    // 可选认证失败时不返回错误，继续执行
    next();
  }
}

module.exports = {
  authenticateToken,
  optionalAuth
};