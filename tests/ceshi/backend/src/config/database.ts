import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// 创建 Prisma 客户端实例
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// 连接数据库
export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
}

// 断开数据库连接
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting database:', error);
  }
}

// 优雅关闭
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

export default prisma;