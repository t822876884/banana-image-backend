const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { upload, getFileUrl, generateThumbnail, getImageInfo, deleteFile } = require('../utils/upload');
const fs = require('fs');
const path = require('path');

// 代理配置 - 在导入AI库之前设置
const useProxy = process.env.USE_PROXY === 'true';
const proxyHost = process.env.PROXY_HOST || '127.0.0.1';
const proxyPort = process.env.PROXY_PORT || '7890';

if (useProxy) {
  const proxyUrl = `http://${proxyHost}:${proxyPort}`;
  
  // 设置全局代理环境变量
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;
  
  console.log(`🌐 图片处理模块启用代理: ${proxyUrl}`);
  
  // 设置 Node.js 全局代理
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const https = require('https');
  const http = require('http');
  
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  https.globalAgent = proxyAgent;
  http.globalAgent = proxyAgent;
}

// 在代理配置后导入AI库
const { GoogleGenAI } = require('@google/genai');
const https = require('https');

const router = express.Router();

// ==================== 核心处理引擎 ====================

/**
 * AI模型处理引擎
 * 支持多种AI模型的统一接口
 */
class AIProcessingEngine {
  constructor() {
    this.models = {
      gemini: new GeminiProcessor(),
      // 后续可以添加其他模型
      // openai: new OpenAIProcessor(),
      // midjourney: new MidjourneyProcessor(),
    };
  }

  /**
   * 根据场景配置选择合适的AI模型进行处理
   */
  async processImage(imageData, sceneConfig, prompt) {
    const modelType = sceneConfig.preferredModel || 'gemini';
    const processor = this.models[modelType];
    
    if (!processor) {
      throw new Error(`不支持的AI模型: ${modelType}`);
    }

    return await processor.process(imageData, sceneConfig, prompt);
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels() {
    return Object.keys(this.models);
  }
}

/**
 * Gemini模型处理器
 */
class GeminiProcessor {
  constructor() {
    this.apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!this.apiKey) {
      throw new Error('Google AI API密钥未配置');
    }
  }

  async process(imageData, sceneConfig, prompt) {
    console.log(`🤖 开始Gemini处理，使用代理: ${useProxy}`);
    console.log(`📝 提示词长度: ${prompt.length}`);
    console.log(`🖼️ 图片数据: ${imageData ? '有' : '无'}`);
    
    try {
      let response;
      if (useProxy) {
        console.log('🌐 使用原生HTTPS请求（代理模式）');
        response = await this.makeNativeRequest(imageData, sceneConfig, prompt);
      } else {
        console.log('📚 使用GoogleGenAI库');
        response = await this.makeLibraryRequest(imageData, sceneConfig, prompt);
      }
      
      console.log(`📥 收到Gemini响应`);
      return this.parseResponse(response, sceneConfig);
    } catch (error) {
      console.error(`❌ Gemini处理失败:`, error.message);
      throw error;
    }
  }

