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
import { BACKEND_URL, USE_BACKEND_OPERATING_HOURS, OPERATING_HOURS_ENDPOINT, OPERATING_HOURS_POLL_MS, FALLBACK_OPERATING_HOURS } from '../config';

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
  const withTimeout = useCallback<<T>(promise: Promise<T>, ms?: number, label?: string) => Promise<T>>(<T,>(promise: Promise<T>, ms = 8000, label = 'Validation timed out'): Promise<T> => {
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
        PriceValidationAnalytics.getInstance().trackValidation(duration, validation.hasChanges);
      } catch (error) {
        PriceValidationErrorTracker.trackError(error as Error, {
          validationType: 'client',
          timestamp: new Date().toISOString(),
          cartItems: cartItems.map(item => ({ id: item.id, name: item.name }))
        });
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [cartItems]);

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

  // =================== Operating Hours (Pre-Checkout UX) ===================

  const [operatingStatus, setOperatingStatus] = useState<any | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [opTick, setOpTick] = useState(0);

  // Fetch status on mount and poll
  useEffect(() => {
    let mounted = true;
    let pollId: any = null;

    const applyFallback = () => {
      const fb = FALLBACK_OPERATING_HOURS;
      // Minimal synthetic status for fallback (assume open to avoid accidental blocking)
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

  // 1s ticker for countdown display only
  useEffect(() => {
    const id = setInterval(() => setOpTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatHHMMTo12h = (hhmm?: string) => {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const [hStr, mStr] = hhmm.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return hhmm;
    const isPM = h >= 12;
    const hr = ((h + 11) % 12) + 1;
    const mm = m.toString().padStart(2, '0');
    return `${hr}:${mm} ${isPM ? 'PM' : 'AM'}`;
  };

  const formatDurationCompact = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const normalizeCategory = (c: any) => String(c || '').toLowerCase();

  // Local heuristics for fast food (category or FF-specific fields)
  const localIsFastFood = (item: any) => {
    const c = normalizeCategory(item.category);
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

  // Enriched Fast Food detection via backend (authoritative) when needed
  const [ffDetectedIds, setFfDetectedIds] = useState<Set<string>>(new Set());
  const [ffDetecting, setFfDetecting] = useState(false);

  const nowTs = Date.now() + serverTimeOffsetMs;
  const storeOpen = !!operatingStatus?.store?.open;
  const kitchenOpen = !!operatingStatus?.fast_food?.open;

  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      // Reset when not needed
      if (!cartItems.length || !storeOpen || kitchenOpen) {
        if (!cancelled) {
          setFfDetectedIds(new Set());
          setFfDetecting(false);
        }
        return;
      }
      // If local heuristics already find any FF items, use them
      const localIds = cartItems.filter(localIsFastFood).map((i: any) => i.id);
      if (localIds.length > 0) {
        if (!cancelled) {
          setFfDetectedIds(new Set(localIds));
          setFfDetecting(false);
        }
        return;
      }
      // Otherwise, probe backend once for normalized categories
      try {
        setFfDetecting(true);
        const resp = await fetch(`${BACKEND_URL}/validate-cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: cartItems.map((i: any) => ({ id: i.id, quantity: i.quantity })) })
        });
        if (!resp.ok) throw new Error('validate-cart failed');
        const data = await resp.json();
        const list = Array.isArray(data?.normalizedItems) ? data.normalizedItems
          : Array.isArray(data?.items) ? data.items : [];
        const ids = list
          .filter((p: any) => {
            const c = normalizeCategory(p?.category);
            return c.includes('fast') && c.includes('food');
          })
          .map((p: any) => String(p.id));
        if (!cancelled) {
          setFfDetectedIds(new Set(ids));
        }
      } catch {
        // Ignore errors; backend will still block at placement time
      } finally {
        if (!cancelled) setFfDetecting(false);
      }
    };
    detect();
    return () => { cancelled = true; };
    // Only re-run when cart changes or kitchen/store state changes
  }, [cartItems, storeOpen, kitchenOpen]);

  // Final fast food predicate (includes backend-enriched IDs)
  const isFastFoodItem = (item: any) => localIsFastFood(item) || ffDetectedIds.has(item.id);
  const hasFastFood = cartItems.some(isFastFoodItem);
  const hasGrocery = cartItems.some(item => !isFastFoodItem(item));

  const storeWindow = (() => {
    const s = operatingStatus?.store || {};
    const cfg = operatingStatus?.config || {};
    return (s.window && (s.window.open || s.window.close)) ? s.window : (cfg.store || FALLBACK_OPERATING_HOURS.store);
  })();
  const ffWindow = (() => {
    const ff = operatingStatus?.fast_food || {};
    const cfg = operatingStatus?.config || {};
    return (ff.window && (ff.window.open || ff.window.close)) ? ff.window : (cfg.services?.fast_food || FALLBACK_OPERATING_HOURS.services.fast_food);
  })();

  const storeOpenStr = formatHHMMTo12h(storeWindow?.open);
  const ffOpenStr = formatHHMMTo12h(ffWindow?.open);

  const nextStoreTs = typeof operatingStatus?.store?.nextOpenTs === 'number' ? operatingStatus?.store?.nextOpenTs : null;
  const nextKitchenTs = typeof operatingStatus?.fast_food?.nextOpenTs === 'number' ? operatingStatus?.fast_food?.nextOpenTs : null;

  const isSameDayNextOpen = (nextTs: number | null) =>
    nextTs ? (new Date(nowTs).toDateString() === new Date(nextTs).toDateString()) : false;

  // Remove all fast food items helper
  const removeFastFoodItems = () => {
    cartItems.forEach(item => {
      if (isFastFoodItem(item)) removeFromCart(item.id);
    });
  };

  // Determine hours-based block and banner content
  type HoursBlock =
    | { active: false }
    | {
        active: true;
        type: 'store_closed' | 'kitchen_only' | 'kitchen_mixed';
        title: string;
        subtitle: string;
        countdownMs: number | null;
        showRemoveFastFoodCta?: boolean;
      };

  const hoursBlock: HoursBlock = (() => {
    if (!operatingStatus) return { active: false };

    // Case 1: Store is closed -> block everything
    if (!storeOpen) {
      const sameDay = isSameDayNextOpen(nextStoreTs);
      const title = sameDay ? 'Opening soon' : 'Closed for today';
      const subtitle = sameDay
        ? (storeOpenStr ? `Come back at ${storeOpenStr}` : 'Please check back soon')
        : (storeOpenStr ? `Opens tomorrow at ${storeOpenStr}` : 'Please check back tomorrow');
      const countdownMs = nextStoreTs ? Math.max(0, nextStoreTs - nowTs) : null;
      return { active: true, type: 'store_closed', title, subtitle, countdownMs };
    }

    // Case 2: Store open, kitchen closed and cart has fast food
    if (storeOpen && !kitchenOpen && hasFastFood) {
      const title = 'Kitchen opening soon';
      const subtitle = ffOpenStr ? `Come back at ${ffOpenStr}` : 'Please check back soon';
      const countdownMs = nextKitchenTs ? Math.max(0, nextKitchenTs - nowTs) : null;
      return {
        active: true,
        type: hasGrocery ? 'kitchen_mixed' : 'kitchen_only',
        title,
        subtitle,
        countdownMs,
        showRemoveFastFoodCta: hasGrocery
      };
    }

    // Otherwise, no hours block
    return { active: false };
  })();

  // =================== Operating Hours Banner (Premium style) ===================

  const renderOperatingHoursBanner = () => {
    if (!hoursBlock.active) return null;

    const countdown = hoursBlock.countdownMs != null ? formatDurationCompact(hoursBlock.countdownMs) : '';
    const isClosedToday = hoursBlock.title === 'Closed for today';

    return (
      <div className="max-w-lg mx-auto mt-4">
        <div className="relative overflow-hidden rounded-2xl shadow-lg">
          {/* Animated gradient background */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 50%, #f59e0b 100%)',
              filter: 'saturate(110%) brightness(1.05)'
            }}
          />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                'radial-gradient(1200px 400px at -10% 0%, rgba(255,255,255,0.35), transparent), radial-gradient(800px 300px at 110% 100%, rgba(255,255,255,0.25), transparent)'
            }}
          />
          {/* Glow border */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }}
          />
          {/* Floating accents */}
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl animate-[op_float_8s_ease-in-out_infinite]" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl animate-[op_float_10s_ease-in-out_infinite]" />

          {/* Content row */}
          <div className="relative z-10 p-4 sm:p-5 text-white">
            <div className="flex items-start justify-between">
              {/* Left: message */}
              <div className="flex items-start">
                <div className="mr-3 text-2xl sm:text-3xl leading-none">⏳</div>
                <div>
                  <div
                    className={
                      'text-base sm:text-lg font-extrabold tracking-wide drop-shadow-sm' +
                      (isClosedToday ? ' text-black' : '')
                    }
                  >
                    {hoursBlock.title}
                  </div>
                  <div className="text-xs sm:text-sm font-medium opacity-95">
                    {hoursBlock.subtitle}
                  </div>

                  {/* CTA when mixed cart and kitchen not open */}
                  {hoursBlock.type === 'kitchen_mixed' && hoursBlock.showRemoveFastFoodCta && (
                    <div className="mt-2">
                      <button
                        onClick={removeFastFoodItems}
                        className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 border border-white/30 transition-colors text-black"
                        type="button"
                      >
                        Remove Fast Food items & continue
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: countdown */}
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

            {/* Short helper note for kitchen-only cart */}
            {hoursBlock.type === 'kitchen_only' && (
              <div className="mt-2 text-[11px] sm:text-xs text-white/90">
                Add grocery items or come back when the kitchen opens.
              </div>
            )}
          </div>

          {/* Local keyframes */}
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
      </div>
    );
  };

  const isHoursBlocked = hoursBlock.active;

  // =================== Proceed to Checkout flow ===================

  // Proceed to checkout with validations (rate-limits, stock, prices)
  const handleProceedToCheckout = async () => {
    if (!userId || accessError) return;

    // Block at Cart when hours logic says so (immersive fast UX)
    if (isHoursBlocked) {
      return;
    }

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
      PriceValidationAnalytics.getInstance().trackValidation(duration, validation.hasChanges);

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
    PriceValidationAnalytics.getInstance().trackOrderCancellation('price_change');
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
        // Fire-and-forget: update client-side rate limit record
        try {
          resp.clone().json().then(async (data) => {
            if (data?.id) {
              try { await telegramRateLimit.recordOrderPlacement(data.id); } catch {}
            }
          }).catch(() => {});
        } catch {}

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

      // Prefer operating-hours friendly message when applicable
      const ohMsg = (() => {
        if (resp.status === 403 && (data?.code === 'STORE_CLOSED' || data?.code === 'SERVICE_CLOSED')) {
          const prefix = data?.code === 'STORE_CLOSED' ? 'Store is closed' : 'Fast Food is closed';
          let suffix = '';
          if (typeof data?.retryAfter === 'number') {
            const secs = Math.max(0, Math.round(data.retryAfter));
            suffix = ` • Opens in ${formatTimeRemaining(secs)}`;
          } else if (typeof data?.nextOpenTs === 'number') {
            const secs = Math.max(0, Math.round((data.nextOpenTs - Date.now()) / 1000));
            suffix = ` • Opens in ${formatTimeRemaining(secs)}`;
          } else if (data?.nextOpen) {
            suffix = ` • Next opening: ${data.nextOpen}`;
          }
          return `${prefix}.${suffix}`;
        }
        return null;
      })();

      const details = (data.details || data.errors) || [];
      const msgList = Array.isArray(details) ? details.map((e: any) => e?.message || e?.code).filter(Boolean) : [];
      const errorMsg = ohMsg || data?.error || (msgList.length ? msgList.join('\n') : 'Failed to place order. Please review your cart and try again.');
      
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
  <div className="flex items-center bg-orange-50 border-l-4 border-orange-400 text-orange-800 p-4 rounded-lg shadow">
    <AlertTriangle className="mr-2 flex-shrink-0 text-orange-500" />
    <div>
      <div className="font-semibold mb-1">Order limit reached for now</div>
      <div className="text-xs">
        {rateLimitStatus.retryAfter && rateLimitStatus.retryAfter > 0 && (
          <div className="mt-1 text-orange-600 font-medium">
            Please try again in {formatTimeRemaining(rateLimitStatus.retryAfter)}.
          </div>
        )}
      </div>
    </div>
  </div>
</div>
      )}

      {/* Operating hours banner (pre-checkout UX) */}
      {renderOperatingHoursBanner()}

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {cartItems.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <img
                src={item.imageUrl || item.image || '/placeholder.png'}
                alt={item.name}
                className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                onError={e => { (e.currentTarget as HTMLImageElement).src = '/placeholder.png'; }}
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
    // Only run if not disabled
    let max = maxQtyRef.current[item.id];
    if (typeof max !== 'number') {
      const fetched = await ensureMaxQtyKnown(item.id);
      if (typeof fetched === 'number') {
        max = fetched;
      }
    }
    const nextQty = item.quantity + 1;
    if (typeof max === 'number' && nextQty > max) {
      // Should never fire if disabled, but keep as fallback
      alert('Sorry, we have limited stock for this item.');
      return;
    }
    updateQuantity(item.id, nextQty);
  }}
  disabled={
    (() => {
      let max = maxQtyRef.current[item.id];
      if (typeof max !== 'number') return false; // Don't disable if unknown
      return item.quantity >= max;
    })()
  }
  className={
    (() => {
      let max = maxQtyRef.current[item.id];
      const isDisabled = typeof max === 'number' && item.quantity >= max;
      return [
        'w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors',
        isDisabled
          ? 'bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed'
          : 'bg-teal-600 hover:bg-teal-700 text-white'
      ].join(' ');
    })()
  }
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
          className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-colors ${(!userId || accessError || validatingPrices || rateLimitStatus.checking || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) || isHoursBlocked) ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
          disabled={!userId || !!accessError || authLoading || validatingPrices || rateLimitStatus.checking || (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason) || isHoursBlocked}
        >
          {validatingPrices
            ? 'Checking for Offers...'
            : rateLimitStatus.checking
            ? 'Checking Limits...'
            : (!rateLimitStatus.allowed && !rateLimitStatus.exemptionReason)
            ? 'Order Limit Reached'
            : (!userId || accessError)
            ? 'Registration Required'
            : `${t('proceedToCheckout')} • ₹${grandTotal}`}
        </button>
      </div>
    </div>
  );
};

export default CartPage;