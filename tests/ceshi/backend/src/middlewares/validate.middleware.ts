import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * 验证中间件工厂函数
 */
export function validate(schema: {
  body?: any;
  query?: any;
  params?: any;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // 验证请求体
      if (schema.body) {
        const { error, value } = schema.body.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
        });
        
        if (error) {
          const errors = error.details.map((detail: any) => detail.message);
          logger.warn('Validation error (body):', errors);
          return errorResponse(
            res,
            '请求参数验证失败',
            400,
            errors.join('; ')
          );
        }
        
        req.body = value;
      }

      // 验证查询参数
      if (schema.query) {
        const { error, value } = schema.query.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
        });
        
        if (error) {
          const errors = error.details.map((detail: any) => detail.message);
          logger.warn('Validation error (query):', errors);
          return errorResponse(
            res,
            '查询参数验证失败',
            400,
            errors.join('; ')
          );
        }
        
        req.query = value;
      }

      // 验证路径参数
      if (schema.params) {
        const { error, value } = schema.params.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
        });
        
        if (error) {
          const errors = error.details.map((detail: any) => detail.message);
          logger.warn('Validation error (params):', errors);
          return errorResponse(
            res,
            '路径参数验证失败',
            400,
            errors.join('; ')
          );
        }
        
        req.params = value;
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error:', error);
      return errorResponse(res, '验证过程中发生错误', 500);
    }
  };
}

/**
 * 简单的必填字段验证
 */
export function requireFields(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter(field => !req.body[field]);
    
    if (missing.length > 0) {
      return errorResponse(
        res,
        `缺少必填字段: ${missing.join(', ')}`,
        400,
        'Missing required fields'
      );
    }
    
    next();
  };
}