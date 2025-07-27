import React, { useState, useEffect } from 'react';
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

  // Parse URL-encoded contact data from Telegram
  const parseContactData = (resultStr: string): { phone_number?: string } => {
    try {
      if (resultStr.includes('contact=')) {
        // Extract the contact data parameter
        const contactParam = resultStr.split('contact=')[1].split('&')[0];
        // URL decode the contact data
        const decodedContact = decodeURIComponent(contactParam);
        // Parse the JSON object
        return JSON.parse(decodedContact);
      }
      return {};
    } catch (err) {
      console.error('Failed to parse contact data:', err);
      return {};
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

  // Request phone number directly from Telegram
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
    
    try {
      // This simplified approach handles both direct callback and custom method responses
      const phoneNumber = await new Promise<string>((resolve, reject) => {
        // Flag to prevent duplicate resolutions
        let isResolved = false;
        
        // Function to handle successful phone retrieval
        const handlePhoneSuccess = (phone: string) => {
          if (!isResolved) {
            isResolved = true;
            console.log('Successfully received phone number');
            resolve(phone);
          }
        };
        
        // Parse contact data helper
        const extractPhoneFromResult = (resultStr: string): string | null => {
          try {
            if (resultStr.includes('contact=')) {
              const contactParam = resultStr.split('contact=')[1].split('&')[0];
              const decodedContact = decodeURIComponent(contactParam);
              const contactData = JSON.parse(decodedContact);
              return contactData.phone_number || null;
            }
            return null;
          } catch (err) {
            console.error('Failed to parse contact data:', err);
            return null;
          }
        };
        
        // Store all event handlers to clean them up later
        const eventHandlers: { event: string, handler: any }[] = [];
        
        // 1. Setup event listener for custom method response
        const handleCustomMethod = (event: any) => {
          const data = event.detail;
          console.log('Received custom method event');
          
          if (data?.result && data.result.includes('contact=')) {
            const phone = extractPhoneFromResult(data.result);
            if (phone) {
              handlePhoneSuccess(phone);
            }
          }
        };
        
        // Add event listener and store it for cleanup
        window.addEventListener('custom_method_invoked', handleCustomMethod);
        eventHandlers.push({ event: 'custom_method_invoked', handler: handleCustomMethod });
        
        // 2. Direct request for contact
        tgWebApp.requestContact((result) => {
          console.log('Contact callback triggered', result ? 'with data' : 'without data');
          
          // If we got a result with phone_number directly, use it
          if (result && result.phone_number) {
            handlePhoneSuccess(result.phone_number);
          }
        });
        
        // Utility function to remove all event listeners
        const cleanupEventListeners = () => {
          eventHandlers.forEach(({event, handler}) => {
            window.removeEventListener(event, handler);
          });
        };
        
        // 3. Set a timeout to try direct custom method
        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.log('No contact data yet, trying direct custom method call');
            
            // Generate a unique request ID
            const reqId = 'phone_req_' + Date.now().toString(36);
            
            // Handler for this specific request
            const directCustomMethodHandler = (event: any) => {
              const data = event.detail;
              if (data?.req_id === reqId && data.result) {
                const phone = extractPhoneFromResult(data.result);
                if (phone) {
                  handlePhoneSuccess(phone);
                }
              }
            };
            
            // Add the handler and store it
            window.addEventListener('custom_method_invoked', directCustomMethodHandler);
            eventHandlers.push({ event: 'custom_method_invoked', handler: directCustomMethodHandler });
            
            // Make the direct custom method call
            try {
              tgWebApp.invokeCustomMethod('getRequestedContact', {}, reqId);
            } catch (e) {
              console.error('Error invoking custom method:', e);
            }
            
            // Set final timeout
            setTimeout(() => {
              if (!isResolved) {
                cleanupEventListeners();
                reject(new Error('Contact request timed out'));
              }
            }, 5000);
          }
        }, 3000);
        
        // Make sure we clean up on success
        setTimeout(() => {
          if (isResolved) {
            cleanupEventListeners();
            clearTimeout(timeoutId);
          }
        }, 1000);
      });
      
      if (!phoneNumber) {
        throw new Error('No valid phone number received');
      }
      
      console.log('Phone number successfully extracted:', phoneNumber);
      
      // Phone is provided, proceed with registration
      setPhone(phoneNumber);
      submitRegistration(phoneNumber, location);
      
    } catch (error: any) {
      console.error('Phone error:', error?.message || 'Unknown error');
      setPhoneError(error?.message || 'Failed to get phone number. Please try again.');
      setIsProcessing(false);
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