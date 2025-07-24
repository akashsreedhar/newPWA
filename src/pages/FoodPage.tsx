import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ChefHat } from 'lucide-react';
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
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);
  const { settings } = useProductLanguage();

  // Premium food emojis for floating animation
  const floatingEmojis = ['🍕', '🍔', '🌭', '🌮', '🌯', '🥙', '🍗', '🍖', '🍟', '🥪', '🌶️', '🔥', '🥗', '🍜', '🍲', '🥘'];
  
  // Premium header emojis for sophisticated animation
  const headerEmojis = ['🍟', '🌯', '🍗', '🌶️', '🍕'];

  // Handle product modal open (push to stack and history)
  const handleProductClick = useCallback(async (productId: string) => {
    let product = products.find(p => p.id === productId);
    if (!product) {
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
        if (prev.length && prev[prev.length - 1].id === product.id) return prev;
        return [...prev, product];
      });
    }
  }, [products]);

  const handleProductModalBack = useCallback(() => {
    window.history.back();
  }, []);

  const handleProductSelectFromModal = useCallback((newProduct: Product) => {
    window.history.pushState({ productModal: true, productId: newProduct.id, foodPage: true }, '');
    setProductModalStack(prev => {
      if (prev.length && prev[prev.length - 1].id === newProduct.id) return prev;
      return [...prev, newProduct];
    });
  }, []);

  // Handle browser back button navigation
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (productModalStack.length > 0) {
        // Close modal
        setProductModalStack(prev => prev.slice(0, -1));
      } else {
        // Go back to home
        onBack();
      }
    };
    
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [productModalStack.length, onBack]);

  // Telegram WebApp BackButton integration
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    if (productModalStack.length > 0) {
      tg.BackButton.show();
      tg.BackButton.onClick(handleProductModalBack);
    } else {
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    async function fetchFoodProducts() {
      setLoading(true);
      try {
        const q = query(collection(db, 'products'), where('category', '==', 'Fast Food'));
        const snap = await getDocs(q);
        let fetchedProducts = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Product));
        fetchedProducts = fetchedProducts.filter(product => product.available !== false);
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching Fast Food products:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchFoodProducts();
  }, []);

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
          <p className="text-orange-100 mt-1 text-sm">1 Pm to 8 Pm</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Premium Food Emoji Animation */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-6 sticky top-0 z-10 shadow-lg relative overflow-hidden">
        
        {/* Premium Floating Food Emojis Background Animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {floatingEmojis.map((emoji, index) => (
            <div
              key={index}
              className="absolute text-base opacity-15 animate-premium-float"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${index * 0.8}s`,
                animationDuration: `${8 + (index % 4)}s`
              }}
            >
              {emoji}
            </div>
          ))}
        </div>

        {/* Sparkling Stars Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(8)].map((_, index) => (
            <div
              key={`star-${index}`}
              className="absolute text-xs opacity-30 animate-twinkle"
              style={{
                left: `${(index * 12.5) % 100}%`,
                top: `${20 + (index * 10) % 60}%`,
                animationDelay: `${index * 0.3}s`,
                animationDuration: `${2 + (index % 2)}s`
              }}
            >
              ✨
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between relative z-10">
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
                <p className="text-orange-100 text-sm">1 Pm to 8 Pm</p>
              </div>
            </div>
          </div>
          
          {/* Premium Animated Badge with Sophisticated Effects */}
          <div className="relative">
            <div className="flex items-center space-x-1 px-4 py-2 bg-gradient-to-r from-yellow-400/30 via-orange-400/30 to-red-400/30 backdrop-blur-sm rounded-full border border-white/20 shadow-lg">
              {headerEmojis.map((emoji, index) => (
                <span
                  key={index}
                  className="text-lg animate-premium-pulse"
                  style={{
                    animationDelay: `${index * 0.2}s`,
                    animationDuration: '2s'
                  }}
                >
                  {emoji}
                </span>
              ))}
            </div>
            {/* Glowing ring effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400/20 via-orange-400/20 to-red-400/20 animate-pulse-ring-premium"></div>
          </div>
        </div>

        {/* Premium Multi-Layer Wave Effect */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="h-1 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 opacity-80 animate-wave-flow"></div>
          <div className="h-0.5 bg-gradient-to-r from-red-400 via-pink-400 to-purple-400 opacity-60 animate-wave-flow-reverse"></div>
        </div>
      </div>

      {/* Product Count with Premium Animation */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 relative overflow-hidden">
        
        {/* Subtle Background Pattern Animation */}
        <div className="absolute inset-0 flex items-center justify-end opacity-8">
          <div className="flex space-x-4 text-xl">
            <span className="animate-gentle-pulse">🍽️</span>
            <span className="animate-gentle-pulse" style={{ animationDelay: '1s' }}>🥘</span>
            <span className="animate-gentle-pulse" style={{ animationDelay: '2s' }}>🍲</span>
          </div>
        </div>

        {/* Floating micro particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, index) => (
            <div
              key={`particle-${index}`}
              className="absolute w-1 h-1 bg-orange-300 rounded-full opacity-20 animate-micro-float"
              style={{
                left: `${15 + (index * 12)}%`,
                animationDelay: `${index * 0.5}s`,
                animationDuration: `${4 + (index % 2)}s`
              }}
            />
          ))}
        </div>

        <p className="text-sm text-gray-600 relative z-10">
          <span className="inline-flex items-center">
            <span className="mr-2 animate-gentle-bounce">🍴</span>
            {products.length} delicious item{products.length !== 1 ? 's' : ''} available
          </span>
        </p>
      </div>

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {products.map(product => (
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
          <div className="text-6xl mb-4 animate-bounce">🍽️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">No Fast Food items found</h2>
          <p className="text-gray-600 text-center mb-4">
            We're working on adding delicious Fast Food items to our menu.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
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

      {/* Premium Custom CSS Animations */}
      <style jsx>{`
        @keyframes premium-float {
          0% {
            transform: translateY(120vh) translateX(0px) rotate(0deg) scale(0.8);
            opacity: 0;
          }
          5% {
            opacity: 0.4;
          }
          25% {
            transform: translateY(75vh) translateX(20px) rotate(90deg) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translateY(40vh) translateX(-15px) rotate(180deg) scale(0.9);
            opacity: 0.25;
          }
          75% {
            transform: translateY(20vh) translateX(25px) rotate(270deg) scale(1.1);
            opacity: 0.2;
          }
          95% {
            opacity: 0.1;
          }
          100% {
            transform: translateY(-20vh) translateX(0px) rotate(360deg) scale(0.7);
            opacity: 0;
          }
        }

        @keyframes premium-pulse {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.2) rotate(5deg);
            opacity: 1;
          }
        }

        @keyframes twinkle {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1) rotate(0deg);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.3) rotate(180deg);
          }
        }

        @keyframes pulse-ring-premium {
          0%, 100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.1;
          }
        }

        @keyframes wave-flow {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes wave-flow-reverse {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        @keyframes gentle-pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.05);
          }
        }

        @keyframes gentle-bounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }

        @keyframes micro-float {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
            opacity: 0.1;
          }
          50% {
            transform: translateY(-15px) translateX(5px);
            opacity: 0.3;
          }
        }

        .animate-premium-float {
          animation: premium-float linear infinite;
        }

        .animate-premium-pulse {
          animation: premium-pulse ease-in-out infinite;
        }

        .animate-twinkle {
          animation: twinkle ease-in-out infinite;
        }

        .animate-pulse-ring-premium {
          animation: pulse-ring-premium 3s ease-in-out infinite;
        }

        .animate-wave-flow {
          animation: wave-flow 3s linear infinite;
        }

        .animate-wave-flow-reverse {
          animation: wave-flow-reverse 4s linear infinite;
        }

        .animate-gentle-pulse {
          animation: gentle-pulse 3s ease-in-out infinite;
        }

        .animate-gentle-bounce {
          animation: gentle-bounce 2s ease-in-out infinite;
        }

        .animate-micro-float {
          animation: micro-float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default FoodPage;