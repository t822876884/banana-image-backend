require('dotenv').config();

// 在导入任何其他模块之前设置代理
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
  
  console.log(`🌐 设置全局代理: ${proxyUrl}`);
  
  // 设置 Node.js 全局代理
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const https = require('https');
  const http = require('http');
  
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  https.globalAgent = proxyAgent;
  http.globalAgent = proxyAgent;
}

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

/**
 * 基于本地图片和提示词生成新照片的测试用例
 */
async function testLocalImageGeneration() {
  console.log('🎨 开始基于本地图片的生成测试...\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  console.log(`🔗 代理状态: ${useProxy ? '启用' : '禁用'}`);
  console.log(`🔑 API密钥: ${apiKey ? '已配置' : '未配置'}\n`);
  
  if (!apiKey) {
    console.error('❌ 错误: 未找到 GOOGLE_AI_API_KEY');
    console.log('请在 .env 文件中设置 GOOGLE_AI_API_KEY');
    return;
  }
  
  try {
    // 创建输出目录
    const outputDir = path.join(__dirname, 'generated-images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 创建输出目录: ${outputDir}\n`);
    }
    
    // 测试用例配置
    const testCases = [
      {
        name: '人像增强测试',
        imagePath: '/Users/bertram/Documents/work/weichat/banana-image-backend/uploads/images/1fe55a19-0d72-4526-a9fa-ef43b2efc318_thumb.png',
        prompt: '请基于这张人像照片，生成一张高质量的专业摄影作品，增强面部细节，改善光线效果，营造温暖自然的氛围',
        outputName: 'portrait_enhanced'
      },
      {
        name: '艺术风格转换测试',
        imagePath: '/Users/bertram/Documents/work/weichat/banana-image-backend/uploads/images/1fe55a19-0d72-4526-a9fa-ef43b2efc318_thumb.png',
        prompt: '请将这张照片转换为印象派绘画风格，保持人物特征的同时，添加艺术化的色彩和笔触效果',
        outputName: 'artistic_style'
      },
      {
        name: '创意设计测试',
        imagePath: '/Users/bertram/Documents/work/weichat/banana-image-backend/uploads/images/1fe55a19-0d72-4526-a9fa-ef43b2efc318_thumb.png',
        prompt: '请基于这张照片创作一张富有创意的图片，融入科幻元素和未来感设计，保持人物主体特征',
        outputName: 'creative_design'
      }
    ];
    
    // 执行测试用例
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n🧪 执行测试用例 ${i + 1}/${testCases.length}: ${testCase.name}`);
      console.log(`📷 源图片: ${path.basename(testCase.imagePath)}`);
      console.log(`📝 提示词: ${testCase.prompt}\n`);
      
      try {
        await runSingleTest(testCase, outputDir, apiKey);
        console.log(`✅ 测试用例 ${i + 1} 完成\n`);
      } catch (error) {
        console.error(`❌ 测试用例 ${i + 1} 失败:`, error.message);
      }
      
      // 在测试用例之间添加延迟，避免API限制
      if (i < testCases.length - 1) {
        console.log('⏳ 等待 3 秒后继续下一个测试...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log('\n🎉 所有测试用例执行完成！');
    
  } catch (error) {
    console.error('❌ 测试执行失败:', error);
  }
}

/**
 * 执行单个测试用例
 */
async function runSingleTest(testCase, outputDir, apiKey) {
  // 检查源图片是否存在
  if (!fs.existsSync(testCase.imagePath)) {
    throw new Error(`源图片文件不存在: ${testCase.imagePath}`);
  }
  
  // 读取图片文件
  console.log('📖 读取源图片...');
  const imageData = fs.readFileSync(testCase.imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = getMimeType(testCase.imagePath);
  
  console.log(`📊 图片信息: 大小=${Math.round(imageData.length / 1024)}KB, MIME类型=${mimeType}`);
  
  // 使用 GoogleGenAI 库进行测试
  console.log('🤖 调用 Gemini API...');
  const ai = new GoogleGenAI({ apiKey });
  
  // 构建请求内容（按照你提供的示例格式）
  const contents = [
    { text: testCase.prompt },
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Image
      }
    }
  ];
  
  const requestData = {
    model: "gemini-2.5-flash-image-preview",
    contents: contents
  };
  
  console.log(`📤 发送请求: 模型=${requestData.model}, 内容数量=${contents.length}`);
  
  const startTime = Date.now();
  const response = await ai.models.generateContent(requestData);
  const endTime = Date.now();
  
  console.log(`📥 收到响应，耗时: ${endTime - startTime}ms`);
  console.log(`📋 响应候选项数量: ${response.candidates?.length || 0}`);
  
  // 解析响应
  if (response.candidates && response.candidates[0] && response.candidates[0].content) {
    const parts = response.candidates[0].content.parts;
    console.log(`📝 响应部分数量: ${parts?.length || 0}`);
    
    let textResponse = '';
    let imageCount = 0;
    
    for (const part of parts) {
      if (part.text) {
        textResponse += part.text;
        console.log(`📄 文本响应长度: ${part.text.length}`);
      } else if (part.inlineData) {
        imageCount++;
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, 'base64');
        
        // 保存生成的图片
        const timestamp = Date.now();
        const outputPath = path.join(outputDir, `${testCase.outputName}_${timestamp}.png`);
        fs.writeFileSync(outputPath, buffer);
        
        console.log(`🖼️ 图片已保存: ${outputPath}`);
        console.log(`📏 生成图片大小: ${Math.round(buffer.length / 1024)}KB`);
      }
    }
    
    // 保存文本响应
    if (textResponse) {
      const textPath = path.join(outputDir, `${testCase.outputName}_${Date.now()}_response.txt`);
      fs.writeFileSync(textPath, textResponse, 'utf8');
      console.log(`📝 文本响应已保存: ${textPath}`);
    }
    
    console.log(`✨ 处理完成: 生成了 ${imageCount} 张图片`);
    
    if (imageCount === 0) {
      console.log('⚠️ 注意: 没有生成图片，可能模型返回了文本描述');
      if (textResponse) {
        console.log(`📄 文本响应预览: ${textResponse.substring(0, 200)}...`);
      }
    }
    
  } else {
    console.log('⚠️ 响应格式异常:', JSON.stringify(response, null, 2));
    throw new Error('API响应格式不正确');
  }
}

/**
 * 根据文件扩展名获取MIME类型
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/png';
}

/**
 * 使用原生HTTPS请求的测试方法（备用）
 */
async function testWithNativeRequest(testCase, outputDir, apiKey) {
  const https = require('https');
  
  // 读取图片
  const imageData = fs.readFileSync(testCase.imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = getMimeType(testCase.imagePath);
  
  const requestData = {
    contents: [{
      parts: [
        { text: testCase.prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    }
  };
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
  
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
          if (res.statusCode === 200) {
            resolve(response);
          } else {
            reject(new Error(`API请求失败: ${res.statusCode} - ${response.error?.message || data}`));
          }
        } catch (error) {
          reject(new Error(`解析响应失败: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`请求失败: ${error.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

// 运行测试
if (require.main === module) {
  testLocalImageGeneration();
}

module.exports = {
  testLocalImageGeneration,
  runSingleTest
};