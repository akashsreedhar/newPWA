import React, { useState, useEffect, useRef } from 'react';
import Confetti from 'react-confetti';
import { useAddresses } from '../hooks/useAddresses';
import AddressModal, { Address } from './AddressModal';
import { useCart } from '../contexts/CartContext';

interface OrderReviewModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: any[];
  onPlaceOrder: (order: { address: any; message: string; paymentMethod: 'cod' | 'online'; paymentData?: any }) => void;
  onClearCart?: () => void;
  onNavigateToOrders?: () => void;
  userId?: string | null;
  disableOrderReview?: boolean;
  deliveryAllowed?: boolean;
  deliveryCheckPending?: boolean;
  loading?: boolean;
}

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
  // Get the latest cart items directly from context as a backup
  const { cartItems: contextCartItems } = useCart();
  
  // Use context cart items if prop cart items seem stale
  const cartItems = propCartItems && propCartItems.length > 0 ? propCartItems : contextCartItems;
  
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
        key: 'rzp_live_fI0F8IVzgfDwNs', // Your test key
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
            // NEW: Show verifying payment state
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
              
              // Place order with payment data
              if (onPlaceOrder) {
                onPlaceOrder({
                  address: selectedAddress,
                  message,
                  paymentMethod: 'online',
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
                  if (onClearCart) onClearCart();
                  if (onNavigateToOrders) onNavigateToOrders();
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
          color: '#14b8a6' // Teal color to match your app
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

  // Handle place order
  const handlePlaceOrder = () => {
    setError(null);
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      return;
    }
    if (!deliveryAllowed) {
      setError('Delivery is not available to your selected address.');
      return;
    }
    if (step !== 'idle') return;

    if (paymentMethod === 'cod') {
      // COD flow - same as before
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
            if (onPlaceOrder) {
              onPlaceOrder({ 
                address: selectedAddress, 
                message, 
                paymentMethod: 'cod' 
              });
            }
          }
          
          setTimeout(() => {
            setStep('confetti');
            confettiTimeout.current = setTimeout(() => {
              setStep('checkmark');
              checkmarkTimeout.current = setTimeout(() => {
                if (onClearCart) onClearCart();
                if (onNavigateToOrders) onNavigateToOrders();
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
      // Online payment flow
      setStep('payment');
      handleRazorpayPayment();
    }
  };

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

              
              

              <div className="flex-1 min-h-0 overflow-y-auto pb-4" style={{marginBottom: '7rem'}}>
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

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 bg-white pb-8 pt-2 sticky bottom-0 z-20" style={{paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))', background: 'white'}}>
                <button
                  className={`w-full py-3 rounded-lg font-bold text-white relative overflow-hidden transition-colors ${
                    disableOrderReview || !deliveryAllowed || !selectedAddress || deliveryCheckPending || loading || (step !== 'idle' && step !== 'payment') || processingPayment
                      ? 'bg-gray-400 cursor-not-allowed'
                      : step === 'confetti' || step === 'checkmark' || paymentCompleted
                      ? 'bg-green-500'
                      : 'bg-teal-600 hover:bg-teal-700'
                  }`}
                  onClick={handlePlaceOrder}
                  disabled={disableOrderReview || !deliveryAllowed || deliveryCheckPending || loading || (step !== 'idle' && step !== 'payment') || !selectedAddress || processingPayment}
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
            colors={['#14b8a6', '#06b6d4', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444']}
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