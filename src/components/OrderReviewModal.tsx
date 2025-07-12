import React, { useState, useEffect, useRef } from 'react';
import Confetti from 'react-confetti';
import { useAddresses } from '../hooks/useAddresses';
import AddressModal, { Address } from './AddressModal';
import { useCart } from '../contexts/CartContext';

interface OrderReviewModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: any[];
  onPlaceOrder: (order: { address: any; message: string }) => void;
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
  cartItems: propCartItems, // Rename to avoid confusion
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

  // Animation/order state machine: 'idle' | 'progress' | 'confetti' | 'checkmark'
  const [step, setStep] = useState<'idle' | 'progress' | 'confetti' | 'checkmark'>('idle');
  // For progress bar
  const [progress, setProgress] = useState(0);
  // For robust single order placement
  const [orderPlaced, setOrderPlaced] = useState(false);
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
  // Forcing AddressModal remount to reset form/map when mode changes
  const [addressModalKey, setAddressModalKey] = useState(0);

  // Force address modal if no addresses, block closing until at least one address exists
  useEffect(() => {
    if (open && !addressesLoading && addresses.length === 0) {
      setAddressModalMode('add');
      setAddressModalOpen(true);
    }
  }, [open, addressesLoading, addresses.length]);

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

  // Reset state and clear all animation timeouts/intervals on modal close
  useEffect(() => {
    if (!open) {
      setMessage('');
      setError(null);
      setAddressModalOpen(false);
      setEditingAddress(null);
      setAddressModalMode('list');
      // setLocalLoading(false); // removed, handled by step state
      setProgress(0);
      setOrderPlaced(false);
      // setShowConfetti(false); // removed, handled by step
      // setShowCheckmark(false); // removed, handled by step
      // setFadeOut(false); // removed, handled by step state
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (checkmarkTimeout.current) clearTimeout(checkmarkTimeout.current);
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
    }
  }, [open]);




  // Calculate pricing values with MRP and savings
  const total = cartItems.reduce((sum, item) => sum + ((item.sellingPrice || item.price) * item.quantity), 0);
  const totalMRP = cartItems.reduce((sum, item) => sum + ((item.mrp || item.sellingPrice || item.price) * item.quantity), 0);
  const totalSavings = totalMRP - total;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);


  const handleSaveAddress = async (address: Address, action: 'add' | 'edit') => {
    setError(null);
    // Always set as default when adding or editing
    const addressToSave = { ...address, isDefault: true };
    const savedAddress = await saveAddress(addressToSave as any, action);
    await refreshAddresses();
    // Instantly select the new/edited address as the selected address
    selectAddress(savedAddress || addressToSave);
    setAddressModalOpen(false);
    setEditingAddress(null);
    setAddressModalMode('list');
  };

  const handleDeleteAddress = async (addressId: string) => {
    setError(null);
    await deleteAddress(addressId);
    await refreshAddresses();
    // If deleted address was selected, clear selection
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
    setAddressModalOpen(false); // Close first to force remount
    setAddressModalKey(prev => prev + 1);
    setTimeout(() => {
      setAddressModalOpen(true);
    }, 10);
  };

  // Allow user to change address after selection
  const handleChangeAddress = () => {
    setAddressModalMode('list');
    setAddressModalOpen(true);
  };

  // Only triggers animation, does NOT place order in Firestore
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
    if (step !== 'idle') return; // Prevent double trigger
    setStep('progress');
    // Start progress bar animation
    let prog = 0;
    setProgress(0);
    progressInterval.current = setInterval(() => {
      prog += Math.random() * 18 + 7; // randomize for effect
      if (prog >= 100) {
        prog = 100;
        setProgress(100);
        clearInterval(progressInterval.current!);
        // Place order in Firestore (only once)
        if (!orderPlaced) {
          setOrderPlaced(true);
          if (onPlaceOrder) {
            onPlaceOrder({ address: selectedAddress, message });
          }
        }
        // Wait 0.5s for progress bar to finish visually, then start confetti
        setTimeout(() => {
          console.log('🎉 Starting confetti phase');
          setStep('confetti');
          // Confetti for 4 seconds as requested
          confettiTimeout.current = setTimeout(() => {
            console.log('✅ Starting checkmark phase');
            setStep('checkmark');
            // Checkmark for exactly 3 seconds, then redirect
            checkmarkTimeout.current = setTimeout(() => {
              console.log('🔄 Redirecting to orders page');
              // Clear cart before redirect
              if (onClearCart) {
                console.log('🗑️ Clearing cart');
                onClearCart();
              }
              // Navigate to Orders page
              if (onNavigateToOrders) {
                onNavigateToOrders();
              }
              // Close modal after redirect
              if (onClose) onClose();
              // Reset state after a short delay to allow re-use
              redirectTimeout.current = setTimeout(() => {
                console.log('🏁 Animation sequence complete, resetting state');
                setStep('idle');
                setOrderPlaced(false);
                setProgress(0);
              }, 500);
            }, 3000);
          }, 6000);
        }, 500);
      } else {
        setProgress(Math.min(prog, 99)); // Ensure we don't exceed 99% until order is actually placed
      }
    }, 120);
  };

  // CLEANUP: Remove legacy animation state
  // (localLoading, fadeOut, progress, orderPlaced, progressInterval, confettiTimeout, checkmarkTimeout, redirectTimeout)

  // (Removed: duplicate useEffect for localLoading-based animation)

  // Only triggers animation, does NOT place order in Firestore
  // (No change: handlePlaceOrder already refactored)

  // Only show one modal at a time: AddressModal OR OrderReviewModal
  // Only show one modal at a time: AddressModal OR OrderReviewModal
  // Instead of returning early, render both modals and control visibility with `open` prop.
  // This avoids changing the order of hooks between renders.

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
          {/* Bottom sheet modal style for mobile UX */}
          <div 
            className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-70"
            onClick={(e) => {
              // Prevent clicking outside from closing the modal during animation
              if (step !== 'idle') {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <div 
              className="bg-white rounded-t-2xl shadow-lg w-full max-w-md pt-4 px-4 relative flex flex-col max-h-[calc(100vh-8px)] h-auto"
              onClick={(e) => {
                // Prevent clicks inside modal from propagating
                e.stopPropagation();
              }}
            >
              {step === 'idle' && (
                <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600" onClick={onClose}>&times;</button>
              )}
              <h2 className="text-xl font-bold text-center mb-4">🛒 Review Your Order</h2>

              <div className="flex-1 min-h-0 overflow-y-auto pb-4" style={{marginBottom: '5.5rem'}}>
                {/* Registration warning - only show if not in progress and actually disabled */}
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

                {/* Defensive fallback for address loading or error */}
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
                  
                  {/* Show MRP and savings if there are any savings */}
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

              {/* Always visible Action Buttons */}
              <div className="flex flex-col gap-2 bg-white pb-8 pt-2 sticky bottom-0 z-20" style={{paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))', background: 'white'}}>
                <button
                  className={`w-full py-2 rounded font-bold flex items-center justify-center relative overflow-hidden ${
                    disableOrderReview || !deliveryAllowed || !selectedAddress || deliveryCheckPending || loading || step !== 'idle' 
                      ? step === 'confetti' || step === 'checkmark' 
                        ? 'bg-green-500 text-white cursor-not-allowed' // Green when order is placed
                        : 'bg-gray-300 text-gray-400 cursor-not-allowed'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                  onClick={handlePlaceOrder}
                  disabled={disableOrderReview || !deliveryAllowed || deliveryCheckPending || loading || step !== 'idle' || !selectedAddress}
                  style={{ position: 'relative', minHeight: 44 }}
                >
                  {step === 'progress' ? (
                    <>
                      <div style={{ width: '100%', position: 'absolute', left: 0, top: 0, height: '100%', background: 'rgba(0,0,0,0.04)', zIndex: 1 }} />
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #14b8a6 0%, #06b6d4 100%)', opacity: 0.3, zIndex: 2, transition: 'width 0.2s' }} />
                      <span style={{ position: 'relative', zIndex: 3, fontWeight: 700, fontSize: 16 }}>
                        {progress < 100 ? `Placing Your Order... ${Math.floor(progress)}%` : 'Order Placed!'}
                      </span>
                    </>
                  ) : step === 'confetti' || step === 'checkmark' ? (
                    // Keep showing "Order Placed!" during confetti and checkmark phases
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#f0f5f4' }}>
                      ✅ Order Placed!
                    </span>
                  ) : (
                    '🚀 CONFIRM & PLACE ORDER'
                  )}
                </button>
                <button
                  className="w-full py-2 rounded font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100"
                  onClick={onClose}
                  disabled={loading || step !== 'idle'}
                >
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confetti overlay - always rendered when step is 'confetti' */}
      {step === 'confetti' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          pointerEvents: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.05)', // Slightly more visible background during confetti
        }}>
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            numberOfPieces={3500} // Increased from 1500 for more intense blast
            recycle={false}
            gravity={0.2} // Reduced gravity for slower, more dramatic fall
            initialVelocityY={20} // Increased upward velocity for bigger explosion
            initialVelocityX={8} // Increased horizontal spread
            colors={['#14b8a6', '#06b6d4', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444']} // Added more colors
          />
        </div>
      )}
      {/* Checkmark overlay - always rendered when step is 'checkmark' */}
      {step === 'checkmark' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999, // Increased z-index to ensure it's on top
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.95)', // More opaque background
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)', // Modern blur effect
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
            {/* Main success circle with checkmark */}
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
              
              {/* Inner success checkmark */}
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
              
              {/* Success sparkle effect */}
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
            
            {/* Success text with modern typography */}
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
              Order Placed!
            </div>
            
            {/* Subtitle with gentle animation */}
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
              <span style={{ fontSize: 16, opacity: 0.7 }}>Your order is being prepared</span>
            </div>
          </div>
          
          {/* Enhanced CSS animations for modern effect */}
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
}
export default OrderReviewModal;

