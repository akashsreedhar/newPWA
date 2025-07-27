// Extend Window interface for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: any;
        ready: () => void;
        expand: () => void;
        close: () => void;
        showPopup: (params: any, callback: any) => void;
        requestContact: (callback: (result: any) => void) => void;
        requestLocation: (callback: (result: any) => void) => void;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive: boolean) => void;
          hideProgress: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          setText: (text: string) => void;
        };
      };
    };
  }
}

/**
 * Check if Telegram WebApp is available
 */
export const isTelegramWebApp = (): boolean => {
  return !!(window.Telegram && window.Telegram.WebApp);
};

/**
 * Get Telegram initData string
 */
export const getTelegramInitData = (): string | null => {
  return window.Telegram?.WebApp?.initData || null;
};

/**
 * Get user info from Telegram WebApp
 */
export const getTelegramUserInfo = (): any | null => {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
};

/**
 * Request contact information from Telegram WebApp
 */
export const requestContact = (): Promise<{ phone_number: string }> => {
  return new Promise((resolve, reject) => {
    if (!isTelegramWebApp()) {
      reject(new Error('Telegram WebApp is not available'));
      return;
    }
    
    window.Telegram?.WebApp?.requestContact((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Contact sharing denied'));
      }
    });
  });
};

/**
 * Request location from Telegram WebApp
 */
export const requestLocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (!isTelegramWebApp()) {
      reject(new Error('Telegram WebApp is not available'));
      return;
    }
    
    window.Telegram?.WebApp?.requestLocation((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Location sharing denied'));
      }
    });
  });
};

/**
 * Show a popup in Telegram WebApp
 */
export const showPopup = (
  title: string,
  message: string,
  buttons: Array<{ text: string; type: string; id: string }>
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!isTelegramWebApp()) {
      reject(new Error('Telegram WebApp is not available'));
      return;
    }
    
    window.Telegram?.WebApp?.showPopup(
      { title, message, buttons },
      (buttonId: string) => {
        resolve(buttonId);
      }
    );
  });
};