  async makeNativeRequest(imageData, sceneConfig, prompt) {
    // 构建正确的请求格式
    const parts = [{ text: prompt }];
    
    // 如果有图片数据，添加到parts中
    if (imageData) {
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64Data
        }
      });
    }

    const contents = [{ parts: parts }];

    return await this.makeGeminiRequest(
      this.apiKey,
      'gemini-2.5-flash-image-preview',
      contents
    );
  }

  async makeLibraryRequest(imageData, sceneConfig, prompt) {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    
    // 构建正确的请求格式
    const parts = [{ text: prompt }];
    
    // 如果有图片数据，添加到parts中
    if (imageData) {
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64Data
        }
      });
    }

    const contents = [{ parts: parts }];

    const requestData = {
      model: "gemini-2.5-flash-image-preview",
      contents: contents
    };

    console.log(`📤 发送请求到Gemini:`, {
      model: requestData.model,
      contentsCount: contents.length,
      partsCount: parts.length,
      hasImage: !!imageData,
      promptLength: prompt.length
    });

    const response = await ai.models.generateContent(requestData);
    console.log(`📥 Gemini库响应:`, {
      hasCandidates: !!response.candidates,
      candidatesCount: response.candidates?.length || 0
    });
    
    return response;
  }

  async makeGeminiRequest(apiKey, model, contents) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const requestData = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    };

    console.log(`📤 原生请求到Gemini:`, {
      url: url.replace(apiKey, '***'),
      contentsCount: contents.length,
      partsCount: contents[0]?.parts?.length || 0,
      model: model
    });

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestData);
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log(`📥 原生响应状态: ${res.statusCode}`);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              console.error(`❌ API错误响应:`, response);
              reject(new Error(`API请求失败: ${res.statusCode} - ${response.error?.message || data}`));
            }
          } catch (error) {
            console.error(`❌ 解析响应失败:`, error.message, '原始数据:', data);
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`❌ 请求错误:`, error);
        reject(new Error(`请求失败: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  parseResponse(response, sceneConfig) {
    console.log(`🔧 开始解析响应，候选项数量: ${response.candidates?.length || 0}`);
    
    const result = {
      textResponse: '',
      images: [],
      model: 'gemini-2.5-flash-image-preview',
      proxyUsed: useProxy
    };

    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const parts = response.candidates[0].content.parts;
      console.log(`📝 响应部分数量: ${parts?.length || 0}`);

      for (const part of parts) {
        if (part.text) {
          result.textResponse += part.text;
          console.log(`📄 找到文本部分，长度: ${part.text.length}`);
        } else if (part.inlineData) {
          result.images.push({
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data
          });
          console.log(`🖼️ 找到图片部分，MIME类型: ${part.inlineData.mimeType}, 数据长度: ${part.inlineData.data.length}`);
        } else {
          console.log(`❓ 未知的响应部分类型:`, Object.keys(part));
        }
      }
    } else {
      console.log(`⚠️ 响应结构异常:`, {
        hasCandidates: !!response.candidates,
        candidatesLength: response.candidates?.length,
        firstCandidate: response.candidates?.[0] ? Object.keys(response.candidates[0]) : null,
        fullResponse: JSON.stringify(response, null, 2)
      });
    }

    console.log(`✅ 解析完成: 文本=${result.textResponse.length}字符, 图片=${result.images.length}张`);
    return result;
  }
}

/**
 * 处理进度管理器
 */
class ProcessProgressManager {
  constructor() {
    this.processes = new Map();
  }

  createProcess(processId, userId, imageId, sceneId) {
    const process = {
      id: processId,
      userId,
      imageId,
      sceneId,
      status: 'initializing',
      progress: 0,
      startTime: Date.now(),
      estimatedTime: 30000, // 默认30秒
      currentStep: '初始化处理任务',
      error: null
    };

    this.processes.set(processId, process);
    return process;
  }

  updateProgress(processId, updates) {
    const process = this.processes.get(processId);
    if (process) {
      Object.assign(process, updates);
      return process;
    }
    return null;
  }

  getProcess(processId) {
    return this.processes.get(processId);
  }

  removeProcess(processId) {
    this.processes.delete(processId);
  }

  getStatusText(status) {
    const statusMap = {
      'initializing': '初始化中',
      'loading_scene': '加载场景配置',
      'preparing_prompt': '准备提示词',
      'calling_ai': '调用AI模型',
      'processing_result': '处理结果',
      'saving_images': '保存图片',
      'generating_thumbnails': '生成缩略图',
      'updating_database': '更新数据库',
      'completed': '处理完成',
      'failed': '处理失败'
    };
    return statusMap[status] || status;
  }
}

// 创建全局实例
const aiEngine = new AIProcessingEngine();
const progressManager = new ProcessProgressManager();

// ==================== 辅助函数 ====================

/**
 * 根据场景ID获取场景配置和描述
 */
async function getSceneConfig(sceneId, userId) {
  const db = getDB();
  
  const [scenes] = await db.execute(
    `SELECT s.*, sc.name as category_name 
     FROM scenes s 
     LEFT JOIN scene_categories sc ON s.category_id = sc.id 
     WHERE s.id = ? AND (s.user_id IS NULL OR s.user_id = ?)`,
    [sceneId, userId]
  );

  if (scenes.length === 0) {
    throw new Error('场景不存在或无权限访问');
  }

  const scene = scenes[0];
  return {
    id: scene.id,
    name: scene.name,
    type: scene.type,
    description: scene.description,
    config: scene.config ? JSON.parse(scene.config) : {},
    categoryName: scene.category_name,
    preferredModel: scene.config?.preferredModel || 'gemini'
  };
}

/**
 * 构建完整的处理提示词
 */
function buildProcessingPrompt(sceneConfig, userPrompt = '') {
  let prompt = sceneConfig.description || '';
  
  // 根据场景类型添加特定的图片生成提示词
  const scenePrompts = {
    'portrait_enhance': '请基于这张人像照片，生成一张高质量的改进版本，注重面部细节、自然光线和专业摄影效果',
    'landscape_enhance': '请基于这张风景照片，生成一张更美丽的版本，增强色彩饱和度、对比度和构图效果',
    'style_transfer': '请将这张图片转换为艺术风格，保持主体特征的同时融入创意元素',
    'creative_design': '请基于这张图片创作一张富有创意的新图片，融合现代设计元素和视觉效果',
    'business_use': '请基于这张图片生成一张适合商业用途的专业版本，提升整体质量和商业价值'
  };

  const scenePrompt = scenePrompts[sceneConfig.type] || '请基于这张图片生成一张改进的新图片';
  
  // 组合提示词，明确要求生成图片
  const parts = [
    '请生成一张新图片。',
    prompt, 
    scenePrompt, 
    userPrompt,
    '请确保生成高质量的图片作为输出。'
  ].filter(p => p.trim());
  
  return parts.join(' ');
}

/**
 * 优化后的保存处理结果函数 - 重点优化图片数据处理
 */
async function saveProcessingResult(userId, processId, aiResult, sceneConfig) {
  const db = getDB();
  
  const savedImages = [];
  
  // 直接处理AI返回的图片数据，不强制保存到文件系统
  for (let i = 0; i < aiResult.images.length; i++) {
    const imageData = aiResult.images[i];
    const imageId = uuidv4();
    
    // 从base64数据获取图片信息
    const buffer = Buffer.from(imageData.data, "base64");
    const fileSize = buffer.length;
    
    // 使用sharp获取图片尺寸（如果可用）
    let width = 512, height = 512; // 默认尺寸
    try {
      const sharp = require('sharp');
      const metadata = await sharp(buffer).metadata();
      width = metadata.width || 512;
      height = metadata.height || 512;
    } catch (error) {
      console.log('无法获取图片尺寸，使用默认值:', error.message);
    }

    // 生成缩略图的base64数据
    let thumbnailBase64 = imageData.data; // 默认使用原图
    try {
      const sharp = require('sharp');
      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 200, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .png()
        .toBuffer();
      thumbnailBase64 = thumbnailBuffer.toString('base64');
    } catch (error) {
      console.log('生成缩略图失败，使用原图:', error.message);
    }

    // 构建图片数据对象 - 包含所有必要信息
    const imageObject = {
      id: imageId,
      filename: `${sceneConfig.name}_processed_${i + 1}.png`,
      // 原始图片数据
      base64: imageData.data,
      dataUrl: `data:${imageData.mimeType};base64,${imageData.data}`,
      // 缩略图数据
      thumbnailBase64: thumbnailBase64,
      thumbnailDataUrl: `data:${imageData.mimeType};base64,${thumbnailBase64}`,
      // 图片信息
      mimeType: imageData.mimeType,
      width: width,
      height: height,
      fileSize: fileSize,
      // 可选：如果需要文件URL（用于下载等）
      downloadUrl: `/api/image/download-base64/${processId}/${imageId}`,
      // 处理信息
      processId: processId,
      sceneType: sceneConfig.type,
      createdAt: new Date().toISOString()
    };

    // 可选：保存到数据库（如果需要持久化记录）
    try {
      await db.execute(
        `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
         thumbnail_path, file_size, mime_type, width, height, scene_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          imageId,
          userId,
          imageObject.filename,
          imageObject.filename,
          `base64:${processId}:${imageId}`, // 特殊标记表示这是base64数据
          `base64_thumb:${processId}:${imageId}`,
          fileSize,
          imageData.mimeType,
          width,
          height,
          sceneConfig.type
        ]
      );
    } catch (dbError) {
      console.log('数据库保存失败，继续处理:', dbError.message);
    }

    savedImages.push(imageObject);
  }

  // 计算处理时间
  const processTime = Date.now() - (progressManager.getProcess(processId)?.startTime || Date.now());
  
  // 构建处理结果数据 - 包含完整的图片信息
  const resultData = {
    processId: processId,
    textResponse: aiResult.textResponse,
    images: savedImages,
    model: aiResult.model,
    proxyUsed: aiResult.proxyUsed,
    processTime: processTime,
    sceneConfig: {
      id: sceneConfig.id,
      name: sceneConfig.name,
      type: sceneConfig.type
    },
    completedAt: new Date().toISOString()
  };

  // 更新处理记录
  await db.execute(
    `UPDATE process_records SET 
     status = 'completed', 
     updated_at = CURRENT_TIMESTAMP,
     process_params = ?,
     process_time = ?
     WHERE id = ?`,
    [
      JSON.stringify(resultData),
      processTime,
      processId
    ]
  );

  return savedImages;
}

