/**
 * Application Configuration
 * Contains environment-specific URLs and settings
 */

// API endpoints - fully configurable via environment variables
export const BOT_SERVER_URL = import.meta.env.VITE_BACKEND_URL;

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// WebApp URL (used by bot) - now configurable
export const WEBAPP_URL = import.meta.env.VITE_WEBAPP_URL;

// Store location for delivery radius calculation - now configurable
export const STORE_LOCATION = {
  latitude: Number(import.meta.env.VITE_SUPERMARKET_LAT),
  longitude: Number(import.meta.env.VITE_SUPERMARKET_LNG)
};

// Delivery radius in kilometers - now configurable
export const DELIVERY_RADIUS_KM = Number(import.meta.env.VITE_DELIVERY_RADIUS_KM);

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
    open: import.meta.env.VITE_STORE_OPEN!,
    close: import.meta.env.VITE_STORE_CLOSE!,
    lastOrderBufferMinutes: Number.parseInt(
      import.meta.env.VITE_LAST_ORDER_BUFFER_MINUTES!,
      10
    )
  },
  services: {
    fast_food: {
      open: import.meta.env.VITE_FASTFOOD_OPEN!,
      close: import.meta.env.VITE_FASTFOOD_CLOSE!,
      lastOrderBufferMinutes: Number.parseInt(
        import.meta.env.VITE_FASTFOOD_LAST_ORDER_BUFFER_MINUTES ||
          import.meta.env.VITE_LAST_ORDER_BUFFER_MINUTES!,
        10
      )
    }
  }
};