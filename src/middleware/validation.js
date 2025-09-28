const { body, param, query, validationResult } = require('express-validator');

// 验证结果处理
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 400,
      message: '请求参数验证失败',
      errors: errors.array()
    });
  }
  next();
};

// 用户注册验证
const validateRegister = [
  body('username')
    .isLength({ min: 2, max: 20 })
    .withMessage('用户名长度必须在2-20字符之间')
    .matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和中文'),
  
  body('phone')
    .optional()
    .isMobilePhone('zh-CN')
    .withMessage('手机号格式不正确'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('邮箱格式不正确'),
  
  body('password')
    .isLength({ min: 6, max: 20 })
    .withMessage('密码长度必须在6-20字符之间'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('确认密码与密码不匹配');
      }
      return true;
    }),
  
  handleValidationErrors
];

// 用户登录验证
const validateLogin = [
  body('username')
    .notEmpty()
    .withMessage('用户名/手机号/邮箱不能为空'),
  
  body('password')
    .notEmpty()
    .withMessage('密码不能为空'),
  
  handleValidationErrors
];

// 更新用户资料验证
const validateUpdateProfile = [
  body('nickname')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('昵称长度必须在1-50字符之间'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('性别值无效'),
  
  body('birthday')
    .optional()
    .isDate()
    .withMessage('生日格式不正确'),
  
  handleValidationErrors
];

// 修改密码验证
const validateChangePassword = [
  body('oldPassword')
    .notEmpty()
    .withMessage('原密码不能为空'),
  
  body('newPassword')
    .isLength({ min: 6, max: 20 })
    .withMessage('新密码长度必须在6-20字符之间'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('确认密码与新密码不匹配');
      }
      return true;
    }),
  
  handleValidationErrors
];

// 分页验证
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('页码必须是大于0的整数'),
  
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量必须是1-100之间的整数'),
  
  handleValidationErrors
];

// UUID参数验证
const validateUUID = (paramName) => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName}格式不正确`),
  
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validatePagination,
  validateUUID,
  handleValidationErrors
};