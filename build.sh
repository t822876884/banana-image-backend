#!/bin/bash

# 构建脚本
set -e

echo "🚀 开始构建 Banana Image Backend Docker 镜像..."

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker"
    exit 1
fi

# 构建镜像
echo "📦 构建生产镜像..."
docker build -t banana-image-backend:latest .

echo "📦 构建开发镜像..."
docker build -f Dockerfile.dev -t banana-image-backend:dev .

# 显示镜像信息
echo "✅ 构建完成！"
echo ""
echo "📋 镜像列表："
docker images | grep banana-image-backend

echo ""
echo "🎯 使用方法："
echo "生产环境: docker-compose up -d"
echo "开发环境: docker-compose -f docker-compose.dev.yml up -d"
echo "仅构建应用: docker run -p 3000:3000 banana-image-backend:latest"