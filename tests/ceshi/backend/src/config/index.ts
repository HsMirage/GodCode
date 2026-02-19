import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // 数据库配置
  databaseUrl: process.env.DATABASE_URL || '',

  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Redis配置
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // 上传配置
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB
  },

  // 前端URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // 邮件配置
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.FROM_EMAIL || '',
  },
};

// 验证必要的环境变量
export function validateConfig() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}