const express = require('express');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取场景分类列表
router.get('/categories', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    // 获取所有场景分类（包括系统默认和用户自定义）
    const [categories] = await db.execute(
      `SELECT sc.*, 
              CASE WHEN sc.user_id IS NULL THEN false ELSE true END as isCustom
       FROM scene_categories sc 
       WHERE sc.user_id IS NULL OR sc.user_id = ?
       ORDER BY sc.sort_order ASC, sc.created_at ASC`,
      [req.user.id]
    );

    // 获取每个分类下的场景
    const categoriesWithScenes = await Promise.all(
      categories.map(async (category) => {
        const [scenes] = await db.execute(
          `SELECT s.id, s.name, s.icon, s.type, s.description, s.prompt
           FROM scenes s 
           WHERE s.category_id = ? AND (s.user_id IS NULL OR s.user_id = ?)
           ORDER BY s.sort_order ASC, s.created_at ASC`,
          [category.id, req.user.id]
        );

        return {
          id: category.id,
          name: category.name,
          icon: category.icon,
          isCustom: category.isCustom,
          scenes: scenes.map(scene => ({
            id: scene.id,
            name: scene.name,
            icon: scene.icon,
            type: scene.type,
            description: scene.description,
            prompt: scene.prompt
          }))
        };
      })
    );

    res.json({
      code: 200,
      data: categoriesWithScenes
    });

  } catch (error) {
    console.error('获取场景分类失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取场景分类失败'
    });
  }
});

// 创建自定义场景分类
router.post('/categories', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { name, icon, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        code: 400,
        message: '分类名称不能为空'
      });
    }

    // 检查分类名称是否已存在
    const [existing] = await db.execute(
      'SELECT id FROM scene_categories WHERE name = ? AND user_id = ?',
      [name, req.user.id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '分类名称已存在'
      });
    }

    // 插入新分类，让数据库自动生成ID
    const [result] = await db.execute(
      `INSERT INTO scene_categories (user_id, name, icon, description) 
       VALUES (?, ?, ?, ?)`,
      [req.user.id, name, icon || '', description || '']
    );

    const categoryId = result.insertId;

    res.json({
      code: 200,
      message: '场景分类创建成功',
      data: {
        id: categoryId,
        name,
        icon: icon || '',
        description: description || '',
        isCustom: true
      }
    });

  } catch (error) {
    console.error('创建场景分类失败:', error);
    res.status(500).json({
      code: 500,
      message: '创建场景分类失败'
    });
  }
});

// 创建自定义场景
router.post('/', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { categoryId, name, icon, description, type, prompt } = req.body;
    
    if (!categoryId || !name || !type) {
      return res.status(400).json({
        code: 400,
        message: '分类ID、场景名称和类型不能为空'
      });
    }

    // 检查分类是否存在且属于当前用户
    const [categories] = await db.execute(
      'SELECT id FROM scene_categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
      [categoryId, req.user.id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '场景分类不存在'
      });
    }

    // 检查场景名称是否已存在
    const [existing] = await db.execute(
      'SELECT id FROM scenes WHERE name = ? AND category_id = ? AND user_id = ?',
      [name, categoryId, req.user.id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '场景名称已存在'
      });
    }

    // 插入新场景，让数据库自动生成ID
    const [result] = await db.execute(
      `INSERT INTO scenes (category_id, user_id, name, icon, description, type, prompt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryId, 
        req.user.id, 
        name, 
        icon || '', 
        description || '', 
        type,
        prompt || '', 
      ]
    );

    const sceneId = result.insertId;

    res.json({
      code: 200,
      message: '场景创建成功',
      data: {
        id: sceneId,
        categoryId,
        name,
        icon: icon || '',
        description: description || '',
        type,
        prompt: prompt || ''
      }
    });

  } catch (error) {
    console.error('创建场景失败:', error);
    res.status(500).json({
      code: 500,
      message: '创建场景失败'
    });
  }
});

// 更新场景
router.put('/:sceneId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { sceneId } = req.params;
    const { name, icon, description, prompt } = req.body;
    
    // 检查场景是否存在且属于当前用户
    const [scenes] = await db.execute(
      'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
      [sceneId, req.user.id]
    );

    if (scenes.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '场景不存在或无权限修改'
      });
    }

    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    
    if (icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(icon);
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    
    if (prompt !== undefined) {
      updateFields.push('prompt = ?');
      updateValues.push(prompt);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '没有需要更新的字段'
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(sceneId);

    await db.execute(
      `UPDATE scenes SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      code: 200,
      message: '场景更新成功'
    });

  } catch (error) {
    console.error('更新场景失败:', error);
    res.status(500).json({
      code: 500,
      message: '更新场景失败'
    });
  }
});

// 删除场景
router.delete('/:sceneId', authenticateToken, async (req, res) => {
  const db = getDB();
  
  try {
    const { sceneId } = req.params;
    
    // 检查场景是否存在且属于当前用户
    const [scenes] = await db.execute(
      'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
      [sceneId, req.user.id]
    );

    if (scenes.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '场景不存在或无权限删除'
      });
    }

    // 检查是否有相关的处理记录
    const [records] = await db.execute(
      'SELECT COUNT(*) as count FROM process_records WHERE scene_type = ?',
      [scenes[0].type]
    );

    if (records[0].count > 0) {
      return res.status(400).json({
        code: 400,
        message: '该场景已被使用，无法删除'
      });
    }

    await db.execute('DELETE FROM scenes WHERE id = ?', [sceneId]);

    res.json({
      code: 200,
      message: '场景删除成功'
    });

  } catch (error) {
    console.error('删除场景失败:', error);
    res.status(500).json({
      code: 500,
      message: '删除场景失败'
    });
  }
});

module.exports = router;