const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Nano Banana AI图片处理API',
      version: '1.0.0',
      description: 'Nano Banana AI图片处理应用的后端API文档',
      contact: {
        name: 'Nano Banana Team',
        email: 'support@nanobanana.com'
      }
    },
    servers: [
      {
        url: 'http://127.0.0.1:3000',
        description: '开发环境'
      },
      {
        url: 'https://api.nanobanana.com',
        description: '生产环境'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            status: { type: 'string', enum: ['active', 'inactive', 'banned'] },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            nickname: { type: 'string' },
            gender: { type: 'string', enum: ['male', 'female', 'other'] },
            birthday: { type: 'string', format: 'date' },
            avatar: { type: 'string' },
            wechat: { type: 'string' },
            qq: { type: 'string' }
          }
        },
        Scene: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            category_id: { type: 'integer' },
            name: { type: 'string' },
            icon: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string' },
            config: { type: 'object' }
          }
        },
        Image: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            original_filename: { type: 'string' },
            filename: { type: 'string' },
            file_path: { type: 'string' },
            thumbnail_path: { type: 'string' },
            file_size: { type: 'integer' },
            mime_type: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            scene_type: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' },
            details: { type: 'string' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 200 },
            message: { type: 'string', example: '操作成功' },
            data: { type: 'object' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.js', // 扫描路由文件中的注释
    './src/app.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;