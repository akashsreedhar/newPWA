import React, { useEffect, useState, useCallback, useRef } from 'react';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { useProductLanguage } from '../hooks/useProductLanguage';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

import groceryKitchenImg from '../images/grocery-kitchen.jpg';
import snacksDrinksImg from '../images/snacks-drinks.png';
import beautyCareImg from '../images/beauty-care.jpeg';
import householdEssentialsImg from '../images/household-essentials.png';
import foodImg from '../images/food-category.png';

interface Product {
  id: string;
  name_en?: string;
  name_ml?: string;
  name_manglish?: string;
  name?: string;
  category?: string;
  price?: number;
  mrp: number;
  sellingPrice: number;
  imageUrl?: string;
  available?: boolean;
  description?: string;
  netQuantity?: string;
}

interface HomePageProps {
  onCategorySelect?: (category: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onCategorySelect }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);
  const [isAutoAnimating, setIsAutoAnimating] = useState(false);
  const foodCardRef = useRef<HTMLDivElement>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { settings: productLanguageSettings } = useProductLanguage();

  const getCategoryDisplayName = (category: any) => {
    const { mode } = productLanguageSettings;
    if (mode === 'single') {
      switch (productLanguageSettings.singleLanguage) {
        case 'malayalam':
          return category.malayalamName;
        case 'manglish':
          return category.manglishName;
        default:
          return category.name;
      }
    } else if (mode === 'english-malayalam') {
      return category.name;
    } else if (mode === 'english-manglish') {
      return category.name;
    }
    return category.name;
  };

  const getCategorySecondaryName = (category: any) => {
    const { mode } = productLanguageSettings;
    if (mode === 'single') {
      return null;
    } else if (mode === 'english-manglish') {
      return category.manglishName;
    }
    return null;
  };

  const triggerAutoAnimation = useCallback(() => {
    setIsAutoAnimating(true);
    setTimeout(() => {
      setIsAutoAnimating(false);
    }, 2000);
  }, []);

  useEffect(() => {
    if (!foodCardRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            triggerAutoAnimation();
          }
        });
      },
      {
        threshold: 0.5,
        rootMargin: '0px'
      }
    );
    observerRef.current.observe(foodCardRef.current);
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [triggerAutoAnimation]);

  useEffect(() => {
    if (!loading) {
      const initialTimer = setTimeout(() => {
        triggerAutoAnimation();
      }, 1000);
      animationIntervalRef.current = setInterval(() => {
        triggerAutoAnimation();
      }, 10000);
      return () => {
        clearTimeout(initialTimer);
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
        }
      };
    }
  }, [loading, triggerAutoAnimation]);

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'products'));
        const fetchedProducts: Product[] = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Product));
        setProducts(fetchedProducts);
      } catch (error) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const handleCategoryClick = (categoryName: string) => {
    if (onCategorySelect) {
      onCategorySelect(categoryName);
    }
  };

  const handleProductClick = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      window.history.pushState({ productModal: true, productId }, '');
      setProductModalStack(prev => {
        if (prev.length && prev[prev.length - 1].id === product.id) return prev;
        return [...prev, product];
      });
    }
  }, [products]);

  const handleProductModalBack = useCallback(() => {
    window.history.back();
  }, []);

  const handleProductSelectFromModal = useCallback((newProduct: Product) => {
    window.history.pushState({ productModal: true, productId: newProduct.id }, '');
    setProductModalStack(prev => {
      if (prev.length && prev[prev.length - 1].id === newProduct.id) return prev;
      return [...prev, newProduct];
    });
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      setProductModalStack(prev => {
        if (prev.length > 0) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;
    if (productModalStack.length > 0) {
      tg.BackButton.show();
      tg.BackButton.onClick(handleProductModalBack);
    } else {
      tg.BackButton.hide();
      tg.BackButton.offClick(handleProductModalBack);
    }
    return () => {
      if (tg.BackButton) {
        tg.BackButton.offClick(handleProductModalBack);
      }
    };
  }, [productModalStack.length, handleProductModalBack]);

  const foodCategory = {
    name: 'Food',
    malayalamName: 'ഭക്ഷണം',
    manglishName: 'Bhakshanam',
    imageUrl: foodImg,
    gradient: 'from-yellow-400 to-red-500',
    bgColor: 'bg-yellow-50',
    subcategories: ['Fast Food']
  };

  const otherCategories = [
    {
      name: 'Grocery & Kitchen',
      malayalamName: 'അടുക്കള സാധനങ്ങൾ',
      manglishName: 'Adukala Sadhanangal',
      imageUrl: groceryKitchenImg,
      gradient: 'from-green-500 to-emerald-600',
      bgColor: 'bg-green-50',
      subcategories: ['Fruits and Vegetables', 'Rice, Atta & Dal', 'Oil, Ghee & Masala', 'Dairy, Breads & Eggs', 'Chicken, Meat & Fish', 'Kitchenware & Appliances']
    },
    {
      name: 'Snacks & Drinks',
      malayalamName: 'ലഘുഭക്ഷണവും പാനീയങ്ങളും',
      manglishName: 'Snacks um Drinks um',
      imageUrl: snacksDrinksImg,
      gradient: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-50',
      subcategories: ['Chips', 'Sweet Chocolates', 'Bakery and Biscuits', 'Drinks and Juices', 'Tea, Coffee & Milk Drinks', 'Instant Food']
    },
    {
      name: 'Beauty & Personal Care',
      malayalamName: 'സൗന്ദര്യവും വ്യക്തിഗത പരിചരണവും',
      manglishName: 'Beauty & Personal Care',
      description: 'Soap, Shampoo & Cosmetics',
      malayalamDescription: 'സോപ്പ്, ഷാംപൂ, സൗന്ദര്യ സാധനങ്ങൾ',
      imageUrl: beautyCareImg,
      gradient: 'from-pink-500 to-purple-600',
      bgColor: 'bg-pink-50',
      iconBg: 'bg-pink-100',
      subcategories: ['Bath & Body', 'Hair', 'Skin & Face', 'Feminine Hygiene', 'Baby Care', 'Beauty and Cosmetics']
    },
    {
      name: 'Household Essentials',
      malayalamName: 'വീട്ടിലെ അത്യാവശ്യങ്ങൾ',
      manglishName: 'Veetile Athyavashyangal',
      imageUrl: householdEssentialsImg,
      gradient: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-50',
      subcategories: ['Home & Lifestyle', 'Cleaners & Repellents', 'Electronics', 'Stationery & Games']
    }
  ];

  const availableProducts = products.filter(p => p.available !== false);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
      {/* Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-blue-600 text-white p-3 sm:p-4 mx-3 sm:mx-4 mt-3 sm:mt-4 rounded-xl">
        <h2 className="text-base sm:text-lg font-semibold leading-tight">Welcome to Safari Cheemeni</h2>
      </div>

      {/* Main Categories Section */}
      <div className="p-3 sm:p-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">
          Shop by Category
        </h2>

        {/* Featured Food Category - Full Width with Automatic Animations */}
        <div className="mb-4 sm:mb-6" ref={foodCardRef}>
          <div
            onClick={() => handleCategoryClick(foodCategory.name)}
            className={`${foodCategory.bgColor} rounded-2xl p-4 sm:p-6 cursor-pointer transform hover:scale-[1.02] hover:-translate-y-2 transition-all duration-700 ease-out shadow-xl hover:shadow-2xl border-2 border-yellow-400 relative overflow-hidden group ${
              isAutoAnimating ? 'scale-[1.02] -translate-y-2 shadow-2xl' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 50%, #fde68a 100%)',
              boxShadow: '0 10px 25px -3px rgba(251, 191, 36, 0.3), 0 4px 6px -2px rgba(251, 191, 36, 0.05)',
              minHeight: '180px' // Ensure consistent card height
            }}
          >
            {/* Premium Animated Background Pattern */}
            <div className={`absolute inset-0 opacity-[0.03] transition-opacity duration-700 ${
              isAutoAnimating ? 'opacity-[0.08]' : 'group-hover:opacity-[0.08]'
            }`}>
              <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-400 rounded-full -translate-x-16 -translate-y-16 animate-pulse"></div>
              <div className="absolute top-1/2 left-1/4 w-20 h-20 bg-orange-400 rounded-full animate-pulse delay-150"></div>
              <div className="absolute bottom-0 right-0 w-24 h-24 bg-red-400 rounded-full translate-x-12 translate-y-12 animate-pulse delay-300"></div>
              <div className="absolute bottom-1/3 left-1/2 w-16 h-16 bg-yellow-300 rounded-full animate-pulse delay-500"></div>
            </div>

            {/* Floating Sparkles */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-4 left-8 w-1 h-1 bg-yellow-400 rounded-full opacity-60 animate-ping"></div>
              <div className="absolute top-8 right-16 w-1.5 h-1.5 bg-orange-400 rounded-full opacity-40 animate-ping delay-200"></div>
              <div className="absolute bottom-12 left-12 w-1 h-1 bg-red-400 rounded-full opacity-50 animate-ping delay-500"></div>
              <div className="absolute bottom-6 right-8 w-1.5 h-1.5 bg-yellow-300 rounded-full opacity-70 animate-ping delay-700"></div>
            </div>

            {/* Premium Highlight Badge - Fixed Top-Left, No Overlap */}
            <div className="absolute z-20 left-3 sm:left-4 top-3 sm:top-4 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg select-none pointer-events-none">
              <span className="flex items-center gap-1">
                🔥 <span>HOT</span>
              </span>
            </div>

            {/* Content Container - Absolute positioning for perfect center */}
            <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-6 pt-12 sm:pt-14 pb-4 sm:pb-6 z-10">
              {/* Left Side - Text Content with Flex Grow */}
              <div className="flex-1 pr-6">
                <h3 className={`font-bold text-lg sm:text-xl text-gray-800 mb-1 leading-tight transition-colors duration-300 ${
                  isAutoAnimating ? 'text-gray-900' : 'group-hover:text-gray-900'
                }`}>
                  {getCategoryDisplayName(foodCategory)}
                </h3>
                {getCategorySecondaryName(foodCategory) && (
                  <p className={`text-sm text-gray-600 mb-2 font-medium transition-colors duration-300 ${
                    isAutoAnimating ? 'text-gray-700' : 'group-hover:text-gray-700'
                  }`}>
                    {getCategorySecondaryName(foodCategory)}
                  </p>
                )}
                <p className={`text-xs sm:text-sm text-gray-600 mb-3 font-medium transition-colors duration-300 ${
                  isAutoAnimating ? 'text-gray-700' : 'group-hover:text-gray-700'
                }`}>
                 Shawarma, Alfam, Chicken and more <br />
<span
  className="inline-block mt-1 px-2 py-0.5 rounded-full bg-yellow-300 text-yellow-900 text-xs font-semibold shadow-sm"
>
  1 PM to 8 PM
</span>
                </p>
                {/* Premium Animated Arrow indicator */}
                <div className="flex items-center mt-3">
                  <div className={`h-1 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 rounded-full transition-all duration-500 shadow-md ${
                    isAutoAnimating ? 'w-16' : 'w-12 group-hover:w-16'
                  }`}></div>
                  <div className={`ml-2 transform transition-transform duration-300 ${
                    isAutoAnimating ? 'translate-x-2' : 'group-hover:translate-x-2'
                  }`}>
                    <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Right Side - Perfectly Centered Image - Uses absolute centering */}
              <div className="absolute right-4 sm:right-6 top-1/2 transform -translate-y-1/2">
                <div className={`w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-gradient-to-br ${foodCategory.gradient} shadow-2xl flex-shrink-0 transition-all duration-700 ease-out relative ${
                  isAutoAnimating 
                    ? 'shadow-3xl scale-110 rotate-6' 
                    : 'group-hover:shadow-3xl group-hover:scale-110 group-hover:rotate-6'
                }`}>
                  <img
                    src={foodCategory.imageUrl}
                    alt={foodCategory.name}
                    className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                      isAutoAnimating ? 'scale-110' : 'group-hover:scale-110'
                    }`}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  {/* Premium Shimmer Effect Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent transform -translate-x-full transition-all duration-1000 ease-out ${
                    isAutoAnimating 
                      ? 'opacity-30 translate-x-full' 
                      : 'opacity-0 group-hover:opacity-30 group-hover:translate-x-full'
                  }`}></div>
                  {/* Premium Glow Ring */}
                  <div className={`absolute -inset-1 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 rounded-2xl transition-opacity duration-500 blur-sm ${
                    isAutoAnimating ? 'opacity-20' : 'opacity-0 group-hover:opacity-20'
                  }`}></div>
                </div>
                {/* Floating Ring Animation */}
                <div className={`absolute inset-0 rounded-2xl border-2 border-yellow-400 transition-all duration-700 ease-out ${
                  isAutoAnimating 
                    ? 'opacity-40 scale-125' 
                    : 'opacity-0 group-hover:opacity-40 group-hover:scale-125'
                }`}></div>
              </div>
            </div>

            {/* Premium Bottom Glow Effect */}
            <div className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 w-4/5 h-2 bg-gradient-to-r from-transparent via-yellow-400 to-transparent transition-opacity duration-700 rounded-full blur-sm ${
              isAutoAnimating ? 'opacity-40' : 'opacity-0 group-hover:opacity-40'
            }`}></div>
            {/* Premium Side Accent Lines */}
            <div className={`absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-16 bg-gradient-to-b from-yellow-400 to-orange-500 transition-opacity duration-500 rounded-r ${
              isAutoAnimating ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'
            }`}></div>
            <div className={`absolute right-0 top-1/2 transform -translate-y-1/2 w-1 h-16 bg-gradient-to-b from-orange-500 to-red-500 transition-opacity duration-500 rounded-l ${
              isAutoAnimating ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'
            }`}></div>
          </div>
        </div>

        {/* Other Categories - 2x2 Grid with Enhanced Hover Effects */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {otherCategories.map((category, index) => (
            <div
              key={index}
              onClick={() => handleCategoryClick(category.name)}
              className={`${category.bgColor} rounded-2xl p-4 sm:p-5 cursor-pointer transform hover:scale-105 hover:-translate-y-1 transition-all duration-500 ease-out shadow-md hover:shadow-xl border border-white group`}
            >
              {/* Image with Gradient Background */}
              <div className={`w-full h-24 sm:h-28 mb-3 rounded-xl overflow-hidden bg-gradient-to-br ${category.gradient} shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                <img
                  src={category.imageUrl}
                  alt={category.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              {/* Category Title */}
              <h3 className="font-bold text-sm sm:text-base text-gray-800 text-center mb-1 leading-tight group-hover:text-gray-900 transition-colors duration-300">
                {getCategoryDisplayName(category)}
              </h3>
              {/* Secondary Language Name (if enabled) */}
              {getCategorySecondaryName(category) && (
                <p className="text-xs text-gray-600 text-center mb-2 font-medium group-hover:text-gray-700 transition-colors duration-300">
                  {getCategorySecondaryName(category)}
                </p>
              )}
              {/* Enhanced Arrow indicator */}
              <div className="flex justify-center mt-3">
                <div className="w-6 h-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent rounded-full group-hover:w-8 group-hover:via-gray-400 transition-all duration-300"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Featured Products */}
      <div className="p-3 sm:p-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Featured Products</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {availableProducts.slice(0, 6).map(item => (
            <ProductCard
              key={item.id}
              id={item.id}
              name={item.name_en || item.name || 'Unknown Product'}
              malayalamName={item.name_ml}
              manglishName={item.name_manglish}
              price={item.price || 0}
              mrp={item.mrp}
              sellingPrice={item.sellingPrice}
              imageUrl={item.imageUrl}
              netQuantity={item.netQuantity}
              onProductClick={handleProductClick}
            />
          ))}
        </div>
      </div>

      {/* All Products */}
      <div className="p-3 sm:p-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">All Products</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {availableProducts.map(item => (
            <ProductCard
              key={item.id}
              id={item.id}
              name={item.name_en || item.name || 'Unknown Product'}
              malayalamName={item.name_ml}
              manglishName={item.name_manglish}
              mrp={item.mrp || 0}
              sellingPrice={item.sellingPrice || 0}
              imageUrl={item.imageUrl}
              netQuantity={item.netQuantity}
              onProductClick={handleProductClick}
            />
          ))}
        </div>
      </div>

      {/* Product Detail Modal with stack navigation */}
      {productModalStack.length > 0 && (
        <ProductDetailModal
          isOpen={true}
          product={{
            ...productModalStack[productModalStack.length - 1],
            price: productModalStack[productModalStack.length - 1].sellingPrice || 0
          }}
          onClose={handleProductModalBack}
          onProductSelect={handleProductSelectFromModal}
        />
      )}
    </div>
  );
};

export default HomePage;