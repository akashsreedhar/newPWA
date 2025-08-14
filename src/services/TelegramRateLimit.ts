/**
 * PRODUCTION-READY TelegramRateLimit Service
 *
 * Centralized client-side rate limit helper that:
 * - Always trusts server (/check-rate-limits) with short timeout
 * - Falls back to local checks using server-learned config
 * - Matches backend limits: 2 min interval, 3 active orders, 20/day, 2 min post-exemption cooldown
 */

// Rate limiting configuration (client behavior + request policy)
const RATE_LIMIT_CONFIG = {
  CACHE_TTL_SECONDS: 30,        // Local order history cache TTL
  SERVER_CACHE_TTL_SECONDS: 10, // Server response cache TTL
  RETRY_DELAY_MS: 500,          // Delay between retries (ms)
  MAX_RETRIES: 2,               // Max retries for server calls
  REQUEST_TIMEOUT_MS: 2000      // Per-request timeout for fast UX (ms)
};

// Storage keys
const STORAGE_KEYS = {
  ORDER_HISTORY: 'order_limits_',  // Prefix for user-specific data
  DEVICE_ID: 'device_fingerprint', // Device fingerprint storage
  SESSION_TOKEN: 'order_session',  // Current session token
};

// Types for rate limiting data
interface OrderHistory {
  activeOrders: string[];       // Currently active order IDs
  orderTimestamps: number[];    // Timestamps of recent orders
  dailyOrderCount: number;      // Orders placed today
  lastResetDate: string;        // When daily count was last reset
  deviceIds?: string[];         // Device fingerprints used
  cancelExemptionToken?: {      // Exemption token for order cancellation
    orderId: string;            // Cancelled order ID
    expiresAt: number;          // Expiration timestamp (ms)
    used: boolean;              // Whether the exemption has been used
  };
  postExemptionCooldown?: {     // Cooldown after using exemption
    expiresAt: number;          // Cooldown expiration timestamp (ms)
  };
}

interface RateLimitResult {
  allowed: boolean;             // Whether order is allowed
  reason?: string;              // Reason if not allowed
  retryAfter?: number;          // Seconds until retry is possible
  activeOrders?: number;        // Current active order count
  exemptionReason?: string;     // Reason for exemption if applicable
  cooldownType?: string;        // Type of cooldown (post_exemption, frequency, etc.)
  dailyCount?: number;          // Current daily order count
  remainingToday?: number;      // Remaining orders allowed today
  fallback?: boolean;           // Whether this is a fallback response
  warning?: string;             // Warning message if any
  exemption?: {                 // Exemption details if applicable
    orderId: string;            // Order ID that was exempted
    expiresAt: number;          // When exemption expires
  };
  // Optional config hints the server may return
  maxActiveOrders?: number;
  minInterval?: number;         // minutes
  maxDailyOrders?: number;
}

// Server-learned config (kept in-memory to avoid drift during fallback)
interface LearnedConfig {
  maxActiveOrders: number;            // default 3
  minIntervalMinutes: number;         // default 2
  maxDailyOrders: number;             // default 20
  postExemptionCooldownMinutes: number; // default 2
}

/**
 * Main rate limiting service class
 */
export class TelegramRateLimit {
  private static instance: TelegramRateLimit;
  private initialized = false;
  private telegramWebApp: any = null;
  private telegramUser: any = null;
  private telegramCloudStorage: any = null;
private backendUrl = import.meta.env.VITE_BACKEND_URL;
  // Learned config from server (fallback-safe defaults match backend)
 private learnedConfig: LearnedConfig = {
  maxActiveOrders: Number(import.meta.env.VITE_ORDER_MAX_ACTIVE || 3),
  minIntervalMinutes: Number(import.meta.env.VITE_ORDER_MIN_INTERVAL || 2),
  maxDailyOrders: Number(import.meta.env.VITE_ORDER_MAX_DAILY || 20),
  postExemptionCooldownMinutes: Number(import.meta.env.VITE_ORDER_POST_EXEMPTION_COOLDOWN || 2)
};

