import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;

// 优雅关闭
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});