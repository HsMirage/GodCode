import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, MapPin, Globe, Eye, Star, Share2, Heart, Flag, MessageCircle, ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';
import type { Event, Comment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

const EventDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [eventRes, commentsRes] = await Promise.all([
        api.getEventById(id!),
        api.getEventComments(id!),
      ]);

      if (eventRes.success && eventRes.data) setEvent(eventRes.data);
      if (commentsRes.success && commentsRes.data) setComments(commentsRes.data);
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      alert('请先登录');
      return;
    }
    try {
      await api.toggleFavorite(id!);
      setIsFavorited(!isFavorited);
    } catch (error) {
      console.error('Failed to favorite:', error);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('请先登录');
      return;
    }
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await api.createComment(id!, commentText);
      if (response.success && response.data) {
        setComments([response.data, ...comments]);
        setCommentText('');
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: event?.title,
        text: event?.content,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('链接已复制到剪贴板');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">事件不存在</h2>
          <Link to="/" className="text-red-600 hover:text-red-700">返回首页</Link>
        </div>
      </div>
    );
  }

  const isBlack = event.type === 'black';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Link to="/" className="hover:text-gray-900">首页</Link>
            <span>/</span>
            <Link to={`/${event.type}list`} className="hover:text-gray-900">
              {isBlack ? '黑榜' : '红榜'}
            </Link>
            <span>/</span>
            <Link to={`/brand/${event.brandId}`} className="hover:text-gray-900">
              {event.brand.name}
            </Link>
            <span>/</span>
            <span className="text-gray-900">{event.title}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Event Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <span
                  className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    isBlack
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {isBlack ? '黑榜' : '红榜'}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleFavorite}
                    className={`p-2 rounded-lg transition-colors ${
                      isFavorited ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <h1 className="text-3xl font-bold text-gray-900 mb-4">{event.title}</h1>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(event.eventDate).toLocaleDateString('zh-CN')}</span>
                </div>
                {event.eventLocation && (
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-4 h-4" />
                    <span>{event.eventLocation}</span>
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <Globe className="w-4 h-4" />
                  <span>{event.affectedCountry}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Eye className="w-4 h-4" />
                  <span>{event.viewCount} 次浏览</span>
                </div>
              </div>

              {/* Severity/Contribution */}
              <div className="flex items-center space-x-2 mb-6">
                <span className="text-gray-600">{isBlack ? '严重程度' : '贡献程度'}:</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= event.severity
                          ? isBlack
                            ? 'text-red-500 fill-current'
                            : 'text-green-500 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap">{event.content}</p>
              </div>

              {/* Tags */}
              {event.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-gray-200">
                  {event.tags.map((tag) => (
                    <Link
                      key={tag.id}
                      to={`/search?q=${encodeURIComponent(tag.name)}`}
                      className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors text-sm"
                    >
                      #{tag.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* Source URLs */}
              {event.sourceUrls.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">来源链接</h3>
                  <div className="space-y-2">
                    {event.sourceUrls.map((url, index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span className="truncate">{url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Images */}
            {event.images.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">证据图片</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {event.images.map((image) => (
                    <img
                      key={image.id}
                      src={image.imageUrl}
                      alt="Evidence"
                      className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <MessageCircle className="w-5 h-5 mr-2" />
                评论 ({comments.length})
              </h2>

              {/* Comment Form */}
              {user ? (
                <form onSubmit={handleComment} className="mb-6">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="发表你的评论..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                    rows={3}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !commentText.trim()}
                    className="mt-2 px-6 py-2 bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '提交中...' : '发表评论'}
                  </button>
                </form>
              ) : (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-2">登录后发表评论</p>
                  <Link to="/login" className="text-red-600 hover:text-red-700">
                    去登录
                  </Link>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">暂无评论，快来抢沙发吧！</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="border-b border-gray-200 pb-4 last:border-0">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-gray-600 font-semibold">
                          {comment.user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-gray-900">{comment.user.username}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <p className="text-gray-700">{comment.content}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:w-80 flex-shrink-0">
            {/* Brand Card */}
            <Link to={`/brand/${event.brandId}`} className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-gray-200">
                  {event.brand.logo ? (
                    <img src={event.brand.logo} alt={event.brand.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                      <span className="text-xl font-bold text-gray-400">{event.brand.name.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{event.brand.name}</h3>
                  <p className="text-sm text-gray-500">{event.brand.industry}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    黑榜 {event.brand.blackCount} / 红榜 {event.brand.redCount}
                  </p>
                </div>
              </div>
            </Link>

            {/* Author Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">发布信息</h3>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-gray-600 font-semibold">
                  {event.user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{event.user.username}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default EventDetail;