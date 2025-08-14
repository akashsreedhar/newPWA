import { useState, useEffect, useRef } from 'react';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase';

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
  registrationMode: boolean;
  registrationInitData: string | null;
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
  const [registrationMode, setRegistrationMode] = useState<boolean>(false);
  const [registrationInitData, setRegistrationInitData] = useState<string | null>(null);

  // Debounce/lock: Only allow one authentication at a time
  const isAuthenticating = useRef(false);

  // 🔥 NEW: Function to sign in with Firebase custom token
  const signInWithFirebaseCustomToken = async (customToken: string) => {
    try {
      const userCredential = await signInWithCustomToken(auth, customToken);
      console.log('✅ Firebase Auth successful:', userCredential.user.uid);
      return true;
    } catch (error: any) {
      console.error('❌ Firebase Auth failed:', error);
      return false;
    }
  };

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
        setUserId(import.meta.env.VITE_DEV_USER_ID || '123456789');
setLastLocation({
  latitude: Number(import.meta.env.VITE_DEV_USER_LAT || 12.23811),
  longitude: Number(import.meta.env.VITE_DEV_USER_LNG || 75.23166),
  address: import.meta.env.VITE_DEV_USER_ADDRESS || "123 Main Street, Test City"
});

        setAccessError("");
        setLoading(false);
        setRegistrationMode(false);
        setRegistrationInitData(null);
        isAuthenticating.current = false;
        
        // 🔥 NEW: Sign in mock user to Firebase Auth in dev mode
        try {
          // In dev mode, we skip Firebase Auth as we don't have a custom token
          // But we could sign out any existing user to avoid conflicts
          if (auth.currentUser) {
            console.log('🔍 DEV MODE: Signing out existing Firebase user for clean state');
            await signOut(auth);
          }
          console.log('🔍 DEV MODE: Firebase Auth state cleared for dev user');
        } catch (error) {
          console.warn('⚠️ DEV MODE: Firebase Auth setup issue:', error);
        }
        
        return;
      }

      if (isAuthenticating.current) return; // Debounce: skip if already running
      isAuthenticating.current = true;
      setLoading(true);

      try {
        const BOT_SERVER_URL = process.env.NODE_ENV === 'production'
  ? import.meta.env.VITE_BACKEND_URL_PROD
  : import.meta.env.VITE_BACKEND_URL_DEV;

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
              // Check if registration is required
              if (data.requiresRegistration) {
                setRegistrationMode(true);
                setRegistrationInitData(tgWebApp.initData);
                setUserId(null);
                setAccessError("");
                setLoading(false);
                isAuthenticating.current = false;
                return;
              }
              
              setUserId(data.user_id || data.user);
              if (data.lastLocation) {
                setLastLocation({
                  latitude: data.lastLocation.latitude,
                  longitude: data.lastLocation.longitude,
                  address: data.lastLocation.address
                });
              }
              setAccessError("");
              setRegistrationMode(false);
              setRegistrationInitData(null);
              
              // 🔥 NEW: Sign in to Firebase Auth with custom token
              if (data.firebaseCustomToken) {
                const firebaseSuccess = await signInWithFirebaseCustomToken(data.firebaseCustomToken);
                if (firebaseSuccess) {
                  console.log('✅ Dual authentication successful (Telegram + Firebase)');
                } else {
                  console.warn('⚠️ Custom auth successful but Firebase Auth failed');
                }
              } else {
                console.warn('⚠️ No Firebase custom token received from backend');
              }
              
              setLoading(false);
              return;
            } else {
              // Handle other validation errors
              setUserId(null);
              setRegistrationMode(false);
              setRegistrationInitData(null);
              setAccessError(
                data.error && data.error.includes("not registered")
                  ? "❌ You are not registered. Please complete the registration process."
                  : "❌ Invalid or expired session. Please try again."
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
          setRegistrationMode(false);
          setRegistrationInitData(null);
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
              setRegistrationMode(false);
              setRegistrationInitData(null);
              setAccessError("❌ Session expired. Please use the Telegram bot to get a new access link.");
              setLoading(false);
              return;
            }
          } else {
            clearRefreshToken();
            setUserId(null);
            setRegistrationMode(false);
            setRegistrationInitData(null);
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
          setRegistrationMode(false);
          setRegistrationInitData(null);
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
          setRegistrationMode(false);
          setRegistrationInitData(null);
          // Store refresh token if provided
          if (data.refreshToken) setRefreshToken(data.refreshToken);
          
          // 🔥 NEW: Sign in to Firebase Auth with custom token
          if (data.firebaseCustomToken) {
            const firebaseSuccess = await signInWithFirebaseCustomToken(data.firebaseCustomToken);
            if (firebaseSuccess) {
              console.log('✅ Dual authentication successful (Token + Firebase)');
            } else {
              console.warn('⚠️ Custom auth successful but Firebase Auth failed');
            }
          } else {
            console.warn('⚠️ No Firebase custom token received from backend');
          }
          
        } else {
          setUserId(null);
          setRegistrationMode(false);
          setRegistrationInitData(null);
          setAccessError("❌ Invalid or expired session. Please use the Telegram bot to get a new access link.");
        }
      } catch (error) {
        if (!cancelled) {
          setUserId(null);
          setRegistrationMode(false);
          setRegistrationInitData(null);
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
    loading,
    registrationMode,
    registrationInitData
  };
}