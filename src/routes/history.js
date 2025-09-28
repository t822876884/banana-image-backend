const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { getFileUrl } = require('../utils/upload');

const router = express.Router();

// 获取处理历史
router.get('/photos', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      sceneType, 
      startDate, 
      endDate 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建查询条件
    let whereClause = 'WHERE pr.user_id = ? AND pr.status != "deleted"';
    const queryParams = [req.user.id];
    
    if (sceneType) {
      whereClause += ' AND pr.scene_type = ?';
      queryParams.push(sceneType);
    }
    
    if (startDate) {
      whereClause += ' AND DATE(pr.created_at) >= ?';
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND DATE(pr.created_at) <= ?';
      queryParams.push(endDate);
    }
    
    // 获取总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM process_records pr ${whereClause}`,
      queryParams
    );
    
    const total = countResult[0].total;
    
    // 获取列表数据 - 使用正确的字段名
    const [records] = await db.execute(
      `SELECT pr.id, pr.scene_type, pr.status, pr.processed_image_path as processed_url, pr.process_time,
              pr.created_at, pr.updated_at as completed_at,
              i.file_path, i.thumbnail_path, i.file_size,
              s.name as scene_name,
              f.id as favorite_id
       FROM process_records pr
       LEFT JOIN images i ON pr.image_id = i.id
       LEFT JOIN scenes s ON pr.scene_type = s.type AND (s.user_id IS NULL OR s.user_id = pr.user_id)
       LEFT JOIN favorites f ON pr.id = f.process_id AND f.user_id = pr.user_id
       ${whereClause}
       ORDER BY pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );
    
    const list = records.map(record => ({
      id: record.id,
      originalUrl: record.file_path ? getFileUrl(req, record.file_path) : null,
      processedUrl: record.processed_url,
      thumbnailUrl: record.thumbnail_path ? getFileUrl(req, record.thumbnail_path) : null,
      sceneType: record.scene_type,
      sceneName: record.scene_name || record.scene_type,
      processTime: record.completed_at || record.created_at,
      fileSize: record.file_size,
      status: record.status,
      isFavorite: Boolean(record.favorite_id)
    }));
    
    res.json({
      code: 200,
      data: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        list
      }
    });
    
  } catch (error) {
    console.error('获取处理历史失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取处理历史失败'
    });
  }
});

// 获取收藏列表
router.get('/favorites', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 获取总数
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?',
      [req.user.id]
    );
    
    const total = countResult[0].total;
    
    // 获取收藏列表
    const [favorites] = await db.execute(
      `SELECT pr.id, pr.scene_type, pr.status, pr.processed_url, pr.process_time,
              pr.created_at, pr.completed_at,
              i.original_url, i.thumbnail_url, i.file_size,
              s.name as scene_name,
              f.created_at as favorite_time
       FROM favorites f
       JOIN process_records pr ON f.process_id = pr.id
       LEFT JOIN images i ON pr.image_id = i.id
       LEFT JOIN scenes s ON pr.scene_type = s.type AND (s.user_id IS NULL OR s.user_id = pr.user_id)
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    
    const list = favorites.map(record => ({
      id: record.id,
      originalUrl: record.original_url,
      processedUrl: record.processed_url,
      thumbnailUrl: record.thumbnail_url,
      sceneType: record.scene_type,
      sceneName: record.scene_name || record.scene_type,
      processTime: record.completed_at || record.created_at,
      fileSize: record.file_size,
      status: record.status,
      favoriteTime: record.favorite_time
    }));
    
    res.json({
      code: 200,
      data: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        list
      }
    });
    
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取收藏列表失败'
    });
  }
});

