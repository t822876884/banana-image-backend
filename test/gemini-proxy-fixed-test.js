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
  
  console.log(`🌐 强制设置全局代理: ${proxyUrl}`);
  
  // 设置 Node.js 全局代理
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const https = require('https');
  const http = require('http');
  
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  
  // 覆盖默认的 globalAgent
  https.globalAgent = proxyAgent;
  http.globalAgent = proxyAgent;
  
  console.log(`🔗 已设置全局 HTTPS Agent 使用代理`);
}

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');

// 网络连接测试函数
async function testNetworkConnectivity() {
  console.log('🔍 开始网络连接测试...\n');
  
  // DNS解析测试
  async function testDNS() {
    console.log('🔍 测试DNS解析...');
    
    return new Promise((resolve) => {
      dns.lookup('generativelanguage.googleapis.com', (err, address) => {
        if (err) {
          console.error('❌ DNS解析失败:', err.message);
          resolve(false);
        } else {
          console.log('✅ DNS解析成功:', address);
          resolve(true);
        }
      });
    });
  }
  
  // 测试 Google AI API 认证
  async function testGoogleAIAuth() {
    console.log('🔍 测试Google AI API认证...');
    
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error('❌ API密钥未配置');
      return false;
    }
    
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        contents: [{
          parts: [{
            text: "Hello"
          }]
        }]
      });
      
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Node.js Test Client'
        },
        timeout: 30000
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('✅ Google AI API认证成功');
            resolve(true);
          } else {
            console.error(`❌ Google AI API认证失败，状态码: ${res.statusCode}`);
            console.error('响应:', data.substring(0, 200));
            resolve(false);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('❌ Google AI API连接失败:', error.message);
        resolve(false);
      });
      
      req.on('timeout', () => {
        console.error('❌ Google AI API连接超时');
        req.destroy();
        resolve(false);
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  // 执行所有网络测试
  const dnsResult = await testDNS();
  const authResult = await testGoogleAIAuth();
  
  console.log('\n📊 网络测试结果:');
  console.log(`DNS解析: ${dnsResult ? '✅ 正常' : '❌ 失败'}`);
  console.log(`Google AI API: ${authResult ? '✅ 正常' : '❌ 失败'}`);
  
  const allTestsPassed = dnsResult && authResult;
  
  if (allTestsPassed) {
    console.log('\n🎉 所有网络测试通过！可以继续进行图片生成测试。\n');
  } else {
    console.log('\n⚠️  部分网络测试失败！');
    if (!dnsResult) {
      console.log('  - DNS解析失败: 检查网络连接');
    }
    if (!authResult) {
      console.log('  - Google AI API失败: 检查API密钥或代理配置');
    }
    console.log('');
  }
  
  return allTestsPassed;
}

async function testGeminiImageGeneration() {
  console.log('🚀 开始 Gemini 图片生成测试（强制代理模式）...\n');
  
  // 显示配置信息
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  console.log(`🔗 代理状态: ${useProxy ? '启用' : '禁用'}`);
  if (useProxy) {
    console.log(`🔗 代理地址: ${proxyHost}:${proxyPort}`);
  }
  console.log(`🔑 API密钥: ${apiKey ? '已配置' : '未配置'}\n`);
  
  if (!apiKey) {
    console.error('❌ 错误: 未找到 GOOGLE_AI_API_KEY');
    console.log('请在 .env 文件中设置 GOOGLE_AI_API_KEY');
    return;
  }
  
  // 先进行网络连接测试
  const networkOk = await testNetworkConnectivity();
  if (!networkOk) {
    console.error('❌ 网络连接测试失败，无法继续进行图片生成测试');
    return;
  }
  
  try {
    // 创建输出目录
    const outputDir = path.join(__dirname, 'gemini-proxy-fixed-images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 创建输出目录: ${outputDir}\n`);
    }
    
    console.log('🎨 开始图片生成测试...\n');
    
    // 使用原生 HTTPS 请求而不是 GoogleGenAI 库
    const prompt = "Generate an image of the side of an aircraft carrier with an F35 catapulted";
    console.log(`🎯 提示词: ${prompt}\n`);
    
    const requestData = JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    });
    
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'User-Agent': 'Node.js Gemini Client'
      },
      timeout: 60000 // 60秒超时
    };
    
    console.log('🔄 正在调用 Gemini API...');
    const startTime = Date.now();
    
    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const endTime = Date.now();
          const duration = ((endTime - startTime) / 1000).toFixed(2);
          console.log(`⏱️  API调用耗时: ${duration}秒`);
          
          if (res.statusCode === 200) {
            try {
              const jsonResponse = JSON.parse(data);
              resolve(jsonResponse);
            } catch (parseError) {
              reject(new Error(`JSON解析失败: ${parseError.message}`));
            }
          } else {
            reject(new Error(`API调用失败，状态码: ${res.statusCode}, 响应: ${data.substring(0, 500)}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      
      req.write(requestData);
      req.end();
    });
    
    console.log('✅ API调用成功！');
    
    // 处理响应
    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const parts = response.candidates[0].content.parts;
      let hasImage = false;
      let hasText = false;
      
      for (const part of parts) {
        if (part.text) {
          hasText = true;
          console.log(`📝 文本描述: ${part.text.substring(0, 200)}...`);
        } else if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
          hasImage = true;
          
          const imageData = part.inlineData.data;
          const mimeType = part.inlineData.mimeType;
          const extension = mimeType.split('/')[1] || 'png';
          
          // 生成文件名
          const timestamp = Date.now();
          const filename = `gemini_proxy_fixed_${timestamp}.${extension}`;
          const filepath = path.join(outputDir, filename);
          
          // 保存图片
          const buffer = Buffer.from(imageData, 'base64');
          fs.writeFileSync(filepath, buffer);
          
          console.log(`✅ 图片已保存: ${filename}`);
          console.log(`📁 文件路径: ${filepath}`);
          console.log(`📊 文件大小: ${(buffer.length / 1024).toFixed(2)} KB`);
          console.log(`🖼️  图片格式: ${mimeType}`);
        }
      }
      
      if (!hasImage && !hasText) {
        console.log('⚠️  响应中未找到图片或文本内容');
        console.log('完整响应:', JSON.stringify(response, null, 2));
      }
    } else {
      console.log('⚠️  响应格式异常');
      console.log('完整响应:', JSON.stringify(response, null, 2));
    }
    
    console.log(`\n🎉 测试完成！生成的图片保存在: ${outputDir}`);
    
  } catch (error) {
    console.error('❌ 图片生成失败:', error.message);
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.log('🌐 网络连接问题，可能的解决方案:');
      console.log('  1. 检查代理服务是否正在运行');
      console.log('  2. 确认代理地址和端口正确');
      console.log('  3. 尝试重启代理服务');
    } else if (error.message.includes('API_KEY_INVALID')) {
      console.log('🔑 API密钥问题，请检查 GOOGLE_AI_API_KEY');
    } else if (error.message.includes('QUOTA_EXCEEDED')) {
      console.log('📊 API配额已用完，请检查账户余额');
    }
  }
}

// 添加错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  process.exit(1);
});

// 运行测试
testGeminiImageGeneration();