// ==================== API 路由 ====================

// 1. 图片上传 (保持现有实现)
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  const db = getDB();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        message: '请选择图片文件'
      });
    }

    const { sceneType } = req.body;
    
    if (!sceneType) {
      return res.status(400).json({
        code: 400,
        message: '场景类型不能为空'
      });
    }

    const imageId = uuidv4();
    const originalUrl = getFileUrl(req, req.file.path);
    
    // 获取图片信息
    const imageInfo = await getImageInfo(req.file.path);
    
    // 生成缩略图
    const thumbnailPath = req.file.path.replace(/(\.[^.]+)$/, '_thumb$1');
    await generateThumbnail(req.file.path, thumbnailPath);
    const thumbnailUrl = getFileUrl(req, thumbnailPath);

    // 保存图片信息到数据库
    await db.execute(
      `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
       thumbnail_path, file_size, mime_type, width, height, scene_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        imageId, 
        req.user.id, 
        req.file.originalname,
        req.file.filename,
        req.file.path,
        thumbnailPath,
        req.file.size,
        req.file.mimetype,
        imageInfo.width,
        imageInfo.height,
        sceneType
      ]
    );

    res.json({
      code: 200,
      message: '图片上传成功',
      data: {
        imageId,
        originalUrl,
        thumbnailUrl,
        fileSize: req.file.size,
        userDirectory: req.user.id.toString(),
        dimensions: {
          width: imageInfo.width,
          height: imageInfo.height
        }
      }
    });

  } catch (error) {
    console.error('图片上传失败:', error);
    
    if (req.file) {
      await deleteFile(req.file.path);
    }
    
    res.status(500).json({
      code: 500,
      message: '图片上传失败'
    });
  }
});

// 2. 图片处理 (重构后的核心功能)
router.post('/process', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { imageId, sceneId, userPrompt = '' } = req.body;
    
    if (!imageId || !sceneId) {
      return res.status(400).json({
        code: 400,
        message: '图片ID和场景ID不能为空'
      });
    }

    // 检查图片是否存在且属于当前用户
    const [images] = await db.execute(
      'SELECT * FROM images WHERE id = ? AND user_id = ?',
      [imageId, req.user.id]
    );

    if (images.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '图片不存在'
      });
    }

    // 获取场景配置
    const sceneConfig = await getSceneConfig(sceneId, req.user.id);

    const sourceImage = images[0];
    const processId = uuidv4();
    
    // 准备处理参数，包含用户提示词和场景ID
    const processParams = {
      userPrompt: userPrompt,
      sceneId: sceneId
    };
    
    // 创建处理记录 - 使用正确的字段名匹配数据库表结构
    await db.execute(
      `INSERT INTO process_records (id, user_id, image_id, scene_type, scene_name, process_params, status)
       VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
      [processId, req.user.id, imageId, sceneConfig.type, sceneConfig.name, JSON.stringify(processParams)]
    );

    // 创建进度跟踪
    progressManager.createProcess(processId, req.user.id, imageId, sceneId);

    // 异步处理图片
    processImageAsync(processId, sourceImage, sceneId, userPrompt, req.user.id);

    res.json({
      code: 200,
      message: '处理任务已提交',
      data: {
        processId,
        status: 'processing',
        estimatedTime: 30
      }
    });

  } catch (error) {
    console.error('图片处理失败:', error);
    res.status(500).json({
      code: 500,
      message: '图片处理失败'
    });
  }
});

