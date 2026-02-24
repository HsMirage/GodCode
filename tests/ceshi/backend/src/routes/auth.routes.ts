import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFields } from '../middlewares/validate.middleware';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    用户注册
 * @access  Public
 */
router.post(
  '/register',
  requireFields('username', 'email', 'password'),
  AuthController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 */
router.post(
  '/login',
  requireFields('emailOrUsername', 'password'),
  AuthController.login
);

/**
 * @route   GET /api/auth/profile
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/profile', authenticate, AuthController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    更新用户信息
 * @access  Private
 */
router.put(
  '/profile',
  authenticate,
  AuthController.updateProfile
);

/**
 * @route   PUT /api/auth/password
 * @desc    修改密码
 * @access  Private
 */
router.put(
  '/password',
  authenticate,
  requireFields('oldPassword', 'newPassword'),
  AuthController.changePassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    退出登录
 * @access  Private
 */
router.post('/logout', authenticate, AuthController.logout);

export default router;