import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Clock, TrendingUp } from 'lucide-react';
import { api } from '../../services/api';
import type { Event } from '../../types';
import EventCard from '../../components/EventCard/EventCard';

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hotSearches, setHotSearches] = useState<string[]>([]);

  const [filters, setFilters] = useState({
    type: 'all' as 'all' | 'black' | 'red',
    industry: '',
    country: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (query) {
      performSearch();
    }
    loadHotSearches();
  }, []);

  useEffect(() => {
    if (query) {
      performSearch();
    }
  }, [filters]);

  const performSearch = async () => {
    setIsLoading(true);
    try {
      const response = await api.search({
        keyword: query,
        type: filters.type,
        industries: filters.industry ? [filters.industry] : undefined,
        countries: filters.country ? [filters.country] : undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      });
      if (response.success && response.data) {
        setEvents(response.data.data);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHotSearches = async () => {
    try {
      const response = await api.getHotSearches();
      if (response.success && response.data) {
        setHotSearches(response.data);
      }
    } catch (error) {
      console.error('Failed to load hot searches:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const industries = ['科技', '食品', '服装', '汽车', '化妆品', '奢侈品', '金融', '家居'];
  const countries = ['中国', '美国', '日本', '韩国', '德国', '法国', '英国', '意大利'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Search Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-6 text-center">搜索中心</h1>
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索品牌、事件或关键词..."
              className="w-full px-6 py-4 pr-24 text-gray-900 text-lg rounded-xl shadow-xl focus:ring-4 focus:ring-slate-300 focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 flex items-center space-x-2"
            >
              <Search className="w-4 h-4" />
              <span>搜索</span>
            </button>
          </form>

          {/* Hot Searches */}
          {!query && hotSearches.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center space-x-2 text-slate-300 mb-3">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">热门搜索</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {hotSearches.map((term, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuery(term);
                      performSearch();
                    }}
                    className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-sm transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Advanced Filters */}
          <aside className={`lg:w-72 flex-shrink-0 ${showAdvanced ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <SlidersHorizontal className="w-5 h-5 mr-2" />
                  筛选条件
                </h2>
                <button
                  onClick={() => setFilters({ type: 'all', industry: '', country: '', startDate: '', endDate: '' })}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  清空
                </button>
              </div>

              {/* Event Type */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">事件类型</label>
                <div className="space-y-2">
                  {[
                    { value: 'all', label: '全部' },
                    { value: 'black', label: '黑榜' },
                    { value: 'red', label: '红榜' },
                  ].map((option) => (
                    <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value={option.value}
                        checked={filters.type === option.value}
                        onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <span className="text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Industry Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">行业分类</label>
                <select
                  value={filters.industry}
                  onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="">全部行业</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              {/* Country Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">涉及国家</label>
                <select
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="">全部国家</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">时间范围</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* Results */}
          <div className="flex-1">
            {/* Mobile Filter Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="lg:hidden w-full mb-4 flex items-center justify-center space-x-2 px-4 py-3 bg-white rounded-lg shadow-sm border border-gray-200"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{showAdvanced ? '收起筛选' : '展开筛选'}</span>
            </button>

            {/* Results Count */}
            {query && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                <p className="text-gray-700">
                  找到 <span className="font-bold text-gray-900">{events.length}</span> 条与"
                  <span className="font-semibold text-red-600">{query}</span>"相关的结果
                </p>
              </div>
            )}

            {/* Results List */}
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent mx-auto"></div>
              </div>
            ) : query && events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">未找到相关结果</h3>
                <p className="text-gray-500 mb-4">尝试调整搜索词或筛选条件</p>
                <button
                  onClick={() => setFilters({ type: 'all', industry: '', country: '', startDate: '', endDate: '' })}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  清空筛选条件
                </button>
              </div>
            ) : !query ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">开始搜索</h3>
                <p className="text-gray-500">输入关键词搜索品牌、事件或内容</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;