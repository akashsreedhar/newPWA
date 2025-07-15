import React, { useState, useEffect } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { CartAnimationProvider, useCartAnimation } from './contexts/CartAnimationContext';
import BottomNavigation from './components/BottomNavigation';
import GlobalHeader from './components/GlobalHeader';
import PersistentCartButton from './components/PersistentCartButton';
import CartAnimation from './components/CartAnimation';
import HomePage from './pages/HomePage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import AccountPage from './pages/AccountPage';
import SearchPage from './pages/SearchPage';
import CategoryPage from './pages/CategoryPage';
import GroceryKitchenPage from './pages/GroceryKitchenPage';
import SnacksDrinksPage from './pages/SnacksDrinksPage';
import BeautyPersonalCarePage from './pages/BeautyPersonalCarePage';
import HouseholdEssentialsPage from './pages/HouseholdEssentialsPage';
import { useAuth } from './hooks/useAuth.ts';
import logo from './images/Logo.png';

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

  // Navigation state for pages
  const [currentPage, setCurrentPage] = useState<'home' | 'search' | 'category' | 'dedicated-category'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [navigationStack, setNavigationStack] = useState<string[]>(['home']); // Track navigation history

  // Cart count for badge
  const { cartItems } = useCart();
  
  // Cart animation hook
  const { isAnimating, currentProductName, currentSavings, onAnimationComplete } = useCartAnimation();

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

  // Navigation handlers
  const handleSearchFocus = () => {
    setCurrentPage('search');
  };

  // Future: Handler for programmatic search with query
  // const handleSearch = (query: string) => {
  //   setSearchQuery(query);
  //   setCurrentPage('search');
  // };

  const handleBackToHome = () => {
    setCurrentPage('home');
    setSearchQuery('');
    setSelectedCategory('');
    setNavigationStack(['home']);
    // Scroll to top when returning to home
    window.scrollTo(0, 0);
  };

  const handleSmartBack = () => {
    if (navigationStack.length <= 1) {
      // Already at home or only one item in stack
      handleBackToHome();
      return;
    }

    // Remove current page from stack
    const newStack = [...navigationStack];
    newStack.pop();
    setNavigationStack(newStack);

    // Get previous page info
    const previousPage = newStack[newStack.length - 1];
    
    if (previousPage === 'home') {
      setCurrentPage('home');
      setSelectedCategory('');
    } else if (previousPage.startsWith('dedicated-category:')) {
      const category = previousPage.replace('dedicated-category:', '');
      setCurrentPage('dedicated-category');
      setSelectedCategory(category);
    } else if (previousPage.startsWith('category:')) {
      const category = previousPage.replace('category:', '');
      setCurrentPage('category');
      setSelectedCategory(category);
    }

    // Scroll to top when navigating back
    window.scrollTo(0, 0);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    // Check if this is a main category that has a dedicated page
    const mainCategories = ['Grocery & Kitchen', 'Snacks & Drinks', 'Beauty & Personal Care', 'Household Essentials'];
    const newPage = mainCategories.includes(category) ? 'dedicated-category' : 'category';
    
    setCurrentPage(newPage);
    
    // Update navigation stack
    setNavigationStack(prev => [...prev, `${newPage}:${category}`]);
  };

  // Tab change handler with scroll to top
  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    // Scroll to top when changing tabs
    window.scrollTo(0, 0);
  };

  // Handler to view cart (from persistent button)
  const handleViewCart = () => {
    setTab('cart');
    setCurrentPage('home');
    window.scrollTo(0, 0);
  };

  // Order feedback handlers
  const handleOrderPlaced = (success: boolean, message: string) => {
    if (success) {
      setOrderSuccess(message);
      setOrderError(null);
      setTimeout(() => setOrderSuccess(null), 5000);
    } else {
      setOrderError(message);
      setOrderSuccess(null);
      setTimeout(() => setOrderError(null), 5000);
    }
  };

  // --- Auth ---
  const { userId, accessError, loading: authLoading } = useAuth(fingerprint);
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center">
      <div className="relative flex flex-col items-center">
        <img
          src={logo}
          alt="7Days Hypermarket Logo"
          className="w-32 h-32 md:w-40 md:h-40 object-contain mb-10 animate-logo-pop"
          style={{ filter: 'drop-shadow(0 8px 32px rgba(20,184,166,0.25))' }}
          draggable={false}
        />
        <div
          className="premium-doors-text mb-2"
          style={{
            fontSize: '2.2rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            background: 'linear-gradient(90deg, #14b8a6 0%, #f59e42 50%, #14b8a6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 4px 24px rgba(20,184,166,0.18), 0 1.5px 0 #fff',
            animation: 'fadeInUp 1.2s cubic-bezier(.68,-0.55,.27,1.55) both, shimmerText 2.5s infinite'
          }}
        >
          Doors are opening...
        </div>
        {/* Optional: Animated underline */}
        <div className="w-24 h-1 rounded-full bg-gradient-to-r from-teal-400 via-amber-400 to-teal-400 opacity-80 animate-underline mt-1"></div>
        {/* Sparkle Animation */}
        <div className="absolute top-8 right-8 w-6 h-6 pointer-events-none animate-sparkle">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <g>
              <circle cx="12" cy="12" r="6" fill="#14b8a6" opacity="0.3"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round"/>
            </g>
          </svg>
        </div>
      </div>
      <style>{`
        @keyframes logo-pop {
          0% { transform: scale(0.7) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(30px);}
          100% { opacity: 1; transform: translateY(0);}
        }
        @keyframes shimmerText {
          0% { filter: brightness(1);}
          50% { filter: brightness(1.25);}
          100% { filter: brightness(1);}
        }
        .animate-logo-pop {
          animation: logo-pop 1.2s cubic-bezier(.68,-0.55,.27,1.55) both;
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg);}
          40% { opacity: 1; transform: scale(1.2) rotate(20deg);}
          60% { opacity: 1; transform: scale(1) rotate(-10deg);}
          80% { opacity: 0.7; transform: scale(0.8) rotate(0deg);}
        }
        .animate-sparkle {
          animation: sparkle 2.2s infinite;
        }
        @keyframes underline {
          0% { width: 0; opacity: 0; }
          60% { width: 6rem; opacity: 1; }
          100% { width: 6rem; opacity: 1; }
        }
        .animate-underline {
          animation: underline 1.2s 0.5s cubic-bezier(.68,-0.55,.27,1.55) both;
        }
      `}</style>
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
        {/* Global Header - only show on main tab pages, not on search/category overlay */}
        {(tab === 'home' || tab === 'cart' || tab === 'orders' || tab === 'account') && 
         currentPage === 'home' && (
          <GlobalHeader 
            onSearchFocus={handleSearchFocus}
            showBackButton={false}
            title={tab === 'home' ? '' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            showSearch={tab !== 'account'}
            searchPlaceholder="Search products..."
          />
        )}

        {/* Page Content based on currentPage */}
        {currentPage === 'home' && (
          <>
            {tab === 'home' && (
              <HomePage 
                onCategorySelect={handleCategorySelect}
              />
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
          </>
        )}

        {/* Search Page Overlay */}
        {currentPage === 'search' && (
          <SearchPage 
            onBack={handleBackToHome}
            initialQuery={searchQuery}
          />
        )}

        {/* Category Page Overlay */}
        {currentPage === 'category' && (
          <CategoryPage 
            category={selectedCategory}
            onBack={handleSmartBack}
          />
        )}

        {/* Dedicated Category Pages */}
        {currentPage === 'dedicated-category' && selectedCategory === 'Grocery & Kitchen' && (
          <GroceryKitchenPage 
            onBack={handleSmartBack}
            onNavigateToCategory={handleCategorySelect}
            onSearchOpen={handleSearchFocus}
          />
        )}
        
        {currentPage === 'dedicated-category' && selectedCategory === 'Snacks & Drinks' && (
          <SnacksDrinksPage 
            onBack={handleSmartBack}
            onNavigateToCategory={handleCategorySelect}
            onSearchOpen={handleSearchFocus}
          />
        )}
        
        {currentPage === 'dedicated-category' && selectedCategory === 'Beauty & Personal Care' && (
          <BeautyPersonalCarePage 
            onBack={handleSmartBack}
            onNavigateToCategory={handleCategorySelect}
            onSearchOpen={handleSearchFocus}
          />
        )}
        
        {currentPage === 'dedicated-category' && selectedCategory === 'Household Essentials' && (
          <HouseholdEssentialsPage 
            onBack={handleSmartBack}
            onNavigateToCategory={handleCategorySelect}
            onSearchOpen={handleSearchFocus}
          />
        )}
      </div>
      
      {/* Bottom Navigation - only show when not in overlay mode */}
      {currentPage === 'home' && (
        <BottomNavigation activeTab={tab} onTabChange={handleTabChange} cartCount={cartItems.length} />
      )}

      {/* Persistent Cart Button - show on all pages except cart and account */}
      {tab !== 'cart' && tab !== 'account' && (
        <PersistentCartButton onViewCart={handleViewCart} />
      )}

      {/* Cart Animation */}
      <CartAnimation 
        show={isAnimating} 
        onComplete={onAnimationComplete} 
        productName={currentProductName}
        savings={currentSavings}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <CartAnimationProvider>
        <AppWithAnimation />
      </CartAnimationProvider>
    </LanguageProvider>
  );
};

// Create a wrapper component to access both contexts
const AppWithAnimation: React.FC = () => {
  const { showAnimation } = useCartAnimation();
  
  return (
    <CartProvider onCartItemAdded={showAnimation}>
      <AppInner />
    </CartProvider>
  );
};

export default App;