import React, { useState, useEffect, useRef } from 'react';
import Confetti from 'react-confetti';
import { useAddresses } from '../hooks/useAddresses';
import AddressModal, { Address } from './AddressModal';
import { useCart } from '../contexts/CartContext';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { telegramRateLimit } from '../services/TelegramRateLimit';
import { AlertTriangle } from 'lucide-react';

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

interface OrderReviewModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: any[];
  onPlaceOrder: (order: { address: any; message: string; paymentMethod: 'cod' | 'online'; paymentData?: any; customerName?: string; customerPhone?: string; cartItems?: any[] }) => void;
  onClearCart?: () => void;
  onNavigateToOrders?: () => void;
  userId?: string | null;
  disableOrderReview?: boolean;
  deliveryAllowed?: boolean;
  deliveryCheckPending?: boolean;
  loading?: boolean;
}

// Hook to fetch user data
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

// Product categories cache to reduce Firebase reads
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
  // Fetch user data using the custom hook
  const user = useUser(userId);

  // Get the latest cart items directly from context as a backup
  const { cartItems: contextCartItems, removeFromCart, revalidateCartAvailability } = useCart();

  // Use context cart items if prop cart items seem stale
  let cartItems = propCartItems && propCartItems.length > 0 ? propCartItems : contextCartItems;

  // PATCH: Remove unavailable items before rendering (prevents ordering them)
  useEffect(() => {
    if (!open) return;
    const unavailableItems = cartItems.filter(item => item.available === false);
    if (unavailableItems.length > 0) {
      unavailableItems.forEach(item => removeFromCart(item.id));
    }
    // eslint-disable-next-line
  }, [open, cartItems, removeFromCart]);

  // After removing unavailable, filter them out for display
  cartItems = cartItems.filter(item => item.available !== false);

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [processingPayment, setProcessingPayment] = useState(false);

  // NEW: State for payment verification
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Animation/order state machine: 'idle' | 'progress' | 'payment' | 'confetti' | 'checkmark'
  const [step, setStep] = useState<'idle' | 'progress' | 'payment' | 'confetti' | 'checkmark'>('idle');
  const [progress, setProgress] = useState(0);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  // Animation timers
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const confettiTimeout = useRef<NodeJS.Timeout | null>(null);
  const checkmarkTimeout = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeout = useRef<NodeJS.Timeout | null>(null);

  // Enhanced rate limiting state with cooldown type tracking
  const [rateLimitStatus, setRateLimitStatus] = useState<{
    checking: boolean;
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
    activeOrders?: number;
    exemptionReason?: string;
    cooldownType?: string;
  }>({ checking: true, allowed: true });

  // Atomic order placement protection
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

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {
        // Script might already be removed
      }
    };
  }, []);

  // Enhanced rate limit check when modal opens
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

  // Log cart items for debugging
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

  // Force address modal if no addresses
  useEffect(() => {
    if (open && !addressesLoading && addresses.length === 0) {
      setAddressModalMode('add');
      setAddressModalOpen(true);
    }
  }, [open, addressesLoading, addresses.length]);

  // Reset state on modal close
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
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (checkmarkTimeout.current) clearTimeout(checkmarkTimeout.current);
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
    }
  }, [open]);

  // Defensive: If address loading fails, show error and allow retry
  const [addressLoadError, setAddressLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (addressesError) {
      setAddressLoadError('Failed to load addresses. Please try again.');
    } else {
      setAddressLoadError(null);
    }
  }, [addressesError]);

  // Prevent closing address modal if no addresses exist
  const canCloseAddressModal = addresses.length > 0;

  // Calculate pricing values with MRP and savings
  const total = cartItems.reduce((sum, item) => sum + ((item.sellingPrice || item.price) * item.quantity), 0);
  const totalMRP = cartItems.reduce((sum, item) => sum + ((item.mrp || item.sellingPrice || item.price) * item.quantity), 0);
  const totalSavings = totalMRP - total;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // COD disable logic
  const isCodDisabled = total > 1000;

  // Auto-switch to online if COD is disabled and user tries to select COD
  useEffect(() => {
    if (isCodDisabled && paymentMethod === 'cod') {
      setPaymentMethod('online');
    }
  }, [isCodDisabled, paymentMethod]);

  // Address handlers
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

  // Razorpay Payment Handler
  const handleRazorpayPayment = async () => {
    if (!window.Razorpay) {
      setError('Payment system not loaded. Please refresh and try again.');
      return;
    }

    setProcessingPayment(true);
    setVerifyingPayment(false);

    try {
      // Create Razorpay order
      const orderResponse = await fetch('https://supermarket-backend-ytrh.onrender.com/create-razorpay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          currency: 'INR',
          receipt: `order_${Date.now()}`
        })
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create payment order');
      }

      const orderData = await orderResponse.json();

      const options = {
        key: 'rzp_test_zkGVsDujuT26zg', // test key
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'SuperMarket',
        description: 'Grocery Order Payment',
        order_id: orderData.id,
        prefill: {
          name: selectedAddress?.label || 'Customer',
          contact: selectedAddress?.phone || '',
        },
        config: {
          display: {
            blocks: {
              utib: {
                name: 'Pay using UPI',
                instruments: [
                  {
                    method: 'upi',
                    flows: ['collect', 'intent', 'qr']
                  },
                  {
                    method: 'wallet',
                    wallets: ['paytm', 'phonepe', 'googlepay']
                  }
                ]
              },
              other: {
                name: 'Other Payment Methods',
                instruments: [
                  {
                    method: 'card'
                  },
                  {
                    method: 'netbanking'
                  }
                ]
              }
            },
            hide: [
              {
                method: 'emi'
              }
            ],
            sequence: ['block.utib', 'block.other'],
            preferences: {
              show_default_blocks: false
            }
          }
        },
        handler: async (response: any) => {
          console.log('💳 Payment successful:', response);

          try {
            setVerifyingPayment(true);

            // Verify payment
            const verifyResponse = await fetch('https://supermarket-backend-ytrh.onrender.com/verify-payment', {
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

              // Use exemption token if available before placing order
              if (rateLimitStatus.exemptionReason) {
                await telegramRateLimit.useExemptionToken();
              }

              // Enrich cart items with category (if not already present)
              const enrichedCartItems = await enrichCartItemsWithCategory(cartItems);

              // Generate order ID
              const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
              orderIdRef.current = orderId;
              
              // Record order in rate limiting system
              if (userId) {
                await telegramRateLimit.recordOrderPlacement(orderId);
              }

              // Place order with payment data
              if (onPlaceOrder) {
                onPlaceOrder({
                  address: selectedAddress,
                  message,
                  paymentMethod: 'online',
                  customerName: user?.name,
                  customerPhone: user?.phone,
                  cartItems: enrichedCartItems,
                  paymentData: {
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                    amount: total,
                    status: 'paid'
                  }
                });
              }

              // Start success animation
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
            console.log('💳 Payment cancelled by user');
            setProcessingPayment(false);
            setVerifyingPayment(false);
            setStep('idle');
          }
        },
        theme: {
          color: '#14b8a6'
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (error) {
      console.error('❌ Razorpay payment error:', error);
      setError('Payment failed. Please try again.');
      setProcessingPayment(false);
      setVerifyingPayment(false);
      setStep('idle');
    }
  };

  // Function to enrich cart items with category information
  const enrichCartItemsWithCategory = async (items: any[]) => {
    // Clone the cart items to avoid modifying the originals
    const enrichedItems = [...items];
    
    // Process items in parallel with Promise.all for efficiency
    await Promise.all(
      enrichedItems.map(async (item) => {
        // Skip if the item already has a category
        if (item.category) return;
        
        // Check the cache first to avoid Firebase reads
        if (productCategoriesCache.has(item.id)) {
          item.category = productCategoriesCache.get(item.id);
          return;
        }
        
        // If not in cache, fetch from Firebase
        try {
          const docSnap = await getDoc(doc(db, "products", item.id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Store category in the item
            item.category = data.category || '';
            // Cache for future use
            productCategoriesCache.set(item.id, item.category);
          }
        } catch (error) {
          console.error(`Failed to fetch category for product ${item.id}:`, error);
          // Continue even if we couldn't get the category
        }
      })
    );
    
    return enrichedItems;
  };

  // Time formatting helper function
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

  // Enhanced render rate limit status
  const renderRateLimitStatus = () => {
    if (rateLimitStatus.checking) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            <span className="text-blue-800 text-sm">Checking order limits...</span>
          </div>
        </div>
      );
    }

    // Only show rate limit warning if no exemption is available
    if (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red-600 mt-0.5" size={16} />
            <div>
              <p className="text-red-700 text-sm font-semibold">Order Limit Reached</p>
              <p className="text-red-600 text-xs mt-1">{rateLimitStatus.reason}</p>
              {rateLimitStatus.retryAfter && rateLimitStatus.retryAfter > 0 && (
                <p className="text-red-600 text-xs mt-1">
                  Try again in: {formatTimeRemaining(rateLimitStatus.retryAfter)}
                </p>
              )}
              {rateLimitStatus.activeOrders && rateLimitStatus.activeOrders > 0 && (
                <p className="text-blue-600 text-xs mt-1">
                  You have {rateLimitStatus.activeOrders} active order(s).
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Show exemption notice only when exemption is active
    if (rateLimitStatus.exemptionReason && rateLimitStatus.allowed) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <div>
              <p className="text-blue-700 text-sm font-semibold">Order Cancellation Exemption</p>
              <p className="text-blue-600 text-xs mt-1">
                Since you recently cancelled an order, you can place a new order immediately.
                This exemption is one-time only and will be used when you place this order.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // Enhanced handle place order with proper exemption handling
  const handlePlaceOrder = async () => {
    // Enhanced order placement blocking
    if (orderPlacementRef.current || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)) {
      console.warn('Order placement blocked - rate limit or already processing');
      return;
    }

    // Set atomic flag to prevent duplicate orders
    orderPlacementRef.current = true;

    setError(null);

    // PATCH: Revalidate cart availability before placing order
    if (revalidateCartAvailability) {
      const unavailableItems = await revalidateCartAvailability();
      if (unavailableItems.length > 0) {
        setError(
          `Some items are out of stock: ${unavailableItems.map(i => i.name).join(', ')}`
        );
        orderPlacementRef.current = false;
        return;
      }
    }

    // AVAILABILITY CHECK (should never trigger now, but keep for safety)
    const unavailableItems = cartItems.filter(item => item.available === false);
    if (unavailableItems.length > 0) {
      setError(
        `Some items are out of stock: ${unavailableItems.map(i => i.name).join(', ')}`
      );
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
    if (step !== 'idle') {
      orderPlacementRef.current = false;
      return;
    }

    try {
      if (paymentMethod === 'cod') {
        setStep('progress');
        let prog = 0;
        setProgress(0);
        
        progressInterval.current = setInterval(() => {
          prog += Math.random() * 18 + 7;
          if (prog >= 100) {
            prog = 100;
            setProgress(100);
            clearInterval(progressInterval.current!);

            if (!orderPlaced) {
              setOrderPlaced(true);

              // Enrich cart items with category information
              enrichCartItemsWithCategory(cartItems).then(async (enrichedItems) => {
                if (onPlaceOrder && orderPlacementRef.current) {
                  // Use exemption token before placing order if available
                  if (rateLimitStatus.exemptionReason) {
                    await telegramRateLimit.useExemptionToken();
                  }

                  // Generate unique order ID
                  const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
                  orderIdRef.current = orderId;
                  
                  // Record order in rate limiting system
                  if (userId) {
                    await telegramRateLimit.recordOrderPlacement(orderId);
                  }
                  
                  onPlaceOrder({
                    address: selectedAddress,
                    message,
                    paymentMethod: 'cod',
                    customerName: user?.name,
                    customerPhone: user?.phone,
                    cartItems: enrichedItems,
                  });
                }
              });
            }

            setTimeout(() => {
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
                    setProgress(0);
                  }, 500);
                }, 3000);
              }, 4000);
            }, 500);
          } else {
            setProgress(Math.min(prog, 99));
          }
        }, 120);
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

  // Clean up function
  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (checkmarkTimeout.current) clearTimeout(checkmarkTimeout.current);
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
      orderPlacementRef.current = false;
    };
  }, []);

  // --- Telegram back button integration for modal ---
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
                {/* Registration warning */}
                {disableOrderReview && step === 'idle' && (
                  <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded mb-4">
                    {loading && step === 'idle' ? 'Checking registration status...' : (
                      <>
                        <b>Registration Required:</b> Please register via the SuperMarket Telegram bot before placing an order.<br />
                        <b>Step 1:</b> Go to the SuperMarket Telegram bot.<br />
                        <b>Step 2:</b> Complete registration by sharing your name, phone, and location.<br />
                        <b>Step 3:</b> Then return here and try again!
                      </>
                    )}
                  </div>
                )}

                {/* Delivery area warning */}
                {!disableOrderReview && !deliveryAllowed && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-3 rounded mb-4">
                    Delivery is not available to your selected address. Please choose a different address within our delivery area.
                  </div>
                )}

                {/* Enhanced rate limit status */}
                {step === 'idle' && renderRateLimitStatus()}

                {/* Error message */}
                {error && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-2 rounded mb-3 text-sm">{error}</div>
                )}

                {/* Address Section */}
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

                {/* Payment Method Selection */}
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

                {/* Special Instructions */}
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

                {/* Order Items */}
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

                  {/* Savings display */}
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

              {/* Enhanced Action Buttons */}
              <div className="flex flex-col gap-2 bg-white pb-8 pt-2 sticky bottom-0 z-20" style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))', background: 'white' }}>
                <button
                  className={`w-full py-3 rounded-lg font-bold text-white relative overflow-hidden transition-colors ${
                    disableOrderReview || !deliveryAllowed || !selectedAddress || deliveryCheckPending || loading || (step !== 'idle' && step !== 'payment') || processingPayment || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) || rateLimitStatus.checking || orderPlacementRef.current
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
                        {progress < 100 ? `Placing Order... ${Math.floor(progress)}%` : 'Order Placed!'}
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
                        <span>🚀 Place Order (COD){rateLimitStatus.exemptionReason ? ' (Using Exemption)' : ''}</span>
                      ) : (
                        <span>💳 Pay ₹{total.toFixed(2)} & Place Order{rateLimitStatus.exemptionReason ? ' (Using Exemption)' : ''}</span>
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

      {/* Confetti Animation */}
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

      {/* Success Checkmark */}
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
            {/* Success Circle */}
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
              {/* Outer glow ring */}
              <div style={{
                position: 'absolute',
                width: '120%',
                height: '120%',
                borderRadius: '50%',
                border: '3px solid rgba(16,185,129,0.3)',
                animation: 'expandRing 1.2s ease-out infinite',
              }} />

              {/* Checkmark */}
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

              {/* Sparkle effects */}
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

            {/* Success Text */}
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

            {/* Subtitle */}
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

          {/* CSS Animations */}
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