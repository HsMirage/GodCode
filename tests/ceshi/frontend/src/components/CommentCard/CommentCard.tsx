import { useState } from 'react';
import { MoreVertical, Heart, MessageCircle, Flag, Trash2 } from 'lucide-react';
import type { Comment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

interface CommentCardProps {
  comment: Comment;
  onReply?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onReport?: (commentId: string) => void;
  showReplies?: boolean;
}

const CommentCard = ({ comment, onReply, onDelete, onReport, showReplies = true }: CommentCardProps) => {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleLike = async () => {
    if (!user) {
      alert('请先登录');
      return;
    }
    setIsLiked(!isLiked);
    setLikesCount(isLiked ? likesCount - 1 : likesCount + 1);
  };

  const handleReply = () => {
    if (!user) {
      alert('请先登录');
      return;
    }
    setShowReplyForm(!showReplyForm);
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      const response = await api.createComment(comment.eventId, replyText, comment.id);
      if (response.success && onReply) {
        onReply(comment.id);
      }
      setReplyText('');
      setShowReplyForm(false);
    } catch (error) {
      console.error('Failed to reply:', error);
    }
  };

  const handleDelete = () => {
    if (user && (user.id === comment.userId || user.role === 'admin' || user.role === 'super_admin')) {
      if (confirm('确定要删除这条评论吗？') && onDelete) {
        onDelete(comment.id);
      }
    }
  };

  const handleReport = () => {
    if (user && onReport) {
      onReport(comment.id);
    }
  };

  const isOwner = user?.id === comment.userId;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="group">
      <div className="flex items-start space-x-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-700 font-semibold shadow-sm">
            {comment.user.avatar ? (
              <img src={comment.user.avatar} alt={comment.user.username} className="w-full h-full rounded-full object-cover" />
            ) : (
              comment.user.username.charAt(0).toUpperCase()
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-gray-900">{comment.user.username}</span>
                {comment.user.role === 'admin' && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">管理员</span>
                )}
                {comment.user.role === 'super_admin' && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">超级管理员</span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {new Date(comment.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>

            {/* Menu */}
            {(isOwner || isAdmin) && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {isOwner && (
                      <button
                        onClick={handleDelete}
                        className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>删除</span>
                      </button>
                    )}
                    <button
                      onClick={handleReport}
                      className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Flag className="w-4 h-4" />
                      <span>举报</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comment Text */}
          <p className="text-gray-700 leading-relaxed">{comment.content}</p>

          {/* Actions */}
          <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 text-sm transition-colors ${
                isLiked ? 'text-red-600' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              <span>{likesCount}</span>
            </button>
            <button
              onClick={handleReply}
              className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>回复</span>
            </button>
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <form onSubmit={submitReply} className="mt-4">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`回复 ${comment.user.username}...`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none text-sm"
                rows={2}
              />
              <div className="flex items-center justify-end space-x-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReplyForm(false);
                    setReplyText('');
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="px-4 py-1.5 text-sm bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  回复
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Replies */}
      {showReplies && comment.replies && comment.replies.length > 0 && (
        <div className="ml-12 mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onDelete={onDelete}
              onReport={onReport}
              showReplies={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentCard;