import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, XCircle, Eye, Trash2, Edit } from 'lucide-react';
import { api } from '../../services/api';
import type { Event } from '../../types';

const MySubmissions = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [activeTab]);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const status = activeTab === 'all' ? undefined : activeTab;
      const response = await api.getMyEvents(status);
      if (response.success && response.data) {
        setEvents(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load submissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('确定要删除这条投稿吗？')) return;

    try {
      const response = await api.deleteEvent(eventId);
      if (response.success) {
        setEvents(events.filter(e => e.id !== eventId));
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      alert('删除失败，请重试');
    }
  };

  const tabs = [
    { key: 'all', label: '全部', icon: FileText },
    { key: 'pending', label: '待审核', icon: Clock },
    { key: 'approved', label: '已通过', icon: CheckCircle },
    { key: 'rejected', label: '已拒绝', icon: XCircle },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '待审核';
      case 'approved':
        return '已通过';
      case 'rejected':
        return '已拒绝';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center">
            <FileText className="w-10 h-10 mr-4" />
            我的投稿
          </h1>
          <p className="text-gray-300 text-lg">
            查看和管理您提交的品牌事件
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 mb-6">
          <div className="flex space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gray-900 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.key !== 'all' && (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {events.filter(e => e.status === tab.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent mx-auto"></div>
            <p className="text-gray-500 mt-4">加载中...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'all' ? '暂无投稿' : `暂无${getStatusText(activeTab)}的投稿`}
            </h3>
            <p className="text-gray-500 mb-6">
              {activeTab === 'all' ? '开始您的第一次投稿吧' : '切换到其他标签查看'}
            </p>
            <Link
              to="/publish"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-lg hover:shadow-lg transition-all duration-200"
            >
              <FileText className="w-4 h-4" />
              <span>发布新事件</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {/* Event Info */}
                  <div className="flex-1">
                    <div className="flex items-start space-x-4">
                      {/* Brand Logo */}
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                        {event.brand.logo ? (
                          <img src={event.brand.logo} alt={event.brand.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                            <span className="text-xl font-bold text-gray-400">{event.brand.name.charAt(0)}</span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                            event.type === 'black'
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : 'bg-green-100 text-green-700 border-green-200'
                          }`}>
                            {event.type === 'black' ? '黑榜' : '红榜'}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(event.status)}`}>
                            {getStatusIcon(event.status)}
                            <span className="ml-1">{getStatusText(event.status)}</span>
                          </span>
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{event.title}</h3>
                        <p className="text-sm text-gray-500 mb-2">{event.brand.name}</p>
                        <p className="text-sm text-gray-600 line-clamp-2">{event.content}</p>

                        {event.status === 'rejected' && event.rejectReason && (
                          <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm text-red-700">
                              <strong>拒绝原因：</strong>{event.rejectReason}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                          <span>提交于 {new Date(event.createdAt).toLocaleString('zh-CN')}</span>
                          <span>事件日期 {new Date(event.eventDate).toLocaleDateString('zh-CN')}</span>
                          {event.status === 'approved' && (
                            <span className="flex items-center">
                              <Eye className="w-3 h-3 mr-1" />
                              {event.viewCount} 次浏览
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 md:ml-4">
                    {event.status === 'approved' && (
                      <Link
                        to={`/event/${event.id}`}
                        className="flex items-center space-x-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm">查看</span>
                      </Link>
                    )}
                    {event.status === 'pending' && (
                      <Link
                        to={`/publish?edit=${event.id}`}
                        className="flex items-center space-x-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span className="text-sm">编辑</span>
                      </Link>
                    )}
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm">删除</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MySubmissions;