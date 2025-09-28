const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取模型配置列表
router.get('/configs', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const [configs] = await db.execute(
      `SELECT id, name, description, api_url, model_name, default_model,
              support_custom_model, temperature, max_tokens, timeout,
              is_configured, is_default, created_at, updated_at
       FROM model_configs WHERE user_id = ?
       ORDER BY is_default DESC, created_at ASC`,
      [req.user.id]
    );

    const configList = configs.map(config => ({
      id: config.id,
      name: config.name,
      description: config.description,
      apiUrl: config.api_url,
      apiKey: '***', // 不返回真实的API Key
      modelName: config.model_name,
      defaultModel: config.default_model,
      supportCustomModel: Boolean(config.support_custom_model),
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      timeout: config.timeout,
      isConfigured: Boolean(config.is_configured),
      isDefault: Boolean(config.is_default)
    }));

    res.json({
      code: 200,
      data: configList
    });

  } catch (error) {
    console.error('获取模型配置失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取模型配置失败'
    });
  }
});

// 保存模型配置
router.post('/configs', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { 
      modelId, 
      apiUrl, 
      apiKey, 
      modelName, 
      temperature = 0.7, 
      maxTokens = 2048, 
      timeout = 30000 
    } = req.body;
    
    if (!modelId || !apiUrl || !apiKey) {
      return res.status(400).json({
        code: 400,
        message: '模型ID、API地址和API密钥不能为空'
      });
    }

    // 检查是否已存在该模型配置
    const [existing] = await db.execute(
      'SELECT id FROM model_configs WHERE id = ? AND user_id = ?',
      [modelId, req.user.id]
    );

    if (existing.length > 0) {
      // 更新现有配置
      await db.execute(
        `UPDATE model_configs SET 
         api_url = ?, api_key = ?, model_name = ?, temperature = ?, 
         max_tokens = ?, timeout = ?, is_configured = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [apiUrl, apiKey, modelName || '', temperature, maxTokens, timeout, modelId, req.user.id]
      );
    } else {
      // 创建新配置
      const configId = uuidv4();
      
      // 获取模型信息（这里应该根据modelId从预定义的模型列表中获取）
      const modelInfo = getModelInfo(modelId);
      
      await db.execute(
        `INSERT INTO model_configs (
          id, user_id, name, description, api_url, api_key, model_name,
          default_model, support_custom_model, temperature, max_tokens, 
          timeout, is_configured, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          configId,
          req.user.id,
          modelInfo.name,
          modelInfo.description,
          apiUrl,
          apiKey,
          modelName || modelInfo.defaultModel,
          modelInfo.defaultModel,
          modelInfo.supportCustomModel,
          temperature,
          maxTokens,
          timeout
        ]
      );
    }

    res.json({
      code: 200,
      message: '模型配置保存成功'
    });

  } catch (error) {
    console.error('保存模型配置失败:', error);
    res.status(500).json({
      code: 500,
      message: '保存模型配置失败'
    });
  }
});

// 测试模型连接
router.post('/test-connection', authenticateToken, async (req, res) => {
  try {
    const { modelId, apiUrl, apiKey, modelName } = req.body;
    
    if (!apiUrl || !apiKey) {
      return res.status(400).json({
        code: 400,
        message: 'API地址和API密钥不能为空'
      });
    }

    const startTime = Date.now();
    
    try {
      // 发送测试请求到AI模型API
      const response = await axios.post(
        apiUrl,
        {
          model: modelName || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: 'Hello, this is a connection test.'
            }
          ],
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const responseTime = Date.now() - startTime;

      res.json({
        code: 200,
        data: {
          success: true,
          message: '连接测试成功',
          responseTime,
          modelInfo: {
            model: response.data.model || modelName,
            usage: response.data.usage
          }
        }
      });

    } catch (apiError) {
      console.error('API连接测试失败:', apiError);
      
      let errorMessage = '连接测试失败';
      if (apiError.response) {
        errorMessage = `API错误: ${apiError.response.status} ${apiError.response.statusText}`;
      } else if (apiError.code === 'ECONNABORTED') {
        errorMessage = '连接超时';
      } else if (apiError.code === 'ENOTFOUND') {
        errorMessage = 'API地址无法访问';
      }

      res.json({
        code: 200,
        data: {
          success: false,
          message: errorMessage,
          responseTime: Date.now() - startTime
        }
      });
    }

  } catch (error) {
    console.error('测试模型连接失败:', error);
    res.status(500).json({
      code: 500,
      message: '测试模型连接失败'
    });
  }
});

