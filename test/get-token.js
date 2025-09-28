const axios = require('axios');

async function getValidToken() {
  try {
    console.log('正在尝试登录获取token...');
    
    // 首先尝试注册一个测试用户（如果不存在）
    // try {
    //   const registerResponse = await axios.post('http://127.0.0.1:3000/api/auth/register', {
    //     username: 'testuser',
    //     password: 'Test123456',
    //     email: 'test@example.com'
    //   });
    //   console.log('注册成功:', registerResponse.data.data.token);
    //   return registerResponse.data.data.token;
    // } catch (registerError) {
    //   console.log('用户可能已存在，尝试登录...');
    // }
    
    // 尝试登录
    const loginResponse = await axios.post('http://127.0.0.1:3000/api/auth/login', {
      username: 'bertram',
      password: 'Zaq123456.'
    });
    
    console.log('登录成功!');
    console.log('Access Token:', loginResponse.data.data.token);
    console.log('Refresh Token:', loginResponse.data.data.refreshToken);
    
    return loginResponse.data.data.token;
    
  } catch (error) {
    console.error('获取token失败:', error.response?.data || error.message);
    return null;
  }
}

async function testImageGeneration() {
  const token = await getValidToken();
  
  if (!token) {
    console.error('无法获取有效token，请检查服务器状态');
    return;
  }
  
  try {
    console.log('\n正在测试图片生成...');
    const generateResponse = await axios.post(
      'http://127.0.0.1:3000/api/image/generate',
      {
        prompt: 'Robot holding a red skateboard',
        numberOfImages: 2,
        sceneType: 'ai_generate'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('图片生成成功:', generateResponse.data);
    
  } catch (error) {
    console.error('图片生成失败:', error.response?.data || error.message);
  }
}

// 运行测试
testImageGeneration();