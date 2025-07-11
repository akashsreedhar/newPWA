import React, { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { useProductLanguage } from '../hooks/useProductLanguage';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

interface Product {
  id: string;
  name_en?: string;
  name_ml?: string;
  name_manglish?: string;
  name?: string;
  category?: string;
  price?: number;
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
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
      console.log('🔍 [HomePage] Fetching products from Firestore...');
      try {
        const snap = await getDocs(collection(db, 'products'));
        const fetchedProducts: Product[] = snap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Product));
        
        console.log('📦 [HomePage] Fetched products count:', fetchedProducts.length);
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('❌ [HomePage] Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const handleCategoryClick = (categoryName: string) => {
    console.log('📂 [HomePage] Main category clicked:', categoryName);
    
    // Pass the main category name for navigation
    if (onCategorySelect) {
      onCategorySelect(categoryName);
    }
  };

  const handleProductClick = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedProduct(product);
    }
  };

  const mainCategories = [
    {
      name: 'Grocery & Kitchen',
      malayalamName: 'അടുക്കള സാധനങ്ങൾ',
      manglishName: 'Adukala Sadhanangal',
      imageUrl: 'https://sulabhmart.wordpress.com/wp-content/uploads/2013/07/1-composition-with-variety-of-grocery-products-t-monticello1.jpg',
      gradient: 'from-green-500 to-emerald-600',
      bgColor: 'bg-green-50',
      subcategories: ['Fruits and Vegetables', 'Rice, Atta & Dal', 'Oil, Ghee & Masala', 'Dairy, Breads & Eggs', 'Chicken, Meat & Fish', 'Kitchenware & Appliances']
    },
    {
      name: 'Snacks & Drinks',
      malayalamName: 'ലഘുഭക്ഷണവും പാനീയങ്ങളും',
      manglishName: 'Snacks um Drinks um',
      imageUrl: 'https://www.kindpng.com/picc/m/41-411184_snacks-and-drinks-png-transparent-png.png',
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
      imageUrl:  'https://media.licdn.com/dms/image/v2/D4D22AQH4myu_NZ-FeQ/feedshare-shrink_2048_1536/feedshare-shrink_2048_1536/0/1714028813199?e=2147483647&v=beta&t=SMR6bO8vQqzVs3qdSpbKFiPM9am3z7BQpGUSxKeul0g',
      gradient: 'from-pink-500 to-purple-600',
      bgColor: 'bg-pink-50',
      iconBg: 'bg-pink-100',
      subcategories: ['Bath & Body', 'Hair', 'Skin & Face', 'Feminine Hygiene', 'Baby Care', 'Beauty and Cosmetics']
    },
    {
      name: 'Household Essentials',
      malayalamName: 'വീട്ടിലെ അത്യാവശ്യങ്ങൾ',
      manglishName: 'Veetile Athyavashyangal',
      imageUrl: 'https://hips.hearstapps.com/hmg-prod/images/gettyimages-510693044-1550590816.jpg?crop=0.6667741935483871xw:1xh;center,top&resize=640:*',
      gradient: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-50',
      subcategories: ['Home & Lifestyle', 'Cleaners & Repellents', 'Electronics', 'Stationery & Games']
    }
  ];

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
          {products.slice(0, 6).map(item => (
            <ProductCard 
              key={item.id} 
              id={item.id}
              name={item.name_en || item.name || 'Unknown Product'}
              malayalamName={item.name_ml}
              manglishName={item.name_manglish}
              price={item.price || 0}
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
          {products.map(item => (
            <ProductCard 
              key={item.id} 
              id={item.id}
              name={item.name_en || item.name || 'Unknown Product'}
              malayalamName={item.name_ml}
              manglishName={item.name_manglish}
              price={item.price || 0}
              imageUrl={item.imageUrl}
              netQuantity={item.netQuantity}
              onProductClick={handleProductClick}
            />
          ))}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          isOpen={!!selectedProduct}
          product={{
            ...selectedProduct,
            price: selectedProduct.price || 0
          }}
          onClose={() => setSelectedProduct(null)}
          onProductSelect={(newProduct) => {
            // When a similar product is clicked, show its details
            setSelectedProduct(newProduct);
          }}
        />
      )}
    </div>
  );
};

export default HomePage;
