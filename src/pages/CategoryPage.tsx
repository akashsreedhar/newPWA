import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Filter, SortAsc } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useProductLanguage } from '../hooks/useProductLanguage';

interface Product {
  id: string;
  name_en?: string;
  name_ml?: string;
  name_manglish?: string;
  name?: string;
  category?: string;
  price?: number;
  mrp?: number;
  sellingPrice?: number;
  imageUrl?: string;
  available?: boolean;
  description?: string;
  netQuantity?: string;
  manufacturerNameAddress?: string;
  countryOfOrigin?: string;
  customerSupportDetails?: string;
  // Fast Food specific fields
  fssaiLicenseNumber?: string;
  ingredients?: string;
  allergens?: string;
  servingSize?: string;
  preparationDate?: string;
  bestBefore?: string;
  storageInstructions?: string;
  isVeg?: boolean;
  spiceLevel?: 'mild' | 'medium' | 'spicy';
}

interface CategoryPageProps {
  category: string;
  onBack: () => void;
}

const CategoryPage: React.FC<CategoryPageProps> = ({ category, onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'popular'>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  
  // Use a stack for product modal navigation (like HomePage)
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);
  
  const { settings } = useProductLanguage();

  // Updated category system with Fast Food included - Food category now directly shows Fast Food products
  const categoryMapping: { [key: string]: Array<{
    id: string;
    name_en: string;
    name_ml: string;
    name_manglish: string;
    image: string;
  }> } = {
    'Grocery & Kitchen': [
      { id: 'Fruits and Vegetables', name_en: 'Fruits and Vegetables', name_ml: 'പഴങ്ങളും പച്ചക്കറികളും', name_manglish: 'Pazham & Pachakkari', image: '/api/placeholder/80/80' },
      { id: 'Rice, Atta & Dal', name_en: 'Rice, Atta & Dal', name_ml: 'അരി, ആട്ട, പയർ', name_manglish: 'Ari, Atta & Payar', image: '/api/placeholder/80/80' },
      { id: 'Oil, Ghee & Masala', name_en: 'Oil, Ghee & Masala', name_ml: 'എണ്ണ, നെയ്യ്, മസാല', name_manglish: 'Enna, Ghee & Masala', image: '/api/placeholder/80/80' },
      { id: 'Dairy, Breads & Eggs', name_en: 'Dairy, Breads & Eggs', name_ml: 'പാൽ ഉൽപ്പന്നങ്ങൾ, ബ്രെഡ്, മുട്ട', name_manglish: 'Paal, Bread & Mutta', image: '/api/placeholder/80/80' },
      { id: 'Chicken, Meat & Fish', name_en: 'Chicken, Meat & Fish', name_ml: 'കോഴി, മാംസം, മത്സ്യം', name_manglish: 'Kozhi, Meat & Fish', image: '/api/placeholder/80/80' },
      { id: 'Kitchenware & Appliances', name_en: 'Kitchenware & Appliances', name_ml: 'അടുക്കള സാധനങ്ങൾ', name_manglish: 'Kitchen Sadhanangal', image: '/api/placeholder/80/80' }
    ],
    'Snacks & Drinks': [
      { id: 'Chips', name_en: 'Chips', name_ml: 'ചിപ്സ്', name_manglish: 'Chips', image: '/api/placeholder/80/80' },
      { id: 'Sweet Chocolates', name_en: 'Sweet Chocolates', name_ml: 'മധുര ചോക്ലേറ്റുകൾ', name_manglish: 'Sweet Chocolates', image: '/api/placeholder/80/80' },
      { id: 'Bakery and Biscuits', name_en: 'Bakery and Biscuits', name_ml: 'ബേക്കറിയും ബിസ്കറ്റും', name_manglish: 'Bakery & Biscuits', image: '/api/placeholder/80/80' },
      { id: 'Drinks and Juices', name_en: 'Drinks and Juices', name_ml: 'പാനീയങ്ങളും ജ്യൂസുകളും', name_manglish: 'Drinks & Juices', image: '/api/placeholder/80/80' },
      { id: 'Tea, Coffee & Milk Drinks', name_en: 'Tea, Coffee & Milk Drinks', name_ml: 'ചായ, കാപ്പി, പാൽ പാനീയങ്ങൾ', name_manglish: 'Tea, Coffee & Milk Drinks', image: '/api/placeholder/80/80' },
      { id: 'Instant Food', name_en: 'Instant Food', name_ml: 'ഇൻസ്റ്റന്റ് ഫുഡ്', name_manglish: 'Instant Food', image: '/api/placeholder/80/80' }
    ],
    'Beauty & Personal Care': [
      { id: 'Bath & Body', name_en: 'Bath & Body', name_ml: 'കുളിയും ശരീര പരിചരണവും', name_manglish: 'Bath & Body', image: '/api/placeholder/80/80' },
      { id: 'Hair', name_en: 'Hair', name_ml: 'മുടി പരിചരണം', name_manglish: 'Hair Care', image: '/api/placeholder/80/80' },
      { id: 'Skin & Face', name_en: 'Skin & Face', name_ml: 'ചർമ്മവും മുഖ പരിചരണവും', name_manglish: 'Skin & Face Care', image: '/api/placeholder/80/80' },
      { id: 'Feminine Hygiene', name_en: 'Feminine Hygiene', name_ml: 'സ്ത്രീകളുടെ ശുചിത്വം', name_manglish: 'Feminine Hygiene', image: '/api/placeholder/80/80' },
      { id: 'Baby Care', name_en: 'Baby Care', name_ml: 'കുഞ്ഞുങ്ങളുടെ പരിചരണം', name_manglish: 'Baby Care', image: '/api/placeholder/80/80' },
      { id: 'Beauty and Cosmetics', name_en: 'Beauty and Cosmetics', name_ml: 'സൗന്ദര്യവും സൗന്ദര്യവർദ്ധക വസ്തുക്കളും', name_manglish: 'Beauty & Cosmetics', image: '/api/placeholder/80/80' }
    ],
    'Household Essentials': [
      { id: 'Home & Lifestyle', name_en: 'Home & Lifestyle', name_ml: 'ഹോമും ലൈഫ്സ്റ്റൈലും', name_manglish: 'Home & Lifestyle', image: '/api/placeholder/80/80' },
      { id: 'Cleaners & Repellents', name_en: 'Cleaners & Repellents', name_ml: 'ക്ലീനറും കീടനാശിനികളും', name_manglish: 'Cleaners & Repellents', image: '/api/placeholder/80/80' },
      { id: 'Electronics', name_en: 'Electronics', name_ml: 'ഇലക്ട്രോണിക്സ്', name_manglish: 'Electronics', image: '/api/placeholder/80/80' },
      { id: 'Stationery & Games', name_en: 'Stationery & Games', name_ml: 'സ്റ്റേഷനറിയും ഗെയിമുകളും', name_manglish: 'Stationery & Games', image: '/api/placeholder/80/80' }
    ]
  };

  // Get subcategory display name based on language settings
  const getSubcategoryDisplayName = (subcategory: {
    name_en: string;
    name_ml: string;
    name_manglish: string;
  }) => {
    switch (settings.mode) {
      case 'english-malayalam':
        return `${subcategory.name_en} / ${subcategory.name_ml}`;
      case 'english-manglish':
        return `${subcategory.name_en} / ${subcategory.name_manglish}`;
      case 'single':
        switch (settings.singleLanguage) {
          case 'malayalam':
            return subcategory.name_ml;
          case 'manglish':
            return subcategory.name_manglish;
          default:
            return subcategory.name_en;
        }
      default:
        return subcategory.name_en;
    }
  };

  // Check if this is a main category and get subcategories (memoized to prevent infinite re-renders)
  const isMainCategory = categoryMapping[category] !== undefined;
  const subcategories = useMemo(() =>
    isMainCategory ? categoryMapping[category] : [],
    [category, isMainCategory]
  );

  // Handle subcategory selection with browser history
  const handleSubcategorySelect = useCallback((subcategoryId: string | null) => {
    if (subcategoryId === selectedSubcategory) {
      // Clear filter
      setSelectedSubcategory(null);
      window.history.back();
    } else {
      // Select subcategory
      setSelectedSubcategory(subcategoryId);
      window.history.pushState({ subcategory: subcategoryId }, '');
    }
  }, [selectedSubcategory]);

  // Handle product modal open (push to stack and history)
  const handleProductClick = useCallback(async (productId: string) => {
    // Find the product in current list first
    let product = products.find(p => p.id === productId);

    if (!product) {
      // If not found, fetch from Firestore (shouldn't happen in category view, but safety)
      try {
        const productDoc = await getDocs(query(collection(db, 'products'), where('__name__', '==', productId)));
        if (!productDoc.empty) {
          product = { id: productDoc.docs[0].id, ...productDoc.docs[0].data() } as Product;
        }
      } catch (error) {
        console.error('Error fetching product details:', error);
        return;
      }
    }

    if (product) {
      window.history.pushState({ productModal: true, productId }, '');
      setProductModalStack(prev => {
        // Prevent duplicate push if already top of stack
        if (prev.length && prev[prev.length - 1].id === product.id) return prev;
        return [...prev, product];
      });
    }
  }, [products]);

  // Handle modal close/back (just trigger history back)
  const handleProductModalBack = useCallback(() => {
    window.history.back();
  }, []);

  // When opening a similar product from inside the modal
  const handleProductSelectFromModal = useCallback((newProduct: Product) => {
    window.history.pushState({ productModal: true, productId: newProduct.id }, '');
    setProductModalStack(prev => {
      // Prevent duplicate push if already top of stack
      if (prev.length && prev[prev.length - 1].id === newProduct.id) return prev;
      return [...prev, newProduct];
    });
  }, []);

  // Handle browser back button navigation
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // Check if modal is open
      if (productModalStack.length > 0) {
        setProductModalStack(prev => {
          if (prev.length > 0) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } else if (selectedSubcategory) {
        // Clear subcategory filter
        setSelectedSubcategory(null);
      }
    };
    
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [productModalStack.length, selectedSubcategory]);

  // Telegram WebApp BackButton integration
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    if (productModalStack.length > 0) {
      // Modal is open
      tg.BackButton.show();
      tg.BackButton.onClick(handleProductModalBack);
    } else if (selectedSubcategory) {
      // Subcategory filter is active
      tg.BackButton.show();
      tg.BackButton.onClick(() => setSelectedSubcategory(null));
    } else {
      // Main category view
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }

    return () => {
      if (tg.BackButton) {
        tg.BackButton.offClick(handleProductModalBack);
        tg.BackButton.offClick(() => setSelectedSubcategory(null));
        tg.BackButton.offClick(onBack);
      }
    };
  }, [productModalStack.length, selectedSubcategory, handleProductModalBack, onBack]);

  // Scroll to top when component mounts or category changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [category]);

  useEffect(() => {
    async function fetchCategoryProducts() {
      setLoading(true);
      try {
        console.log('🔍 [CategoryPage] Fetching products for category:', category, 'subcategory:', selectedSubcategory);

        let fetchedProducts: Product[] = [];

        if (selectedSubcategory) {
          // Fetch products for specific subcategory
          console.log('📂 Fetching products for subcategory:', selectedSubcategory);
          const q = query(collection(db, 'products'), where('category', '==', selectedSubcategory));
          const snap = await getDocs(q);
          fetchedProducts = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Product));
        } else if (category === 'Food') {
          // Special case: Food category directly shows Fast Food products
          console.log('📂 Food category detected, fetching Fast Food products directly');
          const q = query(collection(db, 'products'), where('category', '==', 'Fast Food'));
          const snap = await getDocs(q);
          fetchedProducts = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Product));
        } else if (isMainCategory) {
          // This is a main category, fetch products from all subcategories
          console.log('📂 Main category detected, fetching from subcategories:', subcategories.map(s => s.id));

          // Fetch all products and filter by subcategories
          const allProductsQuery = collection(db, 'products');
          const allProductsSnapshot = await getDocs(allProductsQuery);

          fetchedProducts = allProductsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Product))
            .filter(product =>
              product.category && subcategories.some(sub => sub.id === product.category)
            );
        } else {
          // This is a direct subcategory, fetch normally
          console.log('📂 Direct subcategory detected');
          const q = query(collection(db, 'products'), where('category', '==', category));
          const snap = await getDocs(q);
          fetchedProducts = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Product));
        }

        // Filter out unavailable products
        fetchedProducts = fetchedProducts.filter(product => product.available !== false);

        console.log('📦 [CategoryPage] Fetched products count:', fetchedProducts.length);
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching category products:', error);
      } finally {
        setLoading(false);
      }
    }

    if (category) {
      fetchCategoryProducts();
    }
  }, [category, selectedSubcategory, isMainCategory, subcategories]);

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price':
        return (a.price || 0) - (b.price || 0);
      case 'name':
        return (a.name_en || a.name || '').localeCompare(b.name_en || b.name || '');
      case 'popular':
      default:
        return 0; // Keep original order for "popular"
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-3 p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{category}</h1>
          </div>
        </div>

        {/* Subcategory Skeleton for Main Categories - Hidden for Food category */}
        {isMainCategory && subcategories.length > 0 && category !== 'Food' && (
          <div className="bg-white border-b border-gray-100 px-4 py-4">
            <div className="flex items-center space-x-2 mb-3">
              <h3 className="text-sm font-medium text-gray-700">Shop by Category:</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {subcategories.map((subcategory) => (
                <div
                  key={subcategory.id}
                  className="flex flex-col items-center p-3 rounded-xl border-2 border-gray-200 bg-white"
                >
                  <div className="w-12 h-12 rounded-full mb-2 bg-gray-100 animate-pulse"></div>
                  <span className="text-xs font-medium text-center leading-tight text-gray-700">
                    {getSubcategoryDisplayName(subcategory)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-3 p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{category}</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-1 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Filter size={16} />
              <span className="text-sm">Filter</span>
            </button>
            <button
              onClick={() => {
                const options: Array<'popular' | 'price' | 'name'> = ['popular', 'price', 'name'];
                const currentIndex = options.indexOf(sortBy);
                const nextIndex = (currentIndex + 1) % options.length;
                setSortBy(options[nextIndex]);
              }}
              className="flex items-center space-x-1 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <SortAsc size={16} />
              <span className="text-sm capitalize">{sortBy}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              <button className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                Available
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                Price: Low to High
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                Rating: 4+ Stars
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subcategory Selector for Main Categories - Hidden for Food category */}
      {isMainCategory && subcategories.length > 0 && category !== 'Food' && (
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="flex items-center space-x-2 mb-3">
            <h3 className="text-sm font-medium text-gray-700">Shop by Category:</h3>
            {selectedSubcategory && (
              <button
                onClick={() => handleSubcategorySelect(null)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {subcategories.map((subcategory) => (
              <button
                key={subcategory.id}
                onClick={() => handleSubcategorySelect(
                  selectedSubcategory === subcategory.id ? null : subcategory.id
                )}
                className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 hover:shadow-md ${
                  selectedSubcategory === subcategory.id
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`w-12 h-12 rounded-full mb-2 overflow-hidden flex items-center justify-center ${
                  selectedSubcategory === subcategory.id ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <img
                    src={subcategory.image}
                    alt={subcategory.name_en}
                    className="w-8 h-8 object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling!.textContent = subcategory.name_en.charAt(0);
                    }}
                  />
                  <span className="text-lg font-semibold text-gray-600 hidden">
                    {subcategory.name_en.charAt(0)}
                  </span>
                </div>
                <span className={`text-xs font-medium text-center leading-tight ${
                  selectedSubcategory === subcategory.id ? 'text-green-700' : 'text-gray-700'
                }`}>
                  {getSubcategoryDisplayName(subcategory)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Product Count */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <p className="text-sm text-gray-600">
          {products.length} product{products.length !== 1 ? 's' : ''} found
          {selectedSubcategory && (
            <span className="text-green-600 font-medium ml-1">
              in {subcategories.find(s => s.id === selectedSubcategory)?.name_en}
            </span>
          )}
        </p>
      </div>

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {sortedProducts.map(product => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name_en || product.name || ''}
                malayalamName={product.name_ml}
                manglishName={product.name_manglish}
                price={product.price || 0}
                mrp={product.mrp}
                sellingPrice={product.sellingPrice}
                imageUrl={product.imageUrl}
                netQuantity={product.netQuantity}
                category={product.category}
                isVeg={product.isVeg}
                spiceLevel={product.spiceLevel}
                onProductClick={handleProductClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">No products found</h2>
          <p className="text-gray-600 text-center">
            We couldn't find any products in the "{category}" category.
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Browse Other Categories
          </button>
        </div>
      )}

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

export default CategoryPage;