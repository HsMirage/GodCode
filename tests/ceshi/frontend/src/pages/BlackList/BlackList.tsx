import { useEffect, useState } from 'react';
import { Filter, Grid, List, Search, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Event } from '../../types';
import EventCard from '../../components/EventCard/EventCard';

const BlackList = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'latest' | 'hot' | 'severity'>('latest');
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    industry: '',
    country: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadEvents();
  }, [sortBy, filters]);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const response = await api.getEvents({
        type: 'black',
        sort: sortBy,
        ...filters,
      });
      if (response.success && response.data) {
        setEvents(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const industries = ['科技', '食品', '服装', '汽车', '化妆品', '奢侈品', '金融', '家居'];
  const countries = ['中国', '美国', '日本', '韩国', '德国', '法国', '英国', '意大利'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50">
      {/* Header - Black Theme */}
      <div className="bg-gradient-to-r from-black via-gray-900 to-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center">
            <span className="w-12 h-12 bg-redlist rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl">⚫</span>
            </span>
            黑榜
          </h1>
          <p className="text-gray-300 text-lg">
            记录品牌负面事件，提醒消费者注意风险
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Panel */}
          <aside className={`lg:w-72 flex-shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">筛选条件</h2>
                <button
                  onClick={() => setFilters({ industry: '', country: '', startDate: '', endDate: '' })}
                  className="text-sm text-blacklist hover:text-redlist transition-colors"
                >
                  清空
                </button>
              </div>

              {/* Industry Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">行业分类</label>
                <select
                  value={filters.industry}
                  onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1">
            {/* Toolbar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  {/* Mobile Filter Toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Filter className="w-4 h-4" />
                    <span>筛选</span>
                  </button>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="latest">最新发布</option>
                    <option value="hot">最热</option>
                    <option value="severity">最严重</option>
                  </select>
                </div>

                {/* View Toggle */}
                <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      viewMode === 'list'
                        ? 'bg-white shadow text-primary'
                        : 'text-gray-600'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-white shadow text-primary'
                        : 'text-gray-600'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Events List */}
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无黑榜事件</h3>
                <p className="text-gray-500">尝试调整筛选条件或稍后再来</p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}>
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

export default BlackList;