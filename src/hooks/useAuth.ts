import { useState, useEffect, useRef } from 'react';

// Types
interface LastLocation {
  latitude: number;
  longitude: number;
  address: string;
}

interface AuthReturn {
  userId: string | null;
  accessError: string;
  lastLocation: LastLocation | null;
  loading: boolean;
}

// Extend Window interface for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        [key: string]: any;
      };
    };
  }
}

// Helper to get/set refresh token in localStorage
function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}
function setRefreshToken(token: string): void {
  if (token) localStorage.setItem('refreshToken', token);
}
function clearRefreshToken(): void {
  localStorage.removeItem('refreshToken');
}

export function useAuth(fingerprint: string | null): AuthReturn {
  const [userId, setUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string>("");
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Debounce/lock: Only allow one authentication at a time
  const isAuthenticating = useRef(false);

  useEffect(() => {
    if (!fingerprint) {
      setLoading(true);
      return; // Wait until fingerprint is set
    }

    let cancelled = false;

    const authenticateUser = async (retry = false) => {

      // --- DEV MODE BYPASS: Use test user if not in production or VITE_DEV_MODE is true ---
      console.log('🔍 useAuth dev mode check:', {
        VITE_DEV_MODE: import.meta.env.VITE_DEV_MODE,
        MODE: import.meta.env.MODE,
        NODE_ENV: process.env.NODE_ENV,
        isDev: import.meta.env.VITE_DEV_MODE === 'true'
      });
      
      if (import.meta.env.VITE_DEV_MODE === 'true') {
        console.log('✅ DEV MODE: Using mock user');
        setUserId('123456789');
        setLastLocation({
          latitude: 12.23811,
          longitude: 75.23166,
          address: "123 Main Street, Test City"
        });
        setAccessError("");
        setLoading(false);
        isAuthenticating.current = false;
        return;
      }

      if (isAuthenticating.current) return; // Debounce: skip if already running
      isAuthenticating.current = true;
      setLoading(true);

      try {
        const BOT_SERVER_URL = process.env.NODE_ENV === 'production' 
          ? 'https://supermarket-backend-ytrh.onrender.com'
          : 'http://localhost:3000'; // Make sure this matches your backend port

        // --- NEW: Telegram Mini App Auth ---
        const tgWebApp = window.Telegram && window.Telegram.WebApp;
        if (
          tgWebApp &&
          tgWebApp.initData &&
          tgWebApp.initData.length > 10
        ) {
          // Try Telegram Mini App authentication
          const resp = await fetch(`${BOT_SERVER_URL}/verify-telegram-initdata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tgWebApp.initData, fingerprint })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (cancelled) return;
            if (data.valid) {
              setUserId(data.user_id || data.user);
              if (data.lastLocation) {
                setLastLocation({
                  latitude: data.lastLocation.latitude,
                  longitude: data.lastLocation.longitude,
                  address: data.lastLocation.address
                });
              }
              setAccessError("");
              setLoading(false);
              return;
            } else {
              // FIX: Block unregistered users and show error
              setUserId(null);
              setAccessError(
                data.error && data.error.includes("not registered")
                  ? "❌ You are not registered. Please register via the Telegram bot."
                  : "❌ Invalid or expired session. Please use the Telegram bot to get a new access link."
              );
              setLoading(false);
              return;
            }
          }
          // If Telegram auth fails, fall through to token logic
        }

        // --- Existing Token Auth (fallback) ---
        const params = new URLSearchParams(window.location.search);
        let token = params.get("token");
        if (!token) {
          setUserId(null);
          setAccessError("❌ Invalid session. Please use the Telegram bot to get a valid access token.");
          setLoading(false);
          return;
        }

        let url = `${BOT_SERVER_URL}/verify-token?token=${encodeURIComponent(token)}`;
        if (fingerprint) {
          url += `&fingerprint=${encodeURIComponent(fingerprint)}`;
        }

        let response = await fetch(url);

        // If access token expired, try refresh mechanism
        if (response.status === 401 && getRefreshToken()) {
          // Try to refresh the token
          const refreshResp = await fetch(`${BOT_SERVER_URL}/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: getRefreshToken(), fingerprint })
          });
          if (refreshResp.ok) {
            const refreshData = await refreshResp.json();
            if (refreshData.token) {
              // Replace token in URL (optional, or just use for this session)
              token = refreshData.token;
              setRefreshToken(refreshData.refreshToken); // update if new one issued (sliding expiry)
              url = `${BOT_SERVER_URL}/verify-token?token=${encodeURIComponent(token!)}`;
              if (fingerprint) {
                url += `&fingerprint=${encodeURIComponent(fingerprint)}`;
              }
              response = await fetch(url);
            } else {
              clearRefreshToken();
              setUserId(null);
              setAccessError("❌ Session expired. Please use the Telegram bot to get a new access link.");
              setLoading(false);
              return;
            }
          } else {
            clearRefreshToken();
            setUserId(null);
            setAccessError("❌ Session expired. Please use the Telegram bot to get a new access link.");
            setLoading(false);
            return;
          }
        }

        if (!response.ok) {
          // Retry once on 403 (device binding race)
          if (
            response.status === 403 &&
            !retry
          ) {
            await new Promise(res => setTimeout(res, 350));
            isAuthenticating.current = false;
            return authenticateUser(true);
          }
          setUserId(null);
          throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();

        if (cancelled) return;

        if (data.valid) {
          setUserId(data.user);
          if (data.lastLocation) {
            setLastLocation({
              latitude: data.lastLocation.latitude,
              longitude: data.lastLocation.longitude,
              address: data.lastLocation.address
            });
          }
          setAccessError("");
          // Store refresh token if provided
          if (data.refreshToken) setRefreshToken(data.refreshToken);
        } else {
          setUserId(null);
          setAccessError("❌ Invalid or expired session. Please use the Telegram bot to get a new access link.");
        }
      } catch (error) {
        if (!cancelled) {
          setUserId(null);
          setAccessError("❌ Connection failed. Please check your internet connection and try again.");
        }
      } finally {
        isAuthenticating.current = false;
        setLoading(false);
      }
    };

    authenticateUser();

    return () => {
      cancelled = true;
    };
  }, [fingerprint]);

  return {
    userId,
    accessError,
    lastLocation,
    loading
  };
}