  // In-memory cache to minimize storage and API operations
  private cache: {
    orderHistory?: OrderHistory;
    lastFetch?: number;
    validUntil?: number;
    serverRateLimit?: RateLimitResult;
    serverCacheUntil?: number;
  } = {};

  // Utility: fetch with timeout (browser AbortController)
  private async fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = RATE_LIMIT_CONFIG.REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...(init || {}), signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  private constructor() {
    this.init();
  }

  public static getInstance(): TelegramRateLimit {
    if (!TelegramRateLimit.instance) {
      TelegramRateLimit.instance = new TelegramRateLimit();
    }
    return TelegramRateLimit.instance;
  }

  public async init(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
        this.telegramWebApp = (window as any).Telegram.WebApp;
        this.telegramUser = this.telegramWebApp.initDataUnsafe?.user;

        if (this.telegramWebApp.CloudStorage) {
          this.telegramCloudStorage = this.telegramWebApp.CloudStorage;
          console.log('✅ Using Telegram CloudStorage for rate limiting');
        } else {
          console.log('⚠️ Telegram CloudStorage not available, using localStorage fallback');
        }
      } else {
        console.log('⚠️ Not running in Telegram WebApp environment');
      }

      this.initialized = true;

      // Initialize device fingerprint and session token
      this.getOrCreateDeviceFingerprint();
      this.getOrCreateSessionToken();

