import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'english' | 'malayalam' | 'manglish';
export type LanguageDisplay = 'english-malayalam' | 'english-manglish' | 'single';

interface LanguageContextType {
  language: Language;
  languageDisplay: LanguageDisplay;
  setLanguage: (lang: Language) => void;
  setLanguageDisplay: (display: LanguageDisplay) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations = {
  english: {
    home: 'Home',
    cart: 'Cart',
    orders: 'Orders',
    account: 'Account',
    searchPlaceholder: 'Search for items...',
    popularItems: 'Popular Items',
    categories: 'Categories',
    vegetables: 'Vegetables',
    fruits: 'Fruits',
    groceries: 'Groceries',
    meat: 'Meat & Fish',
    dairy: 'Dairy',
    spices: 'Spices',
    add: 'Add',
    remove: 'Remove',
    proceedToCheckout: 'Proceed to Checkout',
    totalAmount: 'Total Amount',
    deliveryCharges: 'Delivery Charges',
    grandTotal: 'Grand Total',
    orderPlaced: 'Order Placed',
    processing: 'Processing',
    delivered: 'Delivered',
    reorder: 'Reorder',
    name: 'Name',
    phone: 'Phone',
    address: 'Delivery Address',
    language: 'Language',
    logout: 'Logout',
    cartEmpty: 'Your cart is empty',
    orderMessage: 'Please check your order',
    free: 'Free',
    kg: 'kg',
    piece: 'piece',
    packet: 'packet'
  },
  malayalam: {
    home: 'ഹോം',
    cart: 'കാർട്ട്',
    orders: 'ഓർഡർസ്',
    account: 'അക്കൗണ്ട്',
    searchPlaceholder: 'സാധനങ്ങൾ തിരയുക...',
    popularItems: 'ജനപ്രിയ സാധനങ്ങൾ',
    categories: 'വിഭാഗങ്ങൾ',
    vegetables: 'പച്ചക്കറികൾ',
    fruits: 'പഴങ്ങൾ',
    groceries: 'പലവ്യഞ്ജനങ്ങൾ',
    meat: 'മാംസവും മീനും',
    dairy: 'പാലുൽപ്പാദനങ്ങൾ',
    spices: 'മസാലകൾ',
    add: 'ചേർക്കുക',
    remove: 'നീക്കം ചെയ്യുക',
    proceedToCheckout: 'ഓർഡർ ചെയ്യുക',
    totalAmount: 'ആകെ തുക',
    deliveryCharges: 'ഡെലിവറി ചാർജ്',
    grandTotal: 'മൊത്തം തുക',
    orderPlaced: 'ഓർഡർ സ്ഥാപിച്ചു',
    processing: 'പ്രോസസ്സിംഗ്',
    delivered: 'ഡെലിവർ ചെയ്തു',
    reorder: 'വീണ്ടും ഓർഡർ',
    name: 'പേര്',
    phone: 'ഫോൺ',
    address: 'വിലാസം',
    language: 'ഭാഷ',
    logout: 'ലോഗ്ഔട്ട്',
    cartEmpty: 'നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്',
    orderMessage: 'ദയവായി നിങ്ങളുടെ ഓർഡർ നോക്കൂ',
    free: 'സൗജന്യം',
    kg: 'കിലോ',
    piece: 'എണ്ണം',
    packet: 'പാക്കറ്റ്'
  },
  manglish: {
    home: 'Hom',
    cart: 'Kaart',
    orders: 'Orders',
    account: 'Ackaunt',
    searchPlaceholder: 'Items search cheyyuka...',
    popularItems: 'Popular Items',
    categories: 'Categories',
    vegetables: 'Pachhakkarikal',
    fruits: 'Pazhangal',
    groceries: 'Groceries',
    meat: 'Meat & Fish',
    dairy: 'Paal Items',
    spices: 'Masala',
    add: 'Add',
    remove: 'Remove',
    proceedToCheckout: 'Order Cheyyuka',
    totalAmount: 'Total Amount',
    deliveryCharges: 'Delivery Charge',
    grandTotal: 'Grand Total',
    orderPlaced: 'Order Placed',
    processing: 'Processing',
    delivered: 'Delivered',
    reorder: 'Reorder',
    name: 'Naam',
    phone: 'Phone',
    address: 'Address',
    language: 'Bhaasha',
    logout: 'Logout',
    cartEmpty: 'Cart empty aanu',
    orderMessage: 'Dayavayi ningalude order nokku',
    free: 'Free',
    kg: 'kg',
    piece: 'piece',
    packet: 'packet'
  }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('english');
  const [languageDisplay, setLanguageDisplay] = useState<LanguageDisplay>('english-malayalam');

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.english] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, languageDisplay, setLanguage, setLanguageDisplay, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};