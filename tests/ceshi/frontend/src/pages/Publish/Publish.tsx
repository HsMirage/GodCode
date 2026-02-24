import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Send, Plus, X, Upload, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

const Publish = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [eventType, setEventType] = useState<'black' | 'red'>('black');
  const [formData, setFormData] = useState({
    brandId: '',
    brandName: '',
    title: '',
    eventDate: '',
    eventLocation: '',
    affectedCountry: '',
    content: '',
    sourceUrl: '',
    severity: 3,
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const blackTags = ['辱华', '双标', '虚假宣传', '质量问题', '价格欺诈', '服务差', '歧视', '抄袭'];
  const redTags = ['爱国', '慈善', '环保', '质量优秀', '社会责任', '公益', '创新', '诚信'];
  const countries = ['中国', '美国', '日本', '韩国', '德国', '法国', '英国', '意大利'];

  const currentTags = eventType === 'black' ? blackTags : redTags;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleToggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      handleRemoveTag(tag);
    } else {
      setTags([...tags, tag]);
    }
  };

  const handleSaveDraft = async () => {
    // Save draft logic would go here
    alert('草稿保存功能开发中');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.title || !formData.eventDate || !formData.affectedCountry || !formData.content) {
      setError('请填写所有必填项');
      return;
    }

    if (formData.content.length < 100) {
      setError('事件详情至少需要100个字符');
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.createEvent({
        type: eventType,
        brandId: formData.brandId || undefined,
        brandName: formData.brandName,
        title: formData.title,
        content: formData.content,
        eventDate: formData.eventDate,
        eventLocation: formData.eventLocation,
        affectedCountry: formData.affectedCountry,
        sourceUrls: formData.sourceUrl ? [formData.sourceUrl] : [],
        severity: formData.severity,
        tags,
      });

      if (result.success) {
        navigate('/my-submissions');
      } else {
        setError(result.error || '提交失败');
      }
    } catch (err) {
      setError('提交失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">请先登录</h2>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-gradient-to-r from-primary to-primary-light text-white rounded-lg hover:shadow-lg transition-all"
          >
            前往登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">发布事件</h1>
          <p className="text-gray-600">记录品牌行为，共建透明评价体系</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">事件类型</label>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setEventType('black')}
                  className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all ${
                    eventType === 'black'
                      ? 'border-blacklist bg-gray-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-2xl">⚫</span>
                    <span className="font-semibold">黑榜事件</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEventType('red')}
                  className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all ${
                    eventType === 'red'
                      ? 'border-redlist bg-redlist text-white'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-2xl">🔴</span>
                    <span className="font-semibold">红榜事件</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Brand */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">品牌名称 *</label>
              <input
                type="text"
                name="brandName"
                value={formData.brandName}
                onChange={handleInputChange}
                placeholder="请输入品牌名称"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">事件标题 *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="请输入事件标题（限100字）"
                maxLength={100}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {formData.title.length}/100
              </div>
            </div>

            {/* Event Date & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">事件发生日期 *</label>
                <input
                  type="date"
                  name="eventDate"
                  value={formData.eventDate}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">发生地点</label>
                <input
                  type="text"
                  name="eventLocation"
                  value={formData.eventLocation}
                  onChange={handleInputChange}
                  placeholder="例如：北京、上海"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            {/* Affected Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">涉及国家/地区 *</label>
              <select
                name="affectedCountry"
                value={formData.affectedCountry}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">请选择</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">事件详情 *</label>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                placeholder="请详细描述事件经过、原因和影响（至少100字，最多5000字）"
                rows={8}
                minLength={100}
                maxLength={5000}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {formData.content.length}/5000
              </div>
            </div>

            {/* Source URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                证据来源链接
                <span className="text-gray-400 font-normal ml-1">（选填，支持新闻链接、社交媒体等）</span>
              </label>
              <input
                type="url"
                name="sourceUrl"
                value={formData.sourceUrl}
                onChange={handleInputChange}
                placeholder="https://..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">事件标签</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {currentTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      tags.includes(tag)
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="自定义标签"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center space-x-1 px-3 py-1 bg-primary text-white rounded-full text-sm"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Severity/Contribution */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {eventType === 'black' ? '严重程度' : '贡献程度'}
              </label>
              <div className="flex items-center space-x-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setFormData({ ...formData, severity: rating })}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        rating <= formData.severity
                          ? 'fill-gold text-gold'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-4 text-gray-600">
                  {formData.severity} {eventType === 'black' ? '星（非常严重）' : '星（贡献巨大）'}
                </span>
              </div>
            </div>

            {/* Agreement */}
            <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                required
                className="mt-1 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label className="text-sm text-gray-600">
                我确认所提交内容真实有效，并承担相应的法律责任。我同意按照{' '}
                <a href="#" className="text-primary hover:underline">
                  用户协议
                </a>{' '}
                和{' '}
                <a href="#" className="text-primary hover:underline">
                  社区规范
                </a>{' '}
                发布内容。
              </label>
            </div>

            {/* Submit Buttons */}
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium flex items-center justify-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>保存草稿</span>
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-primary to-primary-light text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>提交审核</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Notice */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>提示：</strong>提交后，内容将在24-48小时内完成审核。审核通过后将显示在对应榜单中。
          </p>
        </div>
      </div>
    </div>
  );
};

export default Publish;