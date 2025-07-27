import React, { useState, useEffect, useRef } from 'react';
import { BOT_SERVER_URL } from '../config';

// Define props interface
interface WebAppRegistrationProps {
  initData: string;
  fingerprint: string;
  onRegistrationComplete: (userData: any) => void;
}

// Registration steps
enum RegistrationStep {
  LOCATION = 'location',
  PHONE = 'phone',
  SUBMITTING = 'submitting',
  COMPLETE = 'complete',
  ERROR = 'error'
}

const WebAppRegistration: React.FC<WebAppRegistrationProps> = ({
  initData,
  fingerprint,
  onRegistrationComplete
}) => {
  const [step, setStep] = useState<RegistrationStep>(RegistrationStep.LOCATION);
  const [location, setLocation] = useState<any>(null);
  const [phone, setPhone] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [locationError, setLocationError] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Use refs to track state across async operations
  const phoneRequestActiveRef = useRef(false);
  const phoneResolvedRef = useRef(false);

  // Access Telegram WebApp
  const tgWebApp = window.Telegram?.WebApp;

  // Setup debug console
  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.log = (...args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      setDebugLogs(prev => [...prev, `LOG: ${message}`]);
      originalConsoleLog.apply(console, args);
    };

    console.error = (...args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      setDebugLogs(prev => [...prev, `ERROR: ${message}`]);
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      setDebugLogs(prev => [...prev, `WARN: ${message}`]);
      originalConsoleWarn.apply(console, args);
    };

    return () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);

  useEffect(() => {
    // Telegram MainButton setup
    if (tgWebApp) {
      tgWebApp.ready();
      tgWebApp.MainButton.hide();
      console.log('Telegram WebApp version:', tgWebApp.version || 'unknown');
    } else {
      console.warn('Telegram WebApp not available');
    }
  }, []);

  // Extract phone number from URL-encoded response
  const extractPhoneNumber = (result: string): string | null => {
    try {
      console.log('🔍 Extracting phone from result:', result.substring(0, 100));
      if (result && result.includes('contact=')) {
        const contactParam = result.split('contact=')[1].split('&')[0];
        console.log('📱 Contact param (encoded):', contactParam);
        const decodedContact = decodeURIComponent(contactParam);
        console.log('📱 Decoded contact JSON:', decodedContact);
        const contactData = JSON.parse(decodedContact);
        console.log('📱 Parsed contact data:', contactData);
        if (contactData && contactData.phone_number) {
          console.log('✅ Successfully extracted phone number:', contactData.phone_number);
          return contactData.phone_number;
        } else {
          console.warn('❌ No phone_number found in contact data');
          return null;
        }
      } else {
        console.warn('❌ No contact= parameter found in result');
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to parse contact data:', error);
      return null;
    }
  };

  // Request location using only browser geolocation
  const requestLocation = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setLocationError('');
    console.log('Starting location request process');

    if (!tgWebApp) {
      setLocationError('Telegram WebApp is not available');
      setIsProcessing(false);
      return;
    }

    try {
      console.log('Using browser geolocation directly');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => {
              console.error('Browser geolocation error:', error);
              reject(new Error(`Location access denied: ${error.message}`));
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0
            }
          );
        } else {
          reject(new Error('Geolocation is not supported by your browser'));
        }
      });

      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      console.log('Location data received:', locationData);

      // Verify location is in delivery area
      console.log('Verifying location with backend...');
      const verifyResponse = await fetch(`${BOT_SERVER_URL}/verify-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      });

      const verifyResult = await verifyResponse.json();
      console.log('Verify result:', verifyResult);

      if (!verifyResult.allowed) {
        setLocationError(verifyResult.message || 'Location is outside our delivery area');
        setIsProcessing(false);
        return;
      }

      if (verifyResult.address) {
        locationData.address = verifyResult.address;
      }

      setLocation(locationData);
      setStep(RegistrationStep.PHONE);
      setIsProcessing(false);

    } catch (error: any) {
      console.error('Location error:', error);
      setLocationError(error.message || 'Failed to get location. Please try again.');
      setIsProcessing(false);
    }
  };

  // Robust phone request function: handle cancelled immediately
 // Robust phone request function: handle cancelled immediately
const requestPhone = async () => {
  if (isProcessing || phoneRequestActiveRef.current) return;

  setIsProcessing(true);
  setPhoneError('');
  phoneRequestActiveRef.current = true;
  phoneResolvedRef.current = false;

  console.log('🚀 Starting phone request process');

  if (!tgWebApp) {
    setPhoneError('Telegram WebApp is not available');
    setIsProcessing(false);
    phoneRequestActiveRef.current = false;
    return;
  }

  try {
    const phoneNumber = await new Promise<string>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const handleSuccess = (phone: string) => {
        if (phoneResolvedRef.current) return;
        phoneResolvedRef.current = true;
        console.log('✅ Phone request successful:', phone);
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        resolve(phone);
      };

      const handleError = (errorMsg: string) => {
        if (phoneResolvedRef.current) return;
        phoneResolvedRef.current = true;
        console.error('❌ Phone request failed:', errorMsg);
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        reject(new Error(errorMsg));
      };

      // Attach handler BEFORE requesting contact!
      const globalEventHandler = (event: any) => {
        try {
          console.log('[WebApp] receiveEvent caught:', event);
          const data = event?.data;
          
          // Handle cancellation immediately
          if (data?.type === 'phone_requested' && data?.status === 'cancelled') {
            console.warn('🚫 User cancelled phone sharing.');
            handleError('Phone number sharing was cancelled. Please try again and allow access to continue.');
            return; // Exit immediately
          }
          
          if (
            data?.type === 'custom_method_invoked' &&
            typeof data.result === 'string' &&
            data.result.includes('contact=')
          ) {
            console.log('🎯 Found contact data in receiveEvent (type custom_method_invoked)');
            const phone = extractPhoneNumber(data.result);
            if (phone) handleSuccess(phone);
          }
        } catch (err) {
          console.error('Error processing global custom method event:', err);
        }
      };

      window.addEventListener('receiveEvent', globalEventHandler);

      const cleanup = () => {
        window.removeEventListener('receiveEvent', globalEventHandler);
      };

      // Only now call requestContact!
      console.log('📱 Requesting contact from Telegram...');
      tgWebApp.requestContact((result: any) => {
        console.log('📞 Contact callback received:', !!result);
        // Check if we already resolved (e.g., due to cancellation)
        if (phoneResolvedRef.current) {
          console.log('ℹ️ Promise already resolved, ignoring callback');
          return;
        }
        
        if (result && result.phone_number) {
          console.log('✅ Got phone from direct callback:', result.phone_number);
          handleSuccess(result.phone_number);
          return;
        }
        
        console.log('ℹ️ No direct phone in callback, waiting for custom method events...');
      });

      timeoutId = setTimeout(() => {
        if (!phoneResolvedRef.current) {
          console.warn('⏰ Phone request timed out after 25 seconds');
          handleError('Phone number request timed out. Please try again.');
        }
      }, 25000);
    });

    console.log('🎉 Successfully retrieved phone number:', phoneNumber);
    setPhone(phoneNumber);
    await submitRegistration(phoneNumber, location);

  } catch (error: any) {
    console.error('💥 Phone request error:', error?.message || 'Unknown error');
    let errorMessage = 'Failed to get phone number. Please try again.';
    if (error instanceof Error) errorMessage = error.message;
    setPhoneError(errorMessage);
    setIsProcessing(false);
  } finally {
    phoneRequestActiveRef.current = false;
  }
};

  // Submit registration data to backend
  const submitRegistration = async (phoneNumber?: string, locationData?: any) => {
    setStep(RegistrationStep.SUBMITTING);
    setError('');
    console.log('Submitting registration data');

    try {
      const registrationData = {
        initData,
        fingerprint,
        phone: phoneNumber || phone,
        location: locationData || location,
      };

      console.log('Registration payload:', {
        ...registrationData,
        initData: initData ? `${initData.substring(0, 20)}...` : null
      });

      const response = await fetch(`${BOT_SERVER_URL}/register-user-webapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      const result = await response.json();
      console.log('Registration response:', result);

      if (response.ok && result.success) {
        console.log('Registration successful');
        setStep(RegistrationStep.COMPLETE);
        onRegistrationComplete(result);
      } else {
        console.error('Registration failed:', result.error);
        setError(result.error || 'Registration failed');
        setStep(RegistrationStep.ERROR);
        setIsProcessing(false);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError('Network error during registration');
      setStep(RegistrationStep.ERROR);
      setIsProcessing(false);
    }
  };

  // Render the current step UI
  const renderStepContent = () => {
    switch (step) {
      case RegistrationStep.LOCATION:
        return (
          <div className="text-center p-6">
            <div className="text-5xl text-teal-600 mb-4">📍</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Location Required
            </h2>
            <p className="text-gray-600 mb-6">
              We need your location to check if you're within our delivery area.
            </p>
            {locationError && (
              <div className="text-red-600 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="font-medium">Location Error:</div>
                <div className="text-sm">{locationError}</div>
              </div>
            )}
            <button
              className={`w-full ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center transition-colors`}
              onClick={requestLocation}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span className="mr-2">📍</span> Share Location
                </>
              )}
            </button>
          </div>
        );

      case RegistrationStep.PHONE:
        return (
          <div className="text-center p-6">
            <div className="text-5xl text-teal-600 mb-4">📱</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Phone Number Required
            </h2>
            <p className="text-gray-600 mb-6">
              We need your phone number for delivery coordination.
            </p>

            {phoneError && (
              <div className="text-red-600 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="font-medium">Phone Error:</div>
                <div className="text-sm">{phoneError}</div>
              </div>
            )}
            <button
              className={`w-full ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center transition-colors`}
              onClick={requestPhone}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span className="mr-2">📱</span> Share Phone Number
                </>
              )}
            </button>
          </div>
        );

      case RegistrationStep.SUBMITTING:
        return (
          <div className="text-center p-8">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Creating Account
            </h2>
            <p className="text-gray-700">
              Please wait while we set up your account...
            </p>
          </div>
        );

      case RegistrationStep.COMPLETE:
        return (
          <div className="text-center p-6">
            <div className="text-5xl text-green-600 mb-4">✅</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Registration Complete!
            </h2>
            <p className="text-gray-600">
              Your account has been created successfully. You can now start shopping!
            </p>
          </div>
        );

      case RegistrationStep.ERROR:
        return (
          <div className="text-center p-6">
            <div className="text-5xl text-red-600 mb-4">❌</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Registration Failed
            </h2>
            <div className="text-red-600 mb-6 p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="font-medium">Error Details:</div>
              <div className="text-sm">{error || 'An unexpected error occurred'}</div>
            </div>
            <button
              className="bg-teal-600 hover:bg-teal-700 text-white py-2 px-6 rounded-lg font-medium transition-colors"
              onClick={() => {
                setStep(RegistrationStep.LOCATION);
                setError('');
                setLocationError('');
                setPhoneError('');
                phoneRequestActiveRef.current = false;
                phoneResolvedRef.current = false;
              }}
            >
              Try Again
            </button>
          </div>
        );
    }
  };

  return (
    <div className="max-w-md mx-auto my-4 bg-white rounded-xl shadow-md overflow-hidden">
      <div className="bg-teal-600 text-white p-4">
        <h1 className="text-xl font-bold text-center">
          Create Your Account
        </h1>
      </div>
      {renderStepContent()}

      {/* Debug Console - Enhanced for better visibility */}
      {debugLogs.length > 0 && (
        <div className="mt-4 p-2 bg-gray-100 border rounded text-xs text-left overflow-auto mx-4 mb-4" style={{ maxHeight: '200px' }}>
          <div className="font-bold mb-1 flex justify-between items-center sticky top-0 bg-gray-100">
            <span>Debug Console ({debugLogs.length} logs):</span>
            <button
              onClick={() => setDebugLogs([])}
              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
            {debugLogs.map((log, i) => (
              <div
                key={i}
                className={`py-1 ${
                  log.startsWith('ERROR') ? 'text-red-600 font-medium' :
                  log.startsWith('WARN') ? 'text-orange-600' :
                  log.includes('✅') ? 'text-green-600 font-medium' :
                  log.includes('📱') || log.includes('📞') || log.includes('🎯') ? 'text-blue-600' : ''
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebAppRegistration;