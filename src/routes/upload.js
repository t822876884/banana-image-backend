const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { generateThumbnail, getImageInfo, ensureUploadDir } = require('../utils/upload');

const router = express.Router();

// 临时存储配置 - 先保存到临时目录，然后移动到用户目录
const tempStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const tempPath = path.join(process.env.UPLOAD_PATH || './uploads', 'temp');
      await ensureUploadDir(tempPath);
      cb(null, tempPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `temp_${Date.now()}_${uuidv4()}${ext}`;
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
  storage: tempStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 5 // 支持多文件上传
  }
});

// 移动文件到用户目录的辅助函数
async function moveFileToUserDirectory(tempFilePath, userId, fileType, originalFilename) {
  const uploadPath = process.env.UPLOAD_PATH || './uploads';
  // 直接使用用户ID作为目录，不再区分 avatars 和 images 子目录
  const userUploadPath = path.join(uploadPath, userId.toString());
  // 确保用户目录存在
  await ensureUploadDir(userUploadPath);
  // 生成新的文件名：UUID + 原始扩展名
  const ext = path.extname(originalFilename);
  const newFilename = `${uuidv4()}${ext}`;
  const newFilePath = path.join(userUploadPath, newFilename);

  // 移动文件
  await fs.rename(tempFilePath, newFilePath);

  return {
    filename: newFilename,
    filePath: newFilePath,
    relativePath: path.relative(uploadPath, newFilePath)
  };
}

// 获取上传凭证
router.get('/token', authenticateToken, async (req, res) => {
  try {
    const { fileType, fileName } = req.query;

    if (!fileType || !fileName) {
      return res.status(400).json({
        code: 400,
        message: '文件类型和文件名不能为空'
      });
    }

    // 验证文件类型
    const allowedTypes = ['image', 'avatar'];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        code: 400,
        message: '不支持的文件类型'
      });
    }

    // 生成上传凭证
    const uploadToken = generateUploadToken();
    const key = generateFileKey(fileType, fileName, req.user.id);
    const expires = Date.now() + 3600000; // 1小时后过期

    const uploadUrl = `${req.protocol}://${req.get('host')}/api/upload/file`;

    res.json({
      code: 200,
      data: {
        uploadUrl,
        token: uploadToken,
        key,
        expires,
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
        allowedTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(',')
      }
    });

  } catch (error) {
    console.error('获取上传凭证失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取上传凭证失败'
    });
  }
});

