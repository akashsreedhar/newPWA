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
  const contactRequestCompletedRef = useRef(false);
  const customMethodEventsRef = useRef<Array<(e: any) => void>>([]);

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
  }, [tgWebApp]);

  // Helper function to clean up all custom method event listeners
  const cleanupCustomMethodListeners = () => {
    customMethodEventsRef.current.forEach(handler => {
      window.removeEventListener('custom_method_invoked', handler);
    });
    customMethodEventsRef.current = [];
  };

  // Extract phone number from URL-encoded response
  const extractPhoneNumber = (result: string): string | null => {
    try {
      if (result.includes('contact=')) {
        const contactParam = result.split('contact=')[1].split('&')[0];
        const decodedContact = decodeURIComponent(contactParam);
        const contactData = JSON.parse(decodedContact);
        return contactData?.phone_number || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to parse contact data:', error);
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
      
      // Using browser geolocation - more reliable than Telegram's method
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
      
      // If verifyResult includes address info, add it to location data
      if (verifyResult.address) {
        locationData.address = verifyResult.address;
      }
      
      // Location is valid, proceed to next step
      setLocation(locationData);
      setStep(RegistrationStep.PHONE);
      setIsProcessing(false);
      
    } catch (error: any) {
      console.error('Location error:', error);
      setLocationError(error.message || 'Failed to get location. Please try again.');
      setIsProcessing(false);
    }
  };

  // Much simpler and more reliable phone number request function
  const requestPhone = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setPhoneError('');
    console.log('Starting phone request process');
    
    if (!tgWebApp) {
      setPhoneError('Telegram WebApp is not available');
      setIsProcessing(false);
      return;
    }

    // Reset the contact request state
    contactRequestCompletedRef.current = false;
    
    try {
      // Create a promise that will resolve when we get the phone number from any source
      const phoneNumberPromise = new Promise<string>((resolve, reject) => {
        // Setup a listener for the custom_method_invoked event
        const handleCustomMethodEvent = (event: any) => {
          const data = event.detail;
          if (data && data.result && typeof data.result === 'string') {
            const phoneNumber = extractPhoneNumber(data.result);
            if (phoneNumber && !contactRequestCompletedRef.current) {
              contactRequestCompletedRef.current = true;
              console.log('Successfully extracted phone number from event');
              resolve(phoneNumber);
            }
          }
        };
        
        // Add the event listener
        window.addEventListener('custom_method_invoked', handleCustomMethodEvent);
        customMethodEventsRef.current.push(handleCustomMethodEvent);
        
        // Request the phone directly
        tgWebApp.requestContact((result) => {
          console.log('Contact callback received:', result ? 'with data' : 'no data');
          
          if (result && result.phone_number && !contactRequestCompletedRef.current) {
            contactRequestCompletedRef.current = true;
            console.log('Successfully received phone number from callback');
            resolve(result.phone_number);
          }
        });
        
        // Set a timeout to try the custom method approach
        setTimeout(() => {
          if (!contactRequestCompletedRef.current) {
            console.log('Trying direct custom method for phone number');
            try {
              tgWebApp.invokeCustomMethod('getRequestedContact', {});
            } catch (err) {
              console.error('Error invoking custom method:', err);
            }
          }
        }, 1000);
        
        // Final timeout
        setTimeout(() => {
          if (!contactRequestCompletedRef.current) {
            cleanupCustomMethodListeners();
            reject(new Error('Contact request timed out'));
          }
        }, 10000);
      });
      
      // Wait for the phone number
      const phoneNumber = await phoneNumberPromise;
      
      // Clean up event listeners
      cleanupCustomMethodListeners();
      
      // Continue with the registration
      console.log('Phone number obtained:', phoneNumber);
      setPhone(phoneNumber);
      submitRegistration(phoneNumber, location);
      
    } catch (error: any) {
      console.error('Phone error:', error);
      setPhoneError(error.message || 'Failed to get phone number. Please try again.');
      setIsProcessing(false);
      
      // Clean up event listeners on error
      cleanupCustomMethodListeners();
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
        // Pass registration data to parent component
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
              <div className="text-red-600 mb-4">
                {locationError}
              </div>
            )}
            <button 
              className={`w-full ${isProcessing ? 'bg-gray-400' : 'bg-teal-600 hover:bg-teal-700'} text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center`}
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
              <div className="text-red-600 mb-4">
                {phoneError}
              </div>
            )}
            <button 
              className={`w-full ${isProcessing ? 'bg-gray-400' : 'bg-teal-600 hover:bg-teal-700'} text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center`}
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
            <p className="text-gray-700">
              Creating your account...
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
              Your account has been created successfully.
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
            <p className="text-gray-600 mb-6">
              {error || 'An unexpected error occurred'}
            </p>
            <button 
              className="bg-teal-600 hover:bg-teal-700 text-white py-2 px-6 rounded-lg font-medium"
              onClick={() => setStep(RegistrationStep.LOCATION)}
            >
              Try Again
            </button>
          </div>
        );
    }
  };

  // Clean up event listeners when component unmounts
  useEffect(() => {
    return () => {
      cleanupCustomMethodListeners();
    };
  }, []);

  return (
    <div className="max-w-md mx-auto my-4 bg-white rounded-xl shadow-md overflow-hidden">
      <div className="bg-teal-600 text-white p-4">
        <h1 className="text-xl font-bold text-center">
          Create Your Account
        </h1>
      </div>
      {renderStepContent()}
      
      {/* Debug Console */}
      {debugLogs.length > 0 && (
        <div className="mt-4 p-2 bg-gray-100 border rounded text-xs text-left overflow-auto mx-4 mb-4" style={{ maxHeight: '200px' }}>
          <div className="font-bold mb-1 flex justify-between items-center">
            <span>Debug Console:</span>
            <button 
              onClick={() => setDebugLogs([])} 
              className="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
            {debugLogs.map((log, i) => (
              <div key={i} className={log.startsWith('ERROR') ? 'text-red-600' : log.startsWith('WARN') ? 'text-orange-600' : ''}>
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