require('dotenv').config();
const { getDB } = require('./connection');
const { connectDB } = require('./connection');

// 数据库表结构
const tables = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      phone VARCHAR(20) UNIQUE,
      email VARCHAR(100) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_username (username),
      INDEX idx_phone (phone),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  
  user_profiles: `
    CREATE TABLE IF NOT EXISTS user_profiles (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      nickname VARCHAR(50),
      gender ENUM('male', 'female', 'other'),
      birthday DATE,
      avatar VARCHAR(255),
      wechat VARCHAR(50),
      qq VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  refresh_tokens: `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_token (token),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  scene_categories: `
    CREATE TABLE IF NOT EXISTS scene_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      icon VARCHAR(255),
      description TEXT,
      is_custom BOOLEAN DEFAULT FALSE,
      user_id VARCHAR(36),
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_sort_order (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  scenes: `
    CREATE TABLE IF NOT EXISTS scenes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      icon VARCHAR(255),
      description TEXT,
      type VARCHAR(50) NOT NULL,
      config JSON,
      is_custom BOOLEAN DEFAULT FALSE,
      user_id VARCHAR(36),
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES scene_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_category_id (category_id),
      INDEX idx_user_id (user_id),
      INDEX idx_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  model_configs: `
    CREATE TABLE IF NOT EXISTS model_configs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      api_url VARCHAR(255) NOT NULL,
      api_key VARCHAR(255) NOT NULL,
      model_name VARCHAR(100) NOT NULL,
      default_model VARCHAR(100),
      support_custom_model BOOLEAN DEFAULT FALSE,
      temperature DECIMAL(3,2) DEFAULT 0.7,
      max_tokens INT DEFAULT 1000,
      timeout INT DEFAULT 30000,
      is_configured BOOLEAN DEFAULT FALSE,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_is_default (is_default)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  images: `
    CREATE TABLE IF NOT EXISTS images (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      thumbnail_path VARCHAR(500),
      file_size INT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      width INT,
      height INT,
      scene_type VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_scene_type (scene_type),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  process_records: `
    CREATE TABLE IF NOT EXISTS process_records (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      image_id VARCHAR(36) NOT NULL,
      scene_type VARCHAR(50) NOT NULL,
      scene_name VARCHAR(100),
      analysis_id VARCHAR(36),
      processed_image_path VARCHAR(500),
      process_params JSON,
      status ENUM('processing', 'completed', 'failed') DEFAULT 'processing',
      progress INT DEFAULT 0,
      status_text VARCHAR(255),
      estimated_time INT,
      process_time INT,
      error_message TEXT,
      is_favorite BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_image_id (image_id),
      INDEX idx_status (status),
      INDEX idx_scene_type (scene_type),
      INDEX idx_is_favorite (is_favorite),
      INDEX idx_is_deleted (is_deleted),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  login_devices: `
    CREATE TABLE IF NOT EXISTS login_devices (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      device_id VARCHAR(100) NOT NULL,
      device_name VARCHAR(100),
      platform VARCHAR(50),
      user_agent TEXT,
      ip_address VARCHAR(45),
      location VARCHAR(100),
      status ENUM('active', 'removed') DEFAULT 'active',
      last_login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_device (user_id, device_id),
      INDEX idx_user_id (user_id),
      INDEX idx_device_id (device_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  login_history: `
    CREATE TABLE IF NOT EXISTS login_history (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      device_id VARCHAR(100),
      platform VARCHAR(50),
      ip_address VARCHAR(45),
      location VARCHAR(100),
      user_agent TEXT,
      status ENUM('success', 'failed') NOT NULL,
      failure_reason VARCHAR(255),
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_login_time (login_time),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  user_settings: `
    CREATE TABLE IF NOT EXISTS user_settings (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      theme VARCHAR(20) DEFAULT 'light',
      language VARCHAR(10) DEFAULT 'zh-CN',
      auto_save BOOLEAN DEFAULT TRUE,
      image_quality VARCHAR(20) DEFAULT 'high',
      notification_process_complete BOOLEAN DEFAULT TRUE,
      notification_system_update BOOLEAN DEFAULT TRUE,
      two_factor_enabled BOOLEAN DEFAULT FALSE,
      two_factor_secret VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_settings (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  image_analysis: `
    CREATE TABLE IF NOT EXISTS image_analysis (
      id VARCHAR(36) PRIMARY KEY,
      image_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      scene_type VARCHAR(50) NOT NULL,
      analysis_result JSON,
      confidence DECIMAL(5,4),
      processing_time INT,
      model_used VARCHAR(100),
      status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_image_id (image_id),
      INDEX idx_user_id (user_id),
      INDEX idx_scene_type (scene_type),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `
};

// 初始化数据
const initialData = {
  scene_categories: [
    { name: '人像处理', icon: 'portrait', description: '人像美化、风格转换等' },
    { name: '风景处理', icon: 'landscape', description: '风景照片增强、滤镜等' },
    { name: '创意设计', icon: 'creative', description: '艺术风格、创意效果等' },
    { name: '商业用途', icon: 'business', description: '产品图、宣传图等' }
  ],
  
  scenes: [
    { category_id: 1, name: '人像美化', type: 'portrait_enhance', description: '自动美化人像照片' },
    { category_id: 1, name: '风格转换', type: 'style_transfer', description: '将人像转换为不同艺术风格' },
    { category_id: 2, name: '风景增强', type: 'landscape_enhance', description: '增强风景照片的色彩和对比度' },
    { category_id: 2, name: '天空替换', type: 'sky_replacement', description: '替换照片中的天空' },
    { category_id: 3, name: '艺术风格', type: 'artistic_style', description: '应用各种艺术风格效果' },
    { category_id: 3, name: '卡通化', type: 'cartoonize', description: '将照片转换为卡通风格' },
    { category_id: 4, name: '产品图优化', type: 'product_optimize', description: '优化产品照片质量' },
    { category_id: 4, name: '背景移除', type: 'background_remove', description: '自动移除图片背景' }
  ]
};

async function createTables() {
  const db = getDB();
  
  try {
    console.log('开始创建数据库表...');
    
    for (const [tableName, sql] of Object.entries(tables)) {
      console.log(`创建表: ${tableName}`);
      await db.execute(sql);
    }
    
    console.log('数据库表创建完成');
    
    // 插入初始数据
    await insertInitialData();
    
  } catch (error) {
    console.error('创建数据库表失败:', error);
    throw error;
  }
}

async function insertInitialData() {
  const db = getDB();
  
  try {
    console.log('插入初始数据...');
    
    // 检查是否已有数据
    const [categories] = await db.execute('SELECT COUNT(*) as count FROM scene_categories');
    if (categories[0].count > 0) {
      console.log('初始数据已存在，跳过插入');
      return;
    }
    
    // 插入场景分类
    for (const category of initialData.scene_categories) {
      await db.execute(
        'INSERT INTO scene_categories (name, icon, description, is_custom) VALUES (?, ?, ?, FALSE)',
        [category.name, category.icon, category.description]
      );
    }
    
    // 插入场景
    for (const scene of initialData.scenes) {
      await db.execute(
        'INSERT INTO scenes (category_id, name, type, description, is_custom) VALUES (?, ?, ?, ?, FALSE)',
        [scene.category_id, scene.name, scene.type, scene.description]
      );
    }
    
    console.log('初始数据插入完成');
    
  } catch (error) {
    console.error('插入初始数据失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，则执行迁移
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await createTables();
      console.log('数据库迁移完成');
      process.exit(0);
    } catch (error) {
      console.error('数据库迁移失败:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  createTables,
  insertInitialData
};