const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  saveRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens
} = require('../utils/jwt');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 用户注册
router.post('/register', validateRegister, async (req, res) => {
  const db = getDB();
  
  try {
    const { username, password, phone, email } = req.body;
    
    // 检查用户名是否已存在
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE username = ? OR phone = ? OR email = ?',
      [username, phone || '', email || '']
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '用户名、手机号或邮箱已存在'
      });
    }
    
    // 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // 创建用户
    const userId = uuidv4();
    const profileId = uuidv4();
    
    // 获取连接并开始事务
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 插入用户基本信息
      await connection.execute(
        'INSERT INTO users (id, username, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)',
        [userId, username, phone || null, email || null, passwordHash]
      );
      
      // 插入用户资料
      await connection.execute(
        'INSERT INTO user_profiles (id, user_id, nickname) VALUES (?, ?, ?)',
        [profileId, userId, username]
      );
      
      // 创建用户设置
      const settingsId = uuidv4();
      await connection.execute(
        'INSERT INTO user_settings (id, user_id) VALUES (?, ?)',
        [settingsId, userId]
      );
      
      await connection.commit();
      
      // 生成令牌
      const accessToken = generateAccessToken({ userId, username });
      const refreshToken = generateRefreshToken();
      await saveRefreshToken(userId, refreshToken);
      
      // 获取用户信息
      const [userInfo] = await db.execute(
        `SELECT u.id, u.username, u.phone, u.email, u.created_at as joinDate,
                p.nickname, p.avatar
         FROM users u 
         LEFT JOIN user_profiles p ON u.id = p.user_id 
         WHERE u.id = ?`,
        [userId]
      );
      
      res.json({
        code: 200,
        message: '注册成功',
        data: {
          token: accessToken,
          refreshToken: refreshToken,
          user: {
            id: userInfo[0].id,
            username: userInfo[0].username,
            nickname: userInfo[0].nickname,
            phone: userInfo[0].phone,
            email: userInfo[0].email,
            avatar: userInfo[0].avatar,
            joinDate: userInfo[0].joinDate
          }
        }
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('用户注册失败:', error);
    res.status(500).json({
      code: 500,
      message: '注册失败，请稍后重试'
    });
  }
});

// 用户登录
router.post('/login', validateLogin, async (req, res) => {
  const db = getDB();
  
  try {
    const { username, password } = req.body;
    
    // 查找用户（支持用户名、手机号、邮箱登录）
    const [users] = await db.execute(
      `SELECT u.id, u.username, u.password_hash, u.status,
              p.nickname, p.avatar, u.phone, u.email, u.created_at as joinDate
       FROM users u 
       LEFT JOIN user_profiles p ON u.id = p.user_id 
       WHERE (u.username = ? OR u.phone = ? OR u.email = ?) AND u.status = 'active'`,
      [username, username, username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误'
      });
    }
    
    const user = users[0];
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误'
      });
    }
    
    // 生成令牌
    const accessToken = generateAccessToken({ 
      userId: user.id, 
      username: user.username 
    });
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);
    
    // 记录登录历史
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      platform: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
    };
    
    await db.execute(
      `INSERT INTO login_history (id, user_id, platform, ip_address, user_agent, status) 
       VALUES (?, ?, ?, ?, ?, 'success')`,
      [uuidv4(), user.id, deviceInfo.platform, deviceInfo.ip, deviceInfo.userAgent]
    );
    
    res.json({
      code: 200,
      message: '登录成功',
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        userInfo: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          phone: user.phone,
          email: user.email,
          avatar: user.avatar,
          joinDate: user.joinDate
        }
      }
    });
    
  } catch (error) {
    console.error('用户登录失败:', error);
    res.status(500).json({
      code: 500,
      message: '登录失败，请稍后重试'
    });
  }
});

// 刷新Token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        code: 400,
        message: '刷新令牌不能为空'
      });
    }
    
    // 验证刷新令牌
    const tokenData = await validateRefreshToken(refreshToken);
    
    // 生成新的访问令牌
    const newAccessToken = generateAccessToken({
      userId: tokenData.user_id,
      username: tokenData.username
    });
    
    // 生成新的刷新令牌
    const newRefreshToken = generateRefreshToken();
    
    // 删除旧的刷新令牌，保存新的
    await revokeRefreshToken(refreshToken);
    await saveRefreshToken(tokenData.user_id, newRefreshToken);
    
    res.json({
      code: 200,
      message: '令牌刷新成功',
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
    
  } catch (error) {
    console.error('刷新令牌失败:', error);
    res.status(401).json({
      code: 401,
      message: '刷新令牌无效或已过期'
    });
  }
});

// 退出登录
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    
    res.json({
      code: 200,
      message: '退出登录成功'
    });
    
  } catch (error) {
    console.error('退出登录失败:', error);
    res.status(500).json({
      code: 500,
      message: '退出登录失败'
    });
  }
});

// 第三方登录（微信、QQ等）
router.post('/social-login', async (req, res) => {
  const db = getDB();
  
  try {
    const { type, code, userInfo } = req.body;
    
    // 这里需要根据不同的第三方平台实现具体的验证逻辑
    // 暂时返回未实现的响应
    res.status(501).json({
      code: 501,
      message: '第三方登录功能暂未实现'
    });
    
  } catch (error) {
    console.error('第三方登录失败:', error);
    res.status(500).json({
      code: 500,
      message: '第三方登录失败'
    });
  }
});

module.exports = router;