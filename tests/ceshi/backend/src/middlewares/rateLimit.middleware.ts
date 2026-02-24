import rateLimit from 'express-rate-limit';

/**
 * 通用API限流
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 最多100个请求
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试',
    error: 'Too many requests',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 严格限流（用于敏感操作）
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5个请求
  message: {
    success: false,
    message: '操作过于频繁，请稍后再试',
    error: 'Too many requests',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 登录限流
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 10, // 最多10次登录尝试
  skipSuccessfulRequests: true, // 成功的请求不计入限制
  message: {
    success: false,
    message: '登录尝试过多，请15分钟后再试',
    error: 'Too many login attempts',
  },
  standardHeaders: true,
  legacyHeaders: false,
});