# 使用官方 Node.js 18 Alpine 镜像作为基础镜像
FROM docker.1ms.run/node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置 npm 镜像源为淘宝镜像
RUN npm config set registry https://registry.npmmirror.com

# 更新包索引并安装系统依赖（Sharp 需要）
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    make \
    gcc \
    g++ \
    musl-dev \
    vips-dev \
    pkgconfig \
    cairo-dev \
    pango-dev \
    glib-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    && rm -rf /var/cache/apk/*

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制应用代码
COPY . .

# 创建上传目录
RUN mkdir -p uploads/images

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置目录权限
RUN chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动应用
CMD ["npm", "start"]