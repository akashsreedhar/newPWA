import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import Header from '../components/Header';
import CategoryCard from '../components/CategoryCard';
import ProductCard from '../components/ProductCard';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const HomePage: React.FC = () => {
  const { t } = useLanguage();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      const snap = await getDocs(collection(db, 'products'));
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const categories = [
    {
      name: t('vegetables'),
      malayalamName: 'പച്ചക്കറികൾ',
      manglishName: 'Pachhakkarikal',
      icon: '🥬',
      color: 'bg-green-100'
    },
    {
      name: t('fruits'),
      malayalamName: 'പഴങ്ങൾ',
      manglishName: 'Pazhangal',
      icon: '🍎',
      color: 'bg-red-100'
    },
    {
      name: t('groceries'),
      malayalamName: 'പലവ്യഞ്ജനങ്ങൾ',
      manglishName: 'Groceries',
      icon: '🛒',
      color: 'bg-yellow-100'
    },
    {
      name: t('meat'),
      malayalamName: 'മാംസവും മീനും',
      manglishName: 'Meat & Fish',
      icon: '🐟',
      color: 'bg-blue-100'
    },
    {
      name: t('dairy'),
      malayalamName: 'പാലുൽപ്പാദനങ്ങൾ',
      manglishName: 'Paal Items',
      icon: '🥛',
      color: 'bg-purple-100'
    },
    {
      name: t('spices'),
      malayalamName: 'മസാലകൾ',
      manglishName: 'Masala',
      icon: '🌶️',
      color: 'bg-orange-100'
    }
  ];

  // ...removed hardcoded popularItems...

  return (
    <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
      <Header />
      
      {/* Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-blue-600 text-white p-3 sm:p-4 mx-3 sm:mx-4 mt-3 sm:mt-4 rounded-xl">
        <h2 className="text-base sm:text-lg font-semibold leading-tight">Fresh Vegetables & Fruits</h2>
        <p className="text-xs sm:text-sm opacity-90 mt-1">Free delivery on orders above ₹500</p>
      </div>

      {/* Categories */}
      <div className="p-3 sm:p-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('categories')}</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {categories.map((category, index) => (
            <CategoryCard key={index} {...category} />
          ))}
        </div>
      </div>

      {/* Popular Items */}
      <div className="p-3 sm:p-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('popularItems')}</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {products.map(item => (
              <ProductCard key={item.id} {...item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;