// 添加到收藏
router.post('/favorites', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.body;
    
    if (!processId) {
      return res.status(400).json({
        code: 400,
        message: '处理记录ID不能为空'
      });
    }
    
    // 检查处理记录是否存在且属于当前用户
    const [records] = await db.execute(
      'SELECT id FROM process_records WHERE id = ? AND user_id = ?',
      [processId, req.user.id]
    );
    
    if (records.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '处理记录不存在'
      });
    }
    
    // 检查是否已收藏
    const [existing] = await db.execute(
      'SELECT id FROM favorites WHERE process_id = ? AND user_id = ?',
      [processId, req.user.id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '已经收藏过了'
      });
    }
    
    // 添加收藏
    const favoriteId = uuidv4();
    await db.execute(
      'INSERT INTO favorites (id, user_id, process_id) VALUES (?, ?, ?)',
      [favoriteId, req.user.id, processId]
    );
    
    res.json({
      code: 200,
      message: '添加收藏成功'
    });
    
  } catch (error) {
    console.error('添加收藏失败:', error);
    res.status(500).json({
      code: 500,
      message: '添加收藏失败'
    });
  }
});

// 取消收藏
router.delete('/favorites/:processId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    
    // 检查收藏是否存在
    const [favorites] = await db.execute(
      'SELECT id FROM favorites WHERE process_id = ? AND user_id = ?',
      [processId, req.user.id]
    );
    
    if (favorites.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '收藏记录不存在'
      });
    }
    
    // 删除收藏
    await db.execute(
      'DELETE FROM favorites WHERE process_id = ? AND user_id = ?',
      [processId, req.user.id]
    );
    
    res.json({
      code: 200,
      message: '取消收藏成功'
    });
    
  } catch (error) {
    console.error('取消收藏失败:', error);
    res.status(500).json({
      code: 500,
      message: '取消收藏失败'
    });
  }
});

// 删除处理记录
router.delete('/photos/:processId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    
    // 检查处理记录是否存在且属于当前用户
    const [records] = await db.execute(
      'SELECT id FROM process_records WHERE id = ? AND user_id = ?',
      [processId, req.user.id]
    );
    
    if (records.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '处理记录不存在'
      });
    }
    
    // 软删除：更新状态为deleted
    await db.execute(
      'UPDATE process_records SET status = "deleted", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [processId]
    );
    
    res.json({
      code: 200,
      message: '删除成功'
    });
    
  } catch (error) {
    console.error('删除处理记录失败:', error);
    res.status(500).json({
      code: 500,
      message: '删除处理记录失败'
    });
  }
});

// 获取回收站
router.get('/trash', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 获取总数
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM process_records WHERE user_id = ? AND status = "deleted"',
      [req.user.id]
    );
    
    const total = countResult[0].total;
    
    // 获取回收站列表
    const [records] = await db.execute(
      `SELECT pr.id, pr.scene_type, pr.status, pr.processed_url, pr.process_time,
              pr.created_at, pr.updated_at as deleted_at,
              i.original_url, i.thumbnail_url, i.file_size,
              s.name as scene_name
       FROM process_records pr
       LEFT JOIN images i ON pr.image_id = i.id
       LEFT JOIN scenes s ON pr.scene_type = s.type AND (s.user_id IS NULL OR s.user_id = pr.user_id)
       WHERE pr.user_id = ? AND pr.status = "deleted"
       ORDER BY pr.updated_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    
    const list = records.map(record => ({
      id: record.id,
      originalUrl: record.original_url,
      processedUrl: record.processed_url,
      thumbnailUrl: record.thumbnail_url,
      sceneType: record.scene_type,
      sceneName: record.scene_name || record.scene_type,
      processTime: record.created_at,
      deletedAt: record.deleted_at,
      fileSize: record.file_size
    }));
    
    res.json({
      code: 200,
      data: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        list
      }
    });
    
  } catch (error) {
    console.error('获取回收站失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取回收站失败'
    });
  }
});

// 恢复删除的记录
router.put('/trash/:processId/restore', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { processId } = req.params;
    
    // 检查记录是否存在且在回收站中
    const [records] = await db.execute(
      'SELECT id, status FROM process_records WHERE id = ? AND user_id = ? AND status = "deleted"',
      [processId, req.user.id]
    );
    
    if (records.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '回收站中没有找到该记录'
      });
    }
    
    // 恢复记录：将状态改回completed
    await db.execute(
      'UPDATE process_records SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [processId]
    );
    
    res.json({
      code: 200,
      message: '恢复成功'
    });
    
  } catch (error) {
    console.error('恢复删除记录失败:', error);
    res.status(500).json({
      code: 500,
      message: '恢复删除记录失败'
    });
  }
});

module.exports = router;