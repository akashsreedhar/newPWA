import React, { useState, useEffect } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { CartProvider, useCart } from './contexts/CartContext';
import BottomNavigation from './components/BottomNavigation';
import HomePage from './pages/HomePage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import AccountPage from './pages/AccountPage';
import { useAuth } from './hooks/useAuth.ts';


// --- Device Fingerprint Helper ---
function getDeviceFingerprint() {
  const nav = window.navigator;
  const fp = [
    nav.userAgent,
    nav.language,
    nav.platform,
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth
  ].join('|');
  let hash = 0, i, chr;
  for (i = 0; i < fp.length; i++) {
    chr = fp.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "fp_" + Math.abs(hash);
}

const DELIVERY_CHECK_INTERVAL = 2 * 60 * 60 * 1000;
function getLastDeliveryCheck(userId: string) {
  if (!userId) return null;
  try {
    const data = JSON.parse(localStorage.getItem(`lastDeliveryCheck_${userId}`) || 'null');
    if (!data) return null;
    return data;
  } catch {
    return null;
  }
}
function setLastDeliveryCheck(userId: string, result: any) {
  if (!userId) return;
  localStorage.setItem(
    `lastDeliveryCheck_${userId}`,
    JSON.stringify({ ...result, timestamp: Date.now() })
  );
}

const AppInner: React.FC = () => {
  const [tab, setTab] = useState('home');
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [deliveryAllowed, setDeliveryAllowed] = useState(true);
  const [deliveryCheckPending, setDeliveryCheckPending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryErrorDetails, setDeliveryErrorDetails] = useState("");
  const [tgAccessError, setTgAccessError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Cart count for badge
  const { cartItems } = useCart();

  // Generate fingerprint on mount
  useEffect(() => {
    setFingerprint(getDeviceFingerprint());
  }, []);

  // Telegram Mini App restriction
  useEffect(() => {
    // Allow bypass in dev mode (localhost or VITE_DEV_MODE)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const devMode = import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.MODE !== 'production';
    
    console.log('🔍 Telegram access check:', {
      isLocalhost,
      VITE_DEV_MODE: import.meta.env.VITE_DEV_MODE,
      MODE: import.meta.env.MODE,
      devMode,
      hostname: window.location.hostname,
      hasWindow: !!window,
      hasTelegram: !!(window as any).Telegram,
      hasWebApp: !!((window as any).Telegram && (window as any).Telegram.WebApp),
      hasInitData: !!((window as any).Telegram && (window as any).Telegram.WebApp && (window as any).Telegram.WebApp.initData),
      initDataLength: (window as any).Telegram && (window as any).Telegram.WebApp && (window as any).Telegram.WebApp.initData ? (window as any).Telegram.WebApp.initData.length : 0
    });
    
    if (isLocalhost || devMode) {
      console.log('✅ Dev mode detected, bypassing Telegram restriction');
      setTgAccessError("");
      return;
    }
    if (
      !(window as any).Telegram ||
      !(window as any).Telegram.WebApp ||
      !(window as any).Telegram.WebApp.initData ||
      (window as any).Telegram.WebApp.initData.length < 10
    ) {
      console.log('❌ Telegram access check failed');
      setTgAccessError(
        "❌ This app can only be used inside Telegram. Please open it from the bot."
      );
    } else {
      console.log('✅ Telegram access check passed');
      setTgAccessError("");
    }
  }, []);

  // --- Auth ---
  const { userId, accessError, lastLocation, loading: authLoading } = useAuth(fingerprint);
  console.log('App.tsx userId:', userId, 'accessError:', accessError, 'authLoading:', authLoading);
  // --- Cart ---
  // We'll use the context in the page components

  // --- Delivery area check logic ---
  useEffect(() => {
    // Bypass delivery area check in dev mode
    if (import.meta.env.VITE_DEV_MODE === 'true') {
      setDeliveryAllowed(true);
      setDeliveryMessage('');
      setDeliveryErrorDetails('');
      setDeliveryCheckPending(false);
      return;
    }
    if (!userId) return;
    const lastCheck = getLastDeliveryCheck(userId);
    if (lastCheck && Date.now() - lastCheck.timestamp < DELIVERY_CHECK_INTERVAL) {
      setDeliveryAllowed(lastCheck.allowed);
      setDeliveryMessage(lastCheck.message || "");
      setDeliveryErrorDetails("");
      return;
    }
    setDeliveryCheckPending(true);
    // Try Telegram LocationManager first
    const tg = (window as any).Telegram && (window as any).Telegram.WebApp;
    if (tg && tg.LocationManager && typeof tg.LocationManager.init === "function") {
      (async () => {
        try {
          await tg.LocationManager.init();
          tg.LocationManager.getLocation(async (error: any, locationData: any) => {
            setDeliveryErrorDetails(
              `TG LocationManager error: ${JSON.stringify(error)} | locationData: ${JSON.stringify(locationData)}`
            );
            if (!error && locationData && locationData.latitude && locationData.longitude) {
              try {
                // Use Vite env for backend URL, fallback to production if not set
                const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://supermarket-backend-ytrh.onrender.com";
                const response = await fetch(
                  `${backendUrl}/verify-location`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      latitude: locationData.latitude,
                      longitude: locationData.longitude
                    })
                  }
                );
                const data = await response.json();
                if (userId) {
                  setLastDeliveryCheck(userId, data);
                }
                setDeliveryAllowed(data.allowed);
                setDeliveryMessage(data.allowed ? "" : (data.message || "You are outside the delivery area."));
                setDeliveryErrorDetails("");
              } catch (err: any) {
                setDeliveryAllowed(false);
                setDeliveryMessage("Failed to check delivery area. Please try again.");
                setDeliveryErrorDetails(`Fetch error: ${err && err.message}`);
              } finally {
                setDeliveryCheckPending(false);
              }
            } else {
              setDeliveryAllowed(false);
              setDeliveryMessage(
                "Location permission denied or unavailable. Please enable location to check delivery eligibility." +
                (error ? ` [Error: ${JSON.stringify(error)}]` : "") +
                (locationData ? ` [Data: ${JSON.stringify(locationData)}]` : "")
              );
              setDeliveryCheckPending(false);
              if (tg.LocationManager && typeof tg.LocationManager.openSettings === "function") {
                tg.LocationManager.openSettings();
              }
            }
          });
        } catch (err: any) {
          setDeliveryErrorDetails(`TG LocationManager init error: ${err && err.message}`);
          fallbackGeolocation();
        }
      })();
      return;
    }
    fallbackGeolocation();
    function fallbackGeolocation() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            setDeliveryErrorDetails(
              `Browser geolocation success: lat=${position.coords.latitude}, lng=${position.coords.longitude}`
            );
            try {
              // Use Vite env for backend URL, fallback to production if not set
              const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://supermarket-backend-ytrh.onrender.com";
              const response = await fetch(
                `${backendUrl}/verify-location`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                  })
                }
              );
              const data = await response.json();
              if (userId) {
                setLastDeliveryCheck(userId, data);
              }
              setDeliveryAllowed(data.allowed);
              setDeliveryMessage(data.allowed ? "" : (data.message || "You are outside the delivery area."));
              setDeliveryErrorDetails("");
            } catch (err: any) {
              setDeliveryAllowed(false);
              setDeliveryMessage("Failed to check delivery area. Please try again.");
              setDeliveryErrorDetails(`Fetch error: ${err && err.message}`);
            } finally {
              setDeliveryCheckPending(false);
            }
          },
          (error) => {
            setDeliveryAllowed(false);
            setDeliveryMessage(
              "Location permission denied or unavailable. Please enable location to check delivery eligibility." +
              (error ? ` [Error code: ${error.code}, message: ${error.message}]` : "")
            );
            setDeliveryErrorDetails(
              `Browser geolocation error: code=${error && error.code}, message=${error && error.message}`
            );
            setDeliveryCheckPending(false);
          },
          {
            enableHighAccuracy: false,
            timeout: 25000,
            maximumAge: 60000
          }
        );
      } else {
        setDeliveryAllowed(false);
        setDeliveryMessage("Location is not supported in this app. Please share your location with the bot in chat.");
        setDeliveryErrorDetails("Browser geolocation not supported.");
        setDeliveryCheckPending(false);
      }
    }
  }, [userId]);

  // --- Registration enforcement ---
  const isUserRegistered = !!userId && !accessError;
  // Bypass registration requirement in dev mode (localhost or VITE_DEV_MODE)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const devMode = import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.MODE !== 'production';
  // Only disable order review if we're still loading initially OR if user is definitely not registered
  // Don't disable if user is already authenticated (prevent flickering during operations)
  const disableOrderReview = (authLoading && !userId) || (!isUserRegistered && !isLocalhost && !devMode);

  // --- Order placement feedback ---
  const handleOrderPlaced = (success: boolean, message: string) => {
    if (success) {
      setOrderSuccess(message);
      // Don't switch tabs immediately - let the modal handle navigation after animations
      setTimeout(() => setOrderSuccess(null), 3500);
    } else {
      setOrderError(message);
      setTimeout(() => setOrderError(null), 3500);
    }
  };

  // --- UI rendering ---
  if (tgAccessError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center p-6">
        <div className="bg-red-100 border border-red-300 rounded-lg p-6 text-red-700 max-w-md">
          <div className="text-2xl mb-2">🔒 Access Error</div>
          <div>{tgAccessError}</div>
        </div>
      </div>
    );
  }
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center p-6">
        <div className="bg-teal-100 border border-teal-300 rounded-lg p-6 text-teal-800 max-w-md">
          <div className="text-2xl mb-2">🔍 Validating Session...</div>
          <div>Please wait while we verify your access.</div>
        </div>
      </div>
    );
  }
  if (accessError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center p-6">
        <div className="bg-red-100 border border-red-300 rounded-lg p-6 text-red-700 max-w-md">
          <div className="text-2xl mb-2">🔒 Access Error</div>
          <div className="mb-2">{accessError}</div>
          <div className="text-gray-800 text-sm">
            To use this app, please register via the Telegram bot first.<br />
            <b>Step 1:</b> Go to the SuperMarket Telegram bot.<br />
            <b>Step 2:</b> Complete registration by sharing your name, phone, and location.<br />
            <b>Step 3:</b> Then return here and try again!
          </div>
        </div>
      </div>
    );
  }
  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center p-6">
        <div className="bg-red-100 border border-red-300 rounded-lg p-6 text-red-700 max-w-md">
          <div className="text-2xl mb-2">🚫 Access Denied</div>
          <div className="mb-2">You are not registered. Please register via the SuperMarket Telegram bot before using this app.</div>
          <div className="text-gray-800 text-sm">
            <b>Step 1:</b> Go to the SuperMarket Telegram bot.<br />
            <b>Step 2:</b> Complete registration by sharing your name, phone, and location.<br />
            <b>Step 3:</b> Then return here and try again!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Delivery area warning/banner */}
      {!deliveryAllowed && (
        <div className="max-w-lg mx-auto mt-4">
          <div className="flex items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg shadow">
            <div className="font-semibold mb-1">Delivery Area Warning</div>
            <div className="text-sm ml-2">
              {deliveryMessage || "You are outside the delivery area. Checkout is disabled."}
              {deliveryErrorDetails && (
                <div className="mt-1 text-xs text-gray-500">Debug: {deliveryErrorDetails}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order placement feedback */}
      {orderSuccess && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-300 text-green-800 px-6 py-3 rounded-lg shadow z-50">
          {orderSuccess}
        </div>
      )}
      {orderError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-300 text-red-800 px-6 py-3 rounded-lg shadow z-50">
          {orderError}
        </div>
      )}

      {/* Show warning if user is not registered or loading */}
      {(() => { 
        console.log('REGISTRATION WARNING CHECK', { disableOrderReview, userId, accessError, authLoading });
        return disableOrderReview && (
          <div className="max-w-lg mx-auto mt-4">
            <div className="flex items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg shadow">
              <div className="font-semibold mb-1">Registration Required</div>
              <div className="text-sm ml-2">
                Please register via the SuperMarket Telegram bot before placing an order.<br />
                <b>Step 1:</b> Go to the SuperMarket Telegram bot.<br />
                <b>Step 2:</b> Complete registration by sharing your name, phone, and location.<br />
                <b>Step 3:</b> Then return here and try again!
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main content */}
      <div className="pt-2">
        {tab === 'home' && (
          <HomePage />
        )}
        {tab === 'cart' && (
          <CartPage
            userId={userId}
            disableOrderReview={disableOrderReview}
            deliveryAllowed={deliveryAllowed}
            deliveryCheckPending={deliveryCheckPending}
            onOrderPlaced={handleOrderPlaced}
            onNavigateToOrders={() => setTab('orders')}
          />
        )}
        {tab === 'orders' && (
          <OrdersPage userId={userId} onNavigateToCart={() => setTab('cart')} />
        )}
        {tab === 'account' && (
          <AccountPage userId={userId} />
        )}
      </div>
      <BottomNavigation activeTab={tab} onTabChange={setTab} cartCount={cartItems.length} />
    </div>
  );
};

const App: React.FC = () => (
  <LanguageProvider>
    <CartProvider>
      <AppInner />
    </CartProvider>
  </LanguageProvider>
);

export default App;