import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { requireFields } from '../middlewares/validate.middleware';

const router = Router();

/**
 * @route   POST /api/events
 * @desc    创建事件
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  requireFields('brandId', 'type', 'title', 'content', 'eventDate'),
  EventController.createEvent
);

/**
 * @route   GET /api/events
 * @desc    获取事件列表
 * @access  Public
 */
router.get('/', EventController.getEvents);

/**
 * @route   GET /api/events/stats
 * @desc    获取统计数据
 * @access  Public
 */
router.get('/stats', EventController.getStats);

/**
 * @route   GET /api/events/pending
 * @desc    获取待审核事件列表（管理员）
 * @access  Private (Admin)
 */
router.get(
  '/pending',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  EventController.getPendingEvents
);

/**
 * @route   GET /api/events/favorites
 * @desc    获取用户收藏的事件
 * @access  Private
 */
router.get(
  '/favorites',
  authenticate,
  EventController.getUserFavorites
);

/**
 * @route   GET /api/events/:id
 * @desc    获取事件详情
 * @access  Public
 */
router.get('/:id', EventController.getEventById);

/**
 * @route   PUT /api/events/:id
 * @desc    更新事件
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  EventController.updateEvent
);

/**
 * @route   DELETE /api/events/:id
 * @desc    删除事件
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  EventController.deleteEvent
);

/**
 * @route   POST /api/events/:id/favorite
 * @desc    收藏/取消收藏事件
 * @access  Private
 */
router.post(
  '/:id/favorite',
  authenticate,
  EventController.toggleFavorite
);

/**
 * @route   PUT /api/events/:id/audit
 * @desc    审核事件（管理员）
 * @access  Private (Admin)
 */
router.put(
  '/:id/audit',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  EventController.auditEvent
);

export default router;