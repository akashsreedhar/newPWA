import React, { useState, useCallback, useEffect, useRef } from 'react';
import OrderReviewModal from '../components/OrderReviewModal';
import PriceChangeModal from '../components/PriceChangeModal';
import { AlertTriangle } from 'lucide-react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { validateCartPricesAdvanced } from '../utils/advancedPriceValidation';
import { PriceValidationAnalytics, PriceValidationErrorTracker } from '../utils/priceValidationAnalytics';
import { telegramRateLimit } from '../services/TelegramRateLimit';
import { BACKEND_URL } from '../config';

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
  // Fast Food specific fields
  fssaiLicenseNumber?: string;
  ingredients?: string;
  allergens?: string;
  servingSize?: string;
  preparationDate?: string;
  bestBefore?: string;
  storageInstructions?: string;
  isVeg?: boolean;
  spiceLevel?: 'mild' | 'medium' | 'spicy';
}

interface CartPageProps {
  userId: string | null;
  accessError?: string;
  authLoading?: boolean;
  disableOrderReview?: boolean;
  deliveryAllowed?: boolean;
  deliveryCheckPending?: boolean;
  onOrderPlaced?: (success: boolean, message: string) => void;
  onNavigateToOrders?: () => void;
  onOpenOrderReview?: () => void;
  onCloseOrderReview?: () => void;
}

const CartPage: React.FC<CartPageProps> = ({
  userId,
  accessError,
  authLoading,
  disableOrderReview,
  deliveryAllowed = true,
  deliveryCheckPending = false,
  onOrderPlaced,
  onNavigateToOrders,
  onOpenOrderReview,
  onCloseOrderReview
}) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [priceChangeModalOpen, setPriceChangeModalOpen] = useState(false);
  const [priceValidationResult, setPriceValidationResult] = useState<any>(null);
  const [validatingPrices, setValidatingPrices] = useState(false);
  const { t, language, languageDisplay } = useLanguage();

  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    getCartTotal,
    getTotalMRP,
    getTotalSavings,
    clearCart,
    updateCartPrices,
    revalidateCartAvailability,
    getMaxOrderQuantity,
    getAllMaxOrderQuantities
  } = useCart();

  // In-memory cache for per-product max order quantity
  const maxQtyRef = useRef<Record<string, number>>({});

  // Helper: wrap a promise with a timeout (snappier UX)
  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms = 8000, label = 'Validation timed out'): Promise<T> => {
    let timer: any;
    return new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }, []);

  // Prefetch maxOrderQuantity for all items when cart changes (reduces reads in increment handler)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const map = await getAllMaxOrderQuantities();
        if (!mounted) return;
        if (map && typeof map === 'object') {
          maxQtyRef.current = { ...maxQtyRef.current, ...map };
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [getAllMaxOrderQuantities, cartItems.length]);

  const [rateLimitStatus, setRateLimitStatus] = useState<{
    checking: boolean;
    allowed: boolean;
    reason?: string;
    exemptionReason?: string;
    retryAfter?: number;
    cooldownType?: string;
  }>({
    checking: false,
    allowed: true
  });

  // Remove unavailable items from cart automatically
  useEffect(() => {
    const unavailableItems = cartItems.filter(item => item.available === false);
    if (unavailableItems.length > 0) {
      unavailableItems.forEach(item => removeFromCart(item.id));
    }
    // eslint-disable-next-line
  }, [cartItems]);

  // Track latest cart in a ref (prevents stale closures during validations)
  const latestCartItemsRef = useRef(cartItems);
  useEffect(() => {
    latestCartItemsRef.current = cartItems;
  }, [cartItems]);

  // Optional: listen for external cart updates from context
  useEffect(() => {
    const handleCartUpdate = (event: CustomEvent) => {
      latestCartItemsRef.current = event.detail.updatedItems;
    };
    window.addEventListener('cartUpdated', handleCartUpdate as EventListener);
    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate as EventListener);
    };
  }, []);

  // Close modal from external navigation events
  useEffect(() => {
    const handler = () => {
      setReviewOpen(false);
      if (onCloseOrderReview) onCloseOrderReview();
    };
    window.addEventListener('closeOrderReviewModal', handler);
    return () => window.removeEventListener('closeOrderReviewModal', handler);
  }, [onCloseOrderReview]);

  // Manual validation trigger
  const [forceValidationTrigger, setForceValidationTrigger] = useState(0);
  const triggerValidation = useCallback(() => {
    setForceValidationTrigger(prev => prev + 1);
  }, []);

  // Validation run gating (prevents stale/overlapping results)
  const validationRunIdRef = useRef(0);

  const runValidation = useCallback(async (items: any[]) => {
    const runId = ++validationRunIdRef.current;
    setValidatingPrices(true);
    try {
      const result = await withTimeout(validateCartPricesAdvanced(items, true), 8000, 'Price validation timed out');
      // Only apply if this is the latest run
      if (runId !== validationRunIdRef.current) return;
      if (result.hasChanges && result.priceChanges.length > 0) {
        const convertedResult = {
          isValid: result.isValid,
          hasChanges: result.hasChanges,
          updatedItems: result.updatedItems,
          priceChanges: result.priceChanges.map((change: any) => ({
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
        setPriceValidationResult(null);
      }
    } catch (error) {
      // swallow errors; UX handled by calling code if needed
    } finally {
      if (runId === validationRunIdRef.current) {
        setValidatingPrices(false);
      }
    }
  }, [withTimeout]);

  // Validation effect for manual trigger
  useEffect(() => {
    if (forceValidationTrigger === 0) return; // skip initial render
    const currentCartItems = latestCartItemsRef.current;
    if (currentCartItems.length === 0) return;
    runValidation(currentCartItems);
  }, [forceValidationTrigger, runValidation]);

  // Initialize analytics
  const analytics = useCallback(() => PriceValidationAnalytics.getInstance(), []);

  // Validate on load and when coming back from modals
  // IMPORTANT: Do NOT depend on validatingPrices here (causes infinite loop)
  useEffect(() => {
    const currentCartItems = latestCartItemsRef.current;
    if (currentCartItems.length === 0) return;

    const validateOnLoad = async () => {
      try {
        const runId = ++validationRunIdRef.current;
        setValidatingPrices(true);
        const result = await withTimeout(validateCartPricesAdvanced(currentCartItems, true), 8000, 'Price validation timed out');
        if (runId !== validationRunIdRef.current) return;
        if (result.hasChanges && result.priceChanges.length > 0) {
          const convertedResult = {
            isValid: result.isValid,
            hasChanges: result.hasChanges,
            updatedItems: result.updatedItems,
            priceChanges: result.priceChanges.map((change: any) => ({
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
          if (!priceChangeModalOpen && !reviewOpen) {
            setPriceChangeModalOpen(true);
          }
        } else {
          setPriceValidationResult(null);
        }
      } catch (error) {
        // no-op; we don't block the UI here
      } finally {
        // only the latest run clears the spinner
        if (validationRunIdRef.current) {
          setValidatingPrices(false);
        }
      }
    };

    validateOnLoad();
  }, [priceChangeModalOpen, reviewOpen, withTimeout]);

  // Auto-validate in background every 2 minutes (analytics only; doesn't toggle UI spinner)
  useEffect(() => {
    if (cartItems.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const startTime = Date.now();
        const validation = await validateCartPricesAdvanced(cartItems);
        const duration = Date.now() - startTime;
        analytics().trackValidation(duration, validation.hasChanges);
      } catch (error) {
        PriceValidationErrorTracker.trackError(error as Error, {
          validationType: 'client',
          timestamp: new Date().toISOString(),
          cartItems: cartItems.map(item => ({ id: item.id, name: item.name }))
        });
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [cartItems, analytics]);

  const deliveryCharges = getCartTotal() >= 500 ? 0 : 0;
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
      return item.name;
    }
  };

  const getSecondaryName = (item: any) => {
    if (languageDisplay === 'single') return null;
    if (languageDisplay === 'english-manglish') return item.manglishName;
    return item.malayalamName;
  };

  // Place-order state (single declaration)
  const [placingOrder, setPlacingOrder] = useState(false);

  // Ensure we have max qty in cache for an item
  const ensureMaxQtyKnown = useCallback(async (productId: string) => {
    if (typeof maxQtyRef.current[productId] === 'number') return maxQtyRef.current[productId];
    const max = await getMaxOrderQuantity(productId);
    if (typeof max === 'number') {
      maxQtyRef.current[productId] = max;
      return max;
    }
    return undefined;
  }, [getMaxOrderQuantity]);

  // Proceed to checkout with validations (rate-limits, stock, prices)
  const handleProceedToCheckout = async () => {
    if (!userId || accessError) return;

    setPriceValidationResult(null);
    setValidatingPrices(true);
    setRateLimitStatus({ checking: true, allowed: true });

    const startTime = Date.now();

    try {
      // Rate limit check first
      const rateLimits = await telegramRateLimit.canPlaceOrder();
      if (!rateLimits.allowed && !rateLimits.exemptionReason) {
        setRateLimitStatus({
          checking: false,
          allowed: false,
          reason: rateLimits.reason,
          retryAfter: rateLimits.retryAfter,
          cooldownType: rateLimits.cooldownType
        });
        setValidatingPrices(false);
        return;
      } else {
        setRateLimitStatus({
          checking: false,
          allowed: true,
          exemptionReason: rateLimits.exemptionReason
        });
      }

      // Enforce per-product max quantities before moving on
      const maxMap = await getAllMaxOrderQuantities();
      let hadViolations = false;
      for (const item of latestCartItemsRef.current) {
        const max = typeof maxMap[item.id] === 'number' ? maxMap[item.id] : undefined;
        if (typeof max === 'number' && item.quantity > max) {
          hadViolations = true;
          const adjusted = Math.max(0, Math.min(item.quantity, max));
          if (adjusted === 0) {
            removeFromCart(item.id);
          } else if (adjusted !== item.quantity) {
            updateQuantity(item.id, adjusted);
          }
        }
      }
      if (hadViolations) {
        alert('We have limited stock for some items. Quantities were adjusted to the maximum allowed.');
        setValidatingPrices(false);
        return;
      }

      const currentCartItems = latestCartItemsRef.current;
      if (currentCartItems.length === 0) {
        setValidatingPrices(false);
        return;
      }

      // Revalidate availability against backend
      const unavailableItems = await revalidateCartAvailability();
      if (unavailableItems.length > 0) {
        alert(`Some items are no longer available: ${unavailableItems.map(i => i.name).join(', ')}`);
        unavailableItems.forEach(item => removeFromCart(item.id));
        setValidatingPrices(false);
        return;
      }

      // Price validation (with timeout protection)
      const validation = await withTimeout(validateCartPricesAdvanced(currentCartItems, true), 8000, 'Price validation timed out');
      const duration = Date.now() - startTime;
      analytics().trackValidation(duration, validation.hasChanges);

      // Remove unavailable items reported by validation
      if (validation.unavailableItems.length > 0) {
        alert(`Some items are no longer available: ${validation.unavailableItems.map(item => item.name).join(', ')}`);
        validation.unavailableItems.forEach(item => removeFromCart(item.id));
        setValidatingPrices(false);
        return;
      }

      // Stock warnings (ask user to continue)
      if (validation.stockWarnings.length > 0) {
        const stockMessages = validation.stockWarnings.map((warning: any) =>
          `${warning.itemName}: Only ${warning.availableStock} left (you wanted ${warning.requestedQuantity})`
        ).join('\n');

        if (!confirm(`Stock limitations detected:\n${stockMessages}\n\nContinue with available quantities?`)) {
          setValidatingPrices(false);
          return;
        }
      }

      // If prices changed, show modal; otherwise open review
      if (validation.hasChanges) {
        const filteredUpdatedItems = validation.updatedItems.filter((item: any) => item.available !== false);
        setPriceValidationResult({ ...validation, updatedItems: filteredUpdatedItems });
        setPriceChangeModalOpen(true);
      } else {
        if (onOpenOrderReview) onOpenOrderReview();
        setReviewOpen(true);
      }
    } catch (error) {
      PriceValidationErrorTracker.trackError(error as Error, {
        userId,
        cartItems: cartItems.map(item => ({ id: item.id, name: item.name })),
        validationType: 'client',
        timestamp: new Date().toISOString()
      });
      if (confirm('Unable to verify current prices. This may result in price differences. Continue anyway?')) {
        if (onOpenOrderReview) onOpenOrderReview();
        setReviewOpen(true);
      }
    } finally {
      setValidatingPrices(false);
    }
  };

  // Accept updated prices
  const handleAcceptPriceChanges = () => {
    if (priceValidationResult?.updatedItems) {
      const filteredUpdatedItems = priceValidationResult.updatedItems.filter((item: any) => item.available !== false);
      updateCartPrices(filteredUpdatedItems);
      setPriceValidationResult(null);
      setPriceChangeModalOpen(false);
      setTimeout(() => {
        if (onOpenOrderReview) onOpenOrderReview();
        setReviewOpen(true);
      }, 500);
    } else {
      setPriceValidationResult(null);
      setPriceChangeModalOpen(false);
    }
  };

  // Reject updated prices (remove changed items)
  const handleRejectPriceChanges = () => {
    const itemsToRemove = priceValidationResult?.priceChanges?.map((change: any) => change.itemId) || [];
    if (itemsToRemove.length > 0) {
      itemsToRemove.forEach((itemId: string) => {
        removeFromCart(itemId);
      });
    }
    setPriceValidationResult(null);
    setPriceChangeModalOpen(false);
    analytics().trackOrderCancellation('price_change');
  };

  // Place order: dispatch success immediately on HTTP 200 to avoid UI stall
  const handlePlaceOrder = async ({ address, message, paymentMethod, paymentData, cartItems: orderCartItems }: {
    address: any;
    message: string;
    paymentMethod: 'cod' | 'online';
    paymentData?: any;
    cartItems?: any[];
  }) => {
    if (placingOrder) return;
    if (!userId || accessError || !address) {
      return;
    }
    if (!deliveryAllowed) {
      if (onOrderPlaced) onOrderPlaced(false, 'Delivery not allowed in your area.');
      window.dispatchEvent(new CustomEvent('orderPlacementResult', {
        detail: { success: false, message: 'Delivery not allowed in your area.' }
      }));
      return;
    }

    const itemsToOrder = orderCartItems || cartItems;

    // Prevent placement with unavailable items
    const unavailableItems = itemsToOrder.filter((item: any) => item.available === false);
    if (unavailableItems.length > 0) {
      const msg = `Some items are no longer available: ${unavailableItems.map((i: any) => i.name).join(', ')}`;
      alert(msg);
      unavailableItems.forEach((item: any) => removeFromCart(item.id));
      window.dispatchEvent(new CustomEvent('orderPlacementResult', {
        detail: { success: false, message: msg }
      }));
      return;
    }

    setPlacingOrder(true);

    try {
      const payload = {
        userId,
        address,
        items: itemsToOrder.map((item: any) => ({
          id: item.id,
          quantity: item.quantity
        })),
        paymentMethod,
        paymentMeta: paymentData ? {
          razorpayOrderId: paymentData.razorpayOrderId,
          razorpayPaymentId: paymentData.razorpayPaymentId,
          razorpaySignature: paymentData.razorpaySignature,
          amount: paymentData.amount
        } : undefined,
        specialInstructions: message?.trim() || null
      };

      const resp = await fetch(`${BACKEND_URL}/place-order-secure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Success: notify UI immediately; do not wait for resp.json()
      if (resp.ok) {
        if (onOrderPlaced) {
          onOrderPlaced(true, paymentMethod === 'cod' ? 'Order placed successfully!' : 'Payment successful! Order placed.');
        }
        window.dispatchEvent(new CustomEvent('orderPlacementResult', {
          detail: { success: true }
        }));
        setPlacingOrder(false);
        return;
      }

      // Handle non-200 errors (best-effort parse)
      let data: any = {};
      try {
        data = await resp.json();
      } catch (parseError) {
        console.warn('Failed to parse error response JSON:', parseError);
        data = { error: 'Server response error' };
      }

      const details = (data.details || data.errors) || [];
      const msgList = Array.isArray(details) ? details.map((e: any) => e?.message || e?.code).filter(Boolean) : [];
      const errorMsg = data?.error || (msgList.length ? msgList.join('\n') : 'Failed to place order. Please review your cart and try again.');
      
      if (onOrderPlaced) onOrderPlaced(false, errorMsg);
      window.dispatchEvent(new CustomEvent('orderPlacementResult', {
        detail: { success: false, message: errorMsg }
      }));

    } catch (err) {
      console.error('Order placement network error:', err);
      const msg = 'Failed to place order. Please try again.';
      if (onOrderPlaced) onOrderPlaced(false, msg);
      window.dispatchEvent(new CustomEvent('orderPlacementResult', {
        detail: { success: false, message: msg }
      }));
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleModalClose = () => {
    setReviewOpen(false);
    setPriceValidationResult(null);
    if (onCloseOrderReview) onCloseOrderReview();
    setTimeout(() => {
      triggerValidation();
    }, 100);
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (seconds < 3600) {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.ceil((seconds % 3600) / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` and ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`;
    }
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
        cartItems={latestCartItemsRef.current}
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

      {/* Rate limit warning (only show if no exemption) */}
      {rateLimitStatus.reason && !rateLimitStatus.allowed && !rateLimitStatus.exemptionReason && (
        <div className="max-w-lg mx-auto mt-4">
          <div className="flex items-center bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-lg shadow">
            <AlertTriangle className="mr-2 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">Order Limit Reached</div>
              <div className="text-sm">
                {rateLimitStatus.reason}
                {rateLimitStatus.retryAfter && rateLimitStatus.retryAfter > 0 && (
                  <div className="mt-1 text-red-600 font-medium">
                    Try again in: {formatTimeRemaining(rateLimitStatus.retryAfter)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Exemption Notice (only show if exemption is active and allowed) */}
      {rateLimitStatus.exemptionReason && rateLimitStatus.allowed && (
        <div className="max-w-lg mx-auto mt-4">
          <div className="flex items-center bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 rounded-lg shadow">
            <div>
              <div className="font-semibold mb-1">Order Cancellation Exemption</div>
              <div className="text-sm">
                Since you recently cancelled an order, you can place a new order immediately. 
                This exemption is one-time only.
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
                  {item.available === false && (
                    <span className="text-red-600 text-xs font-semibold ml-2">Out of Stock</span>
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
                  onClick={async () => {
                    const nextQty = item.quantity + 1;
                    let max = maxQtyRef.current[item.id];
                    if (typeof max !== 'number') {
                      const fetched = await ensureMaxQtyKnown(item.id);
                      if (typeof fetched === 'number') {
                        max = fetched;
                      }
                    }
                    if (typeof max === 'number' && nextQty > max) {
                      alert('We have limited stock for this item.');
                      return;
                    }
                    updateQuantity(item.id, nextQty);
                  }}
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
          className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-colors ${(!userId || accessError || validatingPrices || rateLimitStatus.checking || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)) ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
          disabled={!userId || !!accessError || authLoading || validatingPrices || rateLimitStatus.checking || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)}
        >
          {validatingPrices
            ? 'Validating Prices...'
            : rateLimitStatus.checking
            ? 'Checking Limits...'
            : (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)
            ? 'Order Limit Reached'
            : (!userId || accessError)
            ? 'Registration Required'
            : t('proceedToCheckout') + ` • ₹${grandTotal}`}
        </button>
      </div>
    </div>
  );
};

export default CartPage;