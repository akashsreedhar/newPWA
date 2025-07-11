import React from 'react';
import { Search, MapPin, ShoppingCart, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';

interface GlobalHeaderProps {
  // Navigation props
  showBackButton?: boolean;
  onBackClick?: () => void;
  title?: string;
  
  // Search props
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onSearchFocus?: () => void;
  showSearch?: boolean;
  searchPlaceholder?: string;
  
  // Actions
  onCartClick?: () => void;
  showCartButton?: boolean;
  
  // Style
  variant?: 'default' | 'minimal' | 'search-focused';
}

const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  showBackButton = false,
  onBackClick,
  title,
  searchTerm = '',
  onSearchChange,
  onSearchFocus,
  showSearch = true,
  searchPlaceholder,
  onCartClick,
  showCartButton = true,
  variant = 'default'
}) => {
  const { t } = useLanguage();
  const { cartItems } = useCart(); // Use cartItems.length for unique product count

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onSearchChange?.(value);
  };

  const handleSearchFocus = () => {
    onSearchFocus?.();
  };

  const handleCartClick = () => {
    onCartClick?.();
  };

  if (variant === 'minimal') {
    return (
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {showBackButton && (
              <button 
                onClick={onBackClick} 
                className="mr-3 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            {title && <h1 className="text-lg font-semibold text-gray-900">{title}</h1>}
          </div>
          {showCartButton && (
            <button onClick={handleCartClick} className="relative p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ShoppingCart size={20} className="text-gray-600" />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'search-focused') {
    return (
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          {showBackButton && (
            <button 
              onClick={onBackClick} 
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              placeholder={searchPlaceholder || t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
              autoFocus
            />
          </div>
          {showCartButton && (
            <button onClick={handleCartClick} className="relative p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
              <ShoppingCart size={20} className="text-gray-600" />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className="bg-white shadow-sm border-b border-gray-100 px-3 sm:px-4 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center">
          {showBackButton && (
            <button 
              onClick={onBackClick} 
              className="mr-3 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          {title ? (
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          ) : (
            <div className="flex items-center text-gray-600">
              <MapPin size={14} className="mr-1 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Kochi, Kerala</span>
            </div>
          )}
        </div>
        {showCartButton && (
          <button onClick={handleCartClick} className="relative">
            <ShoppingCart size={18} className="text-gray-600 sm:w-5 sm:h-5" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </button>
        )}
      </div>
      
      {showSearch && (
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 sm:w-5 sm:h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            placeholder={searchPlaceholder || t('searchPlaceholder')}
            className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white outline-none transition-colors text-sm sm:text-base"
          />
        </div>
      )}
    </div>
  );
};

export default GlobalHeader;
