const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { validateUpdateProfile, validateChangePassword } = require('../middleware/validation');
const { upload, getFileUrl, generateThumbnail, deleteFile } = require('../utils/upload');
const { 
  generateVerificationCode, 
  storeVerificationCode, 
  verifyCode, 
  sendEmailVerificationCode, 
  sendSMSVerificationCode 
} = require('../utils/verification');

const router = express.Router();

// 获取用户资料
router.get('/profile', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.username, u.phone, u.email, u.created_at as joinDate,
              p.nickname, p.gender, p.birthday, p.avatar, p.wechat, p.qq
       FROM users u 
       LEFT JOIN user_profiles p ON u.id = p.user_id 
       WHERE u.id = ?`,
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在'
      });
    }
    
    const user = users[0];
    
    res.json({
      code: 200,
      data: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        gender: user.gender,
        birthday: user.birthday,
        phone: user.phone,
        email: user.email,
        avatar: user.avatar,
        joinDate: user.joinDate,
        contact: {
          wechat: user.wechat,
          qq: user.qq
        }
      }
    });
    
  } catch (error) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取用户资料失败'
    });
  }
});

// 更新用户资料
router.put('/profile', authenticateToken, validateUpdateProfile, async (req, res) => {
  const db = getDB();
  
  try {
    const { nickname, gender, birthday, contact } = req.body;
    
    // 检查用户资料是否存在，不存在则创建
    const [profiles] = await db.execute(
      'SELECT id FROM user_profiles WHERE user_id = ?',
      [req.user.id]
    );
    
    if (profiles.length === 0) {
      // 创建用户资料
      const profileId = uuidv4();
      await db.execute(
        'INSERT INTO user_profiles (id, user_id) VALUES (?, ?)',
        [profileId, req.user.id]
      );
    }
    
    const updateFields = [];
    const updateValues = [];
    
    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      updateValues.push(nickname);
    }
    
    if (gender !== undefined) {
      updateFields.push('gender = ?');
      updateValues.push(gender);
    }
    
    if (birthday !== undefined) {
      updateFields.push('birthday = ?');
      updateValues.push(birthday);
    }
    
    if (contact?.wechat !== undefined) {
      updateFields.push('wechat = ?');
      updateValues.push(contact.wechat);
    }
    
    if (contact?.qq !== undefined) {
      updateFields.push('qq = ?');
      updateValues.push(contact.qq);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '没有需要更新的字段'
      });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.user.id);
    
    await db.execute(
      `UPDATE user_profiles SET ${updateFields.join(', ')} WHERE user_id = ?`,
      updateValues
    );
    
    res.json({
      code: 200,
      message: '用户资料更新成功'
    });
    
  } catch (error) {
    console.error('更新用户资料失败:', error);
    res.status(500).json({
      code: 500,
      message: '更新用户资料失败'
    });
  }
});

// 上传头像
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  const db = getDB();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        message: '请选择头像文件'
      });
    }
    
    const avatarUrl = getFileUrl(req, req.file.path);
    
    // 检查用户资料是否存在，不存在则创建
    const [profiles] = await db.execute(
      'SELECT id FROM user_profiles WHERE user_id = ?',
      [req.user.id]
    );
    
    if (profiles.length === 0) {
      const profileId = uuidv4();
      await db.execute(
        'INSERT INTO user_profiles (id, user_id, avatar) VALUES (?, ?, ?)',
        [profileId, req.user.id, avatarUrl]
      );
    } else {
      // 更新用户头像
      await db.execute(
        'UPDATE user_profiles SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [avatarUrl, req.user.id]
      );
    }
    
    res.json({
      code: 200,
      message: '头像上传成功',
      data: {
        avatarUrl
      }
    });
    
  } catch (error) {
    console.error('头像上传失败:', error);
    
    // 删除已上传的文件
    if (req.file) {
      await deleteFile(req.file.path);
    }
    
    res.status(500).json({
      code: 500,
      message: '头像上传失败'
    });
  }
});

// 修改密码
router.put('/password', authenticateToken, validateChangePassword, async (req, res) => {
  const db = getDB();
  
  try {
    const { oldPassword, newPassword } = req.body;
    
    // 获取当前密码
    const [users] = await db.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在'
      });
    }
    
    // 验证原密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, users[0].password_hash);
    if (!isOldPasswordValid) {
      return res.status(400).json({
        code: 400,
        message: '原密码错误'
      });
    }
    
    // 加密新密码
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // 更新密码
    await db.execute(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, req.user.id]
    );
    
    res.json({
      code: 200,
      message: '密码修改成功'
    });
    
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      code: 500,
      message: '修改密码失败'
    });
  }
});

// 发送手机验证码
router.post('/send-phone-code', authenticateToken, async (req, res) => {
  try {
    const { phone } = req.body;
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        code: 400,
        message: '手机号格式不正确'
      });
    }
    
    // 检查手机号是否已被使用
    const db = getDB();
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE phone = ? AND id != ?',
      [phone, req.user.id]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '该手机号已被其他用户使用'
      });
    }
    
    // 生成验证码
    const code = generateVerificationCode();
    const key = `phone_verify:${req.user.id}:${phone}`;
    
    // 存储验证码
    await storeVerificationCode(key, code, 5);
    
    // 发送短信
    const sent = await sendSMSVerificationCode(phone, code);
    
    if (sent) {
      res.json({
        code: 200,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        code: 500,
        message: '验证码发送失败'
      });
    }
    
  } catch (error) {
    console.error('发送手机验证码失败:', error);
    res.status(500).json({
      code: 500,
      message: '发送验证码失败'
    });
  }
});

// 绑定手机号
router.post('/bind-phone', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { phone, verifyCode } = req.body;
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        code: 400,
        message: '手机号格式不正确'
      });
    }
    
    if (!verifyCode) {
      return res.status(400).json({
        code: 400,
        message: '请输入验证码'
      });
    }
    
    // 检查手机号是否已被使用
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE phone = ? AND id != ?',
      [phone, req.user.id]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '该手机号已被其他用户使用'
      });
    }
    
    // 验证验证码
    const key = `phone_verify:${req.user.id}:${phone}`;
    const isCodeValid = await verifyCode(key, verifyCode);
    
    if (!isCodeValid) {
      return res.status(400).json({
        code: 400,
        message: '验证码错误或已过期'
      });
    }
    
    // 更新手机号
    await db.execute(
      'UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [phone, req.user.id]
    );
    
    res.json({
      code: 200,
      message: '手机号绑定成功'
    });
    
  } catch (error) {
    console.error('绑定手机号失败:', error);
    res.status(500).json({
      code: 500,
      message: '绑定手机号失败'
    });
  }
});

// 发送邮箱验证码
router.post('/send-email-code', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        code: 400,
        message: '邮箱格式不正确'
      });
    }
    
    // 检查邮箱是否已被使用
    const db = getDB();
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, req.user.id]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '该邮箱已被其他用户使用'
      });
    }
    
    // 生成验证码
    const code = generateVerificationCode();
    const key = `email_verify:${req.user.id}:${email}`;
    
    // 存储验证码
    await storeVerificationCode(key, code, 5);
    
    // 发送邮件
    const sent = await sendEmailVerificationCode(email, code);
    
    if (sent) {
      res.json({
        code: 200,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        code: 500,
        message: '验证码发送失败'
      });
    }
    
  } catch (error) {
    console.error('发送邮箱验证码失败:', error);
    res.status(500).json({
      code: 500,
      message: '发送验证码失败'
    });
  }
});

// 绑定邮箱
router.post('/bind-email', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { email, verifyCode } = req.body;
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        code: 400,
        message: '邮箱格式不正确'
      });
    }
    
    if (!verifyCode) {
      return res.status(400).json({
        code: 400,
        message: '请输入验证码'
      });
    }
    
    // 检查邮箱是否已被使用
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, req.user.id]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '该邮箱已被其他用户使用'
      });
    }
    
    // 验证验证码
    const key = `email_verify:${req.user.id}:${email}`;
    const isCodeValid = await verifyCode(key, verifyCode);
    
    if (!isCodeValid) {
      return res.status(400).json({
        code: 400,
        message: '验证码错误或已过期'
      });
    }
    
    // 更新邮箱
    await db.execute(
      'UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [email, req.user.id]
    );
    
    res.json({
      code: 200,
      message: '邮箱绑定成功'
    });
    
  } catch (error) {
    console.error('绑定邮箱失败:', error);
    res.status(500).json({
      code: 500,
      message: '绑定邮箱失败'
    });
  }
});

// 解绑手机号
router.delete('/unbind-phone', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    // 检查用户是否绑定了邮箱（至少保留一种联系方式）
    const [users] = await db.execute(
      'SELECT email FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在'
      });
    }
    
    if (!users[0].email) {
      return res.status(400).json({
        code: 400,
        message: '请先绑定邮箱后再解绑手机号'
      });
    }
    
    // 解绑手机号
    await db.execute(
      'UPDATE users SET phone = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id]
    );
    
    res.json({
      code: 200,
      message: '手机号解绑成功'
    });
    
  } catch (error) {
    console.error('解绑手机号失败:', error);
    res.status(500).json({
      code: 500,
      message: '解绑手机号失败'
    });
  }
});

// 解绑邮箱
router.delete('/unbind-email', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    // 检查用户是否绑定了手机号（至少保留一种联系方式）
    const [users] = await db.execute(
      'SELECT phone FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在'
      });
    }
    
    if (!users[0].phone) {
      return res.status(400).json({
        code: 400,
        message: '请先绑定手机号后再解绑邮箱'
      });
    }
    
    // 解绑邮箱
    await db.execute(
      'UPDATE users SET email = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id]
    );
    
    res.json({
      code: 200,
      message: '邮箱解绑成功'
    });
    
  } catch (error) {
    console.error('解绑邮箱失败:', error);
    res.status(500).json({
      code: 500,
      message: '解绑邮箱失败'
    });
  }
});

module.exports = router;