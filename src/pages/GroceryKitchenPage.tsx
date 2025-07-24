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

interface GroceryKitchenPageProps {
  onBack: () => void;
  onNavigateToCategory: (category: string) => void;
  onSearchOpen: () => void;
  setIsModalOpen?: (open: boolean) => void; // <-- Add this prop
}

const GroceryKitchenPage: React.FC<GroceryKitchenPageProps> = ({
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

  // Grocery & Kitchen subcategories - New modern categories
  const subcategories = [
    {
      id: 'Fruits and Vegetables',
      name_en: 'Fruits and Vegetables',
      name_ml: 'പഴങ്ങളും പച്ചക്കറികളും',
      name_manglish: 'Pazham & Pachakkari',
      image: 'https://media.istockphoto.com/id/1206517226/photo/seamless-horizontal-pattern-colorful-vegetables-and-fruits.jpg?s=170667a&w=0&k=20&c=2UFELD1ezWS--xxvYQXDEhdDB_gxgOrYB_2sYT7EJRE=',
      description: 'Fresh fruits and vegetables',
      malayalamDescription: 'പുതിയ പഴങ്ങളും പച്ചക്കറികളും'
    },
    {
      id: 'Rice, Atta & Dal',
      name_en: 'Rice, Atta & Dal',
      name_ml: 'അരി, ആട്ട, പയർ',
      name_manglish: 'Ari, Atta & Payar',
      image: 'https://media.istockphoto.com/id/1239195602/photo/rice-on-table-against-the-green-field.jpg?s=612x612&w=0&k=20&c=AFZcdaFJalGzKH4o0uCniwf7UWByPlziRhvS1wiLp8I=',
      description: 'Rice, flour and lentils',
      malayalamDescription: 'അരി, മാവ്, പയർവർഗങ്ങൾ'
    },
    {
      id: 'Oil, Ghee & Masala',
      name_en: 'Oil, Ghee & Masala',
      name_ml: 'എണ്ണ, നെയ്യ്, മസാല',
      name_manglish: 'Enna, Ghee & Masala',
      image: 'https://zeecart.in/media/wysiwyg/slidershow/foodgrains.jpg',
      description: 'Cooking oils, ghee and spices',
      malayalamDescription: 'പാചക എണ്ണ, നെയ്യ്, മസാലകൾ'
    },
    {
      id: 'Dairy, Breads & Eggs',
      name_en: 'Dairy, Breads & Eggs',
      name_ml: 'പാൽ ഉൽപ്പന്നങ്ങൾ, ബ്രെഡ്, മുട്ട',
      name_manglish: 'Paal, Bread & Mutta',
      image: 'https://thumbs.dreamstime.com/b/cheese-bread-milk-eggs-17775774.jpg',
      description: 'Milk, curd, bread and eggs',
      malayalamDescription: 'പാൽ, തൈര്, ബ്രെഡ്, മുട്ട'
    },
    {
      id: 'Chicken, Meat & Fish',
      name_en: 'Chicken, Meat & Fish',
      name_ml: 'കോഴി, മാംസം, മത്സ്യം',
      name_manglish: 'Kozhi, Meat & Fish',
      image: 'https://img.freepik.com/premium-photo/assortment-meat-seafood-beef-chicken-fish-pork_996271-13971.jpg',
      description: 'Fresh chicken, meat and fish',
      malayalamDescription: 'പുതിയ കോഴി, മാംസം, മത്സ്യം'
    },
    {
      id: 'Kitchenware & Appliances',
      name_en: 'Kitchenware & Appliances',
      name_ml: 'അടുക്കള സാധനങ്ങൾ',
      name_manglish: 'Kitchen Sadhanangal',
      image: 'https://www.kent.co.in/images/kitchen-appliances/about-kent-modern-kitchen-appliancess-thumbnail.jpg',
      description: 'Kitchen tools and appliances',
      malayalamDescription: 'അടുക്കള ഉപകരണങ്ങൾ'
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

  // Fetch featured products from grocery subcategories
  useEffect(() => {
    async function fetchFeaturedProducts() {
      setLoading(true);
      try {
        const groceryCategories = [
          'Fruits and Vegetables',
          'Rice, Atta & Dal',
          'Oil, Ghee & Masala',
          'Dairy, Breads & Eggs',
          'Chicken, Meat & Fish',
          'Kitchenware & Appliances'
        ];

        const allProductsQuery = collection(db, 'products');
        const allProductsSnapshot = await getDocs(allProductsQuery);

        const groceryProducts = allProductsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product =>
            product.category &&
            groceryCategories.includes(product.category) &&
            product.available !== false
          )
          .slice(0, 10);

        setFeaturedProducts(groceryProducts);
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
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-3 p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Grocery & Kitchen</h1>
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
            <span>Search for fruits, vegetables, rice, oil...</span>
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
            <div className="text-gray-400 mb-2">📦</div>
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

export default GroceryKitchenPage;