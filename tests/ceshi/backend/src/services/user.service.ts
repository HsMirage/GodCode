import prisma from '../utils/prisma';
import { PasswordService, validateEmail, validateUsername } from './auth.service';
import { logger } from '../utils/logger';

export class UserService {
  /**
   * 创建用户
   */
  static async createUser(data: {
    username: string;
    email: string;
    password: string;
  }) {
    // 验证邮箱格式
    if (!validateEmail(data.email)) {
      throw new Error('邮箱格式不正确');
    }

    // 验证用户名格式
    if (!validateUsername(data.username)) {
      throw new Error('用户名格式不正确（4-20位，只能包含字母、数字、下划线）');
    }

    // 验证密码强度
    const passwordValidation = PasswordService.validatePasswordStrength(data.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // 检查邮箱是否已存在
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingEmail) {
      throw new Error('该邮箱已被注册');
    }

    // 检查用户名是否已存在
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUsername) {
      throw new Error('该用户名已被使用');
    }

    // 加密密码
    const passwordHash = await PasswordService.hashPassword(data.password);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    logger.info(`User created: ${user.id}`);
    return user;
  }

  /**
   * 根据邮箱查找用户
   */
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * 根据用户名查找用户
   */
  static async findUserByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  /**
   * 根据ID查找用户
   */
  static async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 更新用户信息
   */
  static async updateUser(id: string, data: {
    username?: string;
    avatar?: string;
    email?: string;
    role?: string;
    status?: string;
  }) {
    // 如果更新用户名，检查是否重复
    if (data.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: id },
        },
      });

      if (existingUser) {
        throw new Error('该用户名已被使用');
      }
    }

    // 如果更新邮箱，检查是否重复
    if (data.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });

      if (existingEmail) {
        throw new Error('该邮箱已被使用');
      }
    }

    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 更新用户资料（用户自己更新）
   */
  static async updateUserProfile(id: string, data: {
    username?: string;
    email?: string;
    avatar?: string;
  }) {
    // 如果更新用户名，检查是否重复
    if (data.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: id },
        },
      });

      if (existingUser) {
        throw new Error('该用户名已被使用');
      }
    }

    // 如果更新邮箱，检查是否重复
    if (data.email) {
      if (!validateEmail(data.email)) {
        throw new Error('邮箱格式不正确');
      }

      const existingEmail = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });

      if (existingEmail) {
        throw new Error('该邮箱已被使用');
      }
    }

    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 修改密码
   */
  static async changePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isValid = await PasswordService.verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('原密码不正确');
    }

    // 验证新密码强度
    const passwordValidation = PasswordService.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // 加密新密码
    const passwordHash = await PasswordService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    logger.info(`Password changed for user: ${id}`);

    // 返回更新后的用户信息
    return this.findUserById(id);
  }

  /**
   * 获取用户列表（管理员）
   */
  static async getUserList(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const { page = 1, limit = 20, search, role, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { username: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              events: true,
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取用户的事件列表
   */
  static async getUserEvents(userId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const { page = 1, limit = 20, status } = params;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          brand: true,
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          eventTags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.event.count({ where }),
    ]);

    return {
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 更新用户角色（管理员）
   */
  static async updateUserRole(id: string, role: string) {
    return prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });
  }

  /**
   * 封禁/解封用户（管理员）
   */
  static async updateUserStatus(id: string, status: string) {
    return prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });
  }
}