import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/response';

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 记录错误
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Prisma错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    
    // 唯一约束冲突
    if (prismaError.code === 'P2002') {
      return errorResponse(
        res,
        '数据已存在，请检查后重试',
        409,
        'Duplicate entry'
      );
    }
    
    // 记录不存在
    if (prismaError.code === 'P2025') {
      return errorResponse(
        res,
        '请求的资源不存在',
        404,
        'Record not found'
      );
    }
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, '无效的令牌', 401, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, '令牌已过期', 401, 'Token expired');
  }

  // 验证错误
  if (err.name === 'ValidationError') {
    return errorResponse(res, err.message, 400, 'Validation error');
  }

  // 默认错误响应
  const statusCode = (err as any).statusCode || 500;
  const message = config.nodeEnv === 'production' 
    ? '服务器内部错误' 
    : err.message;

  return errorResponse(
    res,
    message,
    statusCode,
    config.nodeEnv === 'development' ? err.stack : undefined
  );
}

/**
 * 404处理中间件
 */
export function notFoundHandler(req: Request, res: Response) {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  return errorResponse(
    res,
    `路由 ${req.method} ${req.url} 不存在`,
    404,
    'Route not found'
  );
}

/**
 * 异步错误包装器
 * 用于捕获异步路由中的错误
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}