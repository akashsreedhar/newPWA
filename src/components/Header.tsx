import React from 'react';
import { Search, MapPin, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';

const Header: React.FC = () => {
  const { t } = useLanguage();
  const { getItemCount } = useCart();

  return (
    <div className="bg-white shadow-sm border-b border-gray-100 px-3 sm:px-4 py-3">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center text-gray-600">
          <MapPin size={14} className="mr-1 sm:w-4 sm:h-4" />
          <span className="text-xs sm:text-sm">Kochi, Kerala</span>
        </div>
        <div className="relative">
          <ShoppingCart size={18} className="text-gray-600 sm:w-5 sm:h-5" />
          {getItemCount() > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-xs">
              {getItemCount()}
            </span>
          )}
        </div>
      </div>
      
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 sm:w-5 sm:h-5" />
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm sm:text-base"
        />
      </div>
    </div>
  );
};

export default Header;