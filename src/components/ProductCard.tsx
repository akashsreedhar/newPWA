import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { useProductLanguage } from '../hooks/useProductLanguage';

interface ProductCardProps {
  id: string;
  name: string;
  malayalamName?: string;
  manglishName?: string;
  price: number;
  unit?: string;
  image?: string;
  imageUrl?: string;
}

const ProductCard: React.FC<ProductCardProps> = ({ id, name, malayalamName, manglishName, price, unit, image, imageUrl }) => {
  const { t } = useLanguage();
  const { cartItems, addToCart, updateQuantity } = useCart();
  const { formatProductName } = useProductLanguage();

  const cartItem = cartItems.find(item => item.id === id);
  const quantity = cartItem?.quantity || 0;

  const handleAddToCart = () => {
    // Always pass both image and imageUrl for cart compatibility
    addToCart({
      id,
      name,
      malayalamName: malayalamName || '',
      manglishName: manglishName || '',
      price,
      unit: unit || '',
      image: image || imageUrl || '',
      imageUrl: imageUrl || image || ''
    });
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow w-full h-full flex flex-col min-h-[270px] max-h-[340px]">
      <div className="w-full aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden">
        <img src={imgSrc} alt={name} className="w-full h-full object-cover object-center max-h-40 min-h-32" style={{aspectRatio:'1/1'}} />
      </div>
      
      <div className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
        <div className="flex-1 mb-3 min-h-[48px]">
          <h3 className="font-medium text-gray-800 mb-1 text-sm sm:text-base leading-tight break-words line-clamp-2">{displayName}</h3>
        </div>
        
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex-shrink-0">
            <span className="text-base sm:text-lg font-semibold text-gray-800">₹{price}</span>
            <span className="text-xs sm:text-sm text-gray-500 ml-1">/{t(unit || 'unit')}</span>
          </div>
          
          {quantity === 0 ? (
            <button
              onClick={handleAddToCart}
              className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors min-w-[60px] sm:min-w-[70px] justify-center flex-shrink-0"
            >
              <Plus size={14} className="sm:w-4 sm:h-4" />
              <span className="font-medium text-xs sm:text-sm">{t('add')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 bg-teal-50 rounded-lg p-1 flex-shrink-0">
              <button
                onClick={() => handleUpdateQuantity(quantity - 1)}
                className="bg-white hover:bg-gray-50 text-teal-600 w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors"
              >
                <Minus size={12} className="sm:w-3.5 sm:h-3.5" />
              </button>
              <span className="w-6 sm:w-8 text-center font-medium text-teal-600 text-sm">{quantity}</span>
              <button
                onClick={() => handleUpdateQuantity(quantity + 1)}
                className="bg-white hover:bg-gray-50 text-teal-600 w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors"
              >
                <Plus size={12} className="sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;