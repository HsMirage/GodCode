import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, TrendingUp, ShieldAlert, ShieldCheck, ArrowRight, Flame } from 'lucide-react';
import { api } from '../../services/api';
import type { Event, Brand, Stats } from '../../types';
import EventCard from '../../components/EventCard/EventCard';

const Home = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [blackEvents, setBlackEvents] = useState<Event[]>([]);
  const [redEvents, setRedEvents] = useState<Event[]>([]);
  const [hotBrands, setHotBrands] = useState<Brand[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, blackRes, redRes, hotRes] = await Promise.all([
        api.getStats(),
        api.getEvents({ type: 'black', limit: 5, sort: 'latest' }),
        api.getEvents({ type: 'red', limit: 5, sort: 'latest' }),
        api.getHotBrands(12),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (blackRes.success && blackRes.data) setBlackEvents(blackRes.data.data);
      if (redRes.success && redRes.data) setRedEvents(redRes.data.data);
      if (hotRes.success && hotRes.data) setHotBrands(hotRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  const industries = [
    { name: '科技', icon: '💻' },
    { name: '食品', icon: '🍔' },
    { name: '服装', icon: '👕' },
    { name: '汽车', icon: '🚗' },
    { name: '化妆品', icon: '💄' },
    { name: '奢侈品', icon: '💎' },
    { name: '金融', icon: '💰' },
    { name: '家居', icon: '🏠' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary-light to-black text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg width=\&quot;60\&quot; height=\&quot;60\&quot; viewBox=\&quot;0 0 60 60\&quot; xmlns=\&quot;http://www.w3.org/2000/svg\&quot;%3E%3Cg fill=\&quot;none\&quot; fill-rule=\&quot;evenodd\&quot;%3E%3Cg fill=\&quot;%23ffffff\&quot; fill-opacity=\&quot;1\&quot;%3E%3Cpath d=\&quot;M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\&quot;/%3E%3C/g%3E%3C/g%3E%3C/svg%3E&quot;)]"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              记录品牌是非，守护消费者权益
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-10 max-w-3xl mx-auto">
              透明评价，客观记录，让每一次消费决策都有据可依
            </p>

            {/* Search Box */}
            <div className="max-w-2xl mx-auto mb-12">
              <div className="relative flex items-center bg-white rounded-2xl shadow-2xl overflow-hidden">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索品牌、事件或关键词..."
                  className="flex-1 px-6 py-4 text-gray-900 text-lg focus:outline-none"
                />
                <button
                  onClick={handleSearch}
                  className="px-8 py-4 bg-gradient-to-r from-redlist to-redlist-dark text-white font-semibold hover:from-redlist-dark hover:to-redlist transition-all duration-200 flex items-center space-x-2"
                >
                  <Search className="w-5 h-5" />
                  <span>搜索</span>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all duration-200">
                <div className="text-3xl md:text-4xl font-bold mb-2">
                  {stats?.totalBrands || 0}
                </div>
                <div className="text-gray-300 text-sm">收录品牌</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all duration-200">
                <div className="text-3xl md:text-4xl font-bold mb-2 text-red-400">
                  {stats?.totalBlackEvents || 0}
                </div>
                <div className="text-gray-300 text-sm">黑榜事件</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all duration-200">
                <div className="text-3xl md:text-4xl font-bold mb-2 text-redlist">
                  {stats?.totalRedEvents || 0}
                </div>
                <div className="text-gray-300 text-sm">红榜事件</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all duration-200">
                <div className="text-3xl md:text-4xl font-bold mb-2">
                  {stats?.totalUsers || 0}
                </div>
                <div className="text-gray-300 text-sm">注册用户</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industry Navigation */}
      <section className="py-12 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <TrendingUp className="w-6 h-6 mr-2 text-primary" />
            行业分类
          </h2>
          <div className="flex overflow-x-auto pb-4 space-x-4 scrollbar-hide">
            {industries.map((industry) => (
              <Link
                key={industry.name}
                to={`/search?industry=${industry.name}`}
                className="flex-shrink-0 flex items-center space-x-3 px-6 py-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl hover:shadow-lg hover:from-gray-100 hover:to-gray-200 transition-all duration-200 border border-gray-200 group"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">{industry.icon}</span>
                <span className="font-medium text-gray-700">{industry.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Hot Brands */}
      <section className="py-12 bg-gradient-to-br from-orange-50 to-red-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Flame className="w-6 h-6 mr-2 text-redlist" />
              热门品牌
            </h2>
            <Link to="/search" className="text-redlist hover:text-redlist-light flex items-center text-sm font-medium">
              查看全部 <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {hotBrands.map((brand) => (
              <Link
                key={brand.id}
                to={`/brand/${brand.id}`}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-200 group"
              >
                <div className="aspect-square rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-3 overflow-hidden">
                  {brand.logo ? (
                    <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
                  )}
                </div>
                <div className="text-sm font-medium text-gray-900 text-center truncate">{brand.name}</div>
                <div className="text-xs text-gray-500 text-center mt-1">
                  {brand.blackCount}/{brand.redCount}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Dual Lists */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Black List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  <ShieldAlert className="w-6 h-6 mr-2 text-redlist" />
                  最新黑榜
                </h2>
                <Link to="/blacklist" className="text-redlist hover:text-redlist-light flex items-center text-sm font-medium">
                  查看全部 <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
              <div className="space-y-4">
                {blackEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
                {blackEvents.length === 0 && (
                  <div className="text-center py-12 text-gray-500">暂无黑榜事件</div>
                )}
              </div>
            </div>

            {/* Red List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  <ShieldCheck className="w-6 h-6 mr-2 text-redlist" />
                  最新红榜
                </h2>
                <Link to="/redlist" className="text-redlist hover:text-redlist-light flex items-center text-sm font-medium">
                  查看全部 <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
              <div className="space-y-4">
                {redEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
                {redEvents.length === 0 && (
                  <div className="text-center py-12 text-gray-500">暂无红榜事件</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;