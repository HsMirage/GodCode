import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { BrandService } from './brand.service';

export class EventService {
  /**
   * 创建事件
   */
  static async createEvent(data: {
    brandId: string;
    userId: string;
    type: 'BLACK' | 'RED';
    title: string;
    content: string;
    eventDate: Date;
    eventLocation?: string;
    affectedCountry?: string;
    severity: number;
    sourceUrls?: string[];
    images?: { url: string; sortOrder: number }[];
    tags?: string[];
  }) {
    // 验证品牌存在
    await BrandService.getBrandById(data.brandId);

    // 创建事件
    const event = await prisma.event.create({
      data: {
        brandId: data.brandId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        content: data.content,
        eventDate: data.eventDate,
        eventLocation: data.eventLocation,
        affectedCountry: data.affectedCountry,
        severity: data.severity,
        sourceUrls: data.sourceUrls ? JSON.stringify(data.sourceUrls) : null,
        status: 'PENDING',
        images: data.images
          ? {
              create: data.images,
            }
          : undefined,
        eventTags: data.tags
          ? {
              create: data.tags.map((tagId) => ({
                tagId,
              })),
            }
          : undefined,
      },
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
    });

    logger.info(`Event created: ${event.id}`);
    return event;
  }

  /**
   * 获取事件详情
   */
  static async getEventById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
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
        comments: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) {
      throw new Error('事件不存在');
    }

    // 增加浏览量
    await prisma.event.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return event;
  }

  /**
   * 获取事件列表
   */
  static async getEvents(params: {
    type?: 'BLACK' | 'RED';
    status?: string;
    page?: number;
    limit?: number;
    sort?: 'latest' | 'hot' | 'severity';
    brandId?: string;
    userId?: string;
  }) {
    const {
      type,
      status = 'APPROVED',
      page = 1,
      limit = 20,
      sort = 'latest',
      brandId,
      userId,
    } = params;
    const skip = (page - 1) * limit;

    const where: any = { status };

    if (type) {
      where.type = type;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (userId) {
      where.userId = userId;
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
   * 更新事件
   */
  static async updateEvent(
    id: string,
    data: {
      title?: string;
      content?: string;
      eventDate?: Date;
      eventLocation?: string;
      affectedCountry?: string;
      severity?: number;
      sourceUrls?: string[];
    }
  ) {
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      throw new Error('事件不存在');
    }

    // 只有PENDING状态的事件可以编辑
    if (event.status !== 'PENDING') {
      throw new Error('只有待审核的事件可以编辑');
    }

    return prisma.event.update({
      where: { id },
      data: {
        ...data,
        sourceUrls: data.sourceUrls
          ? JSON.stringify(data.sourceUrls)
          : undefined,
      },
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
    });
  }

  /**
   * 删除事件
   */
  static async deleteEvent(id: string) {
    return prisma.event.delete({
      where: { id },
    });
  }

  /**
   * 审核事件
   */
  static async auditEvent(
    id: string,
    action: 'APPROVE' | 'REJECT',
    adminId: string,
    reason?: string
  ) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: { brand: true },
    });

    if (!event) {
      throw new Error('事件不存在');
    }

    if (event.status !== 'PENDING') {
      throw new Error('该事件已审核');
    }

    // 更新事件状态
    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        rejectReason: reason,
      },
    });

    // 创建审核日志
    await prisma.auditLog.create({
      data: {
        eventId: id,
        adminId,
        action,
        reason,
      },
    });

    // 如果审核通过，更新品牌计数
    if (action === 'APPROVE') {
      await BrandService.updateBrandCounts(event.brandId);
    }

    logger.info(`Event ${action}ED: ${id}`);
    return updatedEvent;
  }

  /**
   * 获取待审核事件列表
   */
  static async getPendingEvents(params: {
    page?: number;
    limit?: number;
    type?: 'BLACK' | 'RED';
  }) {
    const { page = 1, limit = 20, type } = params;
    const skip = (page - 1) * limit;

    const where: any = { status: 'PENDING' };

    if (type) {
      where.type = type;
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
        },
        orderBy: { createdAt: 'desc' },
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
   * 收藏/取消收藏事件
   */
  static async toggleFavorite(eventId: string, userId: string) {
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
    });

    if (existing) {
      // 取消收藏
      await prisma.favorite.delete({
        where: { id: existing.id },
      });
      return { favorited: false };
    } else {
      // 添加收藏
      await prisma.favorite.create({
        data: {
          userId,
          eventId,
        },
      });
      return { favorited: true };
    }
  }

  /**
   * 获取用户收藏的事件
   */
  static async getUserFavorites(userId: string, params: {
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId },
        skip,
        take: limit,
        include: {
          event: {
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      events: favorites.map((f: any) => f.event),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取统计数据
   */
  static async getStats() {
    const [totalBrands, totalBlackEvents, totalRedEvents, pendingEvents] =
      await Promise.all([
        prisma.brand.count(),
        prisma.event.count({
          where: { type: 'BLACK', status: 'APPROVED' },
        }),
        prisma.event.count({
          where: { type: 'RED', status: 'APPROVED' },
        }),
        prisma.event.count({
          where: { status: 'PENDING' },
        }),
      ]);

    return {
      totalBrands,
      totalBlackEvents,
      totalRedEvents,
      pendingEvents,
    };
  }
}