import { Request, Response } from 'express';
import { BrandService } from '../services/brand.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class BrandController {
  /**
   * 创建品牌
   */
  static async createBrand(req: Request, res: Response) {
    try {
      const { name, englishName, logo, country, industry, description } = req.body;

      if (!name) {
        return errorResponse(res, '品牌名称不能为空', 400, 'Brand name is required');
      }

      const brand = await BrandService.createBrand({
        name,
        englishName,
        logo,
        country,
        industry,
        description,
      });

      return successResponse(res, { brand }, '创建品牌成功', 201);
    } catch (error: any) {
      logger.error('Create brand error:', error);
      return errorResponse(res, error.message || '创建品牌失败', 400, error.message);
    }
  }

  /**
   * 获取品牌列表
   */
  static async getBrands(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        industry,
        country,
      } = req.query;

      const result = await BrandService.getBrands({
        page: Number(page),
        limit: Number(limit),
        search: search as string,
        industry: industry as string,
        country: country as string,
      });

      return successResponse(res, result, '获取品牌列表成功');
    } catch (error: any) {
      logger.error('Get brands error:', error);
      return errorResponse(res, error.message || '获取品牌列表失败', 500, error.message);
    }
  }

  /**
   * 获取品牌详情
   */
  static async getBrandById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const brand = await BrandService.getBrandById(id);

      return successResponse(res, { brand }, '获取品牌详情成功');
    } catch (error: any) {
      logger.error('Get brand error:', error);
      return errorResponse(res, error.message || '获取品牌详情失败', 404, error.message);
    }
  }

  /**
   * 获取品牌的事件列表
   */
  static async getBrandEvents(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, page = 1, limit = 20 } = req.query;

      const result = await BrandService.getBrandEvents(id, {
        type: type as 'black' | 'red',
        page: Number(page),
        limit: Number(limit),
      });

      return successResponse(res, result, '获取品牌事件列表成功');
    } catch (error: any) {
      logger.error('Get brand events error:', error);
      return errorResponse(res, error.message || '获取品牌事件列表失败', 500, error.message);
    }
  }

  /**
   * 获取热门品牌
   */
  static async getHotBrands(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const brands = await BrandService.getHotBrands(Number(limit));

      return successResponse(res, { brands }, '获取热门品牌成功');
    } catch (error: any) {
      logger.error('Get hot brands error:', error);
      return errorResponse(res, error.message || '获取热门品牌失败', 500, error.message);
    }
  }

  /**
   * 搜索品牌
   */
  static async searchBrands(req: Request, res: Response) {
    try {
      const { q, limit = 10 } = req.query;

      if (!q) {
        return errorResponse(res, '搜索关键词不能为空', 400, 'Search query is required');
      }

      const brands = await BrandService.searchBrands(q as string, Number(limit));

      return successResponse(res, { brands }, '搜索品牌成功');
    } catch (error: any) {
      logger.error('Search brands error:', error);
      return errorResponse(res, error.message || '搜索品牌失败', 500, error.message);
    }
  }

  /**
   * 更新品牌信息（管理员）
   */
  static async updateBrand(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, englishName, logo, country, industry, description } = req.body;

      const brand = await BrandService.updateBrand(id, {
        name,
        englishName,
        logo,
        country,
        industry,
        description,
      });

      return successResponse(res, { brand }, '更新品牌信息成功');
    } catch (error: any) {
      logger.error('Update brand error:', error);
      return errorResponse(res, error.message || '更新品牌信息失败', 400, error.message);
    }
  }

  /**
   * 删除品牌（管理员）
   */
  static async deleteBrand(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await BrandService.deleteBrand(id);

      logger.info(`Brand deleted: ${id}`);

      return successResponse(res, null, '删除品牌成功');
    } catch (error: any) {
      logger.error('Delete brand error:', error);
      return errorResponse(res, error.message || '删除品牌失败', 400, error.message);
    }
  }

  /**
   * 合并品牌（管理员）
   */
  static async mergeBrands(req: Request, res: Response) {
    try {
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId) {
        return errorResponse(res, '请提供源品牌ID和目标品牌ID', 400, 'Source and target IDs are required');
      }

      if (sourceId === targetId) {
        return errorResponse(res, '源品牌和目标品牌不能相同', 400, 'Source and target cannot be the same');
      }

      await BrandService.mergeBrands(sourceId, targetId);

      return successResponse(res, null, '合并品牌成功');
    } catch (error: any) {
      logger.error('Merge brands error:', error);
      return errorResponse(res, error.message || '合并品牌失败', 400, error.message);
    }
  }
}