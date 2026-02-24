import { Link } from 'react-router-dom';
import { Calendar, MapPin, Eye, Star } from 'lucide-react';
import type { Event } from '../../types';

interface EventCardProps {
  event: Event;
  compact?: boolean;
}

const EventCard = ({ event, compact = false }: EventCardProps) => {
  const isBlack = event.type === 'black';
  const severityColor = isBlack ? 'text-red-500' : 'text-green-500';
  const bgColor = isBlack ? 'from-gray-900 to-gray-800' : 'from-green-50 to-white';
  const borderColor = isBlack ? 'border-red-200' : 'border-green-200';

  return (
    <Link
      to={`/event/${event.id}`}
      className={`block bg-gradient-to-br ${bgColor} rounded-xl p-5 shadow-sm hover:shadow-lg transition-all duration-200 border ${borderColor} group`}
    >
      <div className="flex items-start space-x-4">
        {/* Brand Logo */}
        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white border border-gray-200">
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
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-gray-600 mb-1">{event.brand.name}</div>
              <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">
                {event.title}
              </h3>
            </div>
            <span
              className={`flex-shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${
                isBlack
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {isBlack ? '黑榜' : '红榜'}
            </span>
          </div>

          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{event.content}</p>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Calendar className="w-3 h-3" />
                <span>{new Date(event.eventDate).toLocaleDateString('zh-CN')}</span>
              </div>
              {event.eventLocation && (
                <div className="flex items-center space-x-1">
                  <MapPin className="w-3 h-3" />
                  <span>{event.eventLocation}</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <Star className={`w-3 h-3 ${severityColor} fill-current`} />
                <span>{event.severity}/5</span>
              </div>
              <div className="flex items-center space-x-1">
                <Eye className="w-3 h-3" />
                <span>{event.viewCount}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {event.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                >
                  {tag.name}
                </span>
              ))}
              {event.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                  +{event.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default EventCard;