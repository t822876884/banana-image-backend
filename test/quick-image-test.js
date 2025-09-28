require('dotenv').config();

// 代理设置
const useProxy = process.env.USE_PROXY === 'true';
if (useProxy) {
  const proxyUrl = `http://${process.env.PROXY_HOST || '127.0.0.1'}:${process.env.PROXY_PORT || '7890'}`;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const https = require('https');
  https.globalAgent = new HttpsProxyAgent(proxyUrl);
  
  console.log(`🌐 使用代理: ${proxyUrl}`);
}

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function quickImageTest() {
  console.log('🚀 快速图片生成测试\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const imagePath = '/Users/bertram/Documents/work/weichat/banana-image-backend/uploads/images/1fe55a19-0d72-4526-a9fa-ef43b2efc318_thumb.png';
  
  if (!apiKey) {
    console.error('❌ 请设置 GOOGLE_AI_API_KEY');
    return;
  }
  
  if (!fs.existsSync(imagePath)) {
    console.error('❌ 图片文件不存在:', imagePath);
    return;
  }
  
  try {
    // 读取图片
    console.log('📖 读取图片...');
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    console.log(`📊 图片大小: ${Math.round(imageData.length / 1024)}KB`);
    
    // 初始化 AI
    const ai = new GoogleGenAI({ apiKey });
    
    // 构建请求
    const prompt = "请基于这张照片生成一张高质量的专业摄影作品，增强细节，改善光线效果，营造温暖自然的氛围。请生成图片而不是文字描述。";
    
    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image
        }
      }
    ];
    
    console.log('🤖 调用 Gemini API...');
    console.log(`📝 提示词: ${prompt}\n`);
    
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: contents
    });
    const endTime = Date.now();
    
    console.log(`📥 API响应时间: ${endTime - startTime}ms`);
    
    // 处理响应
    if (response.candidates && response.candidates[0]) {
      const parts = response.candidates[0].content.parts;
      console.log(`📋 响应部分数量: ${parts.length}`);
      
      let imageGenerated = false;
      let textResponse = '';
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        console.log(`\n📄 处理第 ${i + 1} 部分:`);
        
        if (part.text) {
          textResponse += part.text;
          console.log(`📝 文本内容: ${part.text.substring(0, 100)}...`);
        } else if (part.inlineData) {
          imageGenerated = true;
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, 'base64');
          
          // 保存图片
          const outputDir = path.join(__dirname, 'quick-test-output');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          const outputPath = path.join(outputDir, `generated_${Date.now()}.png`);
          fs.writeFileSync(outputPath, buffer);
          
          console.log(`🖼️ 图片已生成: ${outputPath}`);
          console.log(`📏 图片大小: ${Math.round(buffer.length / 1024)}KB`);
        } else {
          console.log(`❓ 未知部分类型:`, Object.keys(part));
        }
      }
      
      if (imageGenerated) {
        console.log('\n✅ 成功生成图片！');
      } else {
        console.log('\n⚠️ 没有生成图片，只有文本响应');
        if (textResponse) {
          console.log(`📄 完整文本响应:\n${textResponse}`);
        }
      }
      
    } else {
      console.log('❌ 响应格式异常');
      console.log('原始响应:', JSON.stringify(response, null, 2));
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('API错误详情:', error.response.data);
    }
  }
}

// 运行测试
quickImageTest();