      return true;
    } catch (error) {
      console.error('Failed to initialize TelegramRateLimit:', error);
      this.initialized = true;
      return false;
    }
  }

  private getUserId(): string {
    if (this.telegramUser?.id) {
      return String(this.telegramUser.id);
    }
    const localUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_id') : null;
    if (localUserId) return String(localUserId);
    const sessionToken = this.getOrCreateSessionToken();
    return `session_${sessionToken}`;
  }

  private getOrCreateDeviceFingerprint(): string {
    try {
      let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
        const components = [
          navigator.userAgent,
          navigator.language,
          screen.colorDepth,
          screen.width + 'x' + screen.height,
          new Date().getTimezoneOffset(),
          !!navigator.cookieEnabled,
          !!window.localStorage,
          !!window.indexedDB,
          typeof (window as any).orientation !== 'undefined' ? (window as any).orientation : '',
          navigator.vendor || ''
        ].join('|');

        let hash = 0;
        for (let i = 0; i < components.length; i++) {
          hash = ((hash << 5) - hash) + components.charCodeAt(i);
          hash |= 0;
        }

        deviceId = `fp_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
      return deviceId;
    } catch {
      return `fp_${Date.now().toString(36)}`;
    }
  }

  private getOrCreateSessionToken(): string {
    try {
      let sessionToken = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
      if (!sessionToken) {
        sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, sessionToken);
      }
      return sessionToken;
    } catch {
      return `session_${Date.now()}`;
    }
  }

  private async logExemptionStatus(): Promise<void> {
    try {
      const history = await this.getOrderHistory();
      const now = Date.now();

      if (history.cancelExemptionToken) {
        const token = history.cancelExemptionToken;
        const isValid = token.expiresAt > now && !token.used;
        const expiresIn = Math.floor((token.expiresAt - now) / 1000);

        console.log(`🎟️ Exemption token status:
        - Valid: ${isValid}
        - Used: ${token.used}
        - Expires in: ${expiresIn > 0 ? `${expiresIn}s` : 'Expired'}
        - Order ID: ${token.orderId}
      `);
      } else {
        console.log('🎟️ No exemption token found in local storage');
      }

      if (history.postExemptionCooldown && history.postExemptionCooldown.expiresAt > now) {
        const cooldownRemaining = Math.floor((history.postExemptionCooldown.expiresAt - now) / 1000);
        console.log(`⏳ Post-exemption cooldown: ${cooldownRemaining}s remaining`);
      }
    } catch (error) {
      console.error('Error logging exemption status:', error);
    }
  }

  /**
   * Primary public method. Prefers server; falls back locally if server slow/unreachable.
   */
  public async canPlaceOrder(): Promise<RateLimitResult> {
    try {
      await this.init();
      await this.logExemptionStatus();

      const userId = this.getUserId();
      if (!userId || userId.startsWith('session_')) {
        return this.checkLocalRateLimits();
      }

      // Serve from cache for snappy UX
      const nowCached = Date.now();
      if (this.cache.serverRateLimit && this.cache.serverCacheUntil && this.cache.serverCacheUntil > nowCached) {
        return this.cache.serverRateLimit;
      }

      let retries = 0;
      let lastError: any = null;

      while (retries <= RATE_LIMIT_CONFIG.MAX_RETRIES) {
        try {
          const response = await this.fetchWithTimeout(
            `${this.backendUrl}/check-rate-limits?userId=${encodeURIComponent(userId)}`,
            { method: 'GET', headers: { 'Content-Type': 'application/json' } },
            RATE_LIMIT_CONFIG.REQUEST_TIMEOUT_MS
          );

          if (!response.ok) {
            // Non-2xx: try again or fallback
            retries++;
            if (retries > RATE_LIMIT_CONFIG.MAX_RETRIES) break;
            await new Promise(r => setTimeout(r, RATE_LIMIT_CONFIG.RETRY_DELAY_MS));
            continue;
          }

          const result: RateLimitResult = await response.json();

          // Learn config from server (prevents drift during fallback)
          this.updateLearnedConfigFromServer(result);

          // If server blocks due to post-exemption cooldown, cache it locally for UX + fewer calls
          if (result.allowed === false && result.cooldownType === 'post_exemption' && typeof result.retryAfter === 'number' && result.retryAfter > 0) {
            const history = await this.getOrderHistory();
            const expiresAt = Date.now() + result.retryAfter * 1000;
            history.postExemptionCooldown = { expiresAt };
            await this.saveOrderHistory(history);
          }

          // Cache server result for a short time (timestamp at cache time)
          const nowStore = Date.now();
          this.cache.serverRateLimit = result;
          this.cache.serverCacheUntil = nowStore + (RATE_LIMIT_CONFIG.SERVER_CACHE_TTL_SECONDS * 1000);

          console.log('✅ Server rate limit check:', result);

          if (result.exemptionReason && result.exemption) {
            console.log(`🎟️ Exemption: ${result.exemptionReason} (order ${result.exemption.orderId})`);
          }

          return result;
        } catch (error) {
          lastError = error;
          console.error(`Error checking server rate limits (attempt ${retries + 1}/${RATE_LIMIT_CONFIG.MAX_RETRIES + 1}):`, error);
          retries++;
          if (retries > RATE_LIMIT_CONFIG.MAX_RETRIES) break;
          await new Promise(r => setTimeout(r, RATE_LIMIT_CONFIG.RETRY_DELAY_MS));
        }
      }

      console.error('All server rate limit check attempts failed:', lastError);
      return this.checkLocalRateLimits();
    } catch (error) {
      console.error('Error in canPlaceOrder:', error);
      return { allowed: true, fallback: true };
    }
  }

  // Apply server-learned config hints when available
  private updateLearnedConfigFromServer(result: RateLimitResult) {
    if (typeof result.maxActiveOrders === 'number' && result.maxActiveOrders > 0) {
      this.learnedConfig.maxActiveOrders = result.maxActiveOrders;
    }
    if (typeof result.minInterval === 'number' && result.minInterval > 0) {
      this.learnedConfig.minIntervalMinutes = result.minInterval;
    }
    if (typeof result.maxDailyOrders === 'number' && result.maxDailyOrders > 0) {
      this.learnedConfig.maxDailyOrders = result.maxDailyOrders;
    }
    // Server may not return cooldown; keep default 2 minutes to match backend
  }

  /**
   * Fallback local rate limit checking (used only when server validation is unavailable).
   * Uses server-learned config to avoid drift.
   */
  private async checkLocalRateLimits(): Promise<RateLimitResult> {
    try {
      await this.init();
      const now = Date.now();

      // Get order history
      const history = await this.getOrderHistory();

      // Reset daily count if needed
      const today = new Date().toDateString();
      if (history.lastResetDate !== today) {
        history.dailyOrderCount = 0;
        history.lastResetDate = today;
        await this.saveOrderHistory(history);
      }

      // Post-exemption cooldown (learned 2 minutes by default)
      const postCooldownMs = this.learnedConfig.postExemptionCooldownMinutes * 60 * 1000;
      if (history.postExemptionCooldown && history.postExemptionCooldown.expiresAt > now) {
        const remainingSeconds = Math.ceil((history.postExemptionCooldown.expiresAt - now) / 1000);
        const minutes = Math.ceil(remainingSeconds / 60);
        return {
          allowed: false,
          reason: `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} after using exemption before placing another order.`,
          retryAfter: remainingSeconds,
          cooldownType: 'post_exemption',
          fallback: true
        };
      }

      // Valid cancellation exemption token (bypass interval checks)
      if (history.cancelExemptionToken && !history.cancelExemptionToken.used && history.cancelExemptionToken.expiresAt > now) {
        console.log(`🎟️ Using local exemption token for order ${history.cancelExemptionToken.orderId}`);
        return {
          allowed: true,
          exemptionReason: 'Recent order cancellation',
          exemption: {
            orderId: history.cancelExemptionToken.orderId,
            expiresAt: history.cancelExemptionToken.expiresAt
          },
          fallback: true
        };
      }

      // 1) Active orders (learned, default 3)
      const activeOrderIds = await this.getActiveOrdersFromFirestore();
      const activeOrdersCount = activeOrderIds.length;

      history.activeOrders = activeOrderIds;
      await this.saveOrderHistory(history);

      if (activeOrdersCount >= this.learnedConfig.maxActiveOrders) {
        return {
          allowed: false,
          reason: `You have ${activeOrdersCount} active orders. Please wait for them to complete before placing a new order.`,
          activeOrders: activeOrdersCount,
          fallback: true
        };
      }

      // 2) Minimum interval (learned, default 2 minutes)
      const intervalMs = this.learnedConfig.minIntervalMinutes * 60 * 1000;
      const recentOrders = history.orderTimestamps.filter(ts => now - ts < intervalMs);
      if (recentOrders.length > 0) {
        const oldestRecent = Math.min(...recentOrders);
        const waitTimeMs = intervalMs - (now - oldestRecent);
        const waitTimeSeconds = Math.ceil(waitTimeMs / 1000);
        const waitMinutes = Math.ceil(waitTimeSeconds / 60);
        return {
          allowed: false,
          reason: `Please wait ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''} between orders.`,
          retryAfter: waitTimeSeconds,
          activeOrders: activeOrdersCount,
          fallback: true
        };
      }

      // 3) Daily limit (learned, default 20)
      if (history.dailyOrderCount >= this.learnedConfig.maxDailyOrders) {
        return {
          allowed: false,
          reason: `You've reached the daily limit of ${this.learnedConfig.maxDailyOrders} orders. Please try again tomorrow.`,
          retryAfter: this.getSecondsUntilMidnight(),
          activeOrders: activeOrdersCount,
          fallback: true
        };
      }

      // All checks passed
      return {
        allowed: true,
        activeOrders: activeOrdersCount,
        dailyCount: history.dailyOrderCount,
        remainingToday: Math.max(0, this.learnedConfig.maxDailyOrders - history.dailyOrderCount),
        fallback: true
      };
    } catch (error) {
      console.error('Error checking local rate limits:', error);
      return { allowed: true, fallback: true };
    }
  }

  /**
   * Get order history from storage (with caching)
   * - Prunes expired exemption token and post-exemption cooldown for clean UX
   */
  private async getOrderHistory(): Promise<OrderHistory> {
    const now = Date.now();
    if (this.cache.orderHistory && this.cache.validUntil && this.cache.validUntil > now) {
      return this.cache.orderHistory;
    }

    const userId = this.getUserId();
    const storageKey = `${STORAGE_KEYS.ORDER_HISTORY}${userId}`;
    const today = new Date().toDateString();

    const defaultHistory: OrderHistory = {
      activeOrders: [],
      orderTimestamps: [],
      dailyOrderCount: 0,
      lastResetDate: today,
      deviceIds: [this.getOrCreateDeviceFingerprint()]
    };

    try {
      // Prefer Telegram CloudStorage
      if (this.telegramCloudStorage) {
        try {
          const data = await this.telegramCloudStorage.getItem(storageKey);
          if (data) {
            const parsed = JSON.parse(data) as OrderHistory;

            let changed = false;

            if (parsed.lastResetDate !== today) {
              parsed.dailyOrderCount = 0;
              parsed.lastResetDate = today;
              changed = true;
            }

            // Prune expired exemption and cooldown
            const nowTs = Date.now();
            if (parsed.cancelExemptionToken && parsed.cancelExemptionToken.expiresAt <= nowTs) {
              delete parsed.cancelExemptionToken;
              changed = true;
            }
            if (parsed.postExemptionCooldown && parsed.postExemptionCooldown.expiresAt <= nowTs) {
              delete parsed.postExemptionCooldown;
              changed = true;
            }

            const deviceId = this.getOrCreateDeviceFingerprint();
            if (!parsed.deviceIds) {
              parsed.deviceIds = [deviceId];
              changed = true;
            } else if (!parsed.deviceIds.includes(deviceId)) {
              parsed.deviceIds.push(deviceId);
              if (parsed.deviceIds.length > 5) parsed.deviceIds = parsed.deviceIds.slice(-5);
              changed = true;
            }

            if (changed) {
              await this.telegramCloudStorage.setItem(storageKey, JSON.stringify(parsed));
            }

            this.cache = {
              ...this.cache,
              orderHistory: parsed,
              lastFetch: now,
              validUntil: now + (RATE_LIMIT_CONFIG.CACHE_TTL_SECONDS * 1000)
            };
            return parsed;
          }
        } catch (cloudError) {
          console.error('Error reading from Telegram CloudStorage:', cloudError);
        }
      }

      // Fallback to localStorage
      const localData = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (localData) {
        try {
          const parsed = JSON.parse(localData) as OrderHistory;
          let changed = false;

          if (parsed.lastResetDate !== today) {
            parsed.dailyOrderCount = 0;
            parsed.lastResetDate = today;
            changed = true;
          }

          // Prune expired exemption and cooldown
          const nowTs = Date.now();
          if (parsed.cancelExemptionToken && parsed.cancelExemptionToken.expiresAt <= nowTs) {
            delete parsed.cancelExemptionToken;
            changed = true;
          }
          if (parsed.postExemptionCooldown && parsed.postExemptionCooldown.expiresAt <= nowTs) {
            delete parsed.postExemptionCooldown;
            changed = true;
          }

          const deviceId = this.getOrCreateDeviceFingerprint();
          if (!parsed.deviceIds) {
            parsed.deviceIds = [deviceId];
            changed = true;
          } else if (!parsed.deviceIds.includes(deviceId)) {
            parsed.deviceIds.push(deviceId);
            if (parsed.deviceIds.length > 5) parsed.deviceIds = parsed.deviceIds.slice(-5);
            changed = true;
          }

          if (changed && typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(parsed));
          }

          this.cache = {
            ...this.cache,
            orderHistory: parsed,
            lastFetch: now,
            validUntil: now + (RATE_LIMIT_CONFIG.CACHE_TTL_SECONDS * 1000)
          };
          return parsed;
        } catch (parseError) {
          console.error('Error parsing localStorage data:', parseError);
        }
      }

      // Nothing found, persist default
      await this.saveOrderHistory(defaultHistory);
      return defaultHistory;
    } catch (error) {
      console.error('Failed to get order history:', error);
      return defaultHistory;
    }
  }

  /**
   * Save order history to storage
   */
  private async saveOrderHistory(history: OrderHistory): Promise<boolean> {
    const userId = this.getUserId();
    const storageKey = `${STORAGE_KEYS.ORDER_HISTORY}${userId}`;

    try {
      if (!history.deviceIds) {
        history.deviceIds = [this.getOrCreateDeviceFingerprint()];
      }

      this.cache = {
        ...this.cache,
        orderHistory: history,
        lastFetch: Date.now(),
        validUntil: Date.now() + (RATE_LIMIT_CONFIG.CACHE_TTL_SECONDS * 1000)
      };

      if (this.telegramCloudStorage) {
        try {
          await this.telegramCloudStorage.setItem(storageKey, JSON.stringify(history));
          return true;
        } catch (cloudError) {
          console.error('Error saving to Telegram CloudStorage:', cloudError);
        }
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(history));
      }
      return true;
    } catch (error) {
      console.error('Failed to save order history:', error);
      return false;
    }
  }

  /**
   * Get active orders from Firebase (minimal cost)
   */
  private async getActiveOrdersFromFirestore(): Promise<string[]> {
    try {
      let firebaseUserId = '';
      const userId = this.getUserId();

      if (userId.startsWith('local_')) {
        firebaseUserId = userId.substring(6);
      } else if (!userId.startsWith('session_')) {
        firebaseUserId = userId;
      } else {
        const localUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_id') : null;
        if (localUserId) firebaseUserId = localUserId; else return [];
      }

      if (!firebaseUserId) return [];

      const { db } = await import('../firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');

      const q = query(
        collection(db, 'orders'),
        where('user', '==', firebaseUserId),
        where('status', 'in', ['pending', 'accepted', 'picking', 'ready', 'out_for_delivery'])
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return (data && data.orderNumber) || doc.id;
      });
    } catch (error) {
      console.error('Error getting active orders from Firestore:', error);
      return [];
    }
  }

  /**
   * Record a new order placement
   */
  public async recordOrderPlacement(orderId: string): Promise<boolean> {
    try {
      await this.init();

      // Clear server cache immediately
      this.cache.serverRateLimit = undefined;
      this.cache.serverCacheUntil = undefined;

      // Record on server-side for registered users
      const userId = this.getUserId();
      if (userId && !userId.startsWith('session_')) {
        try {
          await fetch(`${this.backendUrl}/record-order-placement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, orderId })
          });
          console.log('✅ Recorded order placement on server');
        } catch (serverError) {
          console.error('❌ Failed to record order placement on server:', serverError);
        }
      }

      // Also update local storage as backup
      const history = await this.getOrderHistory();
      const now = Date.now();

      const today = new Date().toDateString();
      if (history.lastResetDate !== today) {
        history.dailyOrderCount = 0;
        history.lastResetDate = today;
      }

      history.orderTimestamps.push(now);
      history.activeOrders.push(orderId);
      history.dailyOrderCount++;

      // Keep only last 24h timestamps
      history.orderTimestamps = history.orderTimestamps.filter(ts => now - ts < 24 * 60 * 60 * 1000);

      return await this.saveOrderHistory(history);
    } catch (error) {
      console.error('Error recording order placement:', error);
      return false;
    }
  }

  /**
   * Record order completion (when status changes)
   */
  public async recordOrderCompletion(orderId: string): Promise<boolean> {
    try {
      await this.init();

      // Clear server cache
      this.cache.serverRateLimit = undefined;
      this.cache.serverCacheUntil = undefined;

      const history = await this.getOrderHistory();

      history.activeOrders = history.activeOrders.filter(id => id !== orderId);

      return await this.saveOrderHistory(history);
    } catch (error) {
      console.error('Error recording order completion:', error);
      return false;
    }
  }

  /**
   * Grant cancellation exemption for a specific order
   */
  public async grantCancellationExemption(orderId: string): Promise<boolean> {
    try {
      // Clear server cache
      this.cache.serverRateLimit = undefined;
      this.cache.serverCacheUntil = undefined;

      const userId = this.getUserId();
      if (userId && !userId.startsWith('session_')) {
        try {
          console.log(`🎟️ Requesting server-side exemption for order ${orderId}`);
          const response = await fetch(`${this.backendUrl}/grant-cancellation-exemption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, orderId })
          });

          if (response.ok) {
            const result = await response.json();
            console.log('✅ Server granted exemption:', result);
          } else {
            console.error('❌ Server refused exemption:', await response.text());
          }
        } catch (serverError) {
          console.error('❌ Failed to request server-side exemption:', serverError);
        }
      }

      // Also set local exemption as backup (10 minutes to match backend)
      const history = await this.getOrderHistory();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      history.cancelExemptionToken = { orderId, expiresAt, used: false };

      console.log(`🎟️ Granted local exemption for order ${orderId} until ${new Date(expiresAt).toLocaleTimeString()}`);

      return await this.saveOrderHistory(history);
    } catch (error) {
      console.error('Error granting cancellation exemption:', error);
      return false;
    }
  }

  /**
   * Use exemption token (returns success/failure)
   */
  public async useExemptionToken(): Promise<boolean> {
    try {
      await this.logExemptionStatus();
      this.cache.serverRateLimit = undefined;
      this.cache.serverCacheUntil = undefined;

      let serverSuccess = false;
      const userId = this.getUserId();

      if (userId && !userId.startsWith('session_')) {
        try {
          console.log(`🎟️ Calling server to use exemption token for user ${userId}`);
          const response = await fetch(`${this.backendUrl}/use-cancellation-exemption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
          if (response.ok) {
            const result = await response.json();
            console.log('✅ Server response for using exemption token:', result);
            serverSuccess = true;
          } else {
            const errorText = await response.text();
            console.error(`❌ Server returned error (${response.status}):`, errorText);
            if (response.status === 404 || response.status === 400) {
              return false;
            }
          }
        } catch (serverError) {
          console.error('❌ Failed to use exemption token on server:', serverError);
        }
      }

      if (serverSuccess || !userId || userId.startsWith('session_')) {
        const history = await this.getOrderHistory();
        if (history.cancelExemptionToken) {
          console.log(`🎟️ Marking local exemption token as used (order ${history.cancelExemptionToken.orderId})`);
          history.cancelExemptionToken.used = true;
          // Match backend: 2-minute post-exemption cooldown
          history.postExemptionCooldown = {
            expiresAt: Date.now() + (this.learnedConfig.postExemptionCooldownMinutes * 60 * 1000)
          };
          await this.saveOrderHistory(history);
          console.log('✅ Updated local exemption token status and added cooldown');
          return true;
        } else {
          console.warn('⚠️ No exemption token found in local storage to mark as used');
          return false;
        }
      }

      await this.logExemptionStatus();
      return serverSuccess;
    } catch (error) {
      console.error('Error marking exemption token as used:', error);
      return false;
    }
  }

  /**
   * Clear all caches (useful for testing or when data inconsistency detected)
   */
  public clearAllCaches(): void {
    this.cache = {};
    console.log('🧹 Cleared all TelegramRateLimit caches');
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  public isTelegramUserAuthenticated(): boolean {
    return !!(this.telegramUser?.id);
  }

  public getTelegramUserId(): string | null {
    return this.telegramUser?.id || null;
  }

  public isCloudStorageAvailable(): boolean {
    return !!this.telegramCloudStorage;
  }

  public static formatTimeRemaining(seconds: number): string {
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
  }
}

// Export singleton instance
export const telegramRateLimit = TelegramRateLimit.getInstance();