// 单文件上传接口
router.post('/file', authenticateToken, upload.single('file'), async (req, res) => {
  const db = getDB();
  let tempFilePath = null;
  let finalFilePath = null;
  let thumbnailPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        message: '请选择要上传的文件'
      });
    }

    tempFilePath = req.file.path;
    const fileId = uuidv4();
    const fileType = req.body.fileType || 'image';

    // 移动文件到用户目录
    const fileInfo = await moveFileToUserDirectory(
      tempFilePath,
      req.user.id,
      fileType,
      req.file.originalname
    );

    finalFilePath = fileInfo.filePath;

    // 生成缩略图（如果是图片）
    if (req.file.mimetype.startsWith('image/')) {
      const thumbnailName = `${path.parse(fileInfo.filename).name}_thumb${path.extname(fileInfo.filename)}`;
      thumbnailPath = path.join(path.dirname(finalFilePath), thumbnailName);

      try {
        await generateThumbnail(finalFilePath, thumbnailPath);
      } catch (error) {
        console.warn('生成缩略图失败:', error);
        thumbnailPath = null;
      }
    }

    // 获取图片信息
    let imageInfo = {};
    if (req.file.mimetype.startsWith('image/')) {
      try {
        imageInfo = await getImageInfo(finalFilePath);
      } catch (error) {
        console.warn('获取图片信息失败:', error);
      }
    }

    // 构建文件URL
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${fileInfo.relativePath.replace(/\\/g, '/')}`;

    let thumbnailUrl = null;
    if (thumbnailPath) {
      const thumbnailRelativePath = path.relative(uploadPath, thumbnailPath);
      thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${thumbnailRelativePath.replace(/\\/g, '/')}`;
    }

    // 保存文件信息到数据库
    await db.execute(
      `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
       thumbnail_path, file_size, mime_type, width, height, scene_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        req.user.id,
        req.file.originalname,
        fileInfo.filename,
        fileInfo.relativePath,
        thumbnailPath ? path.relative(uploadPath, thumbnailPath) : null,
        req.file.size,
        req.file.mimetype,
        imageInfo.width || null,
        imageInfo.height || null,
        req.body.sceneType || null
      ]
    );

    res.json({
      code: 200,
      message: '文件上传成功',
      data: {
        id: fileId,
        filename: fileInfo.filename,
        originalName: req.file.originalname,
        fileUrl,
        thumbnailUrl,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        width: imageInfo.width,
        height: imageInfo.height,
        uploadPath: fileInfo.relativePath,
        userDirectory: req.user.id.toString()  // 直接使用用户ID
      }
    });

  } catch (error) {
    console.error('文件上传失败:', error);

    // 清理文件
    try {
      if (tempFilePath && await fs.access(tempFilePath).then(() => true).catch(() => false)) {
        await fs.unlink(tempFilePath);
      }
      if (finalFilePath && await fs.access(finalFilePath).then(() => true).catch(() => false)) {
        await fs.unlink(finalFilePath);
      }
      if (thumbnailPath && await fs.access(thumbnailPath).then(() => true).catch(() => false)) {
        await fs.unlink(thumbnailPath);
      }
    } catch (cleanupError) {
      console.error('清理文件失败:', cleanupError);
    }

    res.status(500).json({
      code: 500,
      message: '文件上传失败',
      error: error.message
    });
  }
});

// 多文件上传接口
router.post('/files', authenticateToken, upload.array('files', 5), async (req, res) => {
  const db = getDB();
  const uploadedFiles = [];
  const tempFiles = [];

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '请选择要上传的文件'
      });
    }

    // 开始事务
    await db.execute('START TRANSACTION');

    try {
      for (const file of req.files) {
        const tempFilePath = file.path;
        tempFiles.push(tempFilePath);

        const fileId = uuidv4();
        const fileType = req.body.fileType || 'image';

        // 移动文件到用户目录
        const fileInfo = await moveFileToUserDirectory(
          tempFilePath,
          req.user.id,
          fileType,
          file.originalname
        );

        const finalFilePath = fileInfo.filePath;

        // 生成缩略图（如果是图片）
        let thumbnailPath = null;
        if (file.mimetype.startsWith('image/')) {
          const thumbnailName = `${path.parse(fileInfo.filename).name}_thumb${path.extname(fileInfo.filename)}`;
          thumbnailPath = path.join(path.dirname(finalFilePath), thumbnailName);

          try {
            await generateThumbnail(finalFilePath, thumbnailPath);
          } catch (error) {
            console.warn('生成缩略图失败:', error);
            thumbnailPath = null;
          }
        }

        // 获取图片信息
        let imageInfo = {};
        if (file.mimetype.startsWith('image/')) {
          try {
            imageInfo = await getImageInfo(finalFilePath);
          } catch (error) {
            console.warn('获取图片信息失败:', error);
          }
        }

        // 构建文件URL
        const uploadPath = process.env.UPLOAD_PATH || './uploads';
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${fileInfo.relativePath.replace(/\\/g, '/')}`;

        let thumbnailUrl = null;
        if (thumbnailPath) {
          const thumbnailRelativePath = path.relative(uploadPath, thumbnailPath);
          thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${thumbnailRelativePath.replace(/\\/g, '/')}`;
        }

        // 保存文件信息到数据库
        await db.execute(
          `INSERT INTO images (id, user_id, original_filename, filename, file_path, 
           thumbnail_path, file_size, mime_type, width, height, scene_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            req.user.id,
            file.originalname,
            fileInfo.filename,
            fileInfo.relativePath,
            thumbnailPath ? path.relative(uploadPath, thumbnailPath) : null,
            file.size,
            file.mimetype,
            imageInfo.width || null,
            imageInfo.height || null,
            req.body.sceneType || null
          ]
        );

        uploadedFiles.push({
          id: fileId,
          filename: fileInfo.filename,
          originalName: file.originalname,
          fileUrl,
          thumbnailUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          width: imageInfo.width,
          height: imageInfo.height,
          uploadPath: fileInfo.relativePath,
          userDirectory: req.user.id.toString()  // 直接使用用户ID
        });
      }

      // 提交事务
      await db.execute('COMMIT');

      res.json({
        code: 200,
        message: `成功上传 ${uploadedFiles.length} 个文件`,
        data: {
          files: uploadedFiles,
          total: uploadedFiles.length
        }
      });

    } catch (error) {
      // 回滚事务
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('批量文件上传失败:', error);

    // 清理临时文件
    for (const tempFile of tempFiles) {
      try {
        if (await fs.access(tempFile).then(() => true).catch(() => false)) {
          await fs.unlink(tempFile);
        }
      } catch (cleanupError) {
        console.error('清理临时文件失败:', cleanupError);
      }
    }

    // 清理已上传的文件
    for (const uploadedFile of uploadedFiles) {
      try {
        const uploadPath = process.env.UPLOAD_PATH || './uploads';
        const filePath = path.join(uploadPath, uploadedFile.uploadPath);
        if (await fs.access(filePath).then(() => true).catch(() => false)) {
          await fs.unlink(filePath);
        }
      } catch (cleanupError) {
        console.error('清理已上传文件失败:', cleanupError);
      }
    }

    res.status(500).json({
      code: 500,
      message: '批量文件上传失败',
      error: error.message
    });
  }
});

