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
  const [manualPhone, setManualPhone] = useState<boolean>(false);
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

  // Request location from Telegram with improved error handling
  const requestLocation = async () => {
    setLocationError('');
    console.log('Starting location request process');
    
    if (!tgWebApp) {
      setLocationError('Telegram WebApp is not available');
      return;
    }

    try {
      // First, just show a popup explaining why we need location
      console.log('Showing location permission popup');
      const buttonPressed = await new Promise<string>((resolve) => {
        tgWebApp.showPopup({
          title: 'Location Required',
          message: 'Please share your location to continue. We need this to verify if you are within our delivery area.',
          buttons: [
            {text: 'Share Location', type: 'default', id: 'share'},
            {text: 'Cancel', type: 'cancel', id: 'cancel'}
          ]
        }, (buttonId: string) => {
          console.log('Popup button clicked:', buttonId);
          resolve(buttonId);
        });
      });
      
      // If user clicked Cancel, throw error
      if (buttonPressed !== 'share') {
        throw new Error('Location sharing cancelled');
      }
      
      console.log('User agreed to share location, requesting location...');
      
      // Now request location with a timeout
      const locationData = await Promise.race([
        new Promise<any>((resolve, reject) => {
          const handleLocationResult = (result: any) => {
            console.log('Location result received:', result ? 'data received' : 'no data');
            if (result && typeof result === 'object' && 'latitude' in result && 'longitude' in result) {
              resolve({
                latitude: result.latitude,
                longitude: result.longitude,
                address: result.address || undefined
              });
            } else {
              reject(new Error('Invalid location data received'));
            }
          };
          
          // Request location with the callback
          try {
            tgWebApp.requestLocation(handleLocationResult);
          } catch (err) {
            console.error('Error calling requestLocation:', err);
            reject(new Error(`Failed to request location: ${err}`));
          }
        }),
        // Add a timeout to prevent UI from hanging forever
        new Promise<never>((_, reject) => 
          setTimeout(() => {
            console.warn('Location request timed out');
            reject(new Error('Location request timed out after 15 seconds'));
          }, 15000)
        )
      ]);
      
      console.log('Location data received successfully');
      
      try {
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
          return;
        }
        
        // If verifyResult includes address info, add it to location data
        if (verifyResult.address && !locationData.address) {
          locationData.address = verifyResult.address;
        }
        
        // Location is valid, proceed to next step
        setLocation(locationData);
        setStep(RegistrationStep.PHONE);
      } catch (verifyError: any) {
        console.error('Location verification error:', verifyError);
        throw new Error(`Verification failed: ${verifyError.message}`);
      }
      
    } catch (error: any) {
      console.error('Location error:', error);
      
      // Try browser geolocation as fallback
      try {
        console.log('Trying browser geolocation as fallback...');
        setLocationError('Trying browser geolocation as fallback...');
        
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const locationData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
              
              console.log('Browser geolocation succeeded:', locationData);
              
              // Verify location is in delivery area
              const verifyResponse = await fetch(`${BOT_SERVER_URL}/verify-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(locationData)
              });
              
              const verifyResult = await verifyResponse.json();
              
              if (!verifyResult.allowed) {
                setLocationError(verifyResult.message || 'Location is outside our delivery area');
                return;
              }
              
              // Location is valid, proceed to next step
              setLocation(locationData);
              setStep(RegistrationStep.PHONE);
            },
            (geoError) => {
              console.error('Browser geolocation error:', geoError);
              setLocationError(`Location access denied. Please enable location access and try again. (${geoError.message})`);
            },
            { 
              enableHighAccuracy: true, 
              timeout: 15000, 
              maximumAge: 0 
            }
          );
        } else {
          setLocationError('Geolocation is not supported by your browser');
        }
      } catch (fallbackError: any) {
        console.error('Fallback geolocation error:', fallbackError);
        setLocationError(error.message || 'Failed to get location');
      }
    }
  };

  // Request phone number from Telegram
  const requestPhone = async () => {
    setPhoneError('');
    console.log('Starting phone request process');
    
    if (manualPhone) {
      // Validate manual phone input
      if (!phone || phone.length < 10) {
        setPhoneError('Please enter a valid phone number');
        return;
      }
      
      // Submit registration with manual phone
      submitRegistration();
      return;
    }
    
    if (!tgWebApp) {
      setPhoneError('Telegram WebApp is not available');
      return;
    }
    
    try {
      // Request phone via Telegram
      console.log('Showing phone permission popup');
      const buttonPressed = await new Promise<string>((resolve) => {
        tgWebApp.showPopup({
          title: 'Phone Number Required',
          message: 'Please share your phone number for delivery coordination.',
          buttons: [
            {text: 'Share Phone Number', type: 'default', id: 'share'},
            {text: 'Enter Manually', type: 'default', id: 'manual'},
            {text: 'Cancel', type: 'cancel', id: 'cancel'}
          ]
        }, (buttonId: string) => {
          console.log('Phone popup button clicked:', buttonId);
          resolve(buttonId);
        });
      });
      
      if (buttonPressed === 'manual') {
        setManualPhone(true);
        return;
      }
      
      if (buttonPressed !== 'share') {
        throw new Error('Phone sharing cancelled');
      }
      
      // Now request phone with a timeout
      console.log('User agreed to share phone, requesting contact...');
      const phoneData = await Promise.race([
        new Promise<string>((resolve, reject) => {
          const handleContactResult = (result: any) => {
            console.log('Contact result received:', result ? 'data received' : 'no data');
            if (result && result.phone_number) {
              resolve(result.phone_number);
            } else {
              reject(new Error('Invalid contact data received'));
            }
          };
          
          // Request contact with the callback
          try {
            tgWebApp.requestContact(handleContactResult);
          } catch (err) {
            console.error('Error calling requestContact:', err);
            reject(new Error(`Failed to request contact: ${err}`));
          }
        }),
        // Add a timeout to prevent UI from hanging forever
        new Promise<never>((_, reject) => 
          setTimeout(() => {
            console.warn('Contact request timed out');
            reject(new Error('Contact request timed out after 15 seconds'));
          }, 15000)
        )
      ]);
      
      console.log('Phone number received:', phoneData ? 'valid number' : 'no number');
      
      // Phone is provided, proceed with registration
      setPhone(phoneData);
      submitRegistration();
      
    } catch (error: any) {
      console.error('Phone error:', error);
      // Don't show error for manual option choice
      if (error.message !== 'Phone sharing cancelled' || !manualPhone) {
        setPhoneError(error.message || 'Failed to get phone number');
      }
    }
  };

  // Submit registration data to backend
  const submitRegistration = async () => {
    setStep(RegistrationStep.SUBMITTING);
    setError('');
    console.log('Submitting registration data');
    
    try {
      const registrationData = {
        initData,
        fingerprint,
        phone,
        location,
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
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError('Network error during registration');
      setStep(RegistrationStep.ERROR);
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
                <button 
                  className="mt-2 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium"
                  onClick={requestLocation}
                >
                  Try Again
                </button>
              </div>
            )}
            <button 
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center"
              onClick={requestLocation}
            >
              <span className="mr-2">📍</span> Share Location
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
            
            {manualPhone ? (
              <>
                <div className="mb-4">
                  <input
                    type="tel"
                    className={`w-full border ${phoneError ? 'border-red-500' : 'border-gray-300'} rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500`}
                    placeholder="Enter your phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {phoneError && (
                    <p className="text-red-600 text-sm mt-1 text-left">{phoneError}</p>
                  )}
                </div>
                <button 
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center"
                  onClick={requestPhone}
                >
                  <span className="mr-2">📱</span> Submit
                </button>
              </>
            ) : (
              <>
                {phoneError && (
                  <div className="text-red-600 mb-4">
                    {phoneError}
                    <button 
                      className="mt-2 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium"
                      onClick={() => setManualPhone(true)}
                    >
                      Enter Manually Instead
                    </button>
                  </div>
                )}
                <button 
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center"
                  onClick={requestPhone}
                >
                  <span className="mr-2">📱</span> Share Phone Number
                </button>
              </>
            )}
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