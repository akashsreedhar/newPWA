import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
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

interface BeautyPersonalCarePageProps {
  onBack: () => void;
  onNavigateToCategory: (category: string) => void;
  onSearchOpen: () => void;
  setIsModalOpen?: (open: boolean) => void; // <-- Add this prop
}

const BeautyPersonalCarePage: React.FC<BeautyPersonalCarePageProps> = ({
  onBack,
  onNavigateToCategory,
  onSearchOpen,
  setIsModalOpen
}) => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal stack for navigation
  const [productModalStack, setProductModalStack] = useState<Product[]>([]);

  const { settings } = useProductLanguage();

  // Beauty & Personal Care subcategories - New modern categories
  const subcategories = [
    { 
      id: 'Bath & Body', 
      name_en: 'Bath & Body', 
      name_ml: 'കുളിയും ശരീര പരിചരണവും', 
      name_manglish: 'Bath & Body',
      image: 'https://d3mvlb3hz2g78.cloudfront.net/wp-content/uploads/2018/10/thumb_720_450_dreamstime_l_115251617.jpg',
      description: 'Soaps, shower gels and body care',
      malayalamDescription: 'സോപ്പുകൾ, ഷവർ ജെൽ, ശരീര പരിചരണം'
    },
    { 
      id: 'Hair', 
      name_en: 'Hair', 
      name_ml: 'മുടി പരിചരണം', 
      name_manglish: 'Hair Care',
      image: 'https://media.istockphoto.com/id/182177857/photo/woman-washing-her-hair-with-shampoo.jpg?s=612x612&w=0&k=20&c=7TBvz-4iF9bJbnONoPOb9mKYvh_1VfhBQ-ShhQLei2E=',
      description: 'Shampoo, conditioner and hair oils',
      malayalamDescription: 'ഷാംപൂ, കണ്ടീഷണർ, മുടി എണ്ണകൾ'
    },
    { 
      id: 'Skin & Face', 
      name_en: 'Skin & Face', 
      name_ml: 'ചർമ്മവും മുഖ പരിചരണവും', 
      name_manglish: 'Skin & Face Care',
      image: 'https://st2.depositphotos.com/1441511/11709/i/450/depositphotos_117094612-Skin-Care-Product-Womans-Hands-Holding-Beauty-Cream-Lotion.jpg',
      description: 'Face creams, lotions and moisturizers',
      malayalamDescription: 'ഫേസ് ക്രീമുകൾ, ലോഷനുകൾ, മോയിസ്ചറൈസറുകൾ'
    },
    { 
      id: 'Feminine Hygiene', 
      name_en: 'Feminine Hygiene', 
      name_ml: 'സ്ത്രീകളുടെ ശുചിത്വം', 
      name_manglish: 'Feminine Hygiene',
      image: 'https://media6.ppl-media.com//tr:h-235,w-235,c-at_max,dpr-2,q-40/static/img/product/387999/stayfree-advanced-all-nights-ultra-soft-xxl-28s_1_display_1733215455_2df88356.jpg',
      description: 'Feminine hygiene products',
      malayalamDescription: 'സ്ത്രീകളുടെ ശുചിത്വ ഉൽപ്പന്നങ്ങൾ'
    },
    { 
      id: 'Baby Care', 
      name_en: 'Baby Care', 
      name_ml: 'കുഞ്ഞുങ്ങളുടെ പരിചരണം', 
      name_manglish: 'Baby Care',
      image: 'https://static.vecteezy.com/system/resources/thumbnails/049/218/180/small_2x/best-selling-natural-and-organic-baby-care-products-photo.jpeg',
      description: 'Baby products and diapers',
      malayalamDescription: 'കുഞ്ഞിന്റെ സാധനങ്ങൾ, ഡയപ്പറുകൾ'
    },
    { 
      id: 'Beauty and Cosmetics', 
      name_en: 'Beauty and Cosmetics', 
      name_ml: 'സൗന്ദര്യവും സൗന്ദര്യവർദ്ധക വസ്തുക്കളും', 
      name_manglish: 'Beauty & Cosmetics',
      image: 'https://thumbs.dreamstime.com/b/make-up-items-pink-color-background-horizontal-web-banner-set-luxury-decorative-cosmetics-flat-lay-top-view-mockup-mock-163919886.jpg',
      description: 'Makeup and beauty products',
      malayalamDescription: 'മേക്കപ്പും സൗന്ദര്യ ഉൽപ്പന്നങ്ങളും'
    }
  ];

  // Get subcategory display name based on language settings
  const getSubcategoryDisplayName = (subcategory: {
    name_en: string;
    name_ml: string;
    name_manglish: string;
  }) => {
    switch (settings.mode) {
      case 'english-malayalam':
        return `${subcategory.name_en}\n${subcategory.name_ml}`;
      case 'english-manglish':
        return `${subcategory.name_en}\n${subcategory.name_manglish}`;
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

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Fetch featured products from beauty subcategories
  useEffect(() => {
    async function fetchFeaturedProducts() {
      setLoading(true);
      try {
        const beautyCategories = [
          'Bath & Body',
          'Hair',
          'Skin & Face',
          'Feminine Hygiene',
          'Baby Care',
          'Beauty and Cosmetics'
        ];

        const allProductsQuery = collection(db, 'products');
        const allProductsSnapshot = await getDocs(allProductsQuery);

        const beautyProducts = allProductsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product =>
            product.category &&
            beautyCategories.includes(product.category) &&
            product.available !== false
          )
          .slice(0, 10);

        setFeaturedProducts(beautyProducts);
      } catch (error) {
        console.error('Error fetching featured products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchFeaturedProducts();
  }, []);

  // Modal navigation logic (stack + history)
  const handleProductClick = useCallback(async (productId: string) => {
    let product = featuredProducts.find(p => p.id === productId);

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
      window.history.pushState({ productModal: true, productId }, '');
      setProductModalStack(prev => {
        if (prev.length && prev[prev.length - 1].id === product.id) return prev;
        return [...prev, product];
      });
    }
  }, [featuredProducts]);

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

  // Listen for browser back button and handle modal stack properly
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

  // Notify parent (App.tsx) if modal is open or closed
  useEffect(() => {
    if (setIsModalOpen) {
      setIsModalOpen(productModalStack.length > 0);
    }
  }, [productModalStack.length, setIsModalOpen]);

  // Telegram WebApp BackButton integration for modal stack
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

  const handleSubcategoryClick = (subcategoryId: string) => {
    onNavigateToCategory(subcategoryId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
<div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-3 p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Beauty & Personal Care</h1>
          </div>
          <button
            onClick={onSearchOpen}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      {/* Subcategories Section */}
      <div className="bg-white border-b border-gray-100 px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Shop by Category</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {subcategories.map((subcategory) => (
            <div
              key={subcategory.id}
              onClick={() => handleSubcategoryClick(subcategory.id)}
              className="relative overflow-hidden rounded-2xl border-2 border-gray-100 bg-white hover:border-green-200 hover:shadow-lg transition-all duration-300 cursor-pointer group"
            >
              {/* Large Image Container */}
              <div className="relative h-32 sm:h-36 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-t-2xl">
                <img 
                  src={subcategory.image} 
                  alt={subcategory.name_en}
                  className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-300"
                  loading="lazy"
                  style={{ 
                    objectPosition: 'center center',
                    filter: 'brightness(1.05) contrast(1.02)'
                  }}
                />
                {/* Subtle overlay for better text contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent"></div>
              </div>
              
              {/* Text Content */}
              <div className="relative p-4">
                <h3 className="text-sm font-semibold text-gray-900 leading-tight mb-1 whitespace-pre-line">
                  {getSubcategoryDisplayName(subcategory)}
                </h3>
                <p className="text-xs text-gray-600 line-clamp-2">
                  {settings.mode === 'single' && settings.singleLanguage === 'malayalam' 
                    ? subcategory.malayalamDescription 
                    : subcategory.description}
                </p>
              </div>
              
              {/* Hover indicator */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search Prompt */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <button
          onClick={onSearchOpen}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-left text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center">
            <Search size={18} className="mr-3" />
            <span>Search for shampoo, soap, cosmetics, baby care...</span>
          </div>
        </button>
      </div>

      {/* Featured Products Section */}
      <div className="px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Featured Products</h2>
        
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="bg-white rounded-xl p-3 shadow-sm animate-pulse">
                <div className="aspect-square bg-gray-200 rounded-lg mb-3"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product) => (
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
                onProductClick={() => handleProductClick(product.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">💄</div>
            <p className="text-gray-500">No featured products available</p>
          </div>
        )}
      </div>

      {/* Product Detail Modal with stack navigation */}
      {productModalStack.length > 0 && (
        <ProductDetailModal
          product={{
            ...productModalStack[productModalStack.length - 1],
            price: productModalStack[productModalStack.length - 1].price || 0
          }}
          isOpen={true}
          onClose={handleProductModalBack}
          onProductSelect={handleProductSelectFromModal}
        />
      )}
    </div>
  );
};

export default BeautyPersonalCarePage;