// 获取用户上传的文件列表
router.get('/files', authenticateToken, async (req, res) => {
  const db = getDB();

  try {
    const { page = 1, pageSize = 20, sceneType } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    let whereClause = 'WHERE user_id = ?';
    const queryParams = [req.user.id];

    if (sceneType) {
      whereClause += ' AND scene_type = ?';
      queryParams.push(sceneType);
    }

    // 获取总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM images ${whereClause}`,
      queryParams
    );

    const total = countResult[0].total;

    // 获取文件列表
    const [files] = await db.execute(
      `SELECT id, original_filename, filename, file_path, thumbnail_path, 
       file_size, mime_type, width, height, scene_type, created_at
       FROM images ${whereClause}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // 构建完整的URL
    const filesWithUrls = files.map(file => ({
      ...file,
      fileUrl: `${req.protocol}://${req.get('host')}/uploads/${file.file_path.replace(/\\/g, '/')}`,
      thumbnailUrl: file.thumbnail_path ?
        `${req.protocol}://${req.get('host')}/uploads/${file.thumbnail_path.replace(/\\/g, '/')}` : null
    }));

    res.json({
      code: 200,
      data: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        list: filesWithUrls
      }
    });

  } catch (error) {
    console.error('获取文件列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取文件列表失败'
    });
  }
});

// 删除文件
router.delete('/file/:fileId', authenticateToken, async (req, res) => {
  const db = getDB();

  try {
    const { fileId } = req.params;

    // 查找文件信息
    const [files] = await db.execute(
      'SELECT * FROM images WHERE id = ? AND user_id = ?',
      [fileId, req.user.id]
    );

    if (files.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '文件不存在'
      });
    }

    const file = files[0];
    const uploadPath = process.env.UPLOAD_PATH || './uploads';

    // 删除物理文件
    try {
      const filePath = path.join(uploadPath, file.file_path);
      if (await fs.access(filePath).then(() => true).catch(() => false)) {
        await fs.unlink(filePath);
      }

      // 删除缩略图
      if (file.thumbnail_path) {
        const thumbnailPath = path.join(uploadPath, file.thumbnail_path);
        if (await fs.access(thumbnailPath).then(() => true).catch(() => false)) {
          await fs.unlink(thumbnailPath);
        }
      }
    } catch (error) {
      console.warn('删除物理文件失败:', error);
    }

    // 从数据库删除记录
    await db.execute('DELETE FROM images WHERE id = ?', [fileId]);

    res.json({
      code: 200,
      message: '文件删除成功'
    });

  } catch (error) {
    console.error('删除文件失败:', error);
    res.status(500).json({
      code: 500,
      message: '删除文件失败'
    });
  }
});

// 获取文件详情
router.get('/file/:fileId', authenticateToken, async (req, res) => {
  const db = getDB();

  try {
    const { fileId } = req.params;

    const [files] = await db.execute(
      'SELECT * FROM images WHERE id = ? AND user_id = ?',
      [fileId, req.user.id]
    );

    if (files.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '文件不存在'
      });
    }

    const file = files[0];

    res.json({
      code: 200,
      data: {
        ...file,
        fileUrl: `${req.protocol}://${req.get('host')}/uploads/${file.file_path.replace(/\\/g, '/')}`,
        thumbnailUrl: file.thumbnail_path ?
          `${req.protocol}://${req.get('host')}/uploads/${file.thumbnail_path.replace(/\\/g, '/')}` : null
      }
    });

  } catch (error) {
    console.error('获取文件详情失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取文件详情失败'
    });
  }
});

// 清理临时文件的定时任务接口（可选）
router.post('/cleanup-temp', authenticateToken, async (req, res) => {
  try {
    const tempPath = path.join(process.env.UPLOAD_PATH || './uploads', 'temp');

    if (await fs.access(tempPath).then(() => true).catch(() => false)) {
      const files = await fs.readdir(tempPath);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(tempPath, file);
        const stats = await fs.stat(filePath);

        // 删除超过1小时的临时文件
        if (now - stats.mtime.getTime() > 3600000) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      res.json({
        code: 200,
        message: `清理了 ${cleanedCount} 个临时文件`
      });
    } else {
      res.json({
        code: 200,
        message: '临时目录不存在'
      });
    }

  } catch (error) {
    console.error('清理临时文件失败:', error);
    res.status(500).json({
      code: 500,
      message: '清理临时文件失败'
    });
  }
});

// 辅助函数：生成上传凭证
function generateUploadToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 辅助函数：生成文件键（包含用户UUID）
function generateFileKey(fileType, fileName, userId) {
  const ext = fileName.split('.').pop();
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${userId}/${fileType}/${timestamp}_${random}.${ext}`;
}

module.exports = router;