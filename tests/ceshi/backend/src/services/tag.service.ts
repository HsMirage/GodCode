import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

export class TagService {
  /**
   * 创建标签
   */
  static async createTag(data: {
    name: string;
    type: 'BLACK' | 'RED' | 'BOTH';
  }) {
    // 检查标签名是否已存在
    const existingTag = await prisma.tag.findUnique({
      where: { name: data.name },
    });

    if (existingTag) {
      throw new Error('该标签已存在');
    }

    const tag = await prisma.tag.create({
      data,
    });

    logger.info(`Tag created: ${tag.id}`);
    return tag;
  }

  /**
   * 获取所有标签
   */
  static async getTags(params: {
    type?: 'BLACK' | 'RED' | 'BOTH';
    search?: string;
    limit?: number;
  } = {}) {
    const { type, search, limit } = params;

    const where: any = {};

    if (type) {
      where.type = type;
    } else if (type !== 'BOTH') {
      // 如果没有指定类型，返回所有标签
      where.OR = [
        { type: 'BLACK' },
        { type: 'RED' },
        { type: 'BOTH' },
      ];
    }

    if (search) {
      where.name = { contains: search };
    }

    const tags = await prisma.tag.findMany({
      where,
      take: limit || undefined,
      orderBy: { usageCount: 'desc' },
    });

    return tags;
  }

  /**
   * 根据ID获取标签
   */
  static async getTagById(id: string) {
    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        eventTags: {
          include: {
            event: {
              include: {
                brand: true,
              },
            },
          },
          take: 10,
        },
      },
    });

    if (!tag) {
      throw new Error('标签不存在');
    }

    return tag;
  }

  /**
   * 更新标签
   */
  static async updateTag(id: string, data: {
    name?: string;
    type?: 'BLACK' | 'RED' | 'BOTH';
  }) {
    // 如果更新名称，检查是否重复
    if (data.name) {
      const existingTag = await prisma.tag.findFirst({
        where: {
          name: data.name,
          id: { not: id },
        },
      });

      if (existingTag) {
        throw new Error('该标签名已被使用');
      }
    }

    return prisma.tag.update({
      where: { id },
      data,
    });
  }

  /**
   * 删除标签
   */
  static async deleteTag(id: string) {
    return prisma.tag.delete({
      where: { id },
    });
  }

  /**
   * 增加标签使用次数
   */
  static async incrementUsage(tagId: string) {
    await prisma.tag.update({
      where: { id: tagId },
      data: { usageCount: { increment: 1 } },
    });
  }

  /**
   * 减少标签使用次数
   */
  static async decrementUsage(tagId: string) {
    await prisma.tag.update({
      where: { id: tagId },
      data: { usageCount: { decrement: 1 } },
    });
  }

  /**
   * 获取热门标签
   */
  static async getHotTags(limit = 10, type?: 'BLACK' | 'RED' | 'BOTH') {
    const where: any = {};

    if (type) {
      where.type = type;
    }

    return prisma.tag.findMany({
      where,
      take: limit,
      orderBy: { usageCount: 'desc' },
    });
  }

  /**
   * 批量创建标签（如果不存在）
   */
  static async getOrCreateTags(tagNames: string[], type: 'BLACK' | 'RED' | 'BOTH' = 'BOTH') {
    const tags = [];

    for (const name of tagNames) {
      let tag = await prisma.tag.findUnique({
        where: { name },
      });

      if (!tag) {
        tag = await this.createTag({ name, type });
      }

      tags.push(tag);
    }

    return tags;
  }

  /**
   * 搜索标签
   */
  static async searchTags(query: string, limit = 10) {
    return prisma.tag.findMany({
      where: {
        name: { contains: query },
      },
      take: limit,
      orderBy: { usageCount: 'desc' },
    });
  }
}