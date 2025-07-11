import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '../contexts/CartContext';

interface PersistentCartButtonProps {
  onViewCart: () => void;
  className?: string;
}

const PersistentCartButton: React.FC<PersistentCartButtonProps> = ({ onViewCart, className = '' }) => {
  const { cartItems, getCartTotal, getTotalSavings } = useCart();
  
  const itemCount = cartItems.length; // Number of unique products, not total quantity
  const total = getCartTotal();
  const savings = getTotalSavings();

  // Don't show the button if cart is empty
  if (itemCount === 0) {
    return null;
  }

  return (
    <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 ${className}`}>
      <button
        onClick={onViewCart}
        className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6 py-3 shadow-xl flex items-center space-x-3 transition-all duration-300 transform hover:scale-105 active:scale-95 border-2 border-yellow-400"
        style={{ minWidth: '140px' }}
      >
        <div className="relative">
          <ShoppingCart size={20} />
          {itemCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
              {itemCount > 9 ? '9+' : itemCount}
            </span>
          )}
        </div>
        
        <div className="flex flex-col text-left">
          <span className="text-sm font-semibold leading-tight">View Cart</span>
          <div className="flex items-center gap-1">
            <span className="text-xs opacity-90 leading-tight">₹{total.toFixed(0)}</span>
            {savings > 0 && (
              <span className="text-xs bg-yellow-400 text-black px-1 py-0.5 rounded-full font-bold leading-none">
                Saved ₹{savings.toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
};

export default PersistentCartButton;
