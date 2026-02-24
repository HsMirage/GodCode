import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/response';

// 扩展Request类型以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        role: string;
      };
    }
  }
}

/**
 * JWT认证中间件
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // 从请求头获取token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, '未提供认证令牌', 401, 'No token provided');
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    // 验证token
    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: string;
      email: string;
      username: string;
      role: string;
    };

    // 将用户信息附加到请求对象
    req.user = decoded;
    
    logger.debug(`User authenticated: ${decoded.email}`);
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return errorResponse(res, '令牌已过期', 401, 'Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return errorResponse(res, '无效的令牌', 401, 'Invalid token');
    }
    
    logger.error('Authentication error:', error);
    return errorResponse(res, '认证失败', 401, 'Authentication failed');
  }
}

/**
 * 角色授权中间件
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, '未认证', 401, 'Not authenticated');
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.email} with role ${req.user.role}`);
      return errorResponse(res, '权限不足', 403, 'Insufficient permissions');
    }

    return next();
  };
}

/**
 * 可选认证中间件（不强制要求登录）
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwt.secret) as {
        id: string;
        email: string;
        username: string;
        role: string;
      };
      req.user = decoded;
    }
    
    return next();
  } catch (error) {
    // 忽略错误，继续处理请求
    return next();
  }
}