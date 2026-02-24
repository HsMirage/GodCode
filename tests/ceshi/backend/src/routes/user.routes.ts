import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { requireFields } from '../middlewares/validate.middleware';

const router = Router();

/**
 * @route   GET /api/users
 * @desc    获取用户列表（管理员）
 * @access  Private (Admin)
 */
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  UserController.getUsers
);

/**
 * @route   GET /api/users/me
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/me', authenticate, UserController.getCurrentUser);

/**
 * @route   PUT /api/users/me
 * @desc    更新当前用户信息
 * @access  Private
 */
router.put(
  '/me',
  authenticate,
  UserController.updateCurrentUser
);

/**
 * @route   PUT /api/users/me/password
 * @desc    修改当前用户密码
 * @access  Private
 */
router.put(
  '/me/password',
  authenticate,
  requireFields('oldPassword', 'newPassword'),
  UserController.changePassword
);

/**
 * @route   GET /api/users/me/events
 * @desc    获取当前用户的事件列表
 * @access  Private
 */
router.get('/me/events', authenticate, UserController.getUserEvents);

/**
 * @route   GET /api/users/:id
 * @desc    获取用户详情（管理员）
 * @access  Private (Admin)
 */
router.get(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  UserController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    更新用户信息（管理员）
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  UserController.updateUser
);

/**
 * @route   PUT /api/users/:id/status
 * @desc    更新用户状态（管理员）
 * @access  Private (Admin)
 */
router.put(
  '/:id/status',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireFields('status'),
  UserController.updateUserStatus
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    更新用户角色（管理员）
 * @access  Private (Super Admin)
 */
router.put(
  '/:id/role',
  authenticate,
  authorize('SUPER_ADMIN'),
  requireFields('role'),
  UserController.updateUserRole
);

export default router;