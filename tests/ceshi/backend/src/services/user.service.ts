import prisma from '../config/database';
import { JwtService, PasswordService, validateEmail, validateUsername } from './auth.service';
import { logger } from '../utils/logger';

/**
 * 用户注册
 */
export async function register(data: {
  username: string;
  email: string;
  password: string;
}) {
  const { username, email, password } = data;

  // 验证邮箱格式
  if (!validateEmail(email)) {
    throw new Error('邮箱格式不正确');
  }

  // 验证用户名格式
  if (!validateUsername(username)) {
    throw new Error('用户名格式不正确（4-20位，只能包含字母、数字、下划线）');
  }

  // 验证密码强度
  const passwordValidation = PasswordService.validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.errors.join('; '));
  }

  // 检查邮箱是否已存在
  const existingEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingEmail) {
    throw new Error('该邮箱已被注册');
  }

  // 检查用户名是否已存在
  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUsername) {
    throw new Error('该用户名已被使用');
  }

  // 哈希密码
  const passwordHash = await PasswordService.hashPassword(password);

  // 创建用户
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: 'USER',
      status: 'ACTIVE',
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      avatar: true,
      createdAt: true,
    },
  });

  logger.info(`New user registered: ${email}`);

  return user;
}

/**
 * 用户登录
 */
export async function login(credentials: {
  identifier: string; // 邮箱或用户名
  password: string;
}) {
  const { identifier, password } = credentials;

  // 查找用户（支持邮箱或用户名登录）
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier },
      ],
    },
  });

  if (!user) {
    throw new Error('用户不存在');
  }

  // 检查用户状态
  if (user.status === 'BANNED') {
    throw new Error('账号已被封禁');
  }

  // 验证密码
  const isPasswordValid = await PasswordService.verifyPassword(
    password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new Error('密码错误');
  }

  // 生成JWT令牌
  const token = JwtService.generateToken({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });

  logger.info(`User logged in: ${user.email}`);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
  };
}

/**
 * 获取用户信息
 */
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  if (!user) {
    throw new Error('用户不存在');
  }

  return user;
}

/**
 * 更新用户信息
 */
export async function updateUserProfile(
  userId: string,
  data: {
    username?: string;
    avatar?: string;
  }
) {
  const updateData: any = {};

  if (data.username) {
    if (!validateUsername(data.username)) {
      throw new Error('用户名格式不正确');
    }

    // 检查用户名是否已被其他用户使用
    const existingUser = await prisma.user.findFirst({
      where: {
        username: data.username,
        id: { not: userId },
      },
    });

    if (existingUser) {
      throw new Error('该用户名已被使用');
    }

    updateData.username = data.username;
  }

  if (data.avatar) {
    updateData.avatar = data.avatar;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  logger.info(`User profile updated: ${user.email}`);

  return user;
}

/**
 * 修改密码
 */
export async function changePassword(
  userId: string,
  data: {
    oldPassword: string;
    newPassword: string;
  }
) {
  const { oldPassword, newPassword } = data;

  // 获取用户
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('用户不存在');
  }

  // 验证旧密码
  const isOldPasswordValid = await PasswordService.verifyPassword(
    oldPassword,
    user.passwordHash
  );

  if (!isOldPasswordValid) {
    throw new Error('原密码错误');
  }

  // 验证新密码强度
  const passwordValidation = PasswordService.validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.errors.join('; '));
  }

  // 哈希新密码
  const newPasswordHash = await PasswordService.hashPassword(newPassword);

  // 更新密码
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  });

  logger.info(`Password changed for user: ${user.email}`);

  return { success: true };
}