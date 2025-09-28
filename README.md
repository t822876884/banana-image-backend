# Nano Banana AI图片处理应用 - 后端接口

基于 Node.js + Express + MySQL 的AI图片处理应用后端接口。

## 功能特性

- 🔐 用户认证系统（注册、登录、第三方登录）
- 👤 用户资料管理
- 🖼️ 图片上传与处理
- 🎨 AI图片分析与处理
- 📱 场景管理
- ⚙️ AI模型配置
- 📊 处理历史记录
- 🔧 系统设置

## 技术栈

- **后端框架**: Express.js
- **数据库**: MySQL
- **认证**: JWT + Refresh Token
- **文件上传**: Multer
- **图片处理**: Sharp
- **安全**: Helmet, CORS, Rate Limiting
- **缓存**: Redis（可选）

## 项目结构
```
src/
├── app.js                 # 应用入口
├── database/
│   ├── connection.js      # 数据库连接
│   └── migrate.js         # 数据库迁移
├── middleware/
│   ├── auth.js           # 认证中间件
│   ├── upload.js         # 文件上传中间件
│   └── validation.js     # 数据验证中间件
├── routes/
│   ├── auth.js           # 认证路由
│   ├── user.js           # 用户管理路由
│   ├── image.js          # 图片处理路由
│   ├── scene.js          # 场景管理路由
│   ├── model.js          # AI模型配置路由
│   ├── history.js        # 历史记录路由
│   ├── upload.js         # 文件上传路由
│   └── settings.js       # 系统设置路由
└── utils/
├── upload.js         # 上传工具
├── image.js          # 图片处理工具
└── ai.js             # AI接口工具
```

## 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

复制 `.env.example` 到 `.env` 并配置相关参数：

```env
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Netvine123
DB_NAME=banana_image

# JWT配置
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Redis配置（可选）
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# 文件上传配置
UPLOAD_PATH=uploads
MAX_FILE_SIZE=10485760
ALLOWED_TYPES=image/jpeg,image/png,image/gif,image/webp

# AI服务配置
AI_API_URL=https://api.example.com
AI_API_KEY=your_ai_api_key
```

### 3. 数据库初始化

```bash
# 运行数据库迁移
node src/database/migrate.js
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API接口文档

### 用户认证模块

#### 用户注册
- **POST** `/api/auth/register`
- **参数**: `username`, `password`, `phone`, `email`

#### 用户登录
- **POST** `/api/auth/login`
- **参数**: `username`, `password`

#### 刷新Token
- **POST** `/api/auth/refresh`
- **参数**: `refreshToken`

#### 用户登出
- **POST** `/api/auth/logout`

#### 第三方登录
- **POST** `/api/auth/social-login`
- **参数**: `platform`, `code`, `userInfo`

### 用户资料管理模块

#### 获取用户资料
- **GET** `/api/user/profile`

#### 更新用户资料
- **PUT** `/api/user/profile`

#### 上传头像
- **POST** `/api/user/avatar`

#### 修改密码
- **PUT** `/api/user/password`

#### 绑定手机号
- **POST** `/api/user/bind-phone`

#### 绑定邮箱
- **POST** `/api/user/bind-email`

### 图片处理模块

#### 图片上传
- **POST** `/api/image/upload`

#### AI图片分析
- **POST** `/api/image/analyze`

#### 图片处理
- **POST** `/api/image/process`

#### 获取处理状态
- **GET** `/api/image/status/:id`

#### 获取图片信息
- **GET** `/api/image/info/:id`

### 场景管理模块

#### 获取场景分类
- **GET** `/api/scene/categories`

#### 获取场景列表
- **GET** `/api/scene/list`

#### 创建自定义场景
- **POST** `/api/scene/create`

#### 更新场景
- **PUT** `/api/scene/:id`

#### 删除场景
- **DELETE** `/api/scene/:id`

### AI模型配置模块

#### 获取模型配置列表
- **GET** `/api/model/configs`

#### 创建模型配置
- **POST** `/api/model/configs`

#### 更新模型配置
- **PUT** `/api/model/configs/:id`

#### 删除模型配置
- **DELETE** `/api/model/configs/:id`

#### 测试模型连接
- **POST** `/api/model/test/:id`

### 历史记录模块

#### 获取处理历史
- **GET** `/api/history/records`

#### 添加收藏
- **POST** `/api/history/favorites`

#### 移除收藏
- **DELETE** `/api/history/favorites/:id`

#### 获取收藏列表
- **GET** `/api/history/favorites`

#### 移至回收站
- **POST** `/api/history/trash`

#### 获取回收站
- **GET** `/api/history/trash`

#### 恢复文件
- **POST** `/api/history/restore/:id`

#### 永久删除
- **DELETE** `/api/history/permanent/:id`

### 文件上传模块

#### 获取上传Token
- **GET** `/api/upload/token`

#### 文件上传
- **POST** `/api/upload/file`

#### 上传回调
- **POST** `/api/upload/callback`

### 系统设置模块

#### 获取应用设置
- **GET** `/api/settings/app`

#### 更新应用设置
- **PUT** `/api/settings/app`

#### 获取安全设置
- **GET** `/api/settings/security`

#### 启用/禁用两步验证
- **PUT** `/api/settings/security/two-factor`

#### 移除登录设备
- **DELETE** `/api/settings/security/devices/:deviceId`

## 数据库表结构

### 用户相关表
- `users` - 用户基本信息
- `user_profiles` - 用户详细资料
- `refresh_tokens` - 刷新令牌
- `user_settings` - 用户设置
- `login_devices` - 登录设备
- `login_history` - 登录历史

### 业务相关表
- `scene_categories` - 场景分类
- `scenes` - 场景配置
- `model_configs` - AI模型配置
- `images` - 图片信息
- `process_records` - 处理记录

## 开发说明

### 添加新的路由

1. 在 `src/routes/` 目录下创建新的路由文件
2. 在 `src/app.js` 中注册路由
3. 添加相应的中间件和验证

### 数据库迁移

修改 `src/database/migrate.js` 文件，添加新的表结构或修改现有表结构。

### 环境变量

所有配置项都通过环境变量管理，确保敏感信息不被提交到代码仓库。

## 部署

### Docker部署

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### PM2部署

```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

## 许可证

MIT License# banana-image-backend
