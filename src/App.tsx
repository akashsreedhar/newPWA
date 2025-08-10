import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { CartAnimationProvider, useCartAnimation } from './contexts/CartAnimationContext';
import BottomNavigation from './components/BottomNavigation';
import GlobalHeader from './components/GlobalHeader';
import PersistentCartButton from './components/PersistentCartButton';
import CartAnimation from './components/CartAnimation';
import WebAppRegistration from './components/WebAppRegistration';
import HomePage from './pages/HomePage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import AccountPage from './pages/AccountPage';
import SearchPage from './pages/SearchPage';
import CategoryPage from './pages/CategoryPage';
import FoodPage from './pages/FoodPage';
import GroceryKitchenPage from './pages/GroceryKitchenPage';
import SnacksDrinksPage from './pages/SnacksDrinksPage';
import BeautyPersonalCarePage from './pages/BeautyPersonalCarePage';
import HouseholdEssentialsPage from './pages/HouseholdEssentialsPage';
import { useAuth } from './hooks/useAuth.ts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import logo from './images/Logo.png';
import {
  USE_BACKEND_OPERATING_HOURS,
  OPERATING_HOURS_ENDPOINT,
  OPERATING_HOURS_POLL_MS,
  FALLBACK_OPERATING_HOURS
} from './config';

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

