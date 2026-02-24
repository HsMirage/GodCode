import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Brand } from '../../types';

interface BrandCardProps {
  brand: Brand;
  showStats?: boolean;
  compact?: boolean;
}

const BrandCard = ({ brand, showStats = true, compact = false }: BrandCardProps) => {
  if (compact) {
    return (
      <Link
        to={`/brand/${brand.id}`}
        className="flex items-center space-x-3 p-3 bg-white rounded-lg hover:shadow-md transition-all duration-200 border border-gray-200 group"
      >
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0">
          {brand.logo ? (
            <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate group-hover:text-redlist transition-colors">
            {brand.name}
          </h3>
          <p className="text-xs text-gray-500">{brand.industry}</p>
        </div>
        {showStats && (
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center text-red-600">
              <TrendingDown className="w-3 h-3 mr-1" />
              {brand.blackCount}
            </span>
            <span className="flex items-center text-green-600">
              <TrendingUp className="w-3 h-3 mr-1" />
              {brand.redCount}
            </span>
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={`/brand/${brand.id}`}
      className="block bg-white rounded-xl p-5 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200 group overflow-hidden"
    >
      {/* Gradient Overlay on Hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-redlist/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 mx-auto mb-4 shadow-sm group-hover:shadow-lg transition-shadow">
          {brand.logo ? (
            <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-3xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Brand Info */}
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-redlist transition-colors line-clamp-1">
            {brand.name}
          </h3>
          {brand.englishName && (
            <p className="text-sm text-gray-500 mb-2">{brand.englishName}</p>
          )}
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-600 mb-3">
            <span className="px-2 py-1 bg-gray-100 rounded-full">{brand.country}</span>
            <span className="px-2 py-1 bg-gray-100 rounded-full">{brand.industry}</span>
          </div>
        </div>

        {/* Stats */}
        {showStats && (
          <div className="flex items-center justify-around pt-3 border-t border-gray-100">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-red-600 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="font-bold">{brand.blackCount}</span>
              </div>
              <p className="text-xs text-gray-500">黑榜</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-green-600 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="font-bold">{brand.redCount}</span>
              </div>
              <p className="text-xs text-gray-500">红榜</p>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default BrandCard;