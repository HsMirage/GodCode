import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * HTTP请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // 记录请求开始
  logger.http(`${req.method} ${req.url}`);

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    // 根据状态码选择日志级别
    const level = statusCode >= 500 ? 'error' :
                  statusCode >= 400 ? 'warn' : 'info';

    logger.log(level, `${req.method} ${req.url} ${statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.url,
      statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}

/**
 * 开发环境详细日志中间件
 */
export function devLogger(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Request details:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: req.body,
      params: req.params,
    });
  }
  next();
}