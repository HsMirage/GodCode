import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class UserController {
  /**
   * 获取用户列表（管理员）
   */
  static async getUsers(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        role,
        status,
      } = req.query;

      const result = await UserService.getUserList({
        page: Number(page),
        limit: Number(limit),
        search: search as string,
        role: role as string,
        status: status as string,
      });

      return successResponse(res, result, '获取用户列表成功');
    } catch (error: any) {
      logger.error('Get users error:', error);
      return errorResponse(res, error.message || '获取用户列表失败', 500, error.message);
    }
  }

  /**
   * 获取当前用户信息
   */
  static async getCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const user = await UserService.findUserById(userId);

      if (!user) {
        return errorResponse(res, '用户不存在', 404, 'User not found');
      }

      return successResponse(res, { user }, '获取用户信息成功');
    } catch (error: any) {
      logger.error('Get current user error:', error);
      return errorResponse(res, error.message || '获取用户信息失败', 500, error.message);
    }
  }

  /**
   * 更新当前用户信息
   */
  static async updateCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { username, email, avatar } = req.body;

      const user = await UserService.updateUserProfile(userId, {
        username,
        email,
        avatar,
      });

      return successResponse(res, { user }, '更新用户信息成功');
    } catch (error: any) {
      logger.error('Update current user error:', error);
      return errorResponse(res, error.message || '更新用户信息失败', 400, error.message);
    }
  }

  /**
   * 修改当前用户密码
   */
  static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { oldPassword, newPassword } = req.body;

      const user = await UserService.changePassword(userId, oldPassword, newPassword);

      return successResponse(res, { user }, '修改密码成功');
    } catch (error: any) {
      logger.error('Change password error:', error);
      return errorResponse(res, error.message || '修改密码失败', 400, error.message);
    }
  }

  /**
   * 获取当前用户的事件列表
   */
  static async getUserEvents(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20, status } = req.query;

      const result = await UserService.getUserEvents(userId, {
        page: Number(page),
        limit: Number(limit),
        status: status as string,
      });

      return successResponse(res, result, '获取用户事件列表成功');
    } catch (error: any) {
      logger.error('Get user events error:', error);
      return errorResponse(res, error.message || '获取用户事件列表失败', 500, error.message);
    }
  }

  /**
   * 获取用户详情（管理员）
   */
  static async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await UserService.findUserById(id);

      if (!user) {
        return errorResponse(res, '用户不存在', 404, 'User not found');
      }

      return successResponse(res, { user }, '获取用户详情成功');
    } catch (error: any) {
      logger.error('Get user error:', error);
      return errorResponse(res, error.message || '获取用户详情失败', 500, error.message);
    }
  }

  /**
   * 更新用户角色（管理员）
   */
  static async updateUserRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return errorResponse(res, '请指定角色', 400, 'Role is required');
      }

      const user = await UserService.updateUserRole(id, role);

      return successResponse(res, { user }, '更新用户角色成功');
    } catch (error: any) {
      logger.error('Update user role error:', error);
      return errorResponse(res, error.message || '更新用户角色失败', 400, error.message);
    }
  }

  /**
   * 更新用户状态（管理员）
   */
  static async updateUserStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return errorResponse(res, '请指定状态', 400, 'Status is required');
      }

      const user = await UserService.updateUserStatus(id, status);

      return successResponse(res, { user }, '更新用户状态成功');
    } catch (error: any) {
      logger.error('Update user status error:', error);
      return errorResponse(res, error.message || '更新用户状态失败', 400, error.message);
    }
  }

  /**
   * 删除用户（管理员）
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // 不允许删除自己
      if (req.user!.id === id) {
        return errorResponse(res, '不能删除自己的账号', 400, 'Cannot delete yourself');
      }

      // 使用Prisma删除用户（会级联删除相关数据）
      await UserService.findUserById(id); // 先检查用户是否存在

      // 这里需要直接使用Prisma删除，因为UserService没有delete方法
      const prisma = (await import('../utils/prisma')).default;
      await prisma.user.delete({
        where: { id },
      });

      logger.info(`User deleted: ${id}`);

      return successResponse(res, null, '删除用户成功');
    } catch (error: any) {
      logger.error('Delete user error:', error);
      return errorResponse(res, error.message || '删除用户失败', 400, error.message);
    }
  }

  /**
   * 更新用户信息（管理员）
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { username, email, avatar, role, status } = req.body;

      const user = await UserService.updateUser(id, {
        username,
        email,
        avatar,
        role,
        status,
      });

      return successResponse(res, { user }, '更新用户信息成功');
    } catch (error: any) {
      logger.error('Update user error:', error);
      return errorResponse(res, error.message || '更新用户信息失败', 400, error.message);
    }
  }
}