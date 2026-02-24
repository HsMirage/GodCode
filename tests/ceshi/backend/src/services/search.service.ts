import prisma from '../utils/prisma';

export class SearchService {
  /**
   * 搜索事件
   */
  static async searchEvents(params: {
    keyword?: string;
    type?: 'BLACK' | 'RED' | 'ALL';
    brands?: string[];
    startDate?: Date;
    endDate?: Date;
    countries?: string[];
    industries?: string[];
    tags?: string[];
    page?: number;
    limit?: number;
    sort?: 'latest' | 'hot' | 'severity';
  }) {
    const {
      keyword,
      type,
      brands,
      startDate,
      endDate,
      countries,
      industries,
      tags,
      page = 1,
      limit = 20,
      sort = 'latest',
    } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      status: 'APPROVED',
    };

    // 关键词搜索
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
        { brand: { name: { contains: keyword } } },
      ];
    }

    // 类型筛选
    if (type && type !== 'ALL') {
      where.type = type;
    }

    // 品牌筛选
    if (brands && brands.length > 0) {
      where.brandId = { in: brands };
    }

    // 时间范围筛选
    if (startDate || endDate) {
      where.eventDate = {};
      if (startDate) {
        where.eventDate.gte = startDate;
      }
      if (endDate) {
        where.eventDate.lte = endDate;
      }
    }

    // 国家筛选
    if (countries && countries.length > 0) {
      where.affectedCountry = { in: countries };
    }

    // 行业筛选
    if (industries && industries.length > 0) {
      where.brand = {
        industry: { in: industries },
      };
    }

    // 标签筛选
    if (tags && tags.length > 0) {
      where.eventTags = {
        some: {
          tagId: { in: tags },
        },
      };
    }

    // 排序逻辑
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'hot') {
      orderBy = { viewCount: 'desc' };
    } else if (sort === 'severity') {
      orderBy = { severity: 'desc' };
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
        orderBy,
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
   * 搜索建议
   */
  static async getSearchSuggestions(query: string, limit = 10) {
    if (!query || query.length < 2) {
      return { brands: [], tags: [] };
    }

    const [brands, tags] = await Promise.all([
      prisma.brand.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { englishName: { contains: query } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          englishName: true,
          logo: true,
        },
      }),
      prisma.tag.findMany({
        where: {
          name: { contains: query },
        },
        take: limit,
        orderBy: { usageCount: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
        },
      }),
    ]);

    return { brands, tags };
  }

  /**
   * 获取热门搜索
   */
  static async getHotSearches(limit = 10) {
    // 获取浏览量最高的标签
    const tags = await prisma.tag.findMany({
      take: limit,
      orderBy: { usageCount: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        usageCount: true,
      },
    });

    // 获取事件最多的品牌
    const brands = await prisma.brand.findMany({
      take: limit,
      orderBy: [
        { blackCount: 'desc' },
        { redCount: 'desc' },
      ],
      select: {
        id: true,
        name: true,
        englishName: true,
        logo: true,
        blackCount: true,
        redCount: true,
      },
    });

    return { tags, brands };
  }
}