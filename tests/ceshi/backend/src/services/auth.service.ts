import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * JWT服务
 */
export class JwtService {
  /**
   * 生成JWT令牌
   */
  static generateToken(payload: {
    id: string;
    email: string;
    username: string;
    role: string;
  }): string {
    const options: SignOptions = {
      expiresIn: config.jwt.expiresIn,
    };
    return jwt.sign(payload, config.jwt.secret, options);
  }

  /**
   * 验证JWT令牌
   */
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      logger.error('Token verification failed:', error);
      throw error;
    }
  }

  /**
   * 解码JWT令牌（不验证）
   */
  static decodeToken(token: string): any {
    return jwt.decode(token);
  }
}

/**
 * 密码服务
 */
export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  /**
   * 哈希密码
   */
  static async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.SALT_ROUNDS);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('密码加密失败');
    }
  }

  /**
   * 验证密码
   */
  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * 验证密码强度
   */
  static validatePasswordStrength(password: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('密码长度至少为8位');
    }

    if (!/[a-zA-Z]/.test(password)) {
      errors.push('密码必须包含字母');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('密码必须包含数字');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证用户名格式
 */
export function validateUsername(username: string): boolean {
  // 用户名：4-20位，只能包含字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;
  return usernameRegex.test(username);
}