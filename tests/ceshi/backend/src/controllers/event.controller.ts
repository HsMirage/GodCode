import { Request, Response } from 'express';
import { EventService } from '../services/event.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class EventController {
  /**
   * 创建事件
   */
  static async createEvent(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const {
        brandId,
        type,
        title,
        content,
        eventDate,
        eventLocation,
        affectedCountry,
        severity,
        sourceUrls,
        images,
        tags,
      } = req.body;

      // 验证必填字段
      if (!brandId || !type || !title || !content || !eventDate) {
        return errorResponse(res, '请填写所有必填字段', 400, 'Missing required fields');
      }

      // 验证事件类型
      if (!['BLACK', 'RED'].includes(type)) {
        return errorResponse(res, '无效的事件类型', 400, 'Invalid event type');
      }

      // 验证严重程度
      if (severity && (severity < 1 || severity > 5)) {
        return errorResponse(res, '严重程度必须在1-5之间', 400, 'Invalid severity');
      }

      const event = await EventService.createEvent({
        brandId,
        userId,
        type,
        title,
        content,
        eventDate: new Date(eventDate),
        eventLocation,
        affectedCountry,
        severity: severity || 1,
        sourceUrls,
        images,
        tags,
      });

      logger.info(`Event created by user ${userId}: ${event.id}`);

      return successResponse(res, { event }, '创建事件成功', 201);
    } catch (error: any) {
      logger.error('Create event error:', error);
      return errorResponse(res, error.message || '创建事件失败', 400, error.message);
    }
  }

  /**
   * 获取事件列表
   */
  static async getEvents(req: Request, res: Response) {
    try {
      const {
        type,
        status,
        page = 1,
        limit = 20,
        sort = 'latest',
        brandId,
        userId,
      } = req.query;

      const result = await EventService.getEvents({
        type: type as 'BLACK' | 'RED',
        status: status as string,
        page: Number(page),
        limit: Number(limit),
        sort: sort as 'latest' | 'hot' | 'severity',
        brandId: brandId as string,
        userId: userId as string,
      });

      return successResponse(res, result, '获取事件列表成功');
    } catch (error: any) {
      logger.error('Get events error:', error);
      return errorResponse(res, error.message || '获取事件列表失败', 500, error.message);
    }
  }

  /**
   * 获取事件详情
   */
  static async getEventById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const event = await EventService.getEventById(id);

      return successResponse(res, { event }, '获取事件详情成功');
    } catch (error: any) {
      logger.error('Get event error:', error);
      return errorResponse(res, error.message || '获取事件详情失败', 404, error.message);
    }
  }

  /**
   * 更新事件
   */
  static async updateEvent(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const {
        title,
        content,
        eventDate,
        eventLocation,
        affectedCountry,
        severity,
        sourceUrls,
      } = req.body;

      // 验证严重程度
      if (severity && (severity < 1 || severity > 5)) {
        return errorResponse(res, '严重程度必须在1-5之间', 400, 'Invalid severity');
      }

      const event = await EventService.updateEvent(id, {
        title,
        content,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        eventLocation,
        affectedCountry,
        severity,
        sourceUrls,
      });

      logger.info(`Event updated by user ${userId}: ${id}`);

      return successResponse(res, { event }, '更新事件成功');
    } catch (error: any) {
      logger.error('Update event error:', error);
      return errorResponse(res, error.message || '更新事件失败', 400, error.message);
    }
  }

  /**
   * 删除事件
   */
  static async deleteEvent(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // 检查事件是否属于当前用户或用户是管理员
      const prisma = (await import('../utils/prisma')).default;
      const event = await prisma.event.findUnique({
        where: { id },
      });

      if (!event) {
        return errorResponse(res, '事件不存在', 404, 'Event not found');
      }

      if (event.userId !== userId && req.user!.role !== 'ADMIN') {
        return errorResponse(res, '无权删除此事件', 403, 'No permission');
      }

      await EventService.deleteEvent(id);

      logger.info(`Event deleted by user ${userId}: ${id}`);

      return successResponse(res, null, '删除事件成功');
    } catch (error: any) {
      logger.error('Delete event error:', error);
      return errorResponse(res, error.message || '删除事件失败', 400, error.message);
    }
  }

  /**
   * 收藏/取消收藏事件
   */
  static async toggleFavorite(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const result = await EventService.toggleFavorite(id, userId);

      return successResponse(
        res,
        result,
        result.favorited ? '收藏成功' : '取消收藏成功'
      );
    } catch (error: any) {
      logger.error('Toggle favorite error:', error);
      return errorResponse(res, error.message || '操作失败', 400, error.message);
    }
  }

  /**
   * 获取用户收藏的事件
   */
  static async getUserFavorites(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await EventService.getUserFavorites(userId, {
        page: Number(page),
        limit: Number(limit),
      });

      return successResponse(res, result, '获取收藏列表成功');
    } catch (error: any) {
      logger.error('Get user favorites error:', error);
      return errorResponse(res, error.message || '获取收藏列表失败', 500, error.message);
    }
  }

  /**
   * 获取待审核事件列表（管理员）
   */
  static async getPendingEvents(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, type } = req.query;

      const result = await EventService.getPendingEvents({
        page: Number(page),
        limit: Number(limit),
        type: type as 'BLACK' | 'RED',
      });

      return successResponse(res, result, '获取待审核事件列表成功');
    } catch (error: any) {
      logger.error('Get pending events error:', error);
      return errorResponse(res, error.message || '获取待审核事件列表失败', 500, error.message);
    }
  }

  /**
   * 审核事件（管理员）
   */
  static async auditEvent(req: Request, res: Response) {
    try {
      const adminId = req.user!.id;
      const { id } = req.params;
      const { action, reason } = req.body;

      if (!action || !['APPROVE', 'REJECT'].includes(action)) {
        return errorResponse(res, '无效的审核操作', 400, 'Invalid audit action');
      }

      const event = await EventService.auditEvent(
        id,
        action,
        adminId,
        reason
      );

      logger.info(`Event ${action}ED by admin ${adminId}: ${id}`);

      return successResponse(res, { event }, `审核${action === 'APPROVE' ? '通过' : '拒绝'}成功`);
    } catch (error: any) {
      logger.error('Audit event error:', error);
      return errorResponse(res, error.message || '审核失败', 400, error.message);
    }
  }

  /**
   * 获取统计数据
   */
  static async getStats(_req: Request, res: Response) {
    try {
      const stats = await EventService.getStats();

      return successResponse(res, stats, '获取统计数据成功');
    } catch (error: any) {
      logger.error('Get stats error:', error);
      return errorResponse(res, error.message || '获取统计数据失败', 500, error.message);
    }
  }
}