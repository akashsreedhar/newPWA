import React, { useState, useEffect, useRef, useCallback } from 'react';
import Confetti from 'react-confetti';
import { useAddresses } from '../hooks/useAddresses';
import AddressModal, { Address } from './AddressModal';
import { useCart } from '../contexts/CartContext';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { telegramRateLimit } from '../services/TelegramRateLimit';
import { AlertTriangle } from 'lucide-react';
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

interface OrderReviewModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: any[];
  onPlaceOrder: (order: { address: any; message: string; paymentMethod: 'cod' | 'online'; paymentData?: any; customerName?: string; customerPhone?: string; cartItems?: any[] }) => Promise<any> | void;
  onClearCart?: () => void;
  onNavigateToOrders?: () => void;
  userId?: string | null;
  disableOrderReview?: boolean;
  deliveryAllowed?: boolean;
  deliveryCheckPending?: boolean;
  loading?: boolean;
}

function useUser(userId?: string | null) {
  const [user, setUser] = useState<{ name?: string; phone?: string } | null>(null);
  useEffect(() => {
    if (!userId) {
      setUser(null);
      return;
    }
    getDoc(doc(db, "users", String(userId))).then(snap => {
      if (snap.exists()) setUser(snap.data() as any);
      else setUser(null);
    });
  }, [userId]);
  return user;
}

const productCategoriesCache = new Map<string, string>();

