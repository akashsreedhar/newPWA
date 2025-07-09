import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import OrderReviewModal from '../components/OrderReviewModal';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Trash2, Plus, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';

interface CartPageProps {
  userId: string | null;
  accessError?: string;
  authLoading?: boolean;
  disableOrderReview?: boolean;
  deliveryAllowed?: boolean;
  deliveryCheckPending?: boolean;
  onOrderPlaced?: (success: boolean, message: string) => void;
  onNavigateToOrders?: () => void;
}

const CartPage: React.FC<CartPageProps> = ({
  userId,
  accessError,
  authLoading,
  disableOrderReview,
  deliveryAllowed = true,
  deliveryCheckPending = false,
  onOrderPlaced,
  onNavigateToOrders
}) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const { t, language, languageDisplay } = useLanguage();
  const { cartItems, updateQuantity, removeFromCart, getCartTotal, clearCart } = useCart();

  const deliveryCharges = getCartTotal() >= 500 ? 0 : 30;
  const grandTotal = getCartTotal() + deliveryCharges;

  const getDisplayName = (item: any) => {
    if (languageDisplay === 'single') {
      switch (language) {
        case 'malayalam':
          return item.malayalamName;
        case 'manglish':
          return item.manglishName;
        default:
          return item.name;
      }
    } else {
      // For dual language display, always show English as primary
      return item.name;
    }
  };

  const getSecondaryName = (item: any) => {
    if (languageDisplay === 'single') {
      return null;
    } else if (languageDisplay === 'english-manglish') {
      return item.manglishName;
    } else {
      // english-malayalam (default)
      return item.malayalamName;
    }
  };

  // Accepts { address, message } from OrderReviewModal
  const [placingOrder, setPlacingOrder] = useState(false);
  // Only allow one order placement per user action
  const handlePlaceOrder = async ({ address, message }: { address: any; message: string }) => {
    if (placingOrder) return;
    if (!userId || accessError || !address) {
      return;
    }
    // Validate delivery area (if enforced)
    if (!deliveryAllowed) {
      if (onOrderPlaced) onOrderPlaced(false, 'Delivery not allowed in your area.');
      return;
    }

    setPlacingOrder(true);
    // Compose order data
    const order = {
      user: userId,
      items: cartItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity
      })),
      total: getCartTotal(),
      address,
      message: message?.trim() || null,
      status: 'pending',
      createdAt: Timestamp.now(),
      notified: false,
      orderNumber: `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`
    };

    try {
      // Save order to Firestore
      await addDoc(collection(db, 'orders'), order);
    } catch (err) {
      setPlacingOrder(false);
      if (onOrderPlaced) onOrderPlaced(false, 'Failed to place order. Please try again.');
      return;
    }

    // --- Backend notification logic (optional, for parity) ---
    try {
      // Notify staff
      await fetch('https://supermarket-backend-ytrh.onrender.com/notify-staff-new-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.orderNumber,
          customerName: address?.name || 'Customer'
        })
      });
    } catch (err) {
      // Optionally log, but don't block order
    }
    try {
      // Notify user (Telegram)
      await fetch('https://supermarket-backend-ytrh.onrender.com/notify-user-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.orderNumber,
          chatId: userId,
          items: order.items,
          total: order.total,
          status: order.status
        })
      });
    } catch (err) {
      // Optionally log
    }
    // --- End backend notification logic ---

    // Don't clear cart immediately - wait for animations to complete
    // The modal will handle clearing the cart when it closes
    setPlacingOrder(false);
    // Do NOT close the modal here! Let OrderReviewModal handle closing and redirect after all animations.
    if (onOrderPlaced) {
      onOrderPlaced(true, 'Order placed successfully!');
    }
  };

  // Clear cart when modal closes after successful order
  const handleModalClose = () => {
    setReviewOpen(false);
  };

  if (cartItems.length === 0) {
    return (
      <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24 flex items-center justify-center px-4">
        <div className="text-center max-w-sm mx-auto">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">{t('cartEmpty')}</h2>
          <p className="text-sm sm:text-base text-gray-600">{t('orderMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-32 sm:pb-36">
      {/* Order Review Modal */}
      <OrderReviewModal
        open={reviewOpen}
        onClose={handleModalClose}
        cartItems={cartItems}
        // Only trigger Firestore order placement ONCE, after animation completes
        onPlaceOrder={handlePlaceOrder}
        onClearCart={clearCart}
        onNavigateToOrders={onNavigateToOrders}
        userId={userId}
        disableOrderReview={disableOrderReview || !userId || !!accessError || placingOrder}
        deliveryAllowed={deliveryAllowed}
        deliveryCheckPending={deliveryCheckPending}
        loading={!!authLoading || placingOrder}
      />
      <div className="bg-white border-b border-gray-200 p-3 sm:p-4">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-800">{t('cart')}</h1>
      </div>

      {/* Registration enforcement warning */}
      {(!userId || accessError) && (
        <div className="max-w-lg mx-auto mt-4">
          <div className="flex items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg shadow">
            <AlertTriangle className="mr-2 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">Registration Required</div>
              <div className="text-sm">
                Please register via the SuperMarket Telegram bot before placing an order.<br />
                <b>Step 1:</b> Go to the SuperMarket Telegram bot.<br />
                <b>Step 2:</b> Complete registration by sharing your name, phone, and location.<br />
                <b>Step 3:</b> Then return here and try again!
                {accessError && <div className="mt-2 text-red-600">{accessError}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {cartItems.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <img
                src={item.imageUrl || item.image || '/placeholder.png'}
                alt={item.name}
                className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                onError={e => { e.currentTarget.src = '/placeholder.png'; }}
              />
              
              <div className="flex-1">
                <h3 className="font-medium text-gray-800 text-sm sm:text-base leading-tight break-words">{getDisplayName(item)}</h3>
                {getSecondaryName(item) && (
                  <p className="text-xs text-gray-500 leading-tight break-words">{getSecondaryName(item)}</p>
                )}
                <p className="text-sm sm:text-lg font-semibold text-gray-800 mt-0.5 sm:mt-1">
                  ₹{item.price} <span className="text-xs sm:text-sm text-gray-500">/{t(item.unit)}</span>
                </p>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  onClick={() => item.quantity > 1 && updateQuantity(item.id, item.quantity - 1)}
                  className={`bg-gray-100 ${item.quantity === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'} text-gray-600 w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors`}
                  disabled={item.quantity === 1}
                >
                  <Minus size={12} className="sm:w-3.5 sm:h-3.5" />
                </button>
                <span className="w-6 sm:w-8 text-center font-medium text-sm">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="bg-teal-600 hover:bg-teal-700 text-white w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors"
                >
                  <Plus size={12} className="sm:w-3.5 sm:h-3.5" />
                </button>
              </div>

              <button
                onClick={() => removeFromCart(item.id)}
                className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0 p-1"
              >
                <Trash2 size={16} className="sm:w-4.5 sm:h-4.5" />
              </button>
            </div>
          </div>
        ))}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mt-4 sm:mt-6">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex justify-between">
              <span className="text-sm sm:text-base text-gray-600">{t('totalAmount')}</span>
              <span className="font-medium text-sm sm:text-base">₹{getCartTotal()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm sm:text-base text-gray-600">{t('deliveryCharges')}</span>
              <span className="font-medium text-sm sm:text-base">
                {deliveryCharges === 0 ? t('free') : `₹${deliveryCharges}`}
              </span>
            </div>
            <div className="border-t pt-2 sm:pt-3">
              <div className="flex justify-between">
                <span className="text-base sm:text-lg font-semibold">{t('grandTotal')}</span>
                <span className="text-base sm:text-lg font-semibold text-teal-600">₹{grandTotal}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs sm:text-sm mt-3 sm:mt-4 px-2">
          {t('orderMessage')}
        </p>
      </div>

      <div className="fixed bottom-16 sm:bottom-20 left-0 right-0 bg-white border-t border-gray-200 p-3 sm:p-4 safe-area-inset-bottom">
        <button
          onClick={() => setReviewOpen(true)}
          className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-colors ${(!userId || accessError) ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
          disabled={!userId || !!accessError || authLoading}
        >
          {(!userId || accessError)
            ? 'Registration Required'
            : t('proceedToCheckout') + ` • ₹${grandTotal}`}
        </button>
      </div>
    </div>
  );
};

export default CartPage;