// 3. 获取处理进度
router.get('/process-status/:processId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    
    // 从数据库获取处理记录
    const [records] = await db.execute(
      'SELECT * FROM process_records WHERE id = ? AND user_id = ?',
      [processId, req.user.id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '处理记录不存在'
      });
    }

    const record = records[0];
    const processInfo = progressManager.getProcess(processId);
    
    let progress = 0;
    let estimatedTime = 0;
    let currentStep = '';
    let preview = null;

    if (record.status === 'processing' && processInfo) {
      progress = processInfo.progress;
      estimatedTime = Math.max(0, processInfo.estimatedTime - (Date.now() - processInfo.startTime));
      currentStep = processInfo.currentStep;
    } else if (record.status === 'completed') {
      progress = 100;
      currentStep = '处理完成';
      
      // 如果已完成，计算预览信息
      if (record.process_params) {
        try {
          const resultData = typeof record.process_params === 'string' 
            ? JSON.parse(record.process_params) 
            : record.process_params;
          
          if (resultData && resultData.images) {
            preview = {
              hasImages: true,
              imageCount: resultData.images.length,
              hasTextResponse: !!resultData.textResponse,
              processTime: resultData.processTime,
              model: resultData.model
            };
          } else {
            preview = {
              hasImages: false,
              imageCount: 0,
              hasTextResponse: false
            };
          }
        } catch (error) {
          console.error('解析预览信息失败:', error);
          preview = {
            hasImages: false,
            imageCount: 0,
            hasTextResponse: false
          };
        }
      }
    } else if (record.status === 'failed') {
      progress = 0;
      currentStep = '处理失败';
    }

    // 只发送一次响应
    res.json({
      code: 200,
      data: {
        processId: record.id,
        status: record.status,
        progress: progress,
        currentStep: currentStep,
        estimatedTime: estimatedTime,
        startTime: processInfo?.startTime || null,
        preview: preview
      }
    });

  } catch (error) {
    console.error('获取处理状态失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取处理状态失败'
    });
  }
});

// 4. 获取处理结果详情接口 - 直接返回完整的图片数据
router.get('/process-result/:processId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    const { includeOriginal = 'false' } = req.query; // 控制是否包含原图
    
    // 从数据库获取已完成的处理记录
    const [records] = await db.execute(
      'SELECT * FROM process_records WHERE id = ? AND user_id = ? AND status = "completed"',
      [processId, req.user.id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: '处理记录不存在或未完成'
      });
    }

    const record = records[0];
    let resultData = null;

    // 解析处理结果
    if (record.process_params) {
      try {
        resultData = typeof record.process_params === 'string' 
          ? JSON.parse(record.process_params) 
          : record.process_params;
      } catch (parseError) {
        console.error('JSON解析失败:', parseError);
        return res.status(500).json({
          success: false,
          message: '数据解析失败'
        });
      }
    }

    if (!resultData || !resultData.images) {
      return res.status(404).json({
        success: false,
        message: '处理结果不存在'
      });
    }

    // 根据参数决定返回的图片数据
    const responseImages = resultData.images.map(image => {
      const baseImageData = {
        id: image.id,
        filename: image.filename,
        width: image.width,
        height: image.height,
        fileSize: image.fileSize,
        mimeType: image.mimeType,
        // 始终包含缩略图
        thumbnailBase64: image.thumbnailBase64,
        thumbnailDataUrl: image.thumbnailDataUrl,
        // 下载链接
        downloadUrl: image.downloadUrl || `/api/image/download-base64/${processId}/${image.id}`
      };

      // 根据参数决定是否包含原图
      if (includeOriginal === 'true') {
        baseImageData.base64 = image.base64;
        baseImageData.dataUrl = image.dataUrl;
      }

      return baseImageData;
    });

    res.json({
      success: true,
      data: {
        processId: record.id,
        status: record.status,
        textResponse: resultData.textResponse || '',
        images: responseImages,
        model: resultData.model,
        processTime: resultData.processTime,
        sceneConfig: resultData.sceneConfig,
        completedAt: resultData.completedAt,
        // 元数据
        meta: {
          totalImages: responseImages.length,
          includeOriginal: includeOriginal === 'true',
          totalSize: responseImages.reduce((sum, img) => sum + (img.fileSize || 0), 0)
        }
      }
    });

  } catch (error) {
    console.error('获取处理结果失败:', error);
    res.status(500).json({
      success: false,
      message: '获取处理结果失败'
    });
  }
});

