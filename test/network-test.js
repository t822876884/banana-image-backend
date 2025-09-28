require('dotenv').config();
const https = require('https');
const dns = require('dns');
const { createHttpsOptions } = require('../src/utils/proxy');

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

async function testHTTPS() {
  console.log('🔍 测试HTTPS连接...');
  
  return new Promise((resolve) => {
    const options = createHttpsOptions({
      hostname: 'www.google.com',
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 10000
    });
    
    const req = https.request(options, (res) => {
      console.log('✅ HTTPS连接正常，状态码:', res.statusCode);
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.error('❌ HTTPS连接失败:', error.message);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.error('❌ HTTPS连接超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function testGoogleAPI() {
  console.log('🔍 测试Google API连接...');
  
  return new Promise((resolve) => {
    const options = createHttpsOptions({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models',
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': 'Node.js Test Client'
      }
    });
    
    const req = https.request(options, (res) => {
      console.log('✅ Google API连接正常，状态码:', res.statusCode);
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.error('❌ Google API连接失败:', error.message);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.error('❌ Google API连接超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function runNetworkTests() {
  console.log('🚀 开始网络连接测试...\n');
  
  // 显示代理配置
  const useProxy = process.env.USE_PROXY === 'true';
  const proxyHost = process.env.PROXY_HOST || '127.0.0.1';
  const proxyPort = process.env.PROXY_PORT || '7890';
  
  if (useProxy) {
    console.log(`🔗 代理配置: ${proxyHost}:${proxyPort}\n`);
  } else {
    console.log('🔗 未使用代理\n');
  }
  
  const dnsResult = await testDNS();
  const httpsResult = await testHTTPS();
  const googleApiResult = await testGoogleAPI();
  
  console.log('\n📊 测试结果汇总:');
  console.log(`DNS解析: ${dnsResult ? '✅ 正常' : '❌ 失败'}`);
  console.log(`HTTPS连接: ${httpsResult ? '✅ 正常' : '❌ 失败'}`);
  console.log(`Google API: ${googleApiResult ? '✅ 正常' : '❌ 失败'}`);
  
  if (dnsResult && httpsResult && googleApiResult) {
    console.log('\n🎉 所有网络测试通过！');
  } else {
    console.log('\n⚠️  部分网络测试失败，请检查网络配置或代理设置');
  }
}

runNetworkTests();