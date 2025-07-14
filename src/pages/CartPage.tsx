import React, { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import OrderReviewModal from '../components/OrderReviewModal';
import PriceChangeModal from '../components/PriceChangeModal';
import { AlertTriangle } from 'lucide-react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { validateCartPricesAdvanced } from '../utils/advancedPriceValidation';
import { PriceValidationAnalytics, PriceValidationErrorTracker } from '../utils/priceValidationAnalytics';

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
  const [priceChangeModalOpen, setPriceChangeModalOpen] = useState(false);
  const [priceValidationResult, setPriceValidationResult] = useState<any>(null);
  const [validatingPrices, setValidatingPrices] = useState(false);
  const [validationSessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const { t, language, languageDisplay } = useLanguage();
  const { cartItems, updateQuantity, removeFromCart, getCartTotal, getTotalMRP, getTotalSavings, clearCart, validatePrices, updateCartPrices, validatePricesManually } = useCart();

  // Use ref to track latest cart items for validation
  const latestCartItemsRef = useRef(cartItems);
  
  // Update ref whenever cartItems change
  useEffect(() => {
    latestCartItemsRef.current = cartItems;
    console.log('📦 Cart items updated in CartPage:', cartItems.length, 'items');
  }, [cartItems]);

  // Listen for cart updates from context
  useEffect(() => {
    const handleCartUpdate = (event: CustomEvent) => {
      console.log('📦 Cart updated via custom event:', event.detail);
      // Force update the ref with latest data
      latestCartItemsRef.current = event.detail.updatedItems;
    };

    window.addEventListener('cartUpdated', handleCartUpdate as EventListener);
    
    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate as EventListener);
    };
  }, []);

  // Separate trigger for validation after state changes
  const [forceValidationTrigger, setForceValidationTrigger] = useState(0);
  
  // Force validation function
  const triggerValidation = useCallback(() => {
    console.log('🔄 Manually triggering validation');
    setForceValidationTrigger(prev => prev + 1);
  }, []);

  // Validation effect that responds to manual triggers
  useEffect(() => {
    if (forceValidationTrigger === 0) return; // Skip initial render
    
    const currentCartItems = latestCartItemsRef.current;
    if (currentCartItems.length === 0) return;
    
    console.log('🔍 Force validation triggered:', forceValidationTrigger);
    
    const validate = async () => {
      try {
        setValidatingPrices(true);
        const result = await validateCartPricesAdvanced(currentCartItems, true);
        
        if (result.hasChanges && result.priceChanges.length > 0) {
          console.log('💰 Force validation found price changes:', result.priceChanges);
          
          const convertedResult = {
            isValid: result.isValid,
            hasChanges: result.hasChanges,
            updatedItems: result.updatedItems,
            priceChanges: result.priceChanges.map(change => ({
              itemId: change.itemId,
              itemName: change.itemName,
              oldPrice: change.oldPrice,
              newPrice: change.newPrice
            })),
            riskLevel: result.riskLevel,
            unavailableItems: result.unavailableItems,
            stockWarnings: result.stockWarnings
          };
          
          setPriceValidationResult(convertedResult);
          setPriceChangeModalOpen(true);
        } else {
          console.log('✅ Force validation: All prices current');
          setPriceValidationResult(null);
        }
      } catch (error) {
        console.error('Force validation failed:', error);
      } finally {
        setValidatingPrices(false);
      }
    };
    
    validate();
  }, [forceValidationTrigger]);

  // Initialize analytics
  const analytics = useCallback(() => PriceValidationAnalytics.getInstance(), []);

  // Validate prices on page load and when coming back from modals
  useEffect(() => {
    const currentCartItems = latestCartItemsRef.current;
    if (currentCartItems.length === 0) return;
    
    // Skip validation if already validating to prevent double validation
    if (validatingPrices) return;

    // Create a unique key for this validation to prevent duplicate triggers
    const validationKey = `${currentCartItems.length}_${priceChangeModalOpen}_${reviewOpen}`;
    
    const validateOnLoad = async () => {
      try {
        setValidatingPrices(true);
        console.log('🔍 Validating prices - key:', validationKey);
        
        const result = await validateCartPricesAdvanced(currentCartItems, true); // Force fresh
        
        if (result.hasChanges && result.priceChanges.length > 0) {
          console.log('💰 Price changes detected:', result.priceChanges);
          
          // Convert advanced result to ensure compatibility
          const convertedResult = {
            isValid: result.isValid,
            hasChanges: result.hasChanges,
            updatedItems: result.updatedItems,
            priceChanges: result.priceChanges.map(change => ({
              itemId: change.itemId,
              itemName: change.itemName,
              oldPrice: change.oldPrice,
              newPrice: change.newPrice
            })),
            riskLevel: result.riskLevel,
            unavailableItems: result.unavailableItems,
            stockWarnings: result.stockWarnings
          };
          
          setPriceValidationResult(convertedResult);
          
          // Only show modal if not already open
          if (!priceChangeModalOpen && !reviewOpen) {
            setPriceChangeModalOpen(true);
          }
        } else {
          console.log('✅ All cart prices are current');
          setPriceValidationResult(null);
        }
      } catch (error) {
        console.error('Price validation failed:', error);
      } finally {
        setValidatingPrices(false);
      }
    };

    validateOnLoad();
  }, [priceChangeModalOpen, reviewOpen]); // Removed cartItems to prevent infinite loop

  // Auto-validate prices periodically (every 2 minutes) when cart is not empty
  useEffect(() => {
    if (cartItems.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const startTime = Date.now();
        const validation = await validateCartPricesAdvanced(cartItems);
        const duration = Date.now() - startTime;
        
        analytics().trackValidation(duration, validation.hasChanges);

        if (validation.hasChanges && validation.riskLevel !== 'low') {
          // Silent update for low-risk changes, notification for higher risk
          console.log('Background price validation detected changes:', validation.priceChanges);
          // You could show a subtle notification here
        }
      } catch (error) {
        PriceValidationErrorTracker.trackError(error as Error, {
          validationType: 'client',
          timestamp: new Date().toISOString(),
          cartItems: cartItems.map(item => ({ id: item.id, name: item.name }))
        });
      }
    }, 120000); // 2 minutes

    return () => clearInterval(interval);
  }, [cartItems, analytics]);
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

  // Accepts { address, message, paymentMethod, paymentData } from OrderReviewModal
  const [placingOrder, setPlacingOrder] = useState(false);

  // Handle proceed to checkout with production-grade price validation
  const handleProceedToCheckout = async () => {
    if (!userId || accessError) {
      return;
    }

    // Always clear previous validation results to force fresh validation
    setPriceValidationResult(null);
    setValidatingPrices(true);
    const startTime = Date.now();
    
    console.log('🔍 Starting fresh price validation for checkout...');
    
    try {
      // Get the absolute latest cart items
      const currentCartItems = latestCartItemsRef.current;
      console.log('🔍 Checkout validation with latest cart items:', currentCartItems.length);
      
      if (currentCartItems.length === 0) {
        console.log('❌ No items in cart to validate');
        return;
      }
      
      const validation = await validateCartPricesAdvanced(currentCartItems, true); // Force fresh data
      const duration = Date.now() - startTime;
      
      console.log('💰 Price validation result:', {
        hasChanges: validation.hasChanges,
        priceChanges: validation.priceChanges,
        riskLevel: validation.riskLevel
      });
      
      // Track validation metrics
      analytics().trackValidation(duration, validation.hasChanges);
      
      if (validation.unavailableItems.length > 0) {
        // Handle unavailable products
        alert(`Some items are no longer available: ${validation.unavailableItems.map(item => item.name).join(', ')}`);
        return;
      }

      if (validation.stockWarnings.length > 0) {
        // Handle stock issues
        const stockMessages = validation.stockWarnings.map(warning => 
          `${warning.itemName}: Only ${warning.availableStock} left (you wanted ${warning.requestedQuantity})`
        ).join('\n');
        
        if (!confirm(`Stock limitations detected:\n${stockMessages}\n\nContinue with available quantities?`)) {
          return;
        }
      }

      if (validation.hasChanges) {
        // Show enhanced price change modal with risk level
        setPriceValidationResult(validation);
        setPriceChangeModalOpen(true);
      } else {
        // No changes, proceed directly to order review
        setReviewOpen(true);
      }
    } catch (error) {
      console.error('Error validating prices:', error);
      
      // Track error for production monitoring
      PriceValidationErrorTracker.trackError(error as Error, {
        userId,
        cartItems: cartItems.map(item => ({ id: item.id, name: item.name })),
        validationType: 'client',
        timestamp: new Date().toISOString()
      });
      
      // Graceful fallback
      if (confirm('Unable to verify current prices. This may result in price differences. Continue anyway?')) {
        setReviewOpen(true);
      }
    } finally {
      setValidatingPrices(false);
    }
  };

  // Handle accepting price changes
  const handleAcceptPriceChanges = () => {
    if (priceValidationResult?.updatedItems) {
      console.log('🔄 Accepting price changes:', priceValidationResult.priceChanges);
      
      // Update cart prices using the validated items
      updateCartPrices(priceValidationResult.updatedItems);
      
      // Clear validation state immediately
      setPriceValidationResult(null);
      setPriceChangeModalOpen(false);
      
      // Wait for cart state to propagate before opening order review
      setTimeout(() => {
        console.log('✅ Opening order review with updated prices');
        setReviewOpen(true);
      }, 500); // Increased delay to ensure full state propagation
    } else {
      console.log('⚠️ No updated items found in validation result');
      setPriceValidationResult(null);
      setPriceChangeModalOpen(false);
    }
  };

  // Handle rejecting price changes (cancel order)
  const handleRejectPriceChanges = () => {
    console.log('❌ User rejected price changes - removing affected items from cart');
    
    // Get the items that had price changes
    const itemsToRemove = priceValidationResult?.priceChanges?.map((change: any) => change.itemId) || [];
    
    if (itemsToRemove.length > 0) {
      console.log('🗑️ Removing items with price changes:', itemsToRemove);
      
      // Remove each item with price changes from the cart
      itemsToRemove.forEach((itemId: string) => {
        removeFromCart(itemId);
      });
      
      // Show a message to user about what happened
      const removedItemsNames = priceValidationResult?.priceChanges?.map((change: any) => change.itemName).join(', ') || '';
      console.log(`✅ Removed items from cart: ${removedItemsNames}`);
    }
    
    // Clear validation state
    setPriceValidationResult(null);
    setPriceChangeModalOpen(false);
    
    // Track order cancellation for analytics
    analytics().trackOrderCancellation('price_change');
    
    // No need to trigger validation again since we removed the problematic items
  };

  // Updated handlePlaceOrder to support payment methods
  const handlePlaceOrder = async ({ address, message, paymentMethod, paymentData }: { 
    address: any; 
    message: string; 
    paymentMethod: 'cod' | 'online';
    paymentData?: any;
  }) => {
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
    
    // Compose order data with payment information
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
      paymentMethod,
      // Add payment data for online payments
      ...(paymentMethod === 'online' && paymentData ? {
        paymentStatus: 'paid',
        razorpayOrderId: paymentData.razorpayOrderId,
        razorpayPaymentId: paymentData.razorpayPaymentId,
        razorpaySignature: paymentData.razorpaySignature,
        paymentAmount: paymentData.amount,
        paymentTimestamp: Timestamp.now()
      } : {
        paymentStatus: paymentMethod === 'cod' ? 'pending' : 'failed'
      }),
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

    // --- Backend notification logic (updated with payment info) ---
    try {
      // Notify staff
      await fetch('https://supermarket-backend-ytrh.onrender.com/notify-staff-new-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.orderNumber,
          customerName: address?.name || 'Customer',
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus
        })
      });
    } catch (err) {
      // Optionally log, but don't block order
      console.error('Failed to notify staff:', err);
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
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus
        })
      });
    } catch (err) {
      // Optionally log
      console.error('Failed to notify user:', err);
    }
    // --- End backend notification logic ---

    // Don't clear cart immediately - wait for animations to complete
    // The modal will handle clearing the cart when it closes
    setPlacingOrder(false);
    // Do NOT close the modal here! Let OrderReviewModal handle closing and redirect after all animations.
    if (onOrderPlaced) {
      onOrderPlaced(true, paymentMethod === 'cod' ? 'Order placed successfully!' : 'Payment successful! Order placed.');
    }
  };

  // Clear cart when modal closes after successful order
  const handleModalClose = () => {
    console.log('📱 OrderReview modal closed - returning to cart');
    setReviewOpen(false);
    
    // Clear validation state to force fresh validation
    setPriceValidationResult(null);
    
    // Force immediate re-validation when returning from order review
    setTimeout(() => {
      console.log('🔄 Force re-validation after order review close');
      triggerValidation();
    }, 100);
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
      {/* Price Change Modal */}
      <PriceChangeModal
        isOpen={priceChangeModalOpen}
        onClose={handleRejectPriceChanges}
        onAccept={handleAcceptPriceChanges}
        priceChanges={priceValidationResult?.priceChanges || []}
        cartTotal={getCartTotal()}
        newCartTotal={priceValidationResult?.updatedItems?.reduce((total: number, item: any) => total + (item.price * item.quantity), 0) || getCartTotal()}
      />

      {/* Order Review Modal */}
      <OrderReviewModal
        open={reviewOpen}
        onClose={handleModalClose}
        cartItems={latestCartItemsRef.current} // Use ref to ensure latest cart items
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
                <div className="mt-0.5 sm:mt-1">
                  {item.mrp && item.sellingPrice && item.mrp > item.sellingPrice ? (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-lg font-semibold text-gray-800">₹{item.sellingPrice}</span>
                        <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                          {Math.round(((item.mrp - item.sellingPrice) / item.mrp) * 100)}% OFF
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 line-through">₹{item.mrp}</span>
                        <span className="text-xs sm:text-sm text-gray-500">/{t(item.unit)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm sm:text-lg font-semibold text-gray-800">
                      ₹{item.sellingPrice || item.price} <span className="text-xs sm:text-sm text-gray-500">/{t(item.unit)}</span>
                    </p>
                  )}
                </div>
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
            {/* Show MRP and savings if there are any savings */}
            {getTotalSavings() > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm sm:text-base text-gray-600">MRP Total</span>
                  <span className="font-medium text-sm sm:text-base text-gray-500 line-through">₹{getTotalMRP()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm sm:text-base text-green-600 font-medium">You Save</span>
                  <span className="font-semibold text-sm sm:text-base text-green-600">₹{getTotalSavings()}</span>
                </div>
                <hr className="border-gray-200" />
              </>
            )}
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
          onClick={handleProceedToCheckout}
          className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-colors ${(!userId || accessError || validatingPrices) ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
          disabled={!userId || !!accessError || authLoading || validatingPrices}
        >
          {validatingPrices
            ? 'Validating Prices...'
            : (!userId || accessError)
            ? 'Registration Required'
            : t('proceedToCheckout') + ` • ₹${grandTotal}`}
        </button>
      </div>
    </div>
  );
};

export default CartPage;