// Product language display utilities

export type ProductLanguageMode = 'english-malayalam' | 'english-manglish' | 'single';
export type SingleLanguageChoice = 'english' | 'malayalam' | 'manglish';

export interface ProductLanguageSettings {
  mode: ProductLanguageMode;
  singleLanguage: SingleLanguageChoice;
}

// Get current product language settings from localStorage
export const getProductLanguageSettings = (): ProductLanguageSettings => {
  const mode = (localStorage.getItem('productLanguageMode') as ProductLanguageMode) || 'english-malayalam';
  const singleLanguage = (localStorage.getItem('singleProductLanguage') as SingleLanguageChoice) || 'english';
  
  return { mode, singleLanguage };
};

// Set product language settings in localStorage
export const setProductLanguageSettings = (settings: ProductLanguageSettings): void => {
  localStorage.setItem('productLanguageMode', settings.mode);
  localStorage.setItem('singleProductLanguage', settings.singleLanguage);
};

// Get the display name for a product based on current language settings
export const getProductDisplayName = (
  product: {
    name?: string;
    name_en?: string;
    malayalamName?: string;
    name_ml?: string;
    manglishName?: string;
    name_manglish?: string;
  },
  settings?: ProductLanguageSettings
): string => {
  const currentSettings = settings || getProductLanguageSettings();
  
  // Support both old and new field names for compatibility
  const englishName = product.name || product.name_en;
  const malayalamName = product.malayalamName || product.name_ml;
  const manglishName = product.manglishName || product.name_manglish;
  
  console.log('🏷️ [productLanguage] Processing product with names:', {
    englishName,
    malayalamName,
    manglishName,
    mode: currentSettings.mode,
    singleLanguage: currentSettings.singleLanguage
  });
  
  switch (currentSettings.mode) {
    case 'english-malayalam':
      const result1 = englishName && malayalamName 
        ? `${englishName} / ${malayalamName}`
        : englishName || malayalamName || manglishName || 'Unknown Product';
      console.log('🏷️ [productLanguage] English-Malayalam result:', result1);
      return result1;
    
    case 'english-manglish':
      const result2 = englishName && manglishName 
        ? `${englishName} / ${manglishName}`
        : englishName || manglishName || malayalamName || 'Unknown Product';
      console.log('🏷️ [productLanguage] English-Manglish result:', result2);
      return result2;
    
    case 'single':
      let singleResult;
      switch (currentSettings.singleLanguage) {
        case 'english':
          singleResult = englishName || malayalamName || manglishName || 'Unknown Product';
          break;
        case 'malayalam':
          singleResult = malayalamName || englishName || manglishName || 'Unknown Product';
          break;
        case 'manglish':
          singleResult = manglishName || englishName || malayalamName || 'Unknown Product';
          break;
        default:
          singleResult = englishName || malayalamName || manglishName || 'Unknown Product';
      }
      console.log('🏷️ [productLanguage] Single language result:', singleResult);
      return singleResult;
    
    default:
      const defaultResult = englishName || malayalamName || manglishName || 'Unknown Product';
      console.log('🏷️ [productLanguage] Default result:', defaultResult);
      return defaultResult;
  }
};

// Get the display description for a product based on current language settings
export const getProductDisplayDescription = (
  product: {
    description?: string;
    malayalamDescription?: string;
    manglishDescription?: string;
  },
  settings?: ProductLanguageSettings
): string => {
  const currentSettings = settings || getProductLanguageSettings();
  
  switch (currentSettings.mode) {
    case 'english-malayalam':
      return product.description && product.malayalamDescription 
        ? `${product.description} / ${product.malayalamDescription}`
        : product.description || product.malayalamDescription || '';
    
    case 'english-manglish':
      return product.description && product.manglishDescription 
        ? `${product.description} / ${product.manglishDescription}`
        : product.description || product.manglishDescription || '';
    
    case 'single':
      switch (currentSettings.singleLanguage) {
        case 'english':
          return product.description || '';
        case 'malayalam':
          return product.malayalamDescription || product.description || '';
        case 'manglish':
          return product.manglishDescription || product.description || '';
        default:
          return product.description || '';
      }
    
    default:
      return product.description || '';
  }
};
