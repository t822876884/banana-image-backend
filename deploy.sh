#!/bin/bash

# 部署脚本
set -e

echo "🚀 开始部署 Banana Image Backend..."

# 检查环境变量
if [ ! -f .env ]; then
    echo "⚠️  .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件配置正确的环境变量"
fi

# 停止现有容器
echo "🛑 停止现有容器..."
docker-compose down

# 构建并启动
echo "🔨 构建并启动服务..."
docker-compose up -d --build

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose ps

# 运行数据库迁移
echo "🗄️  运行数据库迁移..."
docker-compose exec app npm run migrate

echo "✅ 部署完成！"
echo ""
echo "🌐 服务地址："
echo "API: http://localhost:3000"
echo "API文档: http://localhost:3000/api-docs"
echo "健康检查: http://localhost:3000/health"
echo ""
echo "📊 查看日志: docker-compose logs -f"
echo "🛑 停止服务: docker-compose down"