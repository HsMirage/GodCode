import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, MapPin, Globe, TrendingUp, TrendingDown, ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Brand, Event } from '../../types';
import EventCard from '../../components/EventCard/EventCard';

const BrandDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'black' | 'red'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id, activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [brandRes, eventsRes] = await Promise.all([
        api.getBrandById(id!),
        api.getBrandEvents(id!, activeTab === 'all' ? undefined : activeTab),
      ]);

      if (brandRes.success && brandRes.data) setBrand(brandRes.data);
      if (eventsRes.success && eventsRes.data) setEvents(eventsRes.data.data);
    } catch (error) {
      console.error('Failed to load brand data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent"></div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">品牌不存在</h2>
          <Link to="/" className="text-red-600 hover:text-red-700">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Brand Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-black text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center space-x-2 text-slate-300 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回首页</span>
          </Link>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            {/* Logo */}
            <div className="w-32 h-32 rounded-2xl bg-white overflow-hidden shadow-2xl">
              {brand.logo ? (
                <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                  <span className="text-5xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{brand.name}</h1>
              {brand.englishName && (
                <p className="text-xl text-slate-300 mb-4">{brand.englishName}</p>
              )}

              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg">
                  <Globe className="w-4 h-4" />
                  <span>{brand.country}</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg">
                  <span className="text-lg">🏢</span>
                  <span>{brand.industry}</span>
                </div>
              </div>

              {brand.description && (
                <p className="text-slate-300 max-w-3xl">{brand.description}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-4">
              <div className="bg-red-500/20 border border-red-400 rounded-xl px-6 py-4 text-center">
                <div className="flex items-center space-x-2 mb-1">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 text-sm">黑榜</span>
                </div>
                <div className="text-3xl font-bold text-red-400">{brand.blackCount}</div>
              </div>
              <div className="bg-green-500/20 border border-green-400 rounded-xl px-6 py-4 text-center">
                <div className="flex items-center space-x-2 mb-1">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <span className="text-green-400 text-sm">红榜</span>
                </div>
                <div className="text-3xl font-bold text-green-400">{brand.redCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Events Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 mb-6">
          <div className="flex space-x-2">
            {[
              { value: 'all', label: '全部事件' },
              { value: 'black', label: '黑榜事件' },
              { value: 'red', label: '红榜事件' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value as any)}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab.value
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Events List */}
        {events.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">暂无相关事件</p>
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
  );
};

export default BrandDetail;