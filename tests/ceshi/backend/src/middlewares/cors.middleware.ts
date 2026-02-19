import cors from 'cors';
import { config } from '../config';

// CORS配置
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    // 允许的域名列表
    const allowedOrigins = [
      config.frontendUrl,
      'http://localhost:3000',
      'http://localhost:5173', // Vite默认端口
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ];

    // 开发环境允许所有来源
    if (config.nodeEnv === 'development') {
      callback(null, true);
      return;
    }

    // 生产环境检查来源
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的CORS来源'));
    }
  },
  credentials: true, // 允许携带凭证
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 预检请求缓存24小时
};

// 导出CORS中间件
export const corsMiddleware = cors(corsOptions);