/**
 * Application Configuration
 * Contains environment-specific URLs and settings
 */

// API endpoints
export const BOT_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'https://supermarket-backend-ytrh.onrender.com';

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
export const isDevelopment = import.meta.env.MODE !== 'production' || import.meta.env.VITE_DEV_MODE === 'true';