// 设置默认模型
router.put('/default', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json({
        code: 400,
        message: '模型ID不能为空'
      });
    }

    // 检查模型配置是否存在
    const [configs] = await db.execute(
      'SELECT id FROM model_configs WHERE id = ? AND user_id = ? AND is_configured = 1',
      [modelId, req.user.id]
    );

    if (configs.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '模型配置不存在或未配置'
      });
    }

    await db.execute('START TRANSACTION');

    try {
      // 取消所有模型的默认状态
      await db.execute(
        'UPDATE model_configs SET is_default = 0 WHERE user_id = ?',
        [req.user.id]
      );

      // 设置新的默认模型
      await db.execute(
        'UPDATE model_configs SET is_default = 1 WHERE id = ? AND user_id = ?',
        [modelId, req.user.id]
      );

      await db.execute('COMMIT');

      res.json({
        code: 200,
        message: '默认模型设置成功'
      });

    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('设置默认模型失败:', error);
    res.status(500).json({
      code: 500,
      message: '设置默认模型失败'
    });
  }
});

// 获取全局设置
router.get('/global-settings', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const [settings] = await db.execute(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (settings.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户设置不存在'
      });
    }

    const setting = settings[0];
    
    // 获取默认模型ID
    const [defaultModel] = await db.execute(
      'SELECT id FROM model_configs WHERE user_id = ? AND is_default = 1',
      [req.user.id]
    );

    res.json({
      code: 200,
      data: {
        defaultModelId: defaultModel.length > 0 ? defaultModel[0].id : null,
        autoRetry: Boolean(setting.auto_retry),
        retryCount: setting.retry_count || 3,
        timeout: setting.timeout || 30000
      }
    });

  } catch (error) {
    console.error('获取全局设置失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取全局设置失败'
    });
  }
});

// 更新全局设置
router.put('/global-settings', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { defaultModelId, autoRetry, retryCount, timeout } = req.body;
    
    const updateFields = [];
    const updateValues = [];
    
    if (autoRetry !== undefined) {
      updateFields.push('auto_retry = ?');
      updateValues.push(autoRetry ? 1 : 0);
    }
    
    if (retryCount !== undefined) {
      updateFields.push('retry_count = ?');
      updateValues.push(retryCount);
    }
    
    if (timeout !== undefined) {
      updateFields.push('timeout = ?');
      updateValues.push(timeout);
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(req.user.id);

      await db.execute(
        `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = ?`,
        updateValues
      );
    }

    // 如果指定了默认模型，更新默认模型设置
    if (defaultModelId) {
      await db.execute('START TRANSACTION');

      try {
        await db.execute(
          'UPDATE model_configs SET is_default = 0 WHERE user_id = ?',
          [req.user.id]
        );

        await db.execute(
          'UPDATE model_configs SET is_default = 1 WHERE id = ? AND user_id = ?',
          [defaultModelId, req.user.id]
        );

        await db.execute('COMMIT');
      } catch (error) {
        await db.execute('ROLLBACK');
        throw error;
      }
    }

    res.json({
      code: 200,
      message: '全局设置更新成功'
    });

  } catch (error) {
    console.error('更新全局设置失败:', error);
    res.status(500).json({
      code: 500,
      message: '更新全局设置失败'
    });
  }
});

// 辅助函数：获取模型信息
function getModelInfo(modelId) {
  const modelMap = {
    'openai-gpt4': {
      name: 'OpenAI GPT-4',
      description: 'OpenAI GPT-4 模型',
      defaultModel: 'gpt-4',
      supportCustomModel: true
    },
    'openai-gpt35': {
      name: 'OpenAI GPT-3.5',
      description: 'OpenAI GPT-3.5 Turbo 模型',
      defaultModel: 'gpt-3.5-turbo',
      supportCustomModel: true
    },
    'claude-3': {
      name: 'Claude 3',
      description: 'Anthropic Claude 3 模型',
      defaultModel: 'claude-3-sonnet-20240229',
      supportCustomModel: true
    },
    'gemini-pro': {
      name: 'Gemini Pro',
      description: 'Google Gemini Pro 模型',
      defaultModel: 'gemini-pro',
      supportCustomModel: false
    }
  };

  return modelMap[modelId] || {
    name: '自定义模型',
    description: '用户自定义AI模型',
    defaultModel: 'custom-model',
    supportCustomModel: true
  };
}

module.exports = router;