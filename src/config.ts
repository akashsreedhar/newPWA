/**
 * Application Configuration
 * Contains environment-specific URLs and settings
 */

// API endpoints
export const BOT_SERVER_URL =
  import.meta.env.VITE_BACKEND_URL || 'https://supermarket-backend-ytrh.onrender.com';

export const BACKEND_URL =
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  'https://supermarket-backend-ytrh.onrender.com';

// WebApp URL (used by bot)
export const WEBAPP_URL = 'https://new-pwa-hazel.vercel.app/';

// Store location for delivery radius calculation
export const STORE_LOCATION = {
  latitude: 12.238554127515341,
  longitude: 75.23239831991346
};

// Delivery radius in kilometers
export const DELIVERY_RADIUS_KM = 100;

// Environment variables
export const isDevelopment =
  import.meta.env.MODE !== 'production' || import.meta.env.VITE_DEV_MODE === 'true';

/**
 * Operating hours integration (frontend)
 * - Backend is the source of truth via GET /operating-hours
 * - These flags and fallbacks are for UX and resiliency
 */

// Feature flag: use backend operating hours API
export const USE_BACKEND_OPERATING_HOURS =
  (import.meta.env.VITE_USE_BACKEND_OPERATING_HOURS ?? 'true') === 'true';

// Status endpoint for operating hours
export const OPERATING_HOURS_ENDPOINT = `${BACKEND_URL}/operating-hours`;

// Polling interval (ms) for operating hours updates in the app
export const OPERATING_HOURS_POLL_MS = Number.parseInt(
  import.meta.env.VITE_OPERATING_HOURS_POLL_MS || '60000',
  10
);

// Display timezone (backend computes truth; this is only for UI labels if needed)
export const DEFAULT_TIMEZONE = import.meta.env.VITE_TIMEZONE || 'Asia/Kolkata';

// Fallback schedule if backend status is temporarily unavailable.
// UI should prefer backend values and only rely on this for graceful degradation.
export const FALLBACK_OPERATING_HOURS = {
  timezone: DEFAULT_TIMEZONE,
  store: {
    open: import.meta.env.VITE_STORE_OPEN || '09:00',
    close: import.meta.env.VITE_STORE_CLOSE || '20:00',
    lastOrderBufferMinutes: Number.parseInt(
      import.meta.env.VITE_LAST_ORDER_BUFFER_MINUTES || '0',
      10
    )
  },
  services: {
    fast_food: {
      open: import.meta.env.VITE_FASTFOOD_OPEN || '13:00',
      close: import.meta.env.VITE_FASTFOOD_CLOSE || '20:00',
      lastOrderBufferMinutes: Number.parseInt(
        import.meta.env.VITE_FASTFOOD_LAST_ORDER_BUFFER_MINUTES ||
          import.meta.env.VITE_LAST_ORDER_BUFFER_MINUTES ||
          '0',
        10
      )
    }
  }
};