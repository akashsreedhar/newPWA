/**
 * PRODUCTION-READY TelegramRateLimit Service
 * 
 * This service provides rate limiting functionality for the Telegram Mini App,
 * integrated with server-side validation to prevent bypassing and minimize Firebase usage.
 */

// Rate limiting configuration (must match backend)
const RATE_LIMIT_CONFIG = {
  CACHE_TTL_SECONDS: 30,        // Local cache TTL
  SERVER_CACHE_TTL_SECONDS: 10, // Server response cache TTL
  RETRY_DELAY_MS: 1000,         // Retry delay for failed API calls
  MAX_RETRIES: 3                // Maximum number of retries
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
    expiresAt: number;          // Expiration timestamp
    used: boolean;              // Whether the exemption has been used
  };
  postExemptionCooldown?: {     // 5-minute cooldown after using exemption
    expiresAt: number;          // Cooldown expiration timestamp
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
  }
}

/**
 * Main rate limiting service class
 */
export class TelegramRateLimit {
  private static instance: TelegramRateLimit;
  private initialized: boolean = false;
  private telegramWebApp: any = null;
  private telegramUser: any = null;
  private telegramCloudStorage: any = null;
  private backendUrl: string = 'https://supermarket-backend-ytrh.onrender.com';
  
  // In-memory cache to minimize storage and API operations
  private cache: {
    orderHistory?: OrderHistory;
    lastFetch?: number;
    validUntil?: number;
    serverRateLimit?: RateLimitResult;
    serverCacheUntil?: number;
  } = {};
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.init();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): TelegramRateLimit {
    if (!TelegramRateLimit.instance) {
      TelegramRateLimit.instance = new TelegramRateLimit();
    }
    return TelegramRateLimit.instance;
  }
  
  /**
   * Initialize the service
   */
  public async init(): Promise<boolean> {
    if (this.initialized) return true;
    
    try {
      // Check if running in Telegram WebApp
      if (window.Telegram?.WebApp) {
        this.telegramWebApp = window.Telegram.WebApp;
        this.telegramUser = this.telegramWebApp.initDataUnsafe?.user;
        
        // Check if CloudStorage API is available (Telegram Mini App API 6.9+)
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
      
      // Initialize device fingerprint if not already set
      const deviceId = this.getOrCreateDeviceFingerprint();
      
      // Ensure session token exists
      this.getOrCreateSessionToken();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize TelegramRateLimit:', error);
      this.initialized = true; // Mark as initialized to prevent retries
      return false;
    }
  }
  
  /**
   * Get user identifier (with fallbacks)
   */
  private getUserId(): string {
    // First try: Telegram user ID (most secure)
    if (this.telegramUser?.id) {
      return String(this.telegramUser.id);
    }
    
    // Second try: Firebase user ID from localStorage
    const localUserId = localStorage.getItem('current_user_id');
    if (localUserId) {
      return String(localUserId);
    }
    
    // Last resort: Session-based ID
    const sessionToken = this.getOrCreateSessionToken();
    return `session_${sessionToken}`;
  }
  
  /**
   * Create or retrieve device fingerprint
   */
  private getOrCreateDeviceFingerprint(): string {
    try {
      let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      
      if (!deviceId) {
        // Generate device fingerprint based on browser/device properties
        const components = [
          navigator.userAgent,
          navigator.language,
          screen.colorDepth,
          screen.width + 'x' + screen.height,
          new Date().getTimezoneOffset(),
          !!navigator.cookieEnabled,
          !!window.localStorage,
          !!window.indexedDB,
          typeof(window.orientation) !== 'undefined' ? window.orientation : '',
          navigator.vendor || ''
        ].join('|');
        
        // Create simple hash of device properties
        let hash = 0;
        for (let i = 0; i < components.length; i++) {
          hash = ((hash << 5) - hash) + components.charCodeAt(i);
          hash |= 0; // Convert to 32bit integer
        }
        
        deviceId = `fp_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
      
      return deviceId;
    } catch (error) {
      // Fallback to timestamp-based ID if localStorage fails
      return `fp_${Date.now().toString(36)}`;
    }
  }
  
  /**
   * Get or create session token (persists across page refreshes but not browser sessions)
   */
  private getOrCreateSessionToken(): string {
    try {
      let sessionToken = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
      
      if (!sessionToken) {
        sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, sessionToken);
      }
      
      return sessionToken;
    } catch (error) {
      // Fallback to in-memory token
      return `session_${Date.now()}`;
    }
  }
  
  /**
   * Check if user can place a new order (primary public method)
   * Uses server-side validation with client-side fallback
   */
  public async canPlaceOrder(): Promise<RateLimitResult> {
    try {
      await this.init();
      
      const userId = this.getUserId();
      if (!userId || userId.startsWith('session_')) {
        // For session users, always allow with local checks as fallback
        return this.checkLocalRateLimits();
      }
      
      // Check cache first for performance
      const now = Date.now();
      if (
        this.cache.serverRateLimit && 
        this.cache.serverCacheUntil && 
        this.cache.serverCacheUntil > now
      ) {
        return this.cache.serverRateLimit;
      }
      
      // Make server request with retry logic
      let retries = 0;
      let lastError: any = null;
      
      while (retries < RATE_LIMIT_CONFIG.MAX_RETRIES) {
        try {
          const response = await fetch(
            `${this.backendUrl}/check-rate-limits?userId=${encodeURIComponent(userId)}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          );
          
          if (!response.ok) {
            console.error(`Server rate limit check failed (${response.status}): ${response.statusText}`);
            retries++;
            
            if (retries >= RATE_LIMIT_CONFIG.MAX_RETRIES) {
              return this.checkLocalRateLimits();
            }
            
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.RETRY_DELAY_MS));
            continue;
          }
          
          const result: RateLimitResult = await response.json();
          
          // Cache server result
          this.cache.serverRateLimit = result;
          this.cache.serverCacheUntil = now + (RATE_LIMIT_CONFIG.SERVER_CACHE_TTL_SECONDS * 1000);
          
          console.log('✅ Server rate limit check:', result);
          return result;
        } catch (error) {
          lastError = error;
          console.error(`Error checking server rate limits (retry ${retries + 1}/${RATE_LIMIT_CONFIG.MAX_RETRIES}):`, error);
          retries++;
          
          if (retries >= RATE_LIMIT_CONFIG.MAX_RETRIES) {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.RETRY_DELAY_MS));
        }
      }
      
      console.error('All server rate limit check retries failed:', lastError);
      return this.checkLocalRateLimits();
    } catch (error) {
      console.error('Error in canPlaceOrder:', error);
      return { allowed: true, fallback: true };
    }
  }
  
  /**
   * Fallback local rate limit checking
   * Used when server validation is unavailable
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
      
      // Check for post-exemption cooldown
      if (
        history.postExemptionCooldown && 
        history.postExemptionCooldown.expiresAt > now
      ) {
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
      
      // Check for valid cancellation exemption token
      if (
        history.cancelExemptionToken && 
        !history.cancelExemptionToken.used &&
        history.cancelExemptionToken.expiresAt > now
      ) {
        // Allow order placement regardless of time interval
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
      
      // 1. Get real active orders from Firestore (most accurate)
      const activeOrderIds = await this.getActiveOrdersFromFirestore();
      const activeOrdersCount = activeOrderIds.length;
      
      // Update stored active orders with Firestore data
      history.activeOrders = activeOrderIds;
      await this.saveOrderHistory(history);
      
      // Check active orders limit (max 2 active orders)
      if (activeOrdersCount >= 2) {
        return {
          allowed: false,
          reason: `You have ${activeOrdersCount} active orders. Please wait for them to complete before placing a new order.`,
          activeOrders: activeOrdersCount,
          fallback: true
        };
      }
      
      // 2. Check time interval between orders (5 minutes minimum)
      const recentOrders = history.orderTimestamps.filter(
        time => now - time < 5 * 60 * 1000
      );
      
      if (recentOrders.length > 0) {
        const oldestRecent = Math.min(...recentOrders);
        const waitTimeMs = (5 * 60 * 1000) - (now - oldestRecent);
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
      
      // 3. Check daily limit (max 20 orders per day)
      if (history.dailyOrderCount >= 20) {
        return {
          allowed: false,
          reason: `You've reached the daily limit of 20 orders. Please try again tomorrow.`,
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
        remainingToday: 20 - history.dailyOrderCount,
        fallback: true
      };
    } catch (error) {
      console.error('Error checking local rate limits:', error);
      // Fail-safe: allow order if checks fail
      return { allowed: true, fallback: true };
    }
  }
  
  /**
   * Get order history from storage (with caching)
   */
  private async getOrderHistory(): Promise<OrderHistory> {
    // Check cache first for performance
    const now = Date.now();
    if (
      this.cache.orderHistory && 
      this.cache.validUntil && 
      this.cache.validUntil > now
    ) {
      return this.cache.orderHistory;
    }
    
    const userId = this.getUserId();
    const storageKey = `${STORAGE_KEYS.ORDER_HISTORY}${userId}`;
    const today = new Date().toDateString();
    
    // Default fresh history object
    const defaultHistory: OrderHistory = {
      activeOrders: [],
      orderTimestamps: [],
      dailyOrderCount: 0,
      lastResetDate: today,
      deviceIds: [this.getOrCreateDeviceFingerprint()]
    };
    
    try {
      // Try Telegram CloudStorage first (if available)
      if (this.telegramCloudStorage) {
        try {
          const data = await this.telegramCloudStorage.getItem(storageKey);
          if (data) {
            const parsed = JSON.parse(data) as OrderHistory;
            
            // Reset daily count if needed
            if (parsed.lastResetDate !== today) {
              parsed.dailyOrderCount = 0;
              parsed.lastResetDate = today;
              await this.telegramCloudStorage.setItem(storageKey, JSON.stringify(parsed));
            }
            
            // Add current device ID if not already tracked
            const deviceId = this.getOrCreateDeviceFingerprint();
            if (!parsed.deviceIds) {
              parsed.deviceIds = [deviceId];
            } else if (!parsed.deviceIds.includes(deviceId)) {
              parsed.deviceIds.push(deviceId);
              // Keep only the last 5 device IDs
              if (parsed.deviceIds.length > 5) {
                parsed.deviceIds = parsed.deviceIds.slice(-5);
              }
              await this.telegramCloudStorage.setItem(storageKey, JSON.stringify(parsed));
            }
            
            // Update cache
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
          // Continue to fallback mechanism
        }
      }
      
      // Fallback to localStorage
      const localData = localStorage.getItem(storageKey);
      if (localData) {
        try {
          const parsed = JSON.parse(localData) as OrderHistory;
          
          // Reset daily count if needed
          if (parsed.lastResetDate !== today) {
            parsed.dailyOrderCount = 0;
            parsed.lastResetDate = today;
            localStorage.setItem(storageKey, JSON.stringify(parsed));
          }
          
          // Add current device ID if not already tracked
          const deviceId = this.getOrCreateDeviceFingerprint();
          if (!parsed.deviceIds) {
            parsed.deviceIds = [deviceId];
          } else if (!parsed.deviceIds.includes(deviceId)) {
            parsed.deviceIds.push(deviceId);
            // Keep only the last 5 device IDs
            if (parsed.deviceIds.length > 5) {
              parsed.deviceIds = parsed.deviceIds.slice(-5);
            }
            localStorage.setItem(storageKey, JSON.stringify(parsed));
          }
          
          // Update cache
          this.cache = {
            ...this.cache,
            orderHistory: parsed,
            lastFetch: now,
            validUntil: now + (RATE_LIMIT_CONFIG.CACHE_TTL_SECONDS * 1000)
          };
          
          return parsed;
        } catch (parseError) {
          console.error('Error parsing localStorage data:', parseError);
          // Continue to default return
        }
      }
      
      // No data found, return and save default history
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
      // Ensure deviceIds exists
      if (!history.deviceIds) {
        history.deviceIds = [this.getOrCreateDeviceFingerprint()];
      }
      
      // Update cache
      this.cache = {
        ...this.cache,
        orderHistory: history,
        lastFetch: Date.now(),
        validUntil: Date.now() + (RATE_LIMIT_CONFIG.CACHE_TTL_SECONDS * 1000)
      };
      
      // Try Telegram CloudStorage first
      if (this.telegramCloudStorage) {
        try {
          await this.telegramCloudStorage.setItem(storageKey, JSON.stringify(history));
          return true;
        } catch (cloudError) {
          console.error('Error saving to Telegram CloudStorage:', cloudError);
          // Continue to fallback
        }
      }
      
      // Fallback to localStorage
      localStorage.setItem(storageKey, JSON.stringify(history));
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
      // Extract Firebase user ID
      let firebaseUserId = '';
      const userId = this.getUserId();
      
      if (userId.startsWith('local_')) {
        firebaseUserId = userId.substring(6);
      } else if (!userId.startsWith('session_')) {
        firebaseUserId = userId;
      } else {
        const localUserId = localStorage.getItem('current_user_id');
        if (localUserId) {
          firebaseUserId = localUserId;
        } else {
          return []; // Can't determine Firebase user ID
        }
      }
      
      if (!firebaseUserId) return [];
      
      // Import Firebase dynamically to avoid circular dependencies
      const { db } = await import('../firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      // Query active orders
      const q = query(
        collection(db, "orders"),
        where("user", "==", firebaseUserId),
        where("status", "in", [
          'pending', 'accepted', 'picking', 'ready', 'out_for_delivery'
        ])
      );
      
      const snapshot = await getDocs(q);
      
      // Return order IDs
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return data.orderNumber || doc.id;
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
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId,
              orderId: orderId
            })
          });
          console.log('✅ Recorded order placement on server');
        } catch (serverError) {
          console.error('❌ Failed to record order placement on server:', serverError);
        }
      }
      
      // Also update local storage as backup
      const history = await this.getOrderHistory();
      const now = Date.now();
      
      // Reset daily count if needed
      const today = new Date().toDateString();
      if (history.lastResetDate !== today) {
        history.dailyOrderCount = 0;
        history.lastResetDate = today;
      }
      
      // Update order history
      history.orderTimestamps.push(now);
      history.activeOrders.push(orderId);
      history.dailyOrderCount++;
      
      // Keep only recent timestamps (last 24 hours)
      history.orderTimestamps = history.orderTimestamps.filter(
        time => now - time < 24 * 60 * 60 * 1000
      );
      
      // Save updated history
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
      
      // Remove from active orders
      history.activeOrders = history.activeOrders.filter(id => id !== orderId);
      
      // Save updated history
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
      
      const history = await this.getOrderHistory();
      
      // Set expiration to 10 minutes from now
      const expiresAt = Date.now() + 10 * 60 * 1000; 
      
      history.cancelExemptionToken = {
        orderId,
        expiresAt,
        used: false
      };
      
      return await this.saveOrderHistory(history);
    } catch (error) {
      console.error('Error granting cancellation exemption:', error);
      return false;
    }
  }
  
  /**
   * Use exemption token
   */
  public async useExemptionToken(): Promise<void> {
    try {
      // Clear server cache
      this.cache.serverRateLimit = undefined;
      this.cache.serverCacheUntil = undefined;
      
      // Use server-side exemption usage for registered users
      const userId = this.getUserId();
      if (userId && !userId.startsWith('session_')) {
        try {
          await fetch(`${this.backendUrl}/use-cancellation-exemption`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId
            })
          });
          console.log('✅ Used exemption token on server with 5-minute cooldown');
        } catch (serverError) {
          console.error('❌ Failed to use exemption token on server:', serverError);
        }
      }
      
      // Also update local storage
      const history = await this.getOrderHistory();
      if (history.cancelExemptionToken) {
        history.cancelExemptionToken.used = true;
        
        // Add 5-minute cooldown period
        history.postExemptionCooldown = {
          expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        };
        
        await this.saveOrderHistory(history);
      }
    } catch (error) {
      console.error('Error marking exemption token as used:', error);
    }
  }
  
  /**
   * Clear all caches (useful for testing or when data inconsistency detected)
   */
  public clearAllCaches(): void {
    this.cache = {};
    console.log('🧹 Cleared all TelegramRateLimit caches');
  }
  
  /**
   * Get time until midnight in seconds (for daily reset)
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }
  
  /**
   * Validates if the user is authenticated via Telegram
   */
  public isTelegramUserAuthenticated(): boolean {
    return !!(this.telegramUser?.id);
  }
  
  /**
   * Get Telegram user ID if available
   */
  public getTelegramUserId(): string | null {
    return this.telegramUser?.id || null;
  }
  
  /**
   * Check if CloudStorage is available
   */
  public isCloudStorageAvailable(): boolean {
    return !!this.telegramCloudStorage;
  }
  
  /**
   * Format seconds into a readable time
   */
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