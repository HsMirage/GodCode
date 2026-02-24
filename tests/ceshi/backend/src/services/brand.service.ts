import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

export class BrandService {
  /**
   * 创建品牌
   */
  static async createBrand(data: {
    name: string;
    englishName?: string;
    logo?: string;
    country?: string;
    industry?: string;
    description?: string;
  }) {
    // 检查品牌名是否已存在
    const existingBrand = await prisma.brand.findFirst({
      where: {
        OR: [
          { name: data.name },
          ...(data.englishName ? [{ englishName: data.englishName }] : []),
        ],
      },
    });

    if (existingBrand) {
      throw new Error('该品牌已存在');
    }

    const brand = await prisma.brand.create({
      data,
    });

    logger.info(`Brand created: ${brand.id}`);
    return brand;
  }

  /**
   * 根据ID获取品牌详情
   */
  static async getBrandById(id: string) {
    const brand = await prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      throw new Error('品牌不存在');
    }

    return brand;
  }

  /**
   * 获取品牌列表
   */
  static async getBrands(params: {
    page?: number;
    limit?: number;
    search?: string;
    industry?: string;
    country?: string;
  }) {
    const { page = 1, limit = 20, search, industry, country } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { englishName: { contains: search } },
      ];
    }

    if (industry) {
      where.industry = industry;
    }

    if (country) {
      where.country = country;
    }

    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.brand.count({ where }),
    ]);

    return {
      brands,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取热门品牌
   */
  static async getHotBrands(limit = 10) {
    return prisma.brand.findMany({
      take: limit,
      orderBy: [
        { blackCount: 'desc' },
        { redCount: 'desc' },
      ],
    });
  }

  /**
   * 获取品牌的事件列表
   */
  static async getBrandEvents(brandId: string, params: {
    type?: 'black' | 'red';
    page?: number;
    limit?: number;
  }) {
    const { type, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      brandId,
      status: 'APPROVED',
    };

    if (type) {
      where.type = type.toUpperCase();
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          brand: true,
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          eventTags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: { eventDate: 'desc' },
      }),
      prisma.event.count({ where }),
    ]);

    return {
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 更新品牌信息
   */
  static async updateBrand(id: string, data: {
    name?: string;
    englishName?: string;
    logo?: string;
    country?: string;
    industry?: string;
    description?: string;
  }) {
    return prisma.brand.update({
      where: { id },
      data,
    });
  }

  /**
   * 删除品牌
   */
  static async deleteBrand(id: string) {
    return prisma.brand.delete({
      where: { id },
    });
  }

  /**
   * 合并品牌
   */
  static async mergeBrands(sourceId: string, targetId: string) {
    // 将源品牌的所有事件转移到目标品牌
    await prisma.event.updateMany({
      where: { brandId: sourceId },
      data: { brandId: targetId },
    });

    // 删除源品牌
    await prisma.brand.delete({
      where: { id: sourceId },
    });

    logger.info(`Brand merged: ${sourceId} -> ${targetId}`);
  }

  /**
   * 更新品牌计数
   */
  static async updateBrandCounts(brandId: string) {
    const [blackCount, redCount] = await Promise.all([
      prisma.event.count({
        where: {
          brandId,
          type: 'BLACK',
          status: 'APPROVED',
        },
      }),
      prisma.event.count({
        where: {
          brandId,
          type: 'RED',
          status: 'APPROVED',
        },
      }),
    ]);

    await prisma.brand.update({
      where: { id: brandId },
      data: { blackCount, redCount },
    });
  }

  /**
   * 搜索品牌
   */
  static async searchBrands(query: string, limit = 10) {
    return prisma.brand.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { englishName: { contains: query } },
        ],
      },
      take: limit,
    });
  }
}