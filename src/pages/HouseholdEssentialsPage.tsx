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

interface HouseholdEssentialsPageProps {
  onBack: () => void;
  onNavigateToCategory: (category: string) => void;
  onSearchOpen: () => void;
}

const HouseholdEssentialsPage: React.FC<HouseholdEssentialsPageProps> = ({ 
  onBack, 
  onNavigateToCategory,
  onSearchOpen 
}) => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const { settings } = useProductLanguage();

  // Household Essentials subcategories - New modern categories
  const subcategories = [
    { 
      id: 'Home & Lifestyle', 
      name_en: 'Home & Lifestyle', 
      name_ml: 'ഹോമും ലൈഫ്സ്റ്റൈലും', 
      name_manglish: 'Home & Lifestyle',
      image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200&h=200&fit=crop&crop=center',
      description: 'Home decoration and lifestyle products',
      malayalamDescription: 'വീട് അലങ്കാരവും ജീവിതശൈലി ഉൽപ്പന്നങ്ങളും'
    },
    { 
      id: 'Cleaners & Repellents', 
      name_en: 'Cleaners & Repellents', 
      name_ml: 'ക്ലീനറും കീടനാശിനികളും', 
      name_manglish: 'Cleaners & Repellents',
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop&crop=center',
      description: 'Cleaning products and pest repellents',
      malayalamDescription: 'വൃത്തിയാക്കൽ ഉൽപ്പന്നങ്ങളും കീടനാശിനികളും'
    },
    { 
      id: 'Electronics', 
      name_en: 'Electronics', 
      name_ml: 'ഇലക്ട്രോണിക്സ്', 
      name_manglish: 'Electronics',
      image: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=200&h=200&fit=crop&crop=center',
      description: 'Electronic gadgets and appliances',
      malayalamDescription: 'ഇലക്ട്രോണിക് ഗാഡ്ജെറ്റുകളും ഉപകരണങ്ങളും'
    },
    { 
      id: 'Stationery & Games', 
      name_en: 'Stationery & Games', 
      name_ml: 'സ്റ്റേഷനറിയും ഗെയിമുകളും', 
      name_manglish: 'Stationery & Games',
      image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=200&h=200&fit=crop&crop=center',
      description: 'Stationery supplies and games',
      malayalamDescription: 'സ്റ്റേഷനറി സാധനങ്ങളും ഗെയിമുകളും'
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

  // Fetch featured products from household subcategories
  useEffect(() => {
    async function fetchFeaturedProducts() {
      setLoading(true);
      try {
        console.log('🔍 Fetching featured products for Household Essentials');
        
        // Get all new categories that map to Household Essentials
        const householdCategories = ['Home & Lifestyle', 'Cleaners & Repellents', 'Electronics', 'Stationery & Games'];
        console.log('📂 Categories to fetch:', householdCategories);
        
        const allProductsQuery = collection(db, 'products');
        const allProductsSnapshot = await getDocs(allProductsQuery);
        
        const householdProducts = allProductsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product => 
            product.category && householdCategories.includes(product.category) && product.available !== false
          )
          .slice(0, 10); // Limit to 10 featured products

        console.log('📦 Fetched featured products count:', householdProducts.length);
        setFeaturedProducts(householdProducts);
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
            <h1 className="text-lg font-semibold text-gray-900">Household Essentials</h1>
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
            <span>Search for cleaners, electronics, stationery...</span>
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
            <div className="text-gray-400 mb-2">🏠</div>
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

export default HouseholdEssentialsPage;
