import React, { useState, useEffect } from 'react';
import { Search, MapPin, ShoppingCart } from 'lucide-react';
import { useCart } from '../contexts/CartContext';

interface HeaderProps {
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onSearchFocus?: () => void;
}

const Header: React.FC<HeaderProps> = ({ searchTerm = '', onSearchChange, onSearchFocus }) => {
  const { getItemCount } = useCart();
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
    if (searchTerm) return; // Don't animate if user is typing

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
  }, [placeholderIndex, searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log('🔍 [Header] Search term changed:', value);
    onSearchChange?.(value);
  };

  const handleSearchFocus = () => {
    console.log('🔍 [Header] Search focused');
    onSearchFocus?.();
  };

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
        {/* Static border with subtle glow */}
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
    </div>
  );
};

export default Header;