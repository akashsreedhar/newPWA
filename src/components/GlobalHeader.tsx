import React, { useState, useEffect } from 'react';
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
  
  // User info
  userName?: string; // <-- Added this line
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
  variant = 'default',
  userName // <-- Added this line
}) => {
  const { t } = useLanguage();
  const { cartItems } = useCart(); // Use cartItems.length for unique product count
  
  // Animated placeholder state
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  // Animated placeholder examples
  const placeholderExamples = [
    { en: 'Rice', ml: 'അരി', manglish: 'Ari' },
    { en: 'Mango', ml: 'മാങ്ങ', manglish: 'Manga' },
    { en: 'Onion', ml: 'ഉള്ളി', manglish: 'Ulli' },
    { en: 'Milk', ml: 'പാൽ', manglish: 'Paal' },
    { en: 'Tomato', ml: 'തക്കാളി', manglish: 'Thakkali' }
  ];

  // Typewriter effect for placeholder
  useEffect(() => {
    if (searchTerm || !showSearch) return; // Don't animate if user is typing or search is hidden

    const currentExample = placeholderExamples[placeholderIndex];
    const fullText = `${currentExample.en}, ${currentExample.ml}, ${currentExample.manglish}`;
    
    let currentText = '';
    let charIndex = 0;
    setIsTyping(true);

    const typeInterval = setInterval(() => {
      if (charIndex < fullText.length) {
        currentText += fullText[charIndex];
        setDisplayText(currentText);
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTyping(false);
        
        // Wait 2 seconds then clear and move to next
        setTimeout(() => {
          setIsTyping(true);
          const clearTextInterval = setInterval(() => {
            if (currentText.length > 0) {
              currentText = currentText.slice(0, -1);
              setDisplayText(currentText);
            } else {
              clearInterval(clearTextInterval);
              setPlaceholderIndex((prev) => (prev + 1) % placeholderExamples.length);
            }
          }, 50);
        }, 2000);
      }
    }, 100);

    return () => clearInterval(typeInterval);
  }, [placeholderIndex, searchTerm, showSearch]);

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
              {/* Replace MapPin icon and "Kochi, Kerala" with greeting */}
              <span className="text-xs sm:text-sm font-semibold">
                {userName ? `Hi ${userName} !!` : 'Hi !!'}
              </span>
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
        <div className="relative">        {/* Static border with subtle glow */}
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-teal-600 via-blue-600 via-purple-600 to-pink-600 opacity-90 search-border-flow"></div>
        
        {/* Main search container */}
        <div className="relative rounded-2xl bg-white border-2 border-transparent shadow-lg">
          {/* Inner glow effect */}
          <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-r from-blue-50 via-purple-50 to-teal-50 opacity-40"></div>
          
          {/* Pulsing background effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-teal-400/5 via-blue-500/5 to-purple-600/5 search-pulse"></div>
            
            <div className="relative flex items-center">
              {/* Professional search icon */}
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20">
                <Search size={18} className="text-gray-400 hover:text-teal-500 transition-colors" strokeWidth={2} />
              </div>
              
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                placeholder={searchTerm ? "Search products..." : `Try: ${displayText}${isTyping ? '|' : ''}`}
                className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-gradient-to-r from-white via-blue-50/20 to-purple-50/20 border-0 rounded-2xl focus:outline-none focus:ring-3 focus:ring-blue-500/20 text-sm sm:text-base font-medium text-gray-800 placeholder-gray-500 z-10 transition-all duration-300 focus:shadow-lg"
                style={{
                  backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 50%, rgba(245,247,250,0.98) 100%)',
                }}
              />
              
              {/* Enhanced floating elements */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                {/* Animated dots - smaller and more subtle */}
                <div className="absolute top-2 right-4 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping opacity-50"></div>
                <div className="absolute top-4 right-8 w-1 h-1 bg-blue-400 rounded-full sparkle-float opacity-40"></div>
                <div className="absolute bottom-2 right-6 w-1 h-1 bg-purple-400 rounded-full animate-bounce opacity-40" style={{ animationDelay: '1s' }}></div>
                
                {/* Moving light effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent moving-light"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalHeader;