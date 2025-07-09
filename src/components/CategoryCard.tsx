import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface CategoryCardProps {
  name: string;
  malayalamName: string;
  manglishName: string;
  icon: string;
  color: string;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ name, malayalamName, manglishName, icon, color }) => {
  const { language, languageDisplay } = useLanguage();

  const getDisplayText = () => {
    if (languageDisplay === 'single') {
      switch (language) {
        case 'malayalam':
          return { primary: malayalamName, secondary: null };
        case 'manglish':
          return { primary: manglishName, secondary: null };
        default:
          return { primary: name, secondary: null };
      }
    } else if (languageDisplay === 'english-manglish') {
      return { primary: name, secondary: manglishName };
    } else {
      // english-malayalam (default)
      return { primary: name, secondary: malayalamName };
    }
  };

  const displayText = getDisplayText();

  return (
    <div className="flex flex-col items-center p-3 sm:p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow min-h-[110px] sm:min-h-[130px] overflow-hidden">
      <div className={`w-12 h-12 sm:w-16 sm:h-16 ${color} rounded-full flex items-center justify-center mb-2 sm:mb-3`}>
        <span className="text-xl sm:text-2xl">{icon}</span>
      </div>
      <div className="text-center w-full px-1">
        <h3 className="text-xs sm:text-sm font-medium text-gray-800 leading-tight break-words">{displayText.primary}</h3>
        {displayText.secondary && (
          <p className="text-xs text-gray-600 mt-0.5 sm:mt-1 leading-tight break-words">{displayText.secondary}</p>
        )}
      </div>
    </div>
  );
};

export default CategoryCard;