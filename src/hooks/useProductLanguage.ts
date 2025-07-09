import { useState, useEffect } from 'react';
import { 
  getProductLanguageSettings, 
  setProductLanguageSettings, 
  ProductLanguageSettings,
  ProductLanguageMode,
  SingleLanguageChoice,
  getProductDisplayName,
  getProductDisplayDescription
} from '../utils/productLanguage';

// Custom hook for managing product language settings
export const useProductLanguage = () => {
  const [settings, setSettings] = useState<ProductLanguageSettings>(getProductLanguageSettings());

  // Update localStorage when settings change
  useEffect(() => {
    setProductLanguageSettings(settings);
  }, [settings]);

  const updateMode = (mode: ProductLanguageMode) => {
    setSettings(prev => ({ ...prev, mode }));
  };

  const updateSingleLanguage = (singleLanguage: SingleLanguageChoice) => {
    setSettings(prev => ({ ...prev, singleLanguage }));
  };

  const formatProductName = (product: {
    name?: string;
    malayalamName?: string;
    manglishName?: string;
  }) => {
    return getProductDisplayName(product, settings);
  };

  const formatProductDescription = (product: {
    description?: string;
    malayalamDescription?: string;
    manglishDescription?: string;
  }) => {
    return getProductDisplayDescription(product, settings);
  };

  return {
    settings,
    updateMode,
    updateSingleLanguage,
    formatProductName,
    formatProductDescription
  };
};

export default useProductLanguage;
