const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取应用设置
router.get('/app', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const [settings] = await db.execute(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (settings.length === 0) {
      // 如果没有设置记录，创建默认设置
      const settingsId = uuidv4();
      await db.execute(
        `INSERT INTO user_settings (id, user_id, theme, language, auto_save, 
         image_quality, notification_process_complete, notification_system_update) 
         VALUES (?, ?, 'light', 'zh-CN', 1, 'high', 1, 1)`,
        [settingsId, req.user.id]
      );

      return res.json({
        code: 200,
        data: {
          theme: 'light',
          language: 'zh-CN',
          autoSave: true,
          imageQuality: 'high',
          notifications: {
            processComplete: true,
            systemUpdate: true
          }
        }
      });
    }

    const setting = settings[0];

    res.json({
      code: 200,
      data: {
        theme: setting.theme || 'light',
        language: setting.language || 'zh-CN',
        autoSave: Boolean(setting.auto_save),
        imageQuality: setting.image_quality || 'high',
        notifications: {
          processComplete: Boolean(setting.notification_process_complete),
          systemUpdate: Boolean(setting.notification_system_update)
        }
      }
    });

  } catch (error) {
    console.error('获取应用设置失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取应用设置失败'
    });
  }
});

// 更新应用设置
router.put('/app', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { theme, language, autoSave, imageQuality, notifications } = req.body;
    
    const updateFields = [];
    const updateValues = [];
    
    if (theme !== undefined) {
      updateFields.push('theme = ?');
      updateValues.push(theme);
    }
    
    if (language !== undefined) {
      updateFields.push('language = ?');
      updateValues.push(language);
    }
    
    if (autoSave !== undefined) {
      updateFields.push('auto_save = ?');
      updateValues.push(autoSave ? 1 : 0);
    }
    
    if (imageQuality !== undefined) {
      updateFields.push('image_quality = ?');
      updateValues.push(imageQuality);
    }
    
    if (notifications?.processComplete !== undefined) {
      updateFields.push('notification_process_complete = ?');
      updateValues.push(notifications.processComplete ? 1 : 0);
    }
    
    if (notifications?.systemUpdate !== undefined) {
      updateFields.push('notification_system_update = ?');
      updateValues.push(notifications.systemUpdate ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '没有需要更新的设置'
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.user.id);

    await db.execute(
      `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = ?`,
      updateValues
    );

    res.json({
      code: 200,
      message: '应用设置更新成功'
    });

  } catch (error) {
    console.error('更新应用设置失败:', error);
    res.status(500).json({
      code: 500,
      message: '更新应用设置失败'
    });
  }
});

// 获取安全设置
router.get('/security', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    // 获取用户安全设置
    const [settings] = await db.execute(
      'SELECT two_factor_enabled FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    // 获取登录设备列表
    const [devices] = await db.execute(
      `SELECT device_id, device_name, platform, last_login_time, location, 
              CASE WHEN device_id = ? THEN true ELSE false END as isCurrent
       FROM login_devices WHERE user_id = ? AND status = 'active'
       ORDER BY last_login_time DESC`,
      [req.get('Device-ID') || 'unknown', req.user.id]
    );

    // 获取登录历史
    const [history] = await db.execute(
      `SELECT login_time, platform, location, ip_address, status
       FROM login_history WHERE user_id = ?
       ORDER BY login_time DESC LIMIT 10`,
      [req.user.id]
    );

    res.json({
      code: 200,
      data: {
        twoFactorEnabled: settings.length > 0 ? Boolean(settings[0].two_factor_enabled) : false,
        loginDevices: devices.map(device => ({
          deviceId: device.device_id,
          deviceName: device.device_name,
          platform: device.platform,
          lastLoginTime: device.last_login_time,
          location: device.location,
          isCurrent: Boolean(device.isCurrent)
        })),
        loginHistory: history.map(record => ({
          loginTime: record.login_time,
          platform: record.platform,
          location: record.location,
          ip: record.ip_address,
          status: record.status
        }))
      }
    });

  } catch (error) {
    console.error('获取安全设置失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取安全设置失败'
    });
  }
});

// 启用/禁用两步验证
router.put('/security/two-factor', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { enabled, verifyCode } = req.body;
    
    if (enabled === undefined) {
      return res.status(400).json({
        code: 400,
        message: '请指定是否启用两步验证'
      });
    }

    // TODO: 验证验证码
    // 这里需要实现两步验证码的验证逻辑
    if (enabled && !verifyCode) {
      return res.status(400).json({
        code: 400,
        message: '启用两步验证需要提供验证码'
      });
    }

    await db.execute(
      'UPDATE user_settings SET two_factor_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [enabled ? 1 : 0, req.user.id]
    );

    res.json({
      code: 200,
      message: enabled ? '两步验证已启用' : '两步验证已禁用'
    });

  } catch (error) {
    console.error('设置两步验证失败:', error);
    res.status(500).json({
      code: 500,
      message: '设置两步验证失败'
    });
  }
});

// 移除登录设备
router.delete('/security/devices/:deviceId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({
        code: 400,
        message: '设备ID不能为空'
      });
    }

    // 检查设备是否属于当前用户
    const [devices] = await db.execute(
      'SELECT id FROM login_devices WHERE device_id = ? AND user_id = ?',
      [deviceId, req.user.id]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '设备不存在'
      });
    }

    // 检查是否是当前设备
    const currentDeviceId = req.get('Device-ID') || 'unknown';
    if (deviceId === currentDeviceId) {
      return res.status(400).json({
        code: 400,
        message: '不能移除当前设备'
      });
    }

    // 移除设备（标记为非活跃状态）
    await db.execute(
      'UPDATE login_devices SET status = "removed", updated_at = CURRENT_TIMESTAMP WHERE device_id = ? AND user_id = ?',
      [deviceId, req.user.id]
    );

    res.json({
      code: 200,
      message: '设备移除成功'
    });

  } catch (error) {
    console.error('移除设备失败:', error);
    res.status(500).json({
      code: 500,
      message: '移除设备失败'
    });
  }
});

module.exports = router;