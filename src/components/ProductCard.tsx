import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { useCartAnimation } from '../contexts/CartAnimationContext';
import { useProductLanguage } from '../hooks/useProductLanguage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface ProductCardProps {
  id: string;
  name: string;
  malayalamName?: string;
  manglishName?: string;
  price?: number; // Optional fallback for legacy compatibility
  mrp: number; // Required - Maximum Retail Price
  sellingPrice: number; // Required - Actual selling price
  unit?: string;
  image?: string;
  imageUrl?: string;
  netQuantity?: string;
  onProductClick?: (productId: string) => void;
  available?: boolean; // <-- Add available prop for robust UI
}

const ProductCard: React.FC<ProductCardProps> = ({
  id,
  name,
  malayalamName,
  manglishName,
  mrp,
  sellingPrice,
  unit,
  image,
  imageUrl,
  netQuantity,
  onProductClick,
  available = true // default to true for backward compatibility
}) => {
  const { t } = useLanguage();
  const { cartItems, addToCart, updateQuantity } = useCart();
  const { formatProductName } = useProductLanguage();
  const { showAnimation } = useCartAnimation();

  const cartItem = cartItems.find(item => item.id === id);
  const quantity = cartItem?.quantity || 0;

  // Calculate pricing values - mrp and sellingPrice are now required
  const finalMrp = mrp || 0;
  const finalSellingPrice = sellingPrice || mrp || 0;
  const hasOffer = finalMrp > 0 && finalSellingPrice > 0 && finalMrp > finalSellingPrice;
  const discountPercentage = hasOffer ? Math.round(((finalMrp - finalSellingPrice) / finalMrp) * 100) : 0;

  // PATCH: Always check latest availability before adding to cart
  const handleAddToCart = async () => {
    // Fetch latest product data from Firestore
    try {
      const productDoc = await getDoc(doc(db, 'products', id));
      if (!productDoc.exists()) {
        alert('Product no longer exists.');
        return;
      }
      const productData = productDoc.data();
      if (productData.available === false) {
        alert('Sorry, this product is now out of stock.');
        return;
      }

      const productName = formatProductName({
        name: productData.name || name,
        malayalamName: productData.name_ml || malayalamName,
        manglishName: productData.name_manglish || manglishName
      });

      // Calculate savings for animation
      const latestMrp = productData.mrp || finalMrp;
      const latestSellingPrice = productData.sellingPrice || productData.price || finalSellingPrice;
      const savings = latestMrp > latestSellingPrice ? latestMrp - latestSellingPrice : undefined;

      showAnimation(productName, savings);

      // Always pass both image and imageUrl for cart compatibility
      addToCart(
        {
          id,
          name: productData.name || name,
          malayalamName: productData.name_ml || malayalamName || '',
          manglishName: productData.name_manglish || manglishName || '',
          price: latestSellingPrice,
          mrp: latestMrp,
          sellingPrice: latestSellingPrice,
          unit: productData.unit || unit || '',
          image: productData.image || productData.imageUrl || image || imageUrl || '',
          imageUrl: productData.imageUrl || productData.image || imageUrl || image || ''
        },
        false // Don't trigger context animation since we're handling it manually
      );
    } catch (err) {
      alert('Could not add to cart. Please try again.');
    }
  };

  const handleUpdateQuantity = (newQuantity: number) => {
    updateQuantity(id, newQuantity);
  };

  // Use the product language hook to get display name
  const displayName = formatProductName({
    name,
    malayalamName,
    manglishName
  });

  // Use imageUrl from Firestore, fallback to image prop, then to a placeholder
  const imgSrc = imageUrl || image || 'https://via.placeholder.com/300x300?text=No+Image';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow w-full h-full flex flex-col min-h-[270px] max-h-[340px] relative">
      {/* OFF Badge - Top Right Corner */}
      {hasOffer && (
        <div className="absolute top-2 right-2 z-10">
          <span className="bg-gradient-to-r from-green-500 to-green-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-md">
            {discountPercentage}% OFF
          </span>
        </div>
      )}

      <div
        className="w-full aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden cursor-pointer"
        onClick={() => onProductClick?.(id)}
      >
        <img src={imgSrc} alt={name} className="w-full h-full object-cover object-center max-h-40 min-h-32" style={{ aspectRatio: '1/1' }} />
        {!available && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
            <span className="text-red-600 font-bold text-base sm:text-lg">Out of Stock</span>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
        <div
          className="flex-1 mb-3 min-h-[48px] cursor-pointer"
          onClick={() => onProductClick?.(id)}
        >
          <h3 className="font-medium text-gray-800 mb-1 text-sm sm:text-base leading-tight break-words line-clamp-2 pr-2">{displayName}</h3>
          {netQuantity && (
            <p className="text-xs sm:text-sm text-gray-500">{netQuantity}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex-shrink-0 flex-1 min-w-0">
            {hasOffer ? (
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-semibold text-gray-800">₹{finalSellingPrice}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500 line-through">₹{finalMrp}</span>
                  {!netQuantity && unit && (
                    <span className="text-xs text-gray-500">/{t(unit)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-base sm:text-lg font-semibold text-gray-800">₹{finalSellingPrice}</span>
                {!netQuantity && unit && (
                  <span className="text-xs sm:text-sm text-gray-500 ml-1">/{t(unit)}</span>
                )}
              </div>
            )}
          </div>

          {/* PATCH: Disable Add to Cart if unavailable */}
          {quantity === 0 ? (
            <button
              onClick={handleAddToCart}
              className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors min-w-[70px] sm:min-w-[80px] justify-center flex-shrink-0
                ${available ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-gray-300 text-gray-400 cursor-not-allowed'}
              `}
              disabled={!available}
              aria-disabled={!available}
            >
              <Plus size={16} className="sm:w-4 sm:h-4" />
              <span className="font-medium text-xs sm:text-sm">
                {available ? t('add') : 'Out of Stock'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 bg-teal-50 rounded-lg p-1 flex-shrink-0 border border-teal-200">
              <button
                onClick={() => handleUpdateQuantity(quantity - 1)}
                className="bg-white hover:bg-gray-50 text-teal-600 w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center transition-colors shadow-sm border border-gray-200"
              >
                <Minus size={14} className="sm:w-4 sm:h-4" />
              </button>
              <span className="w-6 sm:w-8 text-center font-semibold text-teal-700 text-sm sm:text-base">{quantity}</span>
              <button
                onClick={() => handleUpdateQuantity(quantity + 1)}
                className="bg-white hover:bg-gray-50 text-teal-600 w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center transition-colors shadow-sm border border-gray-200"
              >
                <Plus size={14} className="sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;