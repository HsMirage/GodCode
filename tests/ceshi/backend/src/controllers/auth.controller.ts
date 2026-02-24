import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { JwtService, PasswordService } from '../services/auth.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class AuthController {
  /**
   * 用户注册
   */
  static async register(req: Request, res: Response) {
    try {
      const { username, email, password } = req.body;

      // 验证必填字段
      if (!username || !email || !password) {
        return errorResponse(res, '请填写所有必填字段', 400, 'Missing required fields');
      }

      // 创建用户
      const user = await UserService.createUser({
        username,
        email,
        password,
      });

      // 生成JWT token
      const token = JwtService.generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });

      logger.info(`User registered: ${user.email}`);

      return successResponse(
        res,
        {
          user,
          token,
        },
        '注册成功',
        201
      );
    } catch (error: any) {
      logger.error('Registration error:', error);
      return errorResponse(res, error.message || '注册失败', 400, error.message);
    }
  }

  /**
   * 用户登录
   */
  static async login(req: Request, res: Response) {
    try {
      const { emailOrUsername, password } = req.body;

      // 验证必填字段
      if (!emailOrUsername || !password) {
        return errorResponse(res, '请填写所有必填字段', 400, 'Missing required fields');
      }

      // 查找用户（支持邮箱或用户名登录）
      let user = await UserService.findUserByEmail(emailOrUsername);
      if (!user) {
        user = await UserService.findUserByUsername(emailOrUsername);
      }

      if (!user) {
        return errorResponse(res, '用户不存在', 401, 'User not found');
      }

      // 检查用户状态
      if (user.status === 'BANNED') {
        return errorResponse(res, '账号已被封禁', 403, 'Account banned');
      }

      // 验证密码
      const isValid = await PasswordService.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return errorResponse(res, '密码错误', 401, 'Invalid password');
      }

      // 生成JWT token
      const token = JwtService.generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });

      // 返回用户信息（不包含密码）
      const { passwordHash, ...userWithoutPassword } = user;

      logger.info(`User logged in: ${user.email}`);

      return successResponse(res, {
        user: userWithoutPassword,
        token,
      }, '登录成功');
    } catch (error: any) {
      logger.error('Login error:', error);
      return errorResponse(res, error.message || '登录失败', 500, error.message);
    }
  }

  /**
   * 获取当前用户信息
   */
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      const user = await UserService.findUserById(userId);

      if (!user) {
        return errorResponse(res, '用户不存在', 404, 'User not found');
      }

      return successResponse(res, { user }, '获取用户信息成功');
    } catch (error: any) {
      logger.error('Get profile error:', error);
      return errorResponse(res, error.message || '获取用户信息失败', 500, error.message);
    }
  }

  /**
   * 更新用户信息
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { username, avatar } = req.body;

      const user = await UserService.updateUser(userId, {
        username,
        avatar,
      });

      return successResponse(res, { user }, '更新用户信息成功');
    } catch (error: any) {
      logger.error('Update profile error:', error);
      return errorResponse(res, error.message || '更新用户信息失败', 400, error.message);
    }
  }

  /**
   * 修改密码
   */
  static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return errorResponse(res, '请填写所有必填字段', 400, 'Missing required fields');
      }

      await UserService.changePassword(userId, oldPassword, newPassword);

      return successResponse(res, null, '密码修改成功');
    } catch (error: any) {
      logger.error('Change password error:', error);
      return errorResponse(res, error.message || '密码修改失败', 400, error.message);
    }
  }

  /**
   * 退出登录
   */
  static async logout(_req: Request, res: Response) {
    // JWT是无状态的，客户端删除token即可
    // 这里可以添加token黑名单逻辑（如果使用Redis）
    return successResponse(res, null, '退出登录成功');
  }
}