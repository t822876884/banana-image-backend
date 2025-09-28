# 生产环境部署指南

## 环境要求

- Docker 和 Docker Compose
- MySQL 服务 (端口: 53306)
- Redis 服务 (端口: 56379)

## 快速部署

### 1. 配置环境变量

复制环境变量模板并修改配置：

```bash
cp .env.prod.example .env.prod
```

编辑 `.env.prod` 文件，确保以下配置正确：

```bash
# 数据库配置
DB_HOST=
DB_PORT=
DB_PASSWORD=

# Redis配置
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=

# Google AI API密钥
GOOGLE_AI_API_KEY=your_actual_api_key
```

### 2. 构建镜像

```bash
./build-prod.sh
```

### 3. 部署服务

```bash
./deploy-prod.sh
```

## 手动部署

### 1. 构建镜像

```bash
docker build -f Dockerfile -t banana-image-backend:latest .
```

### 2. 启动服务

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## 管理命令

```bash
# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看实时日志
docker-compose -f docker-compose.prod.yml logs -f

# 重启服务
docker-compose -f docker-compose.prod.yml restart

# 停止服务
docker-compose -f docker-compose.prod.yml down

# 更新服务（重新构建并重启）
docker-compose -f docker-compose.prod.yml down
docker build -f Dockerfile -t banana-image-backend:latest .
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## 数据持久化

- **上传文件**: `./uploads` 目录挂载到容器的 `/app/uploads`
- **日志文件**: `./logs` 目录挂载到容器的 `/app/logs`

## 健康检查

服务包含健康检查端点：`http://localhost:3000/health`

## 故障排除

### 1. 连接数据库失败

检查 MySQL 服务是否在端口 53306 上运行：

```bash
telnet localhost 53306
```

### 2. 连接 Redis 失败

检查 Redis 服务是否在端口 56379 上运行：

```bash
telnet localhost 56379
```

### 3. 查看详细日志

```bash
docker-compose -f docker-compose.prod.yml logs app
```

### 4. 进入容器调试

```bash
docker-compose -f docker-compose.prod.yml exec app sh
```

## 安全建议

1. 修改默认的 JWT 密钥
2. 使用强密码
3. 定期备份数据库
4. 监控服务日志
5. 定期更新镜像