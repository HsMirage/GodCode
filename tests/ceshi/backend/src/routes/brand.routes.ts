import { Router } from 'express';
import { BrandController } from '../controllers/brand.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { requireFields } from '../middlewares/validate.middleware';

const router = Router();

/**
 * @route   POST /api/brands
 * @desc    创建品牌
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  requireFields('name'),
  BrandController.createBrand
);

/**
 * @route   GET /api/brands
 * @desc    获取品牌列表
 * @access  Public
 */
router.get('/', BrandController.getBrands);

/**
 * @route   GET /api/brands/hot
 * @desc    获取热门品牌
 * @access  Public
 */
router.get('/hot', BrandController.getHotBrands);

/**
 * @route   GET /api/brands/search
 * @desc    搜索品牌
 * @access  Public
 */
router.get('/search', BrandController.searchBrands);

/**
 * @route   GET /api/brands/:id
 * @desc    获取品牌详情
 * @access  Public
 */
router.get('/:id', BrandController.getBrandById);

/**
 * @route   GET /api/brands/:id/events
 * @desc    获取品牌的事件列表
 * @access  Public
 */
router.get('/:id/events', BrandController.getBrandEvents);

/**
 * @route   PUT /api/brands/:id
 * @desc    更新品牌信息（管理员）
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  BrandController.updateBrand
);

/**
 * @route   DELETE /api/brands/:id
 * @desc    删除品牌（管理员）
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  BrandController.deleteBrand
);

/**
 * @route   POST /api/brands/merge
 * @desc    合并品牌（管理员）
 * @access  Private (Admin)
 */
router.post(
  '/merge',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireFields('sourceId', 'targetId'),
  BrandController.mergeBrands
);

export default router;