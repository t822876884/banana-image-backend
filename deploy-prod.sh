#!/bin/bash

echo "🚀 开始部署生产环境..."

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查必要文件
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}❌ docker-compose.prod.yml 文件不存在${NC}"
    exit 1
fi

if [ ! -f ".env.prod" ]; then
    echo -e "${YELLOW}⚠️  .env.prod 文件不存在，请先配置环境变量${NC}"
    echo "您可以复制 .env.prod 模板并修改其中的配置"
    exit 1
fi

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 停止现有服务
echo -e "${YELLOW}🛑 停止现有服务...${NC}"
docker-compose -f docker-compose.prod.yml down

# 构建镜像
echo -e "${YELLOW}📦 构建生产镜像...${NC}"
if ! docker build -f Dockerfile -t banana-image-backend:latest .; then
    echo -e "${RED}❌ 镜像构建失败${NC}"
    exit 1
fi

# 创建必要的目录
echo -e "${YELLOW}📁 准备数据目录...${NC}"
mkdir -p uploads logs
chmod 755 uploads logs

# 启动服务
echo -e "${YELLOW}🚀 启动生产服务...${NC}"
if docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d; then
    echo -e "${GREEN}✅ 生产环境部署成功！${NC}"
else
    echo -e "${RED}❌ 服务启动失败${NC}"
    exit 1
fi

# 等待服务启动
echo -e "${BLUE}⏳ 等待服务启动...${NC}"
sleep 10

# 检查服务状态
echo -e "${BLUE}🔍 检查服务状态...${NC}"
docker-compose -f docker-compose.prod.yml ps

# 显示日志
echo -e "${BLUE}📋 最近的日志：${NC}"
docker-compose -f docker-compose.prod.yml logs --tail=20

echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo "📋 管理命令："
echo "• 查看状态: docker-compose -f docker-compose.prod.yml ps"
echo "• 查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "• 重启服务: docker-compose -f docker-compose.prod.yml restart"
echo "• 停止服务: docker-compose -f docker-compose.prod.yml down"
echo ""
echo "🌐 服务地址: http://localhost:3000"
echo ""
echo -e "${YELLOW}⚠️  请确保以下服务已启动：${NC}"
echo "• MySQL 服务 (端口 53306)"
echo "• Redis 服务 (端口 56379)"