// 5. 获取处理结果完整数据接口 (包含原图)
router.get('/process-result-full/:processId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    
    // 从数据库获取已完成的处理记录
    const [records] = await db.execute(
      'SELECT * FROM process_records WHERE id = ? AND user_id = ? AND status = "completed"',
      [processId, req.user.id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: '处理记录不存在或未完成'
      });
    }

    const record = records[0];
    let resultData = null;

    // 尝试解析处理结果
    if (record.process_params) {
      try {
        // 检查数据类型并相应处理
        if (typeof record.process_params === 'string') {
          // 如果是字符串，检查是否是有效的JSON
          if (record.process_params.startsWith('[object Object]') || record.process_params === '[object Object]') {
            console.log('⚠️ 检测到无效的 process_params 字符串，使用默认结构');
            resultData = { images: [] };
          } else {
            // 尝试解析JSON
            resultData = JSON.parse(record.process_params);
          }
        } else if (typeof record.process_params === 'object' && record.process_params !== null) {
          // 如果已经是对象，直接使用
          resultData = record.process_params;
        } else {
          // 其他情况，设为默认结构
          resultData = { images: [] };
        }
        
        // 为图片数据添加base64信息（如果还没有的话）
        if (resultData && resultData.images && Array.isArray(resultData.images)) {
          for (let image of resultData.images) {
            // 如果图片数据中没有base64，尝试从文件读取
            if (!image.base64 && image.originalUrl) {
              try {
                // 从URL中提取文件名
                const filename = path.basename(image.originalUrl);
                const filePath = path.join(__dirname, '../../uploads', filename);
                
                if (fs.existsSync(filePath)) {
                  const buffer = fs.readFileSync(filePath);
                  image.base64 = buffer.toString('base64');
                  image.dataUrl = `data:image/png;base64,${image.base64}`;
                }
                
                // 同样处理缩略图
                if (!image.thumbnailBase64 && image.thumbnailUrl) {
                  const thumbnailFilename = path.basename(image.thumbnailUrl);
                  const thumbnailPath = path.join(__dirname, '../../uploads', thumbnailFilename);
                  
                  if (fs.existsSync(thumbnailPath)) {
                    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
                    image.thumbnailBase64 = thumbnailBuffer.toString('base64');
                    image.thumbnailDataUrl = `data:image/png;base64,${image.thumbnailBase64}`;
                  }
                }
              } catch (fileError) {
                console.error('读取图片文件失败:', fileError);
              }
            }
          }
        }
        
        console.log(`✅ 完整结果解析完成: ${resultData?.images?.length || 0}张图片`);
        
      } catch (parseError) {
        console.error('❌ JSON 解析失败:', parseError);
        resultData = { images: [] };
      }
    }

    res.json({
      success: true,
      data: {
        processId: record.id,
        status: record.status,
        result: (resultData && resultData.images) || []
      }
    });

  } catch (error) {
    console.error('获取完整处理结果失败:', error);
    res.status(500).json({
      success: false,
      message: '获取完整处理结果失败',
      error: error.message
    });
  }
});

// 新增：Base64图片下载接口
router.get('/download-base64/:processId/:imageId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId, imageId } = req.params;
    const { format = 'png' } = req.query;
    
    // 验证权限
    const [records] = await db.execute(
      'SELECT * FROM process_records WHERE id = ? AND user_id = ? AND status = "completed"',
      [processId, req.user.id]
    );

    if (records.length === 0) {
      return res.status(404).json({ success: false, message: '无权限访问' });
    }

    const record = records[0];
    let resultData = null;

    try {
      resultData = typeof record.process_params === 'string' 
        ? JSON.parse(record.process_params) 
        : record.process_params;
    } catch (error) {
      return res.status(500).json({ success: false, message: '数据解析失败' });
    }

    // 查找指定的图片
    const targetImage = resultData.images?.find(img => img.id === imageId);
    if (!targetImage) {
      return res.status(404).json({ success: false, message: '图片不存在' });
    }

    // 转换base64为buffer
    const buffer = Buffer.from(targetImage.base64, 'base64');
    
    // 安全处理文件名，移除或替换特殊字符
    const safeFilename = (targetImage.filename || `image-${imageId}.png`)
      .replace(/[^\w\-_.]/g, '_') // 替换非字母数字、连字符、下划线、点的字符为下划线
      .replace(/_{2,}/g, '_'); // 将连续的下划线替换为单个下划线
    
    // 设置响应头
    res.set({
      'Content-Type': targetImage.mimeType || 'image/png',
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Cache-Control': 'public, max-age=31536000'
    });

    res.send(buffer);

  } catch (error) {
    console.error('下载图片失败:', error);
    res.status(500).json({ success: false, message: '下载失败' });
  }
});

// 获取完整图片数据用于保存
router.get('/download-image/:processId/:imageId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId, imageId } = req.params;
    
    // 验证处理记录是否属于当前用户
    const [records] = await db.execute(
      'SELECT * FROM process_records WHERE id = ? AND user_id = ? AND status = "completed"',
      [processId, req.user.id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: '处理记录不存在或未完成'
      });
    }

    const record = records[0];
    let resultData = null;

    // 解析处理结果
    if (record.process_params) {
      try {
        if (typeof record.process_params === 'string') {
          if (record.process_params.startsWith('[object Object]') || record.process_params === '[object Object]') {
            resultData = { images: [] };
          } else {
            resultData = JSON.parse(record.process_params);
          }
        } else if (typeof record.process_params === 'object' && record.process_params !== null) {
          resultData = record.process_params;
        } else {
          resultData = { images: [] };
        }
      } catch (parseError) {
        console.error('❌ JSON 解析失败:', parseError);
        resultData = { images: [] };
      }
    }

    // 查找指定的图片
    let targetImage = null;
    if (resultData && resultData.images && Array.isArray(resultData.images)) {
      targetImage = resultData.images.find(img => img.id === imageId);
    }

    if (!targetImage) {
      return res.status(404).json({
        success: false,
        message: '图片不存在'
      });
    }

    // 构建完整的图片数据
    const fullImageData = {
      id: targetImage.id,
      filename: targetImage.filename,
      originalUrl: targetImage.originalUrl,
      thumbnailUrl: targetImage.thumbnailUrl,
      width: targetImage.width,
      height: targetImage.height,
      fileSize: targetImage.fileSize
    };

    // 添加完整图片的base64数据
    if (!targetImage.base64 && targetImage.originalUrl) {
      try {
        const filename = path.basename(targetImage.originalUrl);
        const filePath = path.join(__dirname, '../../uploads', filename);
        
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          fullImageData.base64 = buffer.toString('base64');
          fullImageData.dataUrl = `data:image/png;base64,${fullImageData.base64}`;
        } else {
          return res.status(404).json({
            success: false,
            message: '图片文件不存在'
          });
        }
      } catch (fileError) {
        console.error('读取图片文件失败:', fileError);
        return res.status(500).json({
          success: false,
          message: '读取图片文件失败'
        });
      }
    } else if (targetImage.base64) {
      fullImageData.base64 = targetImage.base64;
      fullImageData.dataUrl = targetImage.dataUrl;
    }

    res.json({
      success: true,
      data: fullImageData
    });

  } catch (error) {
    console.error('获取图片数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图片数据失败',
      error: error.message
    });
  }
});

