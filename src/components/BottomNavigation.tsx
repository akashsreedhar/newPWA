import React from 'react';
import { Home, ShoppingCart, Package, User } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  cartCount?: number;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange, cartCount = 0 }) => {
  const { t } = useLanguage();

  const tabs = [
    { id: 'home', icon: Home, label: t('home') },
    { id: 'cart', icon: ShoppingCart, label: t('cart') },
    { id: 'orders', icon: Package, label: t('orders') },
    { id: 'account', icon: User, label: t('account') }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 sm:px-4 py-2 z-50 safe-area-inset-bottom">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const itemCount = tab.id === 'cart' ? cartCount : 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center p-1.5 sm:p-2 rounded-lg transition-colors min-w-[60px] sm:min-w-[70px] ${
                isActive 
                  ? 'text-teal-600 bg-teal-50' 
                  : 'text-gray-600 hover:text-teal-600'
              }`}
            >
              <div className="relative">
                <Icon size={20} className="sm:w-6 sm:h-6" />
                {itemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="text-xs mt-0.5 sm:mt-1 font-medium leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;