const OrderReviewModal: React.FC<OrderReviewModalProps> = ({
  open,
  onClose,
  cartItems: propCartItems,
  onPlaceOrder,
  onClearCart,
  onNavigateToOrders,
  userId,
  disableOrderReview = false,
  deliveryAllowed = true,
  deliveryCheckPending = false,
  loading = false,
}) => {
  const user = useUser(userId);
  const { cartItems: contextCartItems, removeFromCart, revalidateCartAvailability } = useCart();
  let cartItems = propCartItems && propCartItems.length > 0 ? propCartItems : contextCartItems;

  useEffect(() => {
    if (!open) return;
    const unavailableItems = cartItems.filter(item => item.available === false);
    if (unavailableItems.length > 0) {
      unavailableItems.forEach(item => removeFromCart(item.id));
    }
    // eslint-disable-next-line
  }, [open, cartItems, removeFromCart]);
  cartItems = cartItems.filter(item => item.available !== false);

  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [step, setStep] = useState<'idle' | 'progress' | 'payment' | 'confetti' | 'checkmark'>('idle');
  const [progress, setProgress] = useState(0);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkmarkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendResultTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForBackendRef = useRef(false);

  const [rateLimitStatus, setRateLimitStatus] = useState<{
    checking: boolean;
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
    activeOrders?: number;
    exemptionReason?: string;
    cooldownType?: string;
  }>({ checking: true, allowed: true });

  const orderPlacementRef = useRef(false);
  const orderIdRef = useRef<string | null>(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const {
    addresses,
    selectedAddress,
    loading: addressesLoading,
    saveAddress,
    deleteAddress,
    selectAddress,
    refreshAddresses,
    error: addressesError
  } = useAddresses(userId);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressModalKey, setAddressModalKey] = useState(0);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) { }
    };
  }, []);

  useEffect(() => {
    if (open && userId) {
      setRateLimitStatus(prev => ({ ...prev, checking: true }));
      const checkRateLimit = async () => {
        try {
          const result = await telegramRateLimit.canPlaceOrder();
          setRateLimitStatus({
            checking: false,
            allowed: result.allowed,
            reason: result.reason,
            retryAfter: result.retryAfter,
            activeOrders: result.activeOrders,
            exemptionReason: result.exemptionReason,
            cooldownType: result.cooldownType
          });
        } catch (error) {
          console.error('Rate limit check failed:', error);
          setRateLimitStatus({ checking: false, allowed: true });
        }
      };
      checkRateLimit();
    }
  }, [open, userId]);

  useEffect(() => {
    if (open) {
      console.log('📦 OrderReviewModal opened with cart items:', {
        propItems: propCartItems?.length || 0,
        contextItems: contextCartItems?.length || 0,
        usingItems: cartItems?.length || 0,
        items: cartItems?.map(item => ({ id: item.id, name: item.name, price: item.price }))
      });
    }
  }, [open, propCartItems, contextCartItems, cartItems]);

  useEffect(() => {
    if (open && !addressesLoading && addresses.length === 0) {
      setAddressModalMode('add');
      setAddressModalOpen(true);
    }
  }, [open, addressesLoading, addresses.length]);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setError(null);
      setPaymentMethod('cod');
      setProcessingPayment(false);
      setPaymentCompleted(false);
      setVerifyingPayment(false);
      setAddressModalOpen(false);
      setEditingAddress(null);
      setAddressModalMode('list');
      setProgress(0);
      setOrderPlaced(false);
      setStep('idle');
      setRateLimitStatus({ checking: false, allowed: true });
      orderPlacementRef.current = false;
      orderIdRef.current = null;
      waitingForBackendRef.current = false;
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (checkmarkTimeout.current) clearTimeout(checkmarkTimeout.current);
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
      if (backendResultTimeout.current) clearTimeout(backendResultTimeout.current);
    }
  }, [open]);

  const [addressLoadError, setAddressLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (addressesError) {
      setAddressLoadError('Failed to load addresses. Please try again.');
    } else {
      setAddressLoadError(null);
    }
  }, [addressesError]);

  const canCloseAddressModal = addresses.length > 0;

  const total = cartItems.reduce((sum, item) => sum + ((item.sellingPrice || item.price) * item.quantity), 0);
  const totalMRP = cartItems.reduce((sum, item) => sum + ((item.mrp || item.sellingPrice || item.price) * item.quantity), 0);
  const totalSavings = totalMRP - total;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const isCodDisabled = total > Number(import.meta.env.VITE_COD_LIMIT)

  useEffect(() => {
    if (isCodDisabled && paymentMethod === 'cod') {
      setPaymentMethod('online');
    }
  }, [isCodDisabled, paymentMethod]);

  const handleSaveAddress = async (address: Address, action: 'add' | 'edit') => {
    setError(null);
    const addressToSave = { ...address, isDefault: true };
    const savedAddress = await saveAddress(addressToSave as any, action);
    await refreshAddresses();
    selectAddress(savedAddress || addressToSave);
    setAddressModalOpen(false);
    setEditingAddress(null);
    setAddressModalMode('list');
  };

  const handleDeleteAddress = async (addressId: string) => {
    setError(null);
    await deleteAddress(addressId);
    await refreshAddresses();
    if (selectedAddress && selectedAddress.id === addressId) {
      selectAddress(null);
    }
  };

  const handleSelectAddress = (address: Address) => {
    setError(null);
    selectAddress(address);
    setAddressModalOpen(false);
    setEditingAddress(null);
    setAddressModalMode('list');
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setAddressModalMode('add');
    setAddressModalOpen(false);
    setAddressModalKey(prev => prev + 1);
    setTimeout(() => {
      setAddressModalOpen(true);
    }, 10);
  };

  const handleChangeAddress = () => {
    setAddressModalMode('list');
    setAddressModalOpen(true);
  };

  // Helper: proceed to success animations (unchanged visuals)
  const runSuccessAnimations = useCallback(() => {
    setStep('confetti');
    confettiTimeout.current = setTimeout(() => {
      setStep('checkmark');
      checkmarkTimeout.current = setTimeout(() => {
        if (onNavigateToOrders) onNavigateToOrders();
        if (onClearCart) onClearCart();
        if (onClose) onClose();
        redirectTimeout.current = setTimeout(() => {
          setStep('idle');
          setOrderPlaced(false);
          setPaymentCompleted(false);
          setProgress(0);
        }, 500);
      }, 3000);
    }, 4000);
  }, [onNavigateToOrders, onClearCart, onClose]);

  // Listen for backend placement result emitted by CartPage
  useEffect(() => {
    const handler = (evt: Event) => {
      const e = evt as CustomEvent;
      const success = !!e.detail?.success;
      const message = e.detail?.message as string | undefined;

      waitingForBackendRef.current = false;
      if (backendResultTimeout.current) {
        clearTimeout(backendResultTimeout.current);
        backendResultTimeout.current = null;
      }
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }

      if (success) {
        setOrderPlaced(true);
        setProgress(100);
        runSuccessAnimations();
      } else {
        setError(message || 'Failed to place order. Please try again.');
        setStep('idle');
        setProgress(0);
        orderPlacementRef.current = false;
      }
    };

    window.addEventListener('orderPlacementResult', handler as EventListener);
    return () => {
      window.removeEventListener('orderPlacementResult', handler as EventListener);
    };
  }, [runSuccessAnimations]);

  // Animate progress patiently up to 90% while waiting
  const startProgressToNinety = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setStep('progress');
    setProgress(5);
    progressInterval.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        const inc = Math.max(1, Math.min(6, Math.random() * 8));
        return Math.min(prev + inc, 90);
      });
    }, 140);
  };

  // --------------- moved helpers ABOVE usage to avoid TDZ ---------------

  const enrichCartItemsWithCategory = useCallback(async (items: any[]) => {
    const enrichedItems = [...items];
    await Promise.all(
      enrichedItems.map(async (item) => {
        if (item.category) return;
        if (productCategoriesCache.has(item.id)) {
          item.category = productCategoriesCache.get(item.id) as string;
          return;
        }
        try {
          const docSnap = await getDoc(doc(db, "products", item.id));
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            item.category = data.category || '';
            productCategoriesCache.set(item.id, item.category);
          }
        } catch (error) {
          console.error(`Failed to fetch category for product ${item.id}:`, error);
        }
      })
    );
    return enrichedItems;
  }, []);

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

  const isLikelyFastFood = (item: any) => {
    const c = String(item?.category || '').toLowerCase();
    const byCategory = c.includes('fast') && c.includes('food');
    const byFields =
      item?.spiceLevel !== undefined ||
      item?.isVeg !== undefined ||
      !!item?.fssaiLicenseNumber ||
      !!item?.ingredients ||
      !!item?.servingSize ||
      !!item?.preparationDate ||
      !!item?.bestBefore ||
      !!item?.storageInstructions;
    return byCategory || byFields;
  };

  const ensureOrderingAllowed = useCallback(async (): Promise<{ allowed: boolean; enriched: any[] }> => {
    try {
      const enriched = await enrichCartItemsWithCategory(cartItems);
      const hasFastFood = enriched.some(isLikelyFastFood);

      const resp = await fetch(`${BACKEND_URL}/operating-hours`, { cache: 'no-store' });
      if (!resp.ok) {
        setError('Unable to verify operating hours. Please try again.');
        return { allowed: false, enriched };
      }
      const status = await resp.json();

      if (!status?.store?.open) {
        const retryTxt =
          typeof status?.store?.countdownSeconds === 'number' && status.store.countdownSeconds > 0
            ? ` Opens in ${formatTimeRemaining(Math.ceil(status.store.countdownSeconds))}.`
            : '';
        setError(`Store is closed.${retryTxt}`);
        return { allowed: false, enriched };
      }

      if (hasFastFood && !status?.fast_food?.open) {
        const retryTxt =
          typeof status?.fast_food?.countdownSeconds === 'number' && status.fast_food.countdownSeconds > 0
            ? ` Opens in ${formatTimeRemaining(Math.ceil(status.fast_food.countdownSeconds))}.`
            : '';
        const hasGroceryToo = enriched.some(i => !isLikelyFastFood(i));

        if (hasGroceryToo) {
          const ok = confirm(`Fast Food is unavailable right now.${retryTxt}\n\nRemove Fast Food items and continue with groceries?`);
          if (ok) {
            enriched.forEach(i => { if (isLikelyFastFood(i)) removeFromCart(i.id); });
            const onlyGroceries = enriched.filter(i => !isLikelyFastFood(i));
            return { allowed: true, enriched: onlyGroceries };
          }
        }
        setError(`Fast Food is unavailable right now.${retryTxt}`);
        return { allowed: false, enriched };
      }

      return { allowed: true, enriched };
    } catch {
      setError('Unable to verify operating hours. Please try again.');
      return { allowed: false, enriched: cartItems };
    }
  }, [cartItems, enrichCartItemsWithCategory, removeFromCart, setError]);

  // ------------------------- end moved helpers --------------------------

  // COD: place order immediately; animate while waiting
  const startImmediatePlacementCOD = useCallback(async () => {
    try {
      const pre = await ensureOrderingAllowed();
      if (!pre.allowed) {
        setStep('idle');
        return;
      }

      startProgressToNinety();

      const enrichedCartItems = pre.enriched;
      waitingForBackendRef.current = true;

      const maybePromise = onPlaceOrder && onPlaceOrder({
        address: selectedAddress,
        message,
        paymentMethod: 'cod',
        customerName: user?.name,
        customerPhone: user?.phone,
        cartItems: enrichedCartItems,
      });
      await Promise.resolve(maybePromise);

      if (backendResultTimeout.current) clearTimeout(backendResultTimeout.current);
      backendResultTimeout.current = setTimeout(() => {
        if (!waitingForBackendRef.current) return;
        setError('Taking longer than expected to confirm your order. Please check your Orders page or try again.');
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
          progressInterval.current = null;
        }
        setStep('idle');
        setProgress(0);
        orderPlacementRef.current = false;
        waitingForBackendRef.current = false;
      }, 15000);
    } catch (error) {
      console.error('Order placement failed:', error);
      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = null;
      setError('Failed to place order. Please try again.');
      setStep('idle');
      setProgress(0);
      orderPlacementRef.current = false;
      waitingForBackendRef.current = false;
    }
  }, [ensureOrderingAllowed, message, onPlaceOrder, selectedAddress, user?.name, user?.phone]);

  // Razorpay Payment Handler (uses centralized BACKEND_URL)
  const handleRazorpayPayment = async () => {
    const pre = await ensureOrderingAllowed();
    if (!pre.allowed) {
      setProcessingPayment(false);
      setVerifyingPayment(false);
      setStep('idle');
      return;
    }

    if (!(window as any).Razorpay) {
      setError('Payment system not loaded. Please refresh and try again.');
      return;
    }
    setProcessingPayment(true);
    setVerifyingPayment(false);

    try {
      const orderResponse = await fetch(`${BACKEND_URL}/create-razorpay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          currency: 'INR',
          receipt: `order_${Date.now()}`,
          items: pre.enriched.map((i: any) => ({ id: i.id, quantity: i.quantity }))
        })
      });

      if (!orderResponse.ok) {
        let errMsg = 'Failed to create payment order';
        try {
          const data = await orderResponse.json();
          if (orderResponse.status === 403 && (data?.code === 'STORE_CLOSED' || data?.code === 'SERVICE_CLOSED')) {
            const prefix = data?.code === 'STORE_CLOSED' ? 'Store is closed.' : 'Fast Food is unavailable right now.';
            const retryTxt =
              typeof data?.retryAfter === 'number' && data.retryAfter > 0
                ? ` Opens in ${formatTimeRemaining(Math.ceil(data.retryAfter))}.`
                : '';
            errMsg = `${prefix}${retryTxt}`;
          } else if (data?.error) {
            errMsg = data.error;
          }
        } catch { }
        throw new Error(errMsg);
      }

      const orderData = await orderResponse.json();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY,
        amount: orderData.amount,
        currency: orderData.currency,
        name: import.meta.env.VITE_BUSINESS_NAME || 'SuperMarket',
        description: import.meta.env.VITE_PAYMENT_DESCRIPTION || 'Grocery Order Payment',
        order_id: orderData.id,
        prefill: {
          name: (selectedAddress as any)?.label || 'Customer',
          contact: (selectedAddress as any)?.phone || '',
        },
        config: {
          display: {
            blocks: {
              utib: {
                name: 'Pay using UPI',
                instruments: [
                  { method: 'upi', flows: ['collect', 'intent', 'qr'] },
                  { method: 'wallet', wallets: ['paytm', 'phonepe', 'googlepay'] }
                ]
              },
              other: {
                name: 'Other Payment Methods',
                instruments: [
                  { method: 'card' },
                  { method: 'netbanking' }
                ]
              }
            },
            hide: [{ method: 'emi' }],
            sequence: ['block.utib', 'block.other'],
            preferences: { show_default_blocks: false }
          }
        },
        handler: async (response: any) => {
          try {
            setVerifyingPayment(true);
            const verifyResponse = await fetch(`${BACKEND_URL}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            if (!verifyResponse.ok) {
              throw new Error('Payment verification failed');
            }

            const verifyData = await verifyResponse.json();

            if (verifyData.status === 'success') {
              setPaymentCompleted(true);
              setProcessingPayment(false);
              setVerifyingPayment(false);

              waitingForBackendRef.current = true;

              startProgressToNinety();

              const maybePromise = onPlaceOrder && onPlaceOrder({
                address: selectedAddress,
                message,
                paymentMethod: 'online',
                customerName: user?.name,
                customerPhone: user?.phone,
                cartItems: pre.enriched,
                paymentData: {
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  amount: total,
                  status: 'paid'
                }
              });
              await Promise.resolve(maybePromise);

              if (backendResultTimeout.current) clearTimeout(backendResultTimeout.current);
              backendResultTimeout.current = setTimeout(() => {
                if (!waitingForBackendRef.current) return;
                setError('Taking longer than expected to confirm your order. Please check your Orders page or try again.');
                if (progressInterval.current) {
                  clearInterval(progressInterval.current);
                  progressInterval.current = null;
                }
                setStep('idle');
                setProgress(0);
                orderPlacementRef.current = false;
                waitingForBackendRef.current = false;
              }, 15000);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (verifyError) {
            console.error('❌ Payment verification error:', verifyError);
            setError('Payment verification failed. Please contact support.');
            setProcessingPayment(false);
            setVerifyingPayment(false);
            setStep('idle');
          }
        },
        modal: {
          ondismiss: () => {
            setProcessingPayment(false);
            setVerifyingPayment(false);
            setStep('idle');
          }
        },
        theme: { color: '#14b8a6' }
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();

    } catch (error: any) {
      console.error('❌ Razorpay payment error:', error);
      setError(error?.message || 'Payment failed. Please try again.');
      setProcessingPayment(false);
      setVerifyingPayment(false);
      setStep('idle');
    }
  };

  const renderRateLimitStatus = () => {
    if (rateLimitStatus.checking) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            <span className="text-blue-800 text-sm"> Hang tight...</span>
          </div>
        </div>
      );
    }
    if (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) {
      return (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-orange-500 mt-0.5" size={18} />
            <div>
              <p className="text-orange-700 text-sm font-semibold mb-1">
                Order limit reached for now
              </p>
              <p className="text-orange-600 text-xs">
                You’ve reached the maximum number of orders allowed at this time.
                {rateLimitStatus.retryAfter && rateLimitStatus.retryAfter > 0 && (
                  <>
                    <br />
                    <span>
                      Please try again in {formatTimeRemaining(rateLimitStatus.retryAfter)}.
                    </span>
                  </>
                )}
                {rateLimitStatus.activeOrders && rateLimitStatus.activeOrders > 0 && (
                  <>
                    <br />
                    <span>
                      You currently have {rateLimitStatus.activeOrders} active order{rateLimitStatus.activeOrders > 1 ? 's' : ''}.
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // Place order entry point from button
  const handlePlaceOrder = async () => {
    if (orderPlacementRef.current || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)) {
      console.warn('Order placement blocked - rate limit or already processing');
      return;
    }
    orderPlacementRef.current = true;
    setError(null);

    // Pre-checks
    if (revalidateCartAvailability) {
      const unavailableItemsRemote = await revalidateCartAvailability();
      if (unavailableItemsRemote.length > 0) {
        setError(`Some items are out of stock: ${unavailableItemsRemote.map(i => i.name).join(', ')}`);
        orderPlacementRef.current = false;
        return;
      }
    }
    const unavailableItemsLocal = cartItems.filter(item => item.available === false);
    if (unavailableItemsLocal.length > 0) {
      setError(`Some items are out of stock: ${unavailableItemsLocal.map(i => i.name).join(', ')}`);
      orderPlacementRef.current = false;
      return;
    }
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      orderPlacementRef.current = false;
      return;
    }
    if (!deliveryAllowed) {
      setError('Delivery is not available to your selected address.');
      orderPlacementRef.current = false;
      return;
    }
    if (step !== 'idle' && step !== 'payment') {
      orderPlacementRef.current = false;
      return;
    }

    // Final rate limit re-check
    try {
      setRateLimitStatus(prev => ({ ...prev, checking: true }));
      const fresh = await telegramRateLimit.canPlaceOrder();
      setRateLimitStatus({
        checking: false,
        allowed: fresh.allowed,
        reason: fresh.reason,
        retryAfter: fresh.retryAfter,
        activeOrders: fresh.activeOrders,
        exemptionReason: fresh.exemptionReason,
        cooldownType: fresh.cooldownType
      });
      if (!fresh.allowed && !fresh.exemptionReason) {
        orderPlacementRef.current = false;
        return;
      }
    } catch (finalCheckErr) {
      setRateLimitStatus(prev => ({ ...prev, checking: false }));
    }

    try {
      if (paymentMethod === 'cod') {
        await startImmediatePlacementCOD();
      } else {
        setStep('payment');
        handleRazorpayPayment();
      }
    } catch (error) {
      console.error('Order placement failed:', error);
      orderPlacementRef.current = false;
      setError('Failed to place order. Please try again.');
    }
  };

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (checkmarkTimeout.current) clearTimeout(checkmarkTimeout.current);
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
      if (backendResultTimeout.current) clearTimeout(backendResultTimeout.current);
      orderPlacementRef.current = false;
      waitingForBackendRef.current = false;
    };
  }, []);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || typeof tg.onEvent !== 'function') return;
    if (!open) return;
    const handleTelegramBack = () => {
      if (onClose) onClose();
    };
    tg.onEvent('backButtonClicked', handleTelegramBack);
    return () => {
      tg.offEvent('backButtonClicked', handleTelegramBack);
    };
  }, [open, onClose]);

  return (
    <>
      <AddressModal
        key={addressModalKey + '-' + addressModalMode}
        open={addressModalOpen}
        onClose={() => {
          if (canCloseAddressModal) {
            setAddressModalOpen(false);
            setEditingAddress(null);
            setAddressModalMode('list');
          }
        }}
        force={!canCloseAddressModal}
        onSave={handleSaveAddress}
        onDelete={handleDeleteAddress}
        onSelect={handleSelectAddress}
        addresses={addresses}
        selectedAddress={selectedAddress}
        mode={addressModalMode}
        setMode={setAddressModalMode}
      />

      {/* Order Review Modal */}
      {open && !addressModalOpen && (
        <div>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-70"
            onClick={(e) => {
              if (step !== 'idle') {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <div
              className="bg-white rounded-t-2xl shadow-lg w-full max-w-md pt-4 px-4 relative flex flex-col max-h-[calc(100vh-8px)] h-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {step === 'idle' && (
                <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600" onClick={onClose}>&times;</button>
              )}
              <h2 className="text-xl font-bold text-center mb-4">🛒 Review Your Order</h2>

              <div className="flex-1 min-h-0 overflow-y-auto pb-4" style={{ marginBottom: '7rem' }}>
                {disableOrderReview && step === 'idle' && (
                  <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded mb-4">
                    {loading && step === 'idle' ? 'Checking registration status...' : (
                      <>
                        <b>{import.meta.env.VITE_REGISTRATION_TITLE}</b> {import.meta.env.VITE_REGISTRATION_MESSAGE}<br />
                        <b>Step 1:</b> {import.meta.env.VITE_REGISTRATION_STEP1}<br />
                        <b>Step 2:</b> {import.meta.env.VITE_REGISTRATION_STEP2}<br />
                        <b>Step 3:</b> {import.meta.env.VITE_REGISTRATION_STEP3}
                      </>
                    )}
                  </div>
                )}
                {!disableOrderReview && !deliveryAllowed && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-3 rounded mb-4">
                    Delivery is not available to your selected address. Please choose a different address within our delivery area.
                  </div>
                )}
                {step === 'idle' && renderRateLimitStatus()}
                {error && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-2 rounded mb-3 text-sm">{error}</div>
                )}
                <div className="mb-4">
                  <div className="font-semibold mb-2">Delivery Address</div>
                  {addressesLoading ? (
                    <div className="text-gray-500 text-sm flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-teal-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                      Loading address...
                    </div>
                  ) : addressLoadError ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-red-600 text-sm mb-2">{addressLoadError}</div>
                      <button
                        className="bg-teal-600 text-white px-4 py-2 rounded font-semibold text-sm w-full"
                        onClick={() => { refreshAddresses(); setAddressLoadError(null); }}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  ) : selectedAddress ? (
                    <div className="border rounded p-2 flex items-center justify-between border-teal-500 bg-teal-50 mb-2">
                      <div>
                        <div className="font-medium">{selectedAddress.label}</div>
                        <div className="text-xs text-gray-500">{selectedAddress.details}</div>
                        {(selectedAddress as any).phone && (
                          <div className="text-xs text-gray-500">{(selectedAddress as any).phone}</div>
                        )}
                        {selectedAddress.isDefault && <span className="text-xs text-teal-600 font-semibold">Default</span>}
                      </div>
                      <button
                        className="text-xs ml-2 px-2 py-1 rounded bg-teal-100 text-teal-700 font-semibold hover:bg-teal-200 transition border border-teal-200"
                        onClick={handleChangeAddress}
                        type="button"
                      >
                        Change Address
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="text-gray-500 text-sm mb-2">No address selected. Please add one.</div>
                      <button
                        className="bg-teal-600 text-white px-4 py-2 rounded font-semibold text-sm w-full"
                        onClick={handleAddAddress}
                        type="button"
                      >
                        + Add Address
                      </button>
                    </div>
                  )}
                </div>
                <div className="mb-4">
                  <div className="font-semibold mb-2">Payment Method</div>
                  {isCodDisabled && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-2 rounded mb-2 text-xs">
                      Cash on Delivery is not available for this order. Please use Pay Now.
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${isCodDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cod"
                        checked={paymentMethod === 'cod'}
                        onChange={(e) => {
                          if (!isCodDisabled) setPaymentMethod(e.target.value as 'cod');
                        }}
                        className="mr-3 text-teal-600"
                        disabled={isCodDisabled}
                      />
                      <div className="flex items-center">
                        <span className="text-2xl mr-2">💵</span>
                        <div>
                          <div className="font-medium">Cash on Delivery</div>
                          <div className="text-xs text-gray-500">Pay when your order arrives</div>
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="online"
                        checked={paymentMethod === 'online'}
                        onChange={(e) => setPaymentMethod(e.target.value as 'online')}
                        className="mr-3 text-teal-600"
                      />
                      <div className="flex items-center">
                        <span className="text-2xl mr-2">💳</span>
                        <div>
                          <div className="font-medium">Pay Now</div>
                          <div className="text-xs text-gray-500">UPI, Google Pay, Cards & more</div>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="font-semibold mb-1">Special Instructions</div>
                  <textarea
                    className="w-full border rounded p-2 text-sm"
                    placeholder="Any notes for delivery? (optional)"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="mb-4">
                  <div className="font-semibold mb-2">Order Items ({itemCount})</div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-200 mb-2">
                    {cartItems.map((item, idx) => {
                      const finalMrp = item.mrp || item.sellingPrice || item.price;
                      const finalSellingPrice = item.sellingPrice || item.price;
                      const hasOffer = finalMrp > finalSellingPrice;
                      return (
                        <div key={item.id || idx} className="flex justify-between py-2">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {hasOffer ? (
                              <div className="flex flex-col text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-600">₹{finalSellingPrice} × {item.quantity}</span>
                                  <span className="bg-green-100 text-green-800 px-1 py-0.5 rounded text-xs">
                                    {Math.round(((finalMrp - finalSellingPrice) / finalMrp) * 100)}% OFF
                                  </span>
                                </div>
                                <span className="text-gray-500 line-through">₹{finalMrp} × {item.quantity}</span>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500">₹{finalSellingPrice} × {item.quantity}</div>
                            )}
                            {item.available === false && (
                              <div className="text-xs text-red-600 font-semibold mt-1">Out of Stock</div>
                            )}
                          </div>
                          <div className="font-semibold text-teal-600">₹{(finalSellingPrice * item.quantity).toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {totalSavings > 0 && (
                    <div className="bg-green-50 rounded p-2 mb-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">MRP Total</span>
                        <span className="text-gray-500 line-through">₹{totalMRP.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600 font-medium">You Save</span>
                        <span className="text-green-600 font-semibold">₹{totalSavings.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-teal-50 rounded p-2 mt-2">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg text-teal-700">₹{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 bg-white pb-8 pt-2 sticky bottom-0 z-20" style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))', background: 'white' }}>
                <button
                  className={`w-full py-3 rounded-lg font-bold text-white relative overflow-hidden transition-colors ${disableOrderReview || !deliveryAllowed || !selectedAddress || deliveryCheckPending || loading || (step !== 'idle' && step !== 'payment') || processingPayment || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) || rateLimitStatus.checking || orderPlacementRef.current
                    ? 'bg-gray-400 cursor-not-allowed'
                    : step === 'confetti' || step === 'checkmark' || paymentCompleted
                      ? 'bg-green-500'
                      : 'bg-teal-600 hover:bg-teal-700'
                    }`}
                  onClick={handlePlaceOrder}
                  disabled={disableOrderReview || !deliveryAllowed || deliveryCheckPending || loading || (step !== 'idle' && step !== 'payment') || !selectedAddress || processingPayment || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) || rateLimitStatus.checking || orderPlacementRef.current}
                  style={{ minHeight: 48 }}
                >
                  {step === 'progress' ? (
                    <div className="flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-r from-teal-600 to-blue-600" style={{ width: `${progress}%`, transition: 'width 0.2s' }} />
                      <span className="relative z-10">
                        {progress < 100 ? `Placing Order... ${Math.floor(progress)}%` : 'Placing Order... 100%'}
                      </span>
                    </div>
                  ) : verifyingPayment ? (
                    <span>Verifying Payment...</span>
                  ) : step === 'payment' || processingPayment ? (
                    <span>Opening Payment...</span>
                  ) : step === 'confetti' || step === 'checkmark' || paymentCompleted ? (
                    <span>✅ {paymentMethod === 'cod' ? 'Order Placed!' : 'Payment Successful!'}</span>
                  ) : orderPlacementRef.current ? (
                    <span>Processing...</span>
                  ) : rateLimitStatus.checking ? (
                    <span>Checking...</span>
                  ) : !rateLimitStatus.allowed && !rateLimitStatus.exemptionReason ? (
                    <span>Order Limit Reached</span>
                  ) : (
                    <>
                      {paymentMethod === 'cod' ? (
                        <span>🚀 Place Order (COD)</span>
                      ) : (
                        <span>💳 Pay ₹{total.toFixed(2)} & Place Order</span>
                      )}
                    </>
                  )}
                </button>
                <button
                  className="w-full py-2 rounded-lg font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100"
                  onClick={onClose}
                  disabled={loading || (step !== 'idle' && step !== 'payment') || processingPayment}
                >
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {step === 'confetti' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          pointerEvents: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        }}>
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            numberOfPieces={3500}
            recycle={false}
            gravity={0.2}
            initialVelocityY={20}
            initialVelocityX={8}
            colors={[
              '#00ffe1ff', '#01d9ffff', '#10b981', '#0560f3ff', '#5005ffff', '#f30a7eff', '#fca002ff', '#ef4444',
              '#f60d34ff', '#fbbf24', '#fde68a', '#a3e635', '#22d3ee', '#e11d48', '#f472b6', '#facc15',
              '#4ade80', '#38bdf8', '#6366f1', '#d508f5ff', '#f87171', '#f7be03ff', '#a3ff04ff', '#05f5d1ff',
              '#818cf8', '#f1067fff', '#ec7171ff', '#fadd04ff', '#04f85aff', '#022bf6ff', '#f9a8d4', '#fb0606ff'
            ]}
          />
        </div>
      )}
      {step === 'checkmark' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.95)',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          animation: 'fadeInOverlay 0.4s ease-out',
        }}>
          <div style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
            transform: 'scale(0.9)',
            animation: 'scaleInBounce 0.6s cubic-bezier(.68,-0.55,.27,1.55) forwards'
          }}>
            <div style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)',
              boxShadow: '0 20px 60px 0 rgba(16,185,129,0.4), 0 8px 32px 0 rgba(20,184,166,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              animation: 'pulseSuccess 0.8s ease-out',
              border: '6px solid rgba(255, 255, 255, 0.2)',
            }}>
              <div style={{
                position: 'absolute',
                width: '120%',
                height: '120%',
                borderRadius: '50%',
                border: '3px solid rgba(16,185,129,0.3)',
                animation: 'expandRing 1.2s ease-out infinite',
              }} />
              <svg width="90" height="90" viewBox="0 0 90 90" style={{ display: 'block', zIndex: 2 }}>
                <circle
                  cx="45"
                  cy="45"
                  r="40"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2"
                />
                <polyline
                  points="25,47 40,62 70,32"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 80,
                    strokeDashoffset: 80,
                    animation: 'drawCheckmark 0.8s 0.3s cubic-bezier(.68,-0.55,.27,1.55) forwards',
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))'
                  }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                top: '15%',
                right: '15%',
                width: 20,
                height: 20,
                background: 'rgba(255,255,255,0.9)',
                borderRadius: '50%',
                animation: 'sparkle1 1.5s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute',
                bottom: '20%',
                left: '20%',
                width: 12,
                height: 12,
                background: 'rgba(255,255,255,0.7)',
                borderRadius: '50%',
                animation: 'sparkle2 1.8s 0.3s ease-out infinite',
              }} />
            </div>
            <div style={{
              fontSize: 42,
              color: '#ffffff',
              fontWeight: 800,
              letterSpacing: -0.5,
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              textShadow: '0 4px 16px rgba(0,0,0,0.3)',
              opacity: 0,
              transform: 'translateY(20px) scale(0.95)',
              animation: 'fadeInUpText 0.8s 0.4s cubic-bezier(.68,-0.55,.27,1.55) forwards',
              marginBottom: 8,
            }}>
              {paymentMethod === 'cod' ? 'Order Placed!' : 'Payment Successful!'}
            </div>
            <div style={{
              fontSize: 20,
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 500,
              opacity: 0,
              transform: 'translateY(15px)',
              animation: 'fadeInUpText 0.8s 0.7s cubic-bezier(.68,-0.55,.27,1.55) forwards',
              letterSpacing: 0.3,
              textAlign: 'center',
              lineHeight: 1.4,
            }}>
              Thank you for shopping with us!<br />
              <span style={{ fontSize: 16, opacity: 0.7 }}>
                {paymentMethod === 'cod' ? 'Your order is being prepared' : 'Your payment was successful'}
              </span>
            </div>
          </div>
          <style>{`
            @keyframes drawCheckmark {
              0% { stroke-dashoffset: 80; }
              100% { stroke-dashoffset: 0; }
            }
            @keyframes pulseSuccess {
              0% { transform: scale(0.8); opacity: 0; }
              50% { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes scaleInBounce {
              0% { transform: scale(0.3); opacity: 0; }
              50% { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes fadeInUpText {
              0% { opacity: 0; transform: translateY(20px) scale(0.95); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes fadeInOverlay {
              0% { opacity: 0; backdrop-filter: blur(0px); }
              100% { opacity: 1; backdrop-filter: blur(8px); }
            }
            @keyframes expandRing {
              0% { transform: scale(1); opacity: 0.6; }
              100% { transform: scale(1.3); opacity: 0; }
            }
            @keyframes sparkle1 {
              0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
              50% { transform: scale(1) rotate(180deg); opacity: 1; }
            }
            @keyframes sparkle2 {
              0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
              50% { transform: scale(1) rotate(-180deg); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default OrderReviewModal;