const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');

// 代理配置
function createProxyAgent() {
  const useProxy = process.env.USE_PROXY === 'true';
  const proxyHost = process.env.PROXY_HOST || '127.0.0.1';
  const proxyPort = process.env.PROXY_PORT || '7890';
  
  if (useProxy) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
    console.log(`🔗 使用代理: ${proxyUrl}`);
    return new HttpsProxyAgent(proxyUrl);
  }
  
  return null;
}

// 配置全局代理
function setupGlobalProxy() {
  const useProxy = process.env.USE_PROXY === 'true';
  const proxyHost = process.env.PROXY_HOST || '127.0.0.1';
  const proxyPort = process.env.PROXY_PORT || '7890';
  
  if (useProxy) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
    
    // 设置全局代理
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.http_proxy = proxyUrl;
    process.env.https_proxy = proxyUrl;
    
    console.log(`🌐 全局代理已设置: ${proxyUrl}`);
  }
}

// 创建带代理的 HTTPS 请求选项
function createHttpsOptions(options = {}) {
  const agent = createProxyAgent();
  
  if (agent) {
    return {
      ...options,
      agent
    };
  }
  
  return options;
}

module.exports = {
  createProxyAgent,
  setupGlobalProxy,
  createHttpsOptions
};