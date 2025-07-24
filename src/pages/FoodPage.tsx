import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Filter, SortAsc, ChefHat } from 'lucide-react';
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
}

interface FoodPageProps {
  onBack: () => void;
}

const FoodPage: React.FC<FoodPageProps> = ({ onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'popular'>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const [priceFilter, setPriceFilter] = useState<'all' | 'under50' | '50-100' | 'over100'>('all');
  
  // Use a stack for product modal navigation
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);
  
  const { settings } = useProductLanguage();

  // Food category specific filters
  const foodTypes = [
    { id: 'all', label: 'All Items', emoji: '🍽️' },
    { id: 'shawarma', label: 'Shawarma', emoji: '🥙' },
    { id: 'alfam', label: 'Alfam', emoji: '🍖' },
    { id: 'chicken', label: 'Chicken', emoji: '🍗' },
    { id: 'burger', label: 'Burgers', emoji: '🍔' },
    { id: 'pizza', label: 'Pizza', emoji: '🍕' },
    { id: 'biryani', label: 'Biryani', emoji: '🍛' }
  ];

  const [selectedFoodType, setSelectedFoodType] = useState('all');

  // Handle product modal open (push to stack and history)
  const handleProductClick = useCallback(async (productId: string) => {
    // Find the product in current list first
    let product = products.find(p => p.id === productId);

    if (!product) {
      // If not found, fetch from Firestore
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
      window.history.pushState({ productModal: true, productId, foodPage: true }, '');
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
    window.history.pushState({ productModal: true, productId: newProduct.id, foodPage: true }, '');
    setProductModalStack(prev => {
      // Prevent duplicate push if already top of stack
      if (prev.length && prev[prev.length - 1].id === newProduct.id) return prev;
      return [...prev, newProduct];
    });
  }, []);

  // Handle browser back button navigation - Perfect Native App Behavior
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // Check if we have a product modal open
      if (productModalStack.length > 0) {
        // Close the modal and return to food page
        setProductModalStack(prev => {
          if (prev.length > 0) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } else {
        // If no modal is open and back is pressed, we should go back to home
        // This is handled by the parent component via onBack
      }
    };
    
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [productModalStack.length]);

  // Telegram WebApp BackButton integration - Perfect Native App Behavior
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    if (productModalStack.length > 0) {
      // Modal is open - back button should close modal
      tg.BackButton.show();
      tg.BackButton.onClick(handleProductModalBack);
    } else {
      // Main food page view - back button should go to home
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }

    return () => {
      if (tg.BackButton) {
        tg.BackButton.offClick(handleProductModalBack);
        tg.BackButton.offClick(onBack);
      }
    };
  }, [productModalStack.length, handleProductModalBack, onBack]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    async function fetchFoodProducts() {
      setLoading(true);
      try {
        console.log('🔍 [FoodPage] Fetching Fast Food products');

        // Fetch products with "Fast Food" category
        const q = query(collection(db, 'products'), where('category', '==', 'Fast Food'));
        const snap = await getDocs(q);
        
        let fetchedProducts = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Product));

        // Filter out unavailable products
        fetchedProducts = fetchedProducts.filter(product => product.available !== false);

        console.log('📦 [FoodPage] Fetched Fast Food products count:', fetchedProducts.length);
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching Fast Food products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchFoodProducts();
  }, []);

  // Filter products based on selected filters
  const filteredProducts = products.filter(product => {
    // Food type filter
    if (selectedFoodType !== 'all') {
      const productName = (product.name_en || product.name || '').toLowerCase();
      const productDescription = (product.description || '').toLowerCase();
      const searchText = productName + ' ' + productDescription;
      
      switch (selectedFoodType) {
        case 'shawarma':
          if (!searchText.includes('shawarma')) return false;
          break;
        case 'alfam':
          if (!searchText.includes('alfam')) return false;
          break;
        case 'chicken':
          if (!searchText.includes('chicken') && !searchText.includes('fried')) return false;
          break;
        case 'burger':
          if (!searchText.includes('burger')) return false;
          break;
        case 'pizza':
          if (!searchText.includes('pizza')) return false;
          break;
        case 'biryani':
          if (!searchText.includes('biryani')) return false;
          break;
      }
    }

    // Price filter
    const price = product.sellingPrice || product.price || 0;
    switch (priceFilter) {
      case 'under50':
        if (price >= 50) return false;
        break;
      case '50-100':
        if (price < 50 || price > 100) return false;
        break;
      case 'over100':
        if (price <= 100) return false;
        break;
    }

    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price':
        return (a.sellingPrice || a.price || 0) - (b.sellingPrice || b.price || 0);
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
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-6 sticky top-0 z-10">
          <div className="flex items-center">
            <button 
              onClick={onBack} 
              className="mr-3 p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Go back to home"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center">
              <ChefHat size={24} className="mr-2" />
              <h1 className="text-xl font-bold">Fast Food</h1>
            </div>
          </div>
          <p className="text-orange-100 mt-1 text-sm">Delicious Shawarma, Alfam, Fried Chicken and more</p>
        </div>

        {/* Loading */}
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-6 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button 
              onClick={onBack} 
              className="mr-3 p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Go back to home"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center">
              <ChefHat size={24} className="mr-2" />
              <div>
                <h1 className="text-xl font-bold">Fast Food</h1>
                <p className="text-orange-100 text-sm">Delicious Shawarma, Alfam, Fried Chicken and more</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-1 px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
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
              className="flex items-center space-x-1 px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              <SortAsc size={16} />
              <span className="text-sm capitalize">{sortBy}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="space-y-3">
              {/* Price Filter */}
              <div>
                <h4 className="text-sm font-medium mb-2">Price Range</h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'All Prices' },
                    { id: 'under50', label: 'Under ₹50' },
                    { id: '50-100', label: '₹50 - ₹100' },
                    { id: 'over100', label: 'Over ₹100' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setPriceFilter(filter.id as any)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        priceFilter === filter.id
                          ? 'bg-white text-orange-600 font-medium'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Food Type Selector */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center space-x-2 mb-3">
          <h3 className="text-sm font-medium text-gray-700">Food Types:</h3>
          {selectedFoodType !== 'all' && (
            <button
              onClick={() => setSelectedFoodType('all')}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex overflow-x-auto space-x-3 pb-2">
          {foodTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedFoodType(type.id)}
              className={`flex-shrink-0 flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 hover:shadow-md min-w-[80px] ${
                selectedFoodType === type.id
                  ? 'border-orange-500 bg-orange-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`text-2xl mb-1 ${
                selectedFoodType === type.id ? 'transform scale-110' : ''
              }`}>
                {type.emoji}
              </div>
              <span className={`text-xs font-medium text-center leading-tight ${
                selectedFoodType === type.id ? 'text-orange-700' : 'text-gray-700'
              }`}>
                {type.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Product Count */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <p className="text-sm text-gray-600">
          {sortedProducts.length} product{sortedProducts.length !== 1 ? 's' : ''} found
          {selectedFoodType !== 'all' && (
            <span className="text-orange-600 font-medium ml-1">
              in {foodTypes.find(t => t.id === selectedFoodType)?.label}
            </span>
          )}
        </p>
      </div>

      {/* Products Grid */}
      {sortedProducts.length > 0 ? (
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
                onProductClick={handleProductClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="text-6xl mb-4">🍽️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">No Fast Food items found</h2>
          <p className="text-gray-600 text-center mb-4">
            {selectedFoodType !== 'all' || priceFilter !== 'all'
              ? "Try adjusting your filters to see more items."
              : "We're working on adding delicious Fast Food items to our menu."}
          </p>
          {(selectedFoodType !== 'all' || priceFilter !== 'all') && (
            <button
              onClick={() => {
                setSelectedFoodType('all');
                setPriceFilter('all');
              }}
              className="mb-3 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              Clear All Filters
            </button>
          )}
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
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

export default FoodPage;