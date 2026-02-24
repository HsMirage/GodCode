import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';

const router = Router();

/**
 * @route   GET /api/search
 * @desc    搜索事件和品牌
 * @access  Public
 */
router.get('/', SearchController.searchEvents);

/**
 * @route   GET /api/search/suggestions
 * @desc    获取搜索建议
 * @access  Public
 */
router.get('/suggestions', SearchController.getSearchSuggestions);

/**
 * @route   GET /api/search/hot
 * @desc    获取热门搜索词
 * @access  Public
 */
router.get('/hot', SearchController.getHotSearches);

export default router;