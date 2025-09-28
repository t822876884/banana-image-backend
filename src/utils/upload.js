const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// 确保上传目录存在
async function ensureUploadDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    
    // 如果有用户信息，按用户ID分类保存
    if (req.user && req.user.id) {
      const userDir = path.join(uploadPath, req.user.id.toString());
      await ensureUploadDir(userDir);
      cb(null, userDir);
    } else {
      // 兼容旧的分类方式（如果没有用户信息）
      const subDir = file.fieldname === 'avatar' ? 'avatars' : 'images';
      const fullPath = path.join(uploadPath, subDir);
      await ensureUploadDir(fullPath);
      cb(null, fullPath);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(',');
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

// 创建multer实例
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1
  }
});

// 生成缩略图
async function generateThumbnail(imagePath, thumbnailPath, width = 300, height = 300) {
  try {
    await sharp(imagePath)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    
    return thumbnailPath;
  } catch (error) {
    console.error('生成缩略图失败:', error);
    throw error;
  }
}

// 获取图片信息
async function getImageInfo(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size
    };
  } catch (error) {
    console.error('获取图片信息失败:', error);
    throw error;
  }
}

// 压缩图片
async function compressImage(inputPath, outputPath, quality = 80) {
  try {
    await sharp(inputPath)
      .jpeg({ quality })
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('压缩图片失败:', error);
    throw error;
  }
}

// 删除文件
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('删除文件失败:', error);
  }
}

// 获取文件URL
function getFileUrl(req, filePath) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const relativePath = filePath.replace(process.env.UPLOAD_PATH || './uploads', '/uploads');
  return `${baseUrl}${relativePath}`;
}

module.exports = {
  upload,
  generateThumbnail,
  getImageInfo,
  compressImage,
  deleteFile,
  getFileUrl,
  ensureUploadDir
};