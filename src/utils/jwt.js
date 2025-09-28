const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');

// 生成访问令牌
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

// 生成刷新令牌
function generateRefreshToken() {
  return jwt.sign({ type: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
  });
}

// 验证刷新令牌
function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
}

// 保存刷新令牌到数据库
async function saveRefreshToken(userId, token) {
  const db = getDB();
  const tokenId = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30天后过期

  await db.execute(
    'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
    [tokenId, userId, token, expiresAt]
  );

  return tokenId;
}

// 验证并获取刷新令牌
async function validateRefreshToken(token) {
  const db = getDB();
  
  try {
    // 验证令牌格式
    verifyRefreshToken(token);
    
    // 从数据库查询令牌
    const [tokens] = await db.execute(
      `SELECT rt.*, u.id as user_id, u.username, u.status 
       FROM refresh_tokens rt 
       JOIN users u ON rt.user_id = u.id 
       WHERE rt.token = ? AND rt.expires_at > NOW() AND u.status = 'active'`,
      [token]
    );

    if (tokens.length === 0) {
      throw new Error('刷新令牌无效或已过期');
    }

    return tokens[0];
  } catch (error) {
    throw new Error('刷新令牌验证失败');
  }
}

// 删除刷新令牌
async function revokeRefreshToken(token) {
  const db = getDB();
  await db.execute('DELETE FROM refresh_tokens WHERE token = ?', [token]);
}

// 删除用户的所有刷新令牌
async function revokeAllRefreshTokens(userId) {
  const db = getDB();
  await db.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
}

// 清理过期的刷新令牌
async function cleanupExpiredTokens() {
  const db = getDB();
  await db.execute('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  saveRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  cleanupExpiredTokens
};