const MAIN_PAGES = ['home', 'cart', 'orders', 'account'];

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
  const [userName, setUserName] = useState<string | null>(null);

  // Navigation state for pages
  const [currentPage, setCurrentPage] = useState<'home' | 'search' | 'category' | 'food' | 'dedicated-category' | 'cart' | 'orders' | 'account'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [navigationStack, setNavigationStack] = useState<string[]>(['home']); // Track navigation history

  // Track modal open state for dedicated category pages
  const isDedicatedCategoryModalOpen = useRef(false);
  const setDedicatedCategoryModalOpen = useCallback((open: boolean) => {
    isDedicatedCategoryModalOpen.current = open;
  }, []);

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

    if (isLocalhost || devMode) {
      setTgAccessError("");
      return;
    }
    if (
      !(window as any).Telegram ||
      !(window as any).Telegram.WebApp ||
      !(window as any).Telegram.WebApp.initData ||
      (window as any).Telegram.WebApp.initData.length < 10
    ) {
      setTgAccessError(
        "❌ This app can only be used inside Telegram. Please open it from the bot."
      );
    } else {
      setTgAccessError("");
    }
  }, []);

  // Navigation handlers
  const handleSearchFocus = () => {
    setCurrentPage('search');
    setNavigationStack(prev => [...prev, 'search']);
  };

  const handleBackToHome = () => {
    setCurrentPage('home');
    setTab('home');
    setSearchQuery('');
    setSelectedCategory('');
    setNavigationStack(['home']);
    window.scrollTo(0, 0);
  };

  const handleSmartBack = () => {
    if (navigationStack.length <= 1) {
      handleBackToHome();
      return;
    }
    const newStack = [...navigationStack];
    const last = newStack.pop();
    setNavigationStack(newStack);

    if (last === 'modal:order-review') {
      // Just close the modal, don't change the page
      window.dispatchEvent(new CustomEvent('closeOrderReviewModal'));
      return;
    }

    if (last === 'modal:address') {
      // Just close the address modal, don't change the page
      window.dispatchEvent(new CustomEvent('closeAddressModal'));
      return;
    }

    const previousPage = newStack[newStack.length - 1];
    if (MAIN_PAGES.includes(previousPage)) {
      setCurrentPage(previousPage as typeof currentPage);
      setTab(previousPage);
      setSelectedCategory('');
      setSearchQuery('');
    } else if (previousPage === 'search') {
      setCurrentPage('search');
    } else if (previousPage === 'food') {
      setCurrentPage('food');
    } else if (previousPage.startsWith('dedicated-category:')) {
      const category = previousPage.replace('dedicated-category:', '');
      setCurrentPage('dedicated-category');
      setSelectedCategory(category);
    } else if (previousPage.startsWith('category:')) {
      const category = previousPage.replace('category:', '');
      setCurrentPage('category');
      setSelectedCategory(category);
    }
    window.scrollTo(0, 0);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);

    // Handle Food category specially
    if (category === 'Food') {
      setCurrentPage('food');
      setNavigationStack(prev => [...prev, 'food']);
      window.history.pushState({ view: 'food' }, '');
      return;
    }

    const mainCategories = ['Grocery & Kitchen', 'Snacks & Drinks', 'Beauty & Personal Care', 'Household Essentials'];
    const newPage = mainCategories.includes(category) ? 'dedicated-category' : 'category';
    setCurrentPage(newPage);
    setNavigationStack(prev => [...prev, `${newPage}:${category}`]);
  };

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setCurrentPage(newTab as typeof currentPage);
    setSearchQuery('');
    setSelectedCategory('');
    setNavigationStack(prev => [...prev, newTab]);
    window.scrollTo(0, 0);
  };

  const handleViewCart = () => {
    setTab('cart');
    setCurrentPage('cart');
    setSearchQuery('');
    setSelectedCategory('');
    setNavigationStack(prev => [...prev, 'cart']);
    window.scrollTo(0, 0);
  };

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

  // Modal navigation handlers
  const handleOpenOrderReview = () => {
    setNavigationStack(prev => [...prev, 'modal:order-review']);
  };

  const handleCloseOrderReview = () => {
    setNavigationStack(prev => {
      if (prev[prev.length - 1] === 'modal:order-review') {
        return prev.slice(0, -1);
      }
      return prev;
    });
  };

  const handleOpenAddressModal = () => {
    setNavigationStack(prev => [...prev, 'modal:address']);
  };

  const handleCloseAddressModal = () => {
    setNavigationStack(prev => {
      if (prev[prev.length - 1] === 'modal:address') {
        return prev.slice(0, -1);
      }
      return prev;
    });
  };

  // --- Auth ---
  const { userId, accessError, loading: authLoading, registrationMode, registrationInitData } = useAuth(fingerprint);

  // Registration completion handler
  const handleRegistrationComplete = (userData: any) => {
    // Set user ID from registration
    if (userData.user_id) {
      // Store tokens
      if (userData.token) {
        localStorage.setItem('token', userData.token);
      }
      if (userData.refreshToken) {
        // FIX: Use 'refreshToken' key consistently instead of 'refresh_token'
        localStorage.setItem('refreshToken', userData.refreshToken);
      }
      if (userData.firebaseCustomToken) {
        localStorage.setItem('firebase_token', userData.firebaseCustomToken);
      }

      // Refresh the page to apply new auth state
      window.location.reload();
    }
  };

  // Fetch user name when userId changes
  useEffect(() => {
    if (!userId) {
      setUserName(null);
      return;
    }
    (async () => {
      try {
        const docSnap = await getDoc(doc(db, "users", String(userId)));
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setUserName(userData.name || null);
        } else {
          setUserName(null);
        }
      } catch {
        setUserName(null);
      }
    })();
  }, [userId]);

  // --- Delivery area check logic ---
  useEffect(() => {
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
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const devMode = import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.MODE !== 'production';
  const disableOrderReview = (authLoading && !userId) || (!isUserRegistered && !isLocalhost && !devMode);

  // --- Native-like navigation integration ---
  const isPushingState = useRef(false);

  useEffect(() => {
    if (window.history.state === null) {
      window.history.replaceState({ page: currentPage, tab }, '');
    }
  }, []);

  useEffect(() => {
    if (currentPage !== 'home' && !isPushingState.current) {
      window.history.pushState({ page: currentPage, tab }, '');
      isPushingState.current = true;
      setTimeout(() => { isPushingState.current = false; }, 100);
    }
  }, [currentPage, tab, navigationStack]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // Skip ALL pages that manage their own modal navigation - INCLUDING FOOD PAGE
      if (
        (currentPage === 'category') ||
        (currentPage === 'food') ||  // 🔥 ADDED THIS - Let FoodPage handle its own modals
        (currentPage === 'dedicated-category' && isDedicatedCategoryModalOpen.current)
      ) {
        return; // Let the page handle its own navigation
      }

      if (navigationStack.length <= 1) {
        // Only root left, allow Telegram to minimize/close
        return;
      }
      e.preventDefault?.();
      handleSmartBack();
      window.history.pushState({ page: currentPage, tab }, '');
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
    // eslint-disable-next-line
  }, [currentPage, tab, navigationStack]);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    // Skip ALL pages that manage their own modal navigation - INCLUDING FOOD PAGE
    if (
      (currentPage === 'category') ||
      (currentPage === 'food') ||  // 🔥 ADDED THIS - Let FoodPage handle its own navigation
      (currentPage === 'dedicated-category' && isDedicatedCategoryModalOpen.current)
    ) {
      return; // Let the page handle its own navigation
    }

    if (navigationStack.length <= 1) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      tg.BackButton.onClick(handleSmartBack);
    }
    return () => {
      if (tg.BackButton) {
        tg.BackButton.offClick(handleSmartBack);
      }
    };
  }, [navigationStack.length, currentPage]);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || typeof tg.onEvent !== 'function') return;

    // Skip ALL pages that manage their own modal navigation - INCLUDING FOOD PAGE
    if (
      (currentPage === 'category') ||
      (currentPage === 'food') ||  // 🔥 ADDED THIS - Let FoodPage handle its own navigation
      (currentPage === 'dedicated-category' && isDedicatedCategoryModalOpen.current)
    ) {
      return; // Let the page handle its own navigation
    }

    const handleTelegramBack = () => {
      if (navigationStack.length <= 1) {
        // Only root left, allow Telegram to minimize/close the app
        // Optionally: tg.close();
      } else {
        handleSmartBack();
      }
    };

    tg.onEvent('backButtonClicked', handleTelegramBack);

    return () => {
      tg.offEvent('backButtonClicked', handleTelegramBack);
    };
  }, [navigationStack.length, currentPage]);

  // --- Operating hours status (Home banner only) ---
  const [operatingStatus, setOperatingStatus] = useState<any | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [opTick, setOpTick] = useState(0);

  // Fetch status on mount and poll
  useEffect(() => {
    let mounted = true;
    let pollId: any = null;

    const applyFallback = () => {
      const fb = FALLBACK_OPERATING_HOURS;
      // Minimal synthetic status for fallback (assume open to avoid blocking UI)
      const status = {
        timezone: fb.timezone,
        serverTimeTs: Date.now(),
        store: { open: true, nextOpenTs: null, closeTs: null, countdownSeconds: 0, window: fb.store },
        fast_food: { open: true, nextOpenTs: null, closeTs: null, countdownSeconds: 0, window: fb.services.fast_food },
        config: { store: fb.store, services: { fast_food: fb.services.fast_food }, overrides: {} }
      };
      if (mounted) {
        setOperatingStatus(status);
        setServerTimeOffsetMs(0);
      }
    };

    const fetchStatus = async () => {
      if (!USE_BACKEND_OPERATING_HOURS) {
        applyFallback();
        return;
      }
      try {
        const res = await fetch(OPERATING_HOURS_ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        const now = Date.now();
        const offset = typeof data.serverTimeTs === 'number' ? (data.serverTimeTs - now) : 0;
        setOperatingStatus(data);
        setServerTimeOffsetMs(offset);
      } catch {
        applyFallback();
      }
    };

    fetchStatus();
    pollId = setInterval(fetchStatus, OPERATING_HOURS_POLL_MS);

    return () => {
      mounted = false;
      if (pollId) clearInterval(pollId);
    };
  }, []);

  // Lightweight 1s ticker for countdown display only (no extra server calls)
  useEffect(() => {
    const id = setInterval(() => setOpTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function formatHHMMTo12h(hhmm?: string) {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const [hStr, mStr] = hhmm.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return hhmm;
    const isPM = h >= 12;
    const hr = ((h + 11) % 12) + 1;
    const mm = m.toString().padStart(2, '0');
    return `${hr}:${mm} ${isPM ? 'PM' : 'AM'}`;
  }

  function formatDuration(ms: number) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function renderOperatingHoursBanner() {
    if (!operatingStatus || currentPage !== 'home') return null;

    const store = operatingStatus.store || {};
    const cfg = operatingStatus.config || {};
    const storeWindow = (store.window && (store.window.open || store.window.close))
      ? store.window
      : (cfg.store || FALLBACK_OPERATING_HOURS.store);

    // Friendly time strings
    const openStr = formatHHMMTo12h(storeWindow?.open);

    const nowTs = Date.now() + serverTimeOffsetMs;
    const isOpen = !!store.open;

    // Show no banner when open
    if (isOpen) return null;

    const nextTs = typeof store.nextOpenTs === 'number' ? store.nextOpenTs : null;
    const remainingMs = nextTs ? Math.max(0, nextTs - nowTs) : null;

    // Decide whether next opening is today (after midnight) or tomorrow
    const isSameDayNextOpen = nextTs
      ? (new Date(nowTs).toDateString() === new Date(nextTs).toDateString())
      : false;

    let title = '';
    let subtitle = '';

    if (nextTs) {
      if (isSameDayNextOpen) {
        // After midnight, waiting for today’s opening
        title = 'Opening soon';
        subtitle = openStr ? `Come back at ${openStr}` : 'Please check back soon';
      } else {
        // Before midnight and shop already closed for today
        title = 'Closed for today';
        subtitle = openStr ? `Opens tomorrow at ${openStr}` : 'Please check back tomorrow';
      }
    } else {
      // Fallback if backend didn’t provide nextOpenTs
      title = 'Closed now';
      subtitle = openStr ? `Opens at ${openStr}` : 'Please check back later';
    }

    const countdown = remainingMs !== null ? formatDuration(remainingMs) : '';

    return (
      <div className="max-w-lg mx-auto mt-4">
        <div className="relative overflow-hidden rounded-2xl shadow-lg">
          {/* Premium animated gradient background */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 50%, #f59e0b 100%)',
              filter: 'saturate(110%) brightness(1.05)'
            }}
          />
          <div className="absolute inset-0 opacity-20"
            style={{ background: 'radial-gradient(1200px 400px at -10% 0%, rgba(255,255,255,0.35), transparent), radial-gradient(800px 300px at 110% 100%, rgba(255,255,255,0.25), transparent)' }} />
          {/* Soft glow border */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }} />
          {/* Animated accents */}
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl animate-[op_float_8s_ease-in-out_infinite]" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl animate-[op_float_10s_ease-in-out_infinite]" />

          {/* Content */}
          <div className="relative z-10 flex items-center justify-between p-4 sm:p-5 text-white">
            {/* Left: title + subtitle */}
           <div className="flex items-start">
  <div className="mr-3 text-2xl sm:text-3xl leading-none">⏳</div>
  <div>
    <div
      className={
        "text-base sm:text-lg font-extrabold tracking-wide drop-shadow-sm" +
        (title === 'Closed for today' ? ' text-red-400' : '')
      }
    >
      {title}
    </div>
    <div className="text-xs sm:text-sm font-medium opacity-95">
      {subtitle}
    </div>
  </div>
</div>

          </div>

          {/* Right: live countdown */}
          <div className="flex items-center">
            <div className="px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 shadow-md">
              <div className="text-[10px] sm:text-xs uppercase tracking-wider opacity-90 font-semibold text-white/90">
                Opens in
              </div>
              <div className="font-mono text-lg sm:text-2xl font-bold leading-tight tracking-wider animate-[op_shimmer_3s_linear_infinite]">
                {countdown || '--:--'}
              </div>
            </div>
          </div>
        </div>

        {/* Local keyframes (scoped by unique names) */}
        <style>
          {`
              @keyframes op_float {
                0%, 100% { transform: translateY(0px); opacity: 0.7; }
                50% { transform: translateY(-12px); opacity: 1; }
              }
              @keyframes op_shimmer {
                0% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
                50% { filter: drop-shadow(0 0 8px rgba(255,255,255,0.35)); }
                100% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
              }
            `}
        </style>
          </div>
    );
  }

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

// Show registration UI if needed
if (registrationMode && registrationInitData) {
  return (
    <WebAppRegistration
      initData={registrationInitData}
      fingerprint={fingerprint || ''}
      onRegistrationComplete={handleRegistrationComplete}
    />
  );
}

if (authLoading) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-center relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-teal-400 rounded-full opacity-30 animate-float-1"></div>
        <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-amber-400 rounded-full opacity-40 animate-float-2"></div>
        <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-teal-300 rounded-full opacity-25 animate-float-3"></div>
      </div>
      <div className="relative flex flex-col items-center z-10">
        {/* Logo with enhanced visibility */}
        <div className="relative mb-12">
          {/* Logo glow background */}
          <div className="absolute inset-0 bg-white rounded-2xl opacity-90 blur-md transform scale-110"></div>
          <div className="relative bg-white rounded-xl p-6 shadow-2xl">
            <img
              src={logo}
              alt="7Days Hypermarket Logo"
              className="w-28 h-28 md:w-32 md:h-32 object-contain animate-logo-entrance"
              draggable={false}
            />
          </div>
          {/* Animated ring around logo */}
          <div className="absolute inset-0 border-2 border-teal-400 rounded-xl opacity-50 animate-pulse-ring"></div>
        </div>
        {/* Premium "Opening" text */}
        <div className="relative">
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 animate-text-entrance"
            style={{
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '0.05em',
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
              background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
            }}>
            Opening
          </h1>
          {/* Animated dots */}
          <div className="flex justify-center space-x-1 mt-2">
            <div className="w-2 h-2 bg-teal-400 rounded-full animate-dot-1"></div>
            <div className="w-2 h-2 bg-teal-400 rounded-full animate-dot-2"></div>
            <div className="w-2 h-2 bg-teal-400 rounded-full animate-dot-3"></div>
          </div>
        </div>
        {/* Premium loading bar */}
        <div className="mt-8 w-48 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-teal-400 via-amber-400 to-teal-400 rounded-full animate-loading-bar"></div>
        </div>
      </div>
      <style>{`
          @keyframes logo-entrance {
            0% { 
              transform: scale(0.3) rotateY(-180deg); 
              opacity: 0; 
            }
            60% { 
              transform: scale(1.1) rotateY(10deg); 
              opacity: 1; 
            }
            100% { 
              transform: scale(1) rotateY(0deg); 
              opacity: 1; 
            }
          }
          .animate-logo-entrance {
            animation: logo-entrance 1.5s cubic-bezier(.68,-0.55,.27,1.55) both;
          }
          @keyframes text-entrance {
            0% { 
              opacity: 0; 
              transform: translateY(30px) scale(0.9); 
            }
            100% { 
              opacity: 1; 
              transform: translateY(0) scale(1); 
            }
          }
          .animate-text-entrance {
            animation: text-entrance 1.2s 0.8s cubic-bezier(.68,-0.55,.27,1.55) both;
          }
          @keyframes pulse-ring {
            0%, 100% { 
              transform: scale(1); 
              opacity: 0.5; 
            }
            50% { 
              transform: scale(1.05); 
              opacity: 0.2; 
            }
          }
          .animate-pulse-ring {
            animation: pulse-ring 2s infinite;
          }
          @keyframes dot-1 {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes dot-2 {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes dot-3 {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
          .animate-dot-1 { animation: dot-1 1.5s 0s infinite; }
          .animate-dot-2 { animation: dot-2 1.5s 0.2s infinite; }
          .animate-dot-3 { animation: dot-3 1.5s 0.4s infinite; }
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
          .animate-loading-bar {
            animation: loading-bar 2s infinite;
          }
          @keyframes float-1 {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
          }
          @keyframes float-2 {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-15px) rotate(-180deg); }
          }
          @keyframes float-3 {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-25px) rotate(90deg); }
          }
          .animate-float-1 { animation: float-1 6s infinite; }
          .animate-float-2 { animation: float-2 4s infinite; }
          .animate-float-3 { animation: float-3 5s infinite; }
        `}</style>
    </div>
  );
}

// Replace old access error screen with proper instructions
if (accessError) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-center p-6">
      <div className="bg-red-100 border border-red-300 rounded-lg p-6 text-red-700 max-w-md">
        <div className="text-2xl mb-2">🔒 Access Error</div>
        <div className="mb-2">{accessError}</div>
        <div className="text-gray-800 text-sm">
          Please complete the registration process to continue.
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
        <div className="mb-2">You are not registered. Please complete the registration process to use this app.</div>
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

    {/* Store operating hours banner (Home only) */}
    {renderOperatingHoursBanner()}

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
      return disableOrderReview && (
        <div className="max-w-lg mx-auto mt-4">
          <div className="flex items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg shadow">
            <div className="font-semibold mb-1">Registration Required</div>
            <div className="text-sm ml-2">
              Please complete the registration process before placing an order.
            </div>
          </div>
        </div>
      );
    })()}

    {/* Main content */}
    <div className="pt-2">
      {/* Global Header - only show on main tab pages, not on search/category overlay */}
      {MAIN_PAGES.includes(currentPage) && (
        <GlobalHeader
          onSearchFocus={handleSearchFocus}
          showBackButton={false}
          title={currentPage === 'home' ? '' : currentPage.charAt(0).toUpperCase() + currentPage.slice(1)}
          showSearch={currentPage !== 'account'}
          searchPlaceholder="Search products..."
          userName={userName}
          onCartClick={handleViewCart}
        />
      )}

      {/* Page Content based on currentPage */}
      {currentPage === 'home' && (
        <HomePage
          onCategorySelect={handleCategorySelect}
        />
      )}
      {currentPage === 'cart' && (
        <CartPage
          userId={userId}
          disableOrderReview={disableOrderReview}
          deliveryAllowed={deliveryAllowed}
          deliveryCheckPending={deliveryCheckPending}
          onOrderPlaced={handleOrderPlaced}
          onNavigateToOrders={() => {
            setTab('orders');
            setCurrentPage('orders');
            setSearchQuery('');
            setSelectedCategory('');
            setNavigationStack(prev => [...prev, 'orders']);
            window.scrollTo(0, 0);
          }}
          onOpenOrderReview={handleOpenOrderReview}
          onCloseOrderReview={handleCloseOrderReview}
        />
      )}
      {currentPage === 'orders' && (
        <OrdersPage userId={userId} onNavigateToCart={() => setTab('cart')} />
      )}
      {currentPage === 'account' && (
        <AccountPage
          userId={userId}
          onOpenAddressModal={handleOpenAddressModal}
          onCloseAddressModal={handleCloseAddressModal}
        />
      )}

      {/* Search Page Overlay */}
      {currentPage === 'search' && (
        <SearchPage
          onBack={handleSmartBack}
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

      {/* Food Page Overlay */}
      {currentPage === 'food' && (
        <FoodPage
          onBack={handleSmartBack}
        />
      )}

      {/* Dedicated Category Pages */}
      {currentPage === 'dedicated-category' && selectedCategory === 'Grocery & Kitchen' && (
        <GroceryKitchenPage
          onBack={handleSmartBack}
          onNavigateToCategory={handleCategorySelect}
          onSearchOpen={handleSearchFocus}
          setIsModalOpen={setDedicatedCategoryModalOpen}
        />
      )}

      {currentPage === 'dedicated-category' && selectedCategory === 'Snacks & Drinks' && (
        <SnacksDrinksPage
          onBack={handleSmartBack}
          onNavigateToCategory={handleCategorySelect}
          onSearchOpen={handleSearchFocus}
          setIsModalOpen={setDedicatedCategoryModalOpen}
        />
      )}

      {currentPage === 'dedicated-category' && selectedCategory === 'Beauty & Personal Care' && (
        <BeautyPersonalCarePage
          onBack={handleSmartBack}
          onNavigateToCategory={handleCategorySelect}
          onSearchOpen={handleSearchFocus}
          setIsModalOpen={setDedicatedCategoryModalOpen}
        />
      )}

      {currentPage === 'dedicated-category' && selectedCategory === 'Household Essentials' && (
        <HouseholdEssentialsPage
          onBack={handleSmartBack}
          onNavigateToCategory={handleCategorySelect}
          onSearchOpen={handleSearchFocus}
          setIsModalOpen={setDedicatedCategoryModalOpen}
        />
      )}
    </div>

    {/* Bottom Navigation - only show when not in overlay mode */}
    {MAIN_PAGES.includes(currentPage) && (
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