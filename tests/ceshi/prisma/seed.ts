import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 创建默认行业分类
  const industries = [
    { name: '科技', icon: 'tech', sortOrder: 1 },
    { name: '食品', icon: 'food', sortOrder: 2 },
    { name: '服装', icon: 'fashion', sortOrder: 3 },
    { name: '汽车', icon: 'auto', sortOrder: 4 },
    { name: '化妆品', icon: 'cosmetics', sortOrder: 5 },
    { name: '奢侈品', icon: 'luxury', sortOrder: 6 },
    { name: '金融', icon: 'finance', sortOrder: 7 },
    { name: '教育', icon: 'education', sortOrder: 8 },
    { name: '医疗', icon: 'medical', sortOrder: 9 },
    { name: '娱乐', icon: 'entertainment', sortOrder: 10 },
  ];

  for (const industry of industries) {
    await prisma.industry.upsert({
      where: { name: industry.name },
      update: {},
      create: industry,
    });
  }

  // 创建默认标签
  const tags = [
    // 黑榜标签
    { name: '辱华', type: 'BLACK' },
    { name: '双标', type: 'BLACK' },
    { name: '虚假宣传', type: 'BLACK' },
    { name: '质量问题', type: 'BLACK' },
    { name: '价格欺诈', type: 'BLACK' },
    { name: '服务差', type: 'BLACK' },
    { name: '歧视', type: 'BLACK' },
    { name: '环保问题', type: 'BLACK' },
    
    // 红榜标签
    { name: '爱国', type: 'RED' },
    { name: '慈善', type: 'RED' },
    { name: '环保', type: 'RED' },
    { name: '质量优秀', type: 'RED' },
    { name: '服务优质', type: 'RED' },
    { name: '创新', type: 'RED' },
    { name: '社会责任', type: 'RED' },
    { name: '诚信经营', type: 'RED' },
    
    // 通用标签
    { name: '热门', type: 'BOTH' },
    { name: '争议', type: 'BOTH' },
    { name: '国际', type: 'BOTH' },
    { name: '本土', type: 'BOTH' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }

  // 创建超级管理员
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@brand-blacklist.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@brand-blacklist.com',
      passwordHash: '$2b$10$example_hash_replace_in_production', // 在生产环境中替换为实际的哈希
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  // 创建示例品牌
  const brands = [
    {
      name: '华为',
      englishName: 'Huawei',
      country: '中国',
      industry: '科技',
      description: '全球领先的ICT（信息与通信）基础设施和智能终端提供商',
    },
    {
      name: '苹果',
      englishName: 'Apple',
      country: '美国',
      industry: '科技',
      description: '美国跨国科技公司，消费电子、软件和在线服务提供商',
    },
    {
      name: '茅台',
      englishName: 'Moutai',
      country: '中国',
      industry: '食品',
      description: '中国著名白酒品牌，国酒代表',
    },
    {
      name: '耐克',
      englishName: 'Nike',
      country: '美国',
      industry: '服装',
      description: '全球领先的运动鞋、服装和配饰设计、营销和分销公司',
    },
  ];

  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { name: brand.name },
      update: {},
      create: brand,
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log('📊 Created industries:', industries.length);
  console.log('🏷️  Created tags:', tags.length);
  console.log('👤 Created admin user:', adminUser.email);
  console.log('🏢 Created brands:', brands.length);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });