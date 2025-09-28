const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getRedis } = require('../database/connection');

// 生成验证码
function generateVerificationCode(length = 6) {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

// 存储验证码到Redis或内存
async function storeVerificationCode(key, code, expireMinutes = 5) {
  const redis = getRedis();
  
  if (redis) {
    // 使用Redis存储
    await redis.setex(key, expireMinutes * 60, code);
  } else {
    // 使用内存存储（仅用于开发环境）
    if (!global.verificationCodes) {
      global.verificationCodes = new Map();
    }
    
    global.verificationCodes.set(key, {
      code,
      expires: Date.now() + expireMinutes * 60 * 1000
    });
    
    // 清理过期的验证码
    setTimeout(() => {
      if (global.verificationCodes && global.verificationCodes.has(key)) {
        global.verificationCodes.delete(key);
      }
    }, expireMinutes * 60 * 1000);
  }
}

// 验证验证码
async function verifyCode(key, inputCode) {
  const redis = getRedis();
  
  if (redis) {
    // 从Redis获取
    const storedCode = await redis.get(key);
    if (storedCode && storedCode === inputCode) {
      await redis.del(key); // 验证成功后删除
      return true;
    }
  } else {
    // 从内存获取
    if (global.verificationCodes && global.verificationCodes.has(key)) {
      const data = global.verificationCodes.get(key);
      if (data.expires > Date.now() && data.code === inputCode) {
        global.verificationCodes.delete(key); // 验证成功后删除
        return true;
      }
    }
  }
  
  return false;
}

// 发送邮箱验证码
async function sendEmailVerificationCode(email, code) {
  try {
    // 创建邮件传输器
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // 邮件内容
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Nano Banana - 邮箱验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">邮箱验证码</h2>
          <p>您好，</p>
          <p>您正在进行邮箱绑定操作，验证码为：</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; color: #007bff; letter-spacing: 5px;">${code}</span>
          </div>
          <p>验证码有效期为5分钟，请及时使用。</p>
          <p>如果这不是您的操作，请忽略此邮件。</p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      `
    };

    // 发送邮件
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('发送邮件失败:', error);
    return false;
  }
}

// 发送短信验证码（模拟实现）
async function sendSMSVerificationCode(phone, code) {
  try {
    // 这里应该集成真实的短信服务商API
    // 比如阿里云短信、腾讯云短信等
    
    console.log(`模拟发送短信验证码到 ${phone}: ${code}`);
    
    // 在开发环境下，我们只是打印日志
    if (process.env.NODE_ENV === 'development') {
      console.log(`[开发模式] 短信验证码: ${code} 发送到 ${phone}`);
      return true;
    }
    
    // 生产环境需要实现真实的短信发送逻辑
    // 示例代码（需要根据实际短信服务商调整）:
    /*
    const response = await axios.post('https://sms-api.example.com/send', {
      phone: phone,
      template: process.env.SMS_TEMPLATE_CODE,
      params: { code: code },
      sign: process.env.SMS_SIGN_NAME
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.SMS_ACCESS_KEY}`
      }
    });
    
    return response.data.success;
    */
    
    return true;
  } catch (error) {
    console.error('发送短信失败:', error);
    return false;
  }
}

module.exports = {
  generateVerificationCode,
  storeVerificationCode,
  verifyCode,
  sendEmailVerificationCode,
  sendSMSVerificationCode
};