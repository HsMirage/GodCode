import { Request, Response } from 'express';
import { SearchService } from '../services/search.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class SearchController {
  /**
   * 搜索事件
   */
  static async searchEvents(req: Request, res: Response) {
    try {
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
      } = req.query;

      const result = await SearchService.searchEvents({
        keyword: keyword as string,
        type: type as 'BLACK' | 'RED' | 'ALL',
        brands: brands ? (brands as string).split(',') : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        countries: countries ? (countries as string).split(',') : undefined,
        industries: industries ? (industries as string).split(',') : undefined,
        tags: tags ? (tags as string).split(',') : undefined,
        page: Number(page),
        limit: Number(limit),
        sort: sort as 'latest' | 'hot' | 'severity',
      });

      return successResponse(res, result, '搜索成功');
    } catch (error: any) {
      logger.error('Search events error:', error);
      return errorResponse(res, error.message || '搜索失败', 500, error.message);
    }
  }

  /**
   * 获取搜索建议
   */
  static async getSearchSuggestions(req: Request, res: Response) {
    try {
      const { q, limit = 10 } = req.query;

      if (!q) {
        return errorResponse(res, '搜索关键词不能为空', 400, 'Query is required');
      }

      const result = await SearchService.getSearchSuggestions(
        q as string,
        Number(limit)
      );

      return successResponse(res, result, '获取搜索建议成功');
    } catch (error: any) {
      logger.error('Get search suggestions error:', error);
      return errorResponse(res, error.message || '获取搜索建议失败', 500, error.message);
    }
  }

  /**
   * 获取热门搜索
   */
  static async getHotSearches(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const result = await SearchService.getHotSearches(Number(limit));

      return successResponse(res, result, '获取热门搜索成功');
    } catch (error: any) {
      logger.error('Get hot searches error:', error);
      return errorResponse(res, error.message || '获取热门搜索失败', 500, error.message);
    }
  }
}