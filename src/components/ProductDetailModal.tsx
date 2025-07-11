import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Truck } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useCartAnimation } from '../contexts/CartAnimationContext';
import { useProductLanguage } from '../hooks/useProductLanguage';
import { db } from '../firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import ProductCard from './ProductCard';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSelect?: (product: any) => void; // Add callback for product selection
  product: {
    id: string;
    name_en?: string;
    name_ml?: string;
    name_manglish?: string;
    name?: string;
    price?: number; // Legacy field - optional
    mrp?: number; // Maximum Retail Price
    sellingPrice?: number; // Actual selling price
    imageUrl?: string;
    description?: string;
    category?: string;
    netQuantity?: string;
    manufacturerNameAddress?: string;
    countryOfOrigin?: string;
    customerSupportDetails?: string;
    available?: boolean;
  } | null;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ isOpen, onClose, onProductSelect, product }) => {
  const { cartItems, addToCart, updateQuantity } = useCart();
  const { formatProductName } = useProductLanguage();
  const { showAnimation } = useCartAnimation();
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('');

  // Reset state when modal opens/closes and fetch similar products
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (product) {
        // Only reset image loading if the image URL actually changed
        const newImageUrl = product.imageUrl || '';
        if (newImageUrl !== currentImageUrl) {
          setImageLoading(true);
          setCurrentImageUrl(newImageUrl);
        }
        fetchSimilarProducts();
        // Scroll to top when a new product is loaded
        const scrollContainer = document.querySelector('.product-modal-content');
        if (scrollContainer) {
          scrollContainer.scrollTop = 0;
        }
      }
    } else {
      document.body.style.overflow = 'unset';
      setShowFullDescription(false);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, product?.id]); // Only depend on product ID, not the entire product object

  // Fetch similar products
  const fetchSimilarProducts = async () => {
    if (!product) return;
    
    setLoadingSimilar(true);
    try {
      // First try to get products from the same category
      let productsQuery = query(
        collection(db, 'products'),
        where('category', '==', product.category || ''),
        limit(6)
      );
      
      let snapshot = await getDocs(productsQuery);
      let products = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => p.id !== product.id); // Exclude current product
      
      // If we don't have enough products from the same category, get random products
      if (products.length < 4) {
        const allProductsSnapshot = await getDocs(query(collection(db, 'products'), limit(10)));
        const allProducts = allProductsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.id !== product.id);
        
        // Shuffle and take the first few
        const shuffled = allProducts.sort(() => Math.random() - 0.5);
        products = shuffled.slice(0, 6);
      }
      
      setSimilarProducts(products.slice(0, 6));
    } catch (error) {
      console.error('Error fetching similar products:', error);
      setSimilarProducts([]);
    } finally {
      setLoadingSimilar(false);
    }
  };

  if (!isOpen || !product) return null;

  const cartItem = cartItems.find(item => item.id === product.id);
  const quantity = cartItem?.quantity || 0;

  const displayName = formatProductName({
    name: product.name_en || product.name || '',
    malayalamName: product.name_ml || '',
    manglishName: product.name_manglish || ''
  });

  // Calculate pricing values for display
  const finalMrp = product.mrp || 0;
  const finalSellingPrice = product.sellingPrice || 0;

  const handleAddToCart = () => {
    const productName = formatProductName({
      name: product.name_en || product.name || '',
      malayalamName: product.name_ml || '',
      manglishName: product.name_manglish || ''
    });
    
    // Calculate pricing values - use sellingPrice as primary
    const finalMrp = product.mrp || 0;
    const finalSellingPrice = product.sellingPrice || 0;
    const hasOffer = finalMrp > finalSellingPrice;
    const savings = hasOffer ? finalMrp - finalSellingPrice : 0;
    
    showAnimation(productName, savings);
    
    addToCart({
      id: product.id,
      name: product.name_en || product.name || '',
      malayalamName: product.name_ml || '',
      manglishName: product.name_manglish || '',
      price: finalSellingPrice, // Use selling price as price for legacy compatibility
      mrp: finalMrp,
      sellingPrice: finalSellingPrice,
      unit: 'piece',
      image: product.imageUrl || '',
      imageUrl: product.imageUrl || ''
    }, false); // Don't trigger the context animation since we're handling it manually
  };

  const handleSimilarProductClick = (productId: string) => {
    // Find the product from similar products
    const selectedProduct = similarProducts.find(p => p.id === productId);
    if (selectedProduct && onProductSelect) {
      // Pass the full product object to parent to update the modal
      onProductSelect(selectedProduct);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-t-3xl sm:rounded-b-3xl flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="flex-shrink-0 bg-white z-20 flex items-center justify-between p-4 border-b border-gray-100 relative">
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors z-30 bg-white shadow-sm border border-gray-200"
          >
            <X size={20} className="text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 absolute left-1/2 transform -translate-x-1/2">Product Details</h2>
          <div className="w-9"></div> {/* Spacer for balance */}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto product-modal-content">
          {/* Product Image */}
          <div className="aspect-square bg-gray-50 flex items-center justify-center p-8 relative">
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            )}
            <img
              src={currentImageUrl || '/placeholder.png'}
              alt={displayName}
              className={`w-full h-full object-contain transition-opacity duration-200 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => setImageLoading(false)}
              onError={(e) => { 
                e.currentTarget.src = '/placeholder.png';
                setImageLoading(false);
              }}
            />
          </div>

          {/* Product Info */}
          <div className="p-4 space-y-6 pb-24">{/* Added pb-24 for bottom navigation space */}
            {/* Name and Price */}
            <div>
              <h1 className="text-xl font-semibold text-gray-900 leading-tight">{displayName}</h1>
              <p className="text-sm text-gray-500 mt-1">{product.netQuantity || '1 piece'}</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex flex-col">
                  {finalMrp > 0 && finalSellingPrice > 0 && finalMrp > finalSellingPrice ? (
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-green-600">₹{finalSellingPrice}</span>
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                          {Math.round(((finalMrp - finalSellingPrice) / finalMrp) * 100)}% OFF
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-500 line-through">₹{finalMrp}</span>
                        <span className="text-xs text-gray-600">MRP</span>
                      </div>
                      <span className="text-xs text-green-600 font-medium">You save ₹{finalMrp - finalSellingPrice}</span>
                    </div>
                  ) : (
                    <span className="text-2xl font-bold text-green-600">₹{finalSellingPrice || 0}</span>
                  )}
                </div>
                
                {/* Add to Cart Button */}
                {quantity === 0 ? (
                  <button
                    onClick={handleAddToCart}
                    disabled={!product.available}
                    className={`px-6 py-3 rounded-xl font-semibold text-white transition-colors ${
                      product.available 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {product.available ? 'Add to Cart' : 'Out of Stock'}
                  </button>
                ) : (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => updateQuantity(product.id, quantity - 1)}
                      className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-200 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-lg font-semibold w-8 text-center">{quantity}</span>
                    <button
                      onClick={() => updateQuantity(product.id, quantity + 1)}
                      className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Info */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <Truck className="w-5 h-5 text-green-600" />
                <div>
                  <span className="text-sm font-medium text-green-700">Free Delivery</span>
                  <p className="text-xs text-green-600">On orders above ₹500 • Delivered in 30 mins</p>
                </div>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">About this product</h3>
                <p className={`text-gray-600 text-sm leading-relaxed ${showFullDescription ? '' : 'line-clamp-3'}`}>
                  {product.description}
                </p>
                {product.description.length > 100 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="text-green-600 text-sm font-medium mt-1 hover:underline"
                  >
                    {showFullDescription ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {/* Product Details */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Product Information</h3>
              <div className="space-y-3">
                {product.netQuantity && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium text-gray-600 flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      Net Quantity
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{product.netQuantity}</span>
                  </div>
                )}
                {product.category && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium text-gray-600 flex items-center">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                      Category
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{product.category}</span>
                  </div>
                )}
                {product.countryOfOrigin && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium text-gray-600 flex items-center">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                      Country of Origin
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{product.countryOfOrigin}</span>
                  </div>
                )}
                {product.manufacturerNameAddress && (
                  <div className="py-2 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium text-gray-600 flex items-center mb-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                      Manufacturer
                    </span>
                    <p className="text-sm text-gray-900 ml-5 leading-relaxed">{product.manufacturerNameAddress}</p>
                  </div>
                )}
                {product.customerSupportDetails && (
                  <div className="py-2">
                    <span className="text-sm font-medium text-gray-600 flex items-center mb-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                      Customer Support
                    </span>
                    <p className="text-sm text-gray-900 ml-5">{product.customerSupportDetails}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Similar Products */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">You might also like</h3>
              {loadingSimilar ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : similarProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {similarProducts.map((similarProduct) => (
                    <ProductCard
                      key={similarProduct.id}
                      id={similarProduct.id}
                      name={similarProduct.name_en || similarProduct.name || 'Unknown Product'}
                      malayalamName={similarProduct.name_ml}
                      manglishName={similarProduct.name_manglish}
                      mrp={similarProduct.mrp || 0}
                      sellingPrice={similarProduct.sellingPrice || 0}
                      imageUrl={similarProduct.imageUrl}
                      netQuantity={similarProduct.netQuantity}
                      onProductClick={handleSimilarProductClick}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500">No similar products found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;