// ==================== 异步处理函数 ====================

async function processImageAsync(processId, sourceImage, sceneId, userPrompt, userId) {
  const db = getDB();
  
  try {
    // 更新进度：加载场景配置
    progressManager.updateProgress(processId, {
      status: 'loading_scene',
      progress: 10,
      currentStep: '加载场景配置'
    });

    const sceneConfig = await getSceneConfig(sceneId, userId);
    
    // 更新进度：准备提示词
    progressManager.updateProgress(processId, {
      status: 'preparing_prompt',
      progress: 20,
      currentStep: '准备处理提示词'
    });

    const fullPrompt = buildProcessingPrompt(sceneConfig, userPrompt);
    
    // 更新进度：读取源图片
    progressManager.updateProgress(processId, {
      status: 'loading_image',
      progress: 30,
      currentStep: '读取源图片'
    });

    // 读取源图片
    const imagePath = path.join(__dirname, '../../', sourceImage.file_path.replace(/^\//, ''));
    
    if (!fs.existsSync(imagePath)) {
      throw new Error('源图片文件不存在');
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const imageData = {
      mimeType: sourceImage.mime_type,
      base64Data: imageBuffer.toString('base64')
    };

    // 更新进度：调用AI模型
    progressManager.updateProgress(processId, {
      status: 'calling_ai',
      progress: 40,
      currentStep: '调用AI模型处理'
    });

    const aiResult = await aiEngine.processImage(imageData, sceneConfig, fullPrompt);
    
    // 更新进度：处理结果
    progressManager.updateProgress(processId, {
      status: 'processing_result',
      progress: 70,
      currentStep: '处理AI生成结果'
    });

    if (aiResult.images.length === 0) {
      throw new Error('AI模型未生成任何图片');
    }

    // 更新进度：保存图片
    progressManager.updateProgress(processId, {
      status: 'saving_images',
      progress: 80,
      currentStep: '保存生成的图片'
    });

    const savedImages = await saveProcessingResult(userId, processId, aiResult, sceneConfig);
    
    // 更新进度：完成
    progressManager.updateProgress(processId, {
      status: 'completed',
      progress: 100,
      currentStep: '处理完成'
    });

    console.log(`✅ 图片处理完成，processId: ${processId}, 生成图片数量: ${savedImages.length}`);

  } catch (error) {
    console.error(`❌ 图片处理失败，processId: ${processId}:`, error);
    
    // 更新数据库记录为失败状态
    await db.execute(
      `UPDATE process_records SET 
       status = 'failed', 
       error_message = ?, 
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [error.message, processId]
    );

    // 更新进度管理器
    progressManager.updateProgress(processId, {
      status: 'failed',
      progress: 0,
      currentStep: '处理失败',
      error: error.message
    });
  } finally {
    // 清理进度跟踪（延迟清理，给客户端时间获取最终状态）
    setTimeout(() => {
      progressManager.removeProcess(processId);
    }, 60000); // 1分钟后清理
  }
}

// ==================== 兼容性路由 ====================

// 保持现有的generate和generate-gemini路由以确保向后兼容
router.post('/generate', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { prompt, numberOfImages = 1, sceneType = 'ai_generate' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        code: 400,
        message: '请提供图片生成提示词'
      });
    }

    if (numberOfImages < 1 || numberOfImages > 4) {
      return res.status(400).json({
        code: 400,
        message: '图片数量必须在1-4之间'
      });
    }

    // 检查Google AI API密钥
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({
        code: 500,
        message: 'Google AI API密钥未配置'
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY
    });

    // 调用Google Imagen API生成图片
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: numberOfImages,
      },
    });

    const generatedImages = [];
    const uploadDir = path.join(__dirname, '../../uploads');
    
    // 确保上传目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    let idx = 1;
    for (const generatedImage of response.generatedImages) {
      try {
        const imageId = uuidv4();
        const filename = `generated-${imageId}-${idx}.png`;
        const filePath = path.join(uploadDir, filename);
        
        // 将base64图片数据保存到文件
        const imgBytes = generatedImage.image.imageBytes;
        const buffer = Buffer.from(imgBytes, "base64");
        fs.writeFileSync(filePath, buffer);
        
        // 获取图片信息
        const imageInfo = await getImageInfo(filePath);
        
        // 生成缩略图
        const thumbnailFilename = `generated-${imageId}-${idx}_thumb.png`;
        const thumbnailPath = path.join(uploadDir, thumbnailFilename);
        await generateThumbnail(filePath, thumbnailPath);
        
        // 构建URL
        const imageUrl = `/uploads/${filename}`;
        const thumbnailUrl = `/uploads/${thumbnailFilename}`;
        
        // 保存到数据库
        await db.execute(
          `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
           thumbnail_path, file_size, mime_type, width, height, scene_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            imageId,
            req.user.id,
            `${prompt.substring(0, 50)}_${idx}.png`, // 使用提示词作为原始文件名
            filename,
            imageUrl,
            thumbnailUrl,
            buffer.length,
            'image/png',
            imageInfo.width,
            imageInfo.height,
            sceneType
          ]
        );

        generatedImages.push({
          id: imageId,
          originalUrl: imageUrl,
          thumbnailUrl: thumbnailUrl,
          width: imageInfo.width,
          height: imageInfo.height,
          fileSize: buffer.length,
          prompt: prompt
        });

        idx++;
      } catch (error) {
        console.error(`生成第${idx}张图片时出错:`, error);
        // 继续处理下一张图片
        idx++;
      }
    }

    if (generatedImages.length === 0) {
      return res.status(500).json({
        code: 500,
        message: '图片生成失败'
      });
    }

    res.json({
      code: 200,
      message: '图片生成成功',
      data: {
        prompt: prompt,
        requestedCount: numberOfImages,
        generatedCount: generatedImages.length,
        images: generatedImages
      }
    });

  } catch (error) {
    console.error('图片生成错误:', error);
    
    let errorMessage = '图片生成失败';
    if (error.message.includes('API key')) {
      errorMessage = 'Google AI API密钥无效';
    } else if (error.message.includes('quota')) {
      errorMessage = 'API配额已用完';
    } else if (error.message.includes('network')) {
      errorMessage = '网络连接错误';
    }
    
    res.status(500).json({
      code: 500,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Gemini图片生成接口
router.post('/generate-gemini', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { prompt, sceneType = 'gemini_generate' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        code: 400,
        message: '请提供图片生成提示词'
      });
    }

    // 检查Google AI API密钥
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({
        code: 500,
        message: 'Google AI API密钥未配置'
      });
    }

    console.log('正在使用Gemini生成图片，提示词:', prompt);
    console.log(`代理状态: ${useProxy ? '启用' : '禁用'}`);

    let response;
    
    // 根据代理配置选择请求方式
    if (useProxy) {
      // 使用原生HTTPS请求确保代理正常工作
      const contents = [{
        parts: [{
          text: prompt
        }]
      }];
      
      response = await makeGeminiRequest(
        process.env.GOOGLE_AI_API_KEY,
        'gemini-2.5-flash-image-preview',
        contents
      );
    } else {
      // 使用GoogleGenAI库
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_AI_API_KEY
      });

      response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: prompt,
      });
    }

    const generatedImages = [];
    const uploadDir = path.join(__dirname, '../../uploads');
    
    // 确保上传目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 处理生成的内容
    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const parts = response.candidates[0].content.parts;
      let imageCount = 0;
      let textResponse = '';

      for (const part of parts) {
        if (part.text) {
          textResponse += part.text;
          console.log('Gemini文本响应:', part.text);
        } else if (part.inlineData) {
          try {
            imageCount++;
            const imageId = uuidv4();
            const filename = `gemini-${imageId}-${imageCount}.png`;
            const filePath = path.join(uploadDir, filename);
            
            // 将base64图片数据保存到文件
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync(filePath, buffer);
            
            console.log(`图片 ${imageCount} 已保存:`, filename);
            
            // 获取图片信息
            const imageInfo = await getImageInfo(filePath);
            
            // 生成缩略图
            const thumbnailFilename = `gemini-${imageId}-${imageCount}_thumb.png`;
            const thumbnailPath = path.join(uploadDir, thumbnailFilename);
            await generateThumbnail(filePath, thumbnailPath);
            
            // 构建URL
            const imageUrl = `/uploads/${filename}`;
            const thumbnailUrl = `/uploads/${thumbnailFilename}`;
            
            // 保存到数据库
            await db.execute(
              `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
               thumbnail_path, file_size, mime_type, width, height, scene_type) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                imageId,
                req.user.id,
                `${prompt.substring(0, 50)}_gemini_${imageCount}.png`,
                filename,
                imageUrl,
                thumbnailUrl,
                buffer.length,
                'image/png',
                imageInfo.width,
                imageInfo.height,
                sceneType
              ]
            );

            generatedImages.push({
              id: imageId,
              originalUrl: imageUrl,
              thumbnailUrl: thumbnailUrl,
              width: imageInfo.width,
              height: imageInfo.height,
              fileSize: buffer.length,
              prompt: prompt
            });

          } catch (error) {
            console.error(`处理第${imageCount}张图片时出错:`, error);
          }
        }
      }

      if (generatedImages.length === 0 && !textResponse) {
        return res.status(500).json({
          code: 500,
          message: 'Gemini未生成任何内容'
        });
      }

      res.json({
        code: 200,
        message: 'Gemini图片生成成功',
        data: {
          prompt: prompt,
          textResponse: textResponse,
          generatedCount: generatedImages.length,
          images: generatedImages,
          model: 'gemini-2.5-flash-image-preview',
          proxyUsed: useProxy
        }
      });

    } else {
      return res.status(500).json({
        code: 500,
        message: 'Gemini响应格式异常'
      });
    }

  } catch (error) {
    console.error('Gemini图片生成错误:', error);
    
    let errorMessage = 'Gemini图片生成失败';
    if (error.message.includes('API key')) {
      errorMessage = 'Google AI API密钥无效';
    } else if (error.message.includes('quota')) {
      errorMessage = 'API配额已用完';
    } else if (error.message.includes('SAFETY')) {
      errorMessage = '提示词包含不安全内容，请修改后重试';
    } else if (error.message.includes('network') || error.message.includes('fetch failed') || error.message.includes('请求失败')) {
      errorMessage = '网络连接错误，请检查网络设置或代理配置';
    }
    
    res.status(500).json({
      code: 500,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      proxyUsed: useProxy
    });
  }
});

// 图生图接口 - 基于现有图片生成新图片
router.post('/image-to-image', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { imageId, prompt, sceneType = 'image_to_image' } = req.body;
    
    if (!imageId || !prompt) {
      return res.status(400).json({
        code: 400,
        message: '图片ID和提示词不能为空'
      });
    }

    // 检查图片是否存在且属于当前用户
    const [images] = await db.execute(
      'SELECT * FROM images WHERE id = ? AND user_id = ?',
      [imageId, req.user.id]
    );

    if (images.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '图片不存在'
      });
    }

    const sourceImage = images[0];
    
    // 检查Google AI API密钥
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({
        code: 500,
        message: 'Google AI API密钥未配置'
      });
    }

    // 读取源图片文件
    const imagePath = path.join(__dirname, '../../', sourceImage.file_path.replace(/^\//, ''));
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        code: 404,
        message: '源图片文件不存在'
      });
    }

    // 读取图片为base64
    const base64ImageFile = fs.readFileSync(imagePath, { 
      encoding: "base64" 
    });

    console.log('正在进行图生图，源图片:', sourceImage.filename, '提示词:', prompt);
    console.log(`代理状态: ${useProxy ? '启用' : '禁用'}`);

    // 构建请求内容
    const contents = [
      {
        inlineData: {
          mimeType: sourceImage.mime_type || "image/jpeg",
          data: base64ImageFile,
        },
      },
      { text: prompt }
    ];

    let response;
    
    // 根据代理配置选择请求方式
    if (useProxy) {
      // 使用原生HTTPS请求确保代理正常工作
      response = await makeGeminiRequest(
        process.env.GOOGLE_AI_API_KEY,
        'gemini-2.5-flash',
        contents
      );
    } else {
      // 使用GoogleGenAI库
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_AI_API_KEY
      });

      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
      });
    }

    const generatedImages = [];
    const uploadDir = path.join(__dirname, '../../uploads');
    
    // 确保上传目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 处理生成的内容
    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const parts = response.candidates[0].content.parts;
      let imageCount = 0;
      let textResponse = '';

      for (const part of parts) {
        if (part.text) {
          textResponse += part.text;
          console.log('Gemini文本响应:', part.text);
        } else if (part.inlineData) {
          try {
            imageCount++;
            const imageId = uuidv4();
            const filename = `i2i-${imageId}-${imageCount}.png`;
            const filePath = path.join(uploadDir, filename);
            
            // 将base64图片数据保存到文件
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync(filePath, buffer);
            
            console.log(`图生图结果 ${imageCount} 已保存:`, filename);
            
            // 获取图片信息
            const imageInfo = await getImageInfo(filePath);
            
            // 生成缩略图
            const thumbnailFilename = `i2i-${imageId}-${imageCount}_thumb.png`;
            const thumbnailPath = path.join(uploadDir, thumbnailFilename);
            await generateThumbnail(filePath, thumbnailPath);
            
            // 构建URL
            const imageUrl = `/uploads/${filename}`;
            const thumbnailUrl = `/uploads/${thumbnailFilename}`;
            
            // 保存到数据库
            await db.execute(
              `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
               thumbnail_path, file_size, mime_type, width, height, scene_type) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                imageId,
                req.user.id,
                `${prompt.substring(0, 50)}_i2i_${imageCount}.png`,
                filename,
                imageUrl,
                thumbnailUrl,
                buffer.length,
                'image/png',
                imageInfo.width,
                imageInfo.height,
                sceneType
              ]
            );

            generatedImages.push({
              id: imageId,
              originalUrl: imageUrl,
              thumbnailUrl: thumbnailUrl,
              width: imageInfo.width,
              height: imageInfo.height,
              fileSize: buffer.length,
              prompt: prompt,
              sourceImageId: req.body.imageId
            });

          } catch (error) {
            console.error(`处理第${imageCount}张图片时出错:`, error);
          }
        }
      }

      if (generatedImages.length === 0 && !textResponse) {
        return res.status(500).json({
          code: 500,
          message: '图生图未生成任何内容'
        });
      }

      res.json({
        code: 200,
        message: '图生图生成成功',
        data: {
          sourceImageId: req.body.imageId,
          sourceImageInfo: {
            filename: sourceImage.filename,
            originalFilename: sourceImage.original_filename
          },
          prompt: prompt,
          textResponse: textResponse,
          generatedCount: generatedImages.length,
          images: generatedImages,
          model: 'gemini-2.5-flash',
          proxyUsed: useProxy
        }
      });

    } else {
      return res.status(500).json({
        code: 500,
        message: 'Gemini响应格式异常'
      });
    }

  } catch (error) {
    console.error('图生图错误:', error);
    
    let errorMessage = '图生图生成失败';
    if (error.message.includes('API key')) {
      errorMessage = 'Google AI API密钥无效';
    } else if (error.message.includes('quota')) {
      errorMessage = 'API配额已用完';
    } else if (error.message.includes('SAFETY')) {
      errorMessage = '提示词或图片包含不安全内容，请修改后重试';
    } else if (error.message.includes('network') || error.message.includes('fetch failed') || error.message.includes('请求失败')) {
      errorMessage = '网络连接错误，请检查网络设置或代理配置';
    } else if (error.code === 'ENOENT') {
      errorMessage = '源图片文件不存在';
    }
    
    res.status(500).json({
      code: 500,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      proxyUsed: useProxy
    });
  }
});

function getStatusText(status) {
  const statusMap = {
    'processing': '正在处理中...',
    'completed': '处理完成',
    'failed': '处理失败'
  };
  return statusMap[status] || '未知状态';
}

module.exports = router;