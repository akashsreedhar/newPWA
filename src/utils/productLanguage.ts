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
    malayalamName?: string;
    manglishName?: string;
  },
  settings?: ProductLanguageSettings
): string => {
  const currentSettings = settings || getProductLanguageSettings();
  
  switch (currentSettings.mode) {
    case 'english-malayalam':
      return product.name && product.malayalamName 
        ? `${product.name} / ${product.malayalamName}`
        : product.name || product.malayalamName || 'Unknown Product';
    
    case 'english-manglish':
      return product.name && product.manglishName 
        ? `${product.name} / ${product.manglishName}`
        : product.name || product.manglishName || 'Unknown Product';
    
    case 'single':
      switch (currentSettings.singleLanguage) {
        case 'english':
          return product.name || 'Unknown Product';
        case 'malayalam':
          return product.malayalamName || product.name || 'Unknown Product';
        case 'manglish':
          return product.manglishName || product.name || 'Unknown Product';
        default:
          return product.name || 'Unknown Product';
      }
    
    default:
      return product.name || 'Unknown Product';
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
