import React, { useEffect, useState, useCallback } from 'react';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { useProductLanguage } from '../hooks/useProductLanguage';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

import groceryKitchenImg from '../images/grocery-kitchen.jpg';
import snacksDrinksImg from '../images/snacks-drinks.png';
import beautyCareImg from '../images/beauty-care.jpeg';
import householdEssentialsImg from '../images/household-essentials.png';

interface Product {
  id: string;
  name_en?: string;
  name_ml?: string;
  name_manglish?: string;
  name?: string;
  category?: string;
  price?: number; // Optional legacy field
  mrp: number; // Required - Maximum Retail Price
  sellingPrice: number; // Required - Actual selling price
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

  // Use a stack for product modal navigation
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);

  const { settings: productLanguageSettings } = useProductLanguage();

  // Helper function to get category display name based on user's language preference
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
      return category.name; // Primary: English
    } else if (mode === 'english-manglish') {
      return category.name; // Primary: English
    }
    return category.name; // Default fallback
  };

  const getCategorySecondaryName = (category: any) => {
    const { mode } = productLanguageSettings;
    if (mode === 'single') {
      return null; // No secondary name in single mode
    } else if (mode === 'english-malayalam') {
      return category.malayalamName; // Secondary: Malayalam
    } else if (mode === 'english-manglish') {
      return category.manglishName; // Secondary: Manglish
    }
    return null; // Default fallback
  };

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

  // Open product detail modal (push to stack and push to history)
  const handleProductClick = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setProductModalStack(prev => {
        // Prevent duplicate push if already top of stack
        if (prev.length && prev[prev.length - 1].id === product.id) return prev;
        window.history.pushState({ productModal: true }, '');
        return [...prev, product];
      });
    }
  }, [products]);

  // Handle modal close/back (pop stack and pop history)
  const handleProductModalBack = useCallback(() => {
    setProductModalStack(prev => {
      if (prev.length > 1) {
        window.history.back();
        return prev.slice(0, -1);
      } else if (prev.length === 1) {
        window.history.back();
        return [];
      }
      return prev;
    });
  }, []);

  // Listen for browser/phone back button to pop modal stack
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

  // When opening a similar product from inside the modal
  const handleProductSelectFromModal = useCallback((newProduct: Product) => {
    setProductModalStack(prev => {
      // Prevent duplicate push if already top of stack
      if (prev.length && prev[prev.length - 1].id === newProduct.id) return prev;
      window.history.pushState({ productModal: true }, '');
      return [...prev, newProduct];
    });
  }, []);

  const mainCategories = [
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

  // Filter out unavailable products for display
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
        <h2 className="text-base sm:text-lg font-semibold leading-tight">Fresh Vegetables & Fruits</h2>
        <p className="text-xs sm:text-sm opacity-90 mt-1">Free delivery on orders above ₹500</p>
      </div>

      {/* Main Categories - Redesigned */}
      <div className="p-3 sm:p-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">
          Shop by Category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {mainCategories.map((category, index) => (
            <div
              key={index}
              onClick={() => handleCategoryClick(category.name)}
              className={`${category.bgColor} rounded-2xl p-4 sm:p-5 cursor-pointer transform hover:scale-105 transition-all duration-300 shadow-sm hover:shadow-lg border border-white`}
            >
              {/* Image with Gradient Background */}
              <div className={`w-full h-24 sm:h-28 mb-3 rounded-xl overflow-hidden bg-gradient-to-br ${category.gradient} shadow-lg`}>
                <img
                  src={category.imageUrl}
                  alt={category.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to gradient background if image fails
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              {/* Category Title */}
              <h3 className="font-bold text-sm sm:text-base text-gray-800 text-center mb-1 leading-tight">
                {getCategoryDisplayName(category)}
              </h3>
              {/* Secondary Language Name (if enabled) */}
              {getCategorySecondaryName(category) && (
                <p className="text-xs text-gray-600 text-center mb-2 font-medium">
                  {getCategorySecondaryName(category)}
                </p>
              )}
              {/* Arrow indicator */}
              <div className="flex justify-center mt-3">
                <div className="w-6 h-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent rounded-full"></div>
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