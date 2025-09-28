#!/bin/bash

echo "🚀 开始构建生产环境镜像..."

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 构建生产镜像
echo -e "${YELLOW}📦 构建生产镜像...${NC}"
if docker build -f Dockerfile -t banana-image-backend:latest .; then
    echo -e "${GREEN}✅ 生产镜像构建成功${NC}"
else
    echo -e "${RED}❌ 生产镜像构建失败${NC}"
    exit 1
fi

# 创建必要的目录
echo -e "${YELLOW}📁 创建数据目录...${NC}"
mkdir -p uploads logs

# 设置目录权限
chmod 755 uploads logs

echo -e "${GREEN}🎉 生产环境镜像构建完成！${NC}"
echo ""
echo "📋 使用说明："
echo "1. 启动生产环境："
echo "   docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "2. 查看日志："
echo "   docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "3. 停止服务："
echo "   docker-compose -f docker-compose.prod.yml down"
echo ""
echo "4. 重启服务："
echo "   docker-compose -f docker-compose.prod.yml restart"
echo ""
echo -e "${YELLOW}⚠️  注意：请确保您的 MySQL (端口 53306) 和 Redis (端口 56379) 服务已启动${NC}"