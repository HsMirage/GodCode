import express, { Application } from 'express';
import { config, validateConfig } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middlewares/error.middleware';
import { corsMiddleware } from './middlewares/cors.middleware';
import { loggerMiddleware } from './middlewares/logger.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';

// Import routes (to be created)
// import { authRoutes } from './routes/auth.routes';
// import { userRoutes } from './routes/user.routes';
// import { brandRoutes } from './routes/brand.routes';
// import { eventRoutes } from './routes/event.routes';

// 创建 Express 应用
const app: Application = express();

// 验证配置
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

// 基础中间件
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(loggerMiddleware);
app.use(rateLimiter);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// API 路由
app.use('/api', (req, res) => {
  res.json({
    message: 'Brand Blacklist API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      brands: '/api/brands',
      events: '/api/events',
      search: '/api/search'
    }
  });
});

// 路由挂载（待实现）
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/brands', brandRoutes);
// app.use('/api/events', eventRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND'
  });
});

// 错误处理中间件（必须在所有路由之后）
app.use(errorHandler);

// 启动服务器
async function startServer() {
  try {
    // 连接数据库
    await connectDatabase();

    // 启动 HTTP 服务器
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 Health check: http://localhost:${config.port}/health`);
      logger.info(`📚 API docs: http://localhost:${config.port}/api`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal: string) => {
      logger.info(`⚠️  ${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('📡 HTTP server closed');
        await disconnectDatabase();
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      });

      // 强制关闭超时
      setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 启动应用
startServer();

export default app;