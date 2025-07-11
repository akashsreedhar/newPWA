import React, { useEffect, useState } from 'react';
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
  imageUrl?: string;
  available?: boolean;
  description?: string;
  netQuantity?: string;
  manufacturerNameAddress?: string;
  countryOfOrigin?: string;
  customerSupportDetails?: string;
}

interface SnacksDrinksPageProps {
  onBack: () => void;
  onNavigateToCategory: (category: string) => void;
  onSearchOpen: () => void;
}

const SnacksDrinksPage: React.FC<SnacksDrinksPageProps> = ({ 
  onBack, 
  onNavigateToCategory,
  onSearchOpen 
}) => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const { settings } = useProductLanguage();

  // Snacks & Drinks subcategories - New modern categories
  const subcategories = [
    { 
      id: 'Chips', 
      name_en: 'Chips', 
      name_ml: 'ചിപ്സ്', 
      name_manglish: 'Chips',
      image: 'https://thumbs.dreamstime.com/b/packets-lays-potato-chips-poznan-poland-dec-lay-s-popular-american-brand-founded-owned-pepsico-135975194.jpg',
      description: 'Potato chips and snacks',
      malayalamDescription: 'ചിപ്സുകളും സ്നാക്സുകളും'
    },
    { 
      id: 'Sweet Chocolates', 
      name_en: 'Sweet Chocolates', 
      name_ml: 'മധുര ചോക്ലേറ്റുകൾ', 
      name_manglish: 'Madhura Chocolates',
      image: 'https://www.shutterstock.com/image-photo/broken-dark-chocolate-bar-cocoa-600nw-2449877063.jpg',
      description: 'Chocolates and sweet treats',
      malayalamDescription: 'ചോക്ലേറ്റുകളും മധുരപലഹാരങ്ങളും'
    },
    { 
      id: 'Bakery and Biscuits', 
      name_en: 'Bakery and Biscuits', 
      name_ml: 'ബേക്കറിയും ബിസ്കറ്റും', 
      name_manglish: 'Bakery & Biscuits',
      image: 'https://4.imimg.com/data4/MS/HC/MY-23547870/bakery-biscuit-500x500.jpg',
      description: 'Bread, biscuits and bakery items',
      malayalamDescription: 'ബ്രെഡ്, ബിസ്കറ്റ്, ബേക്കറി സാധനങ്ങൾ'
    },
    { 
      id: 'Drinks and Juices', 
      name_en: 'Drinks and Juices', 
      name_ml: 'പാനീയങ്ങളും ജ്യൂസുകളും', 
      name_manglish: 'Drinks & Juices',
      image: 'https://media.istockphoto.com/id/1370895233/vector/juice-packages-carton-boxes-fruit-drinks-bottles.jpg?s=612x612&w=0&k=20&c=5HITDdbyBNuFzXlOBQR-k38GYTZ62rsadKJPDYcS7_M=',
      description: 'Soft drinks and fruit juices',
      malayalamDescription: 'ശീതളപാനീയങ്ങളും ഫ്രൂട്ട് ജ്യൂസുകളും'
    },
    { 
      id: 'Tea, Coffee & Milk Drinks', 
      name_en: 'Tea, Coffee & Milk Drinks', 
      name_ml: 'ചായ, കാപ്പി, പാൽ പാനീയങ്ങൾ', 
      name_manglish: 'Tea, Coffee & Milk Drinks',
      image: 'https://assets-global.website-files.com/5ee7039040ea6efb80d7521c/5fec543f57cf9ed51bab411e_image6-2.jpg',
      description: 'Tea, coffee and milk drinks',
      malayalamDescription: 'ചായ, കാപ്പി, പാൽ പാനീയങ്ങൾ'
    },
    { 
      id: 'Instant Food', 
      name_en: 'Instant Food', 
      name_ml: 'ഇൻസ്റ്റന്റ് ഫുഡ്', 
      name_manglish: 'Instant Food',
      image: 'https://4.imimg.com/data4/EV/NY/MY-23547870/10-500x500.jpg',
      description: 'Ready-to-eat and instant foods',
      malayalamDescription: 'തൽക്ഷണ ഭക്ഷണങ്ങൾ'
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

  // Fetch featured products from snacks subcategories
  useEffect(() => {
    async function fetchFeaturedProducts() {
      setLoading(true);
      try {
        console.log('🔍 Fetching featured products for Snacks & Drinks');
        
        // Get all new categories that map to Snacks & Drinks
        const snackCategories = ['Chips', 'Sweet Chocolates', 'Bakery and Biscuits', 'Drinks and Juices', 'Tea, Coffee & Milk Drinks', 'Instant Food'];
        console.log('📂 Categories to fetch:', snackCategories);
        
        const allProductsQuery = collection(db, 'products');
        const allProductsSnapshot = await getDocs(allProductsQuery);
        
        const snacksProducts = allProductsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product => 
            product.category && snackCategories.includes(product.category) && product.available !== false
          )
          .slice(0, 10); // Limit to 10 featured products

        console.log('📦 Fetched featured products count:', snacksProducts.length);
        setFeaturedProducts(snacksProducts);
      } catch (error) {
        console.error('Error fetching featured products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchFeaturedProducts();
  }, []);

  const handleProductClick = async (productId: string) => {
    // Find the product in current list first
    let product = featuredProducts.find(p => p.id === productId);
    
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
      setSelectedProduct(product);
      setShowProductDetail(true);
    }
  };

  // Handle product selection from modal (receives full product object)
  const handleProductSelectFromModal = (product: Product) => {
    console.log('🔄 Product selected from modal:', product.id);
    setSelectedProduct(product);
    // Keep modal open to show the new product
  };

  const handleSubcategoryClick = (subcategoryId: string) => {
    // Navigate directly to the new category
    console.log('🔄 Subcategory clicked:', subcategoryId);
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
            <h1 className="text-lg font-semibold text-gray-900">Snacks & Drinks</h1>
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
            <span>Search for chips, chocolates, drinks, tea...</span>
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
                imageUrl={product.imageUrl}
                netQuantity={product.netQuantity}
                onProductClick={() => handleProductClick(product.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">🍿</div>
            <p className="text-gray-500">No featured products available</p>
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {showProductDetail && selectedProduct && (
        <ProductDetailModal
          product={{
            ...selectedProduct,
            price: selectedProduct.price || 0
          }}
          isOpen={showProductDetail}
          onClose={() => {
            setShowProductDetail(false);
            setSelectedProduct(null);
          }}
          onProductSelect={handleProductSelectFromModal}
        />
      )}
    </div>
  );
};

export default SnacksDrinksPage;
