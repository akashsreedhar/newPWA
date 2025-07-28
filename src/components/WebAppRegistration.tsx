import React, { useState, useEffect, useRef } from 'react';
import { BOT_SERVER_URL } from '../config';
import safariLogo from '../images/Logo.png';

// Define props interface
interface WebAppRegistrationProps {
  initData: string;
  fingerprint: string;
  onRegistrationComplete: (userData: any) => void;
}

// Registration steps
enum RegistrationStep {
  LOCATION = 0,
  PHONE = 1,
  NAME = 2,
  SUBMITTING = 3,
  COMPLETE = 4,
  ERROR = 5
}

const WebAppRegistration: React.FC<WebAppRegistrationProps> = ({
  initData,
  fingerprint,
  onRegistrationComplete
}) => {
  const [step, setStep] = useState<RegistrationStep>(RegistrationStep.LOCATION);
  const [location, setLocation] = useState<any>(null);
  const [phone, setPhone] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [locationError, setLocationError] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Use refs to track state across async operations
  const phoneRequestActiveRef = useRef(false);
  const phoneResolvedRef = useRef(false);

  // Access Telegram WebApp
  const tgWebApp = window.Telegram?.WebApp;

  useEffect(() => {
    // Telegram MainButton setup and extract user data
    if (tgWebApp) {
      tgWebApp.ready();
      tgWebApp.MainButton.hide();
      console.log('Telegram WebApp version:', tgWebApp.version || 'unknown');
      
      // Extract user name from initData
      try {
        if (initData) {
          const params = new URLSearchParams(initData);
          const userParam = params.get('user');
          if (userParam) {
            const userData = JSON.parse(decodeURIComponent(userParam));
            const extractedName = userData.first_name || userData.username || '';
            setUserName(extractedName);
            setDisplayName(extractedName);
          }
        }
      } catch (e) {
        console.warn('Could not extract user data from initData');
      }
    } else {
      console.warn('Telegram WebApp not available');
    }
  }, [initData]);

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
              let errorMessage = 'Location access denied. ';
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  errorMessage += 'Please enable location access in your browser settings and try again.';
                  break;
                case error.POSITION_UNAVAILABLE:
                  errorMessage += 'Location information is unavailable. Please check your device settings.';
                  break;
                case error.TIMEOUT:
                  errorMessage += 'Location request timed out. Please try again.';
                  break;
                default:
                  errorMessage += 'Please enable location services and try again.';
                  break;
              }
              reject(new Error(errorMessage));
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0
            }
          );
        } else {
          reject(new Error('Geolocation is not supported by your browser. Please update your browser or use a different device.'));
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
      // Auto advance to next step after success animation
      setTimeout(() => {
        setStep(RegistrationStep.PHONE);
      }, 1500);
      setIsProcessing(false);

    } catch (error: any) {
      console.error('Location error:', error);
      setLocationError(error.message || 'Failed to get location. Please try again.');
      setIsProcessing(false);
    }
  };

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

        // Intercept console.log in real-time to catch contact data immediately
        const setupConsoleInterception = () => {
          const originalConsoleLog = console.log;
          
          const consoleLogInterceptor = (...args: any[]) => {
            // Call original console.log first
            originalConsoleLog.apply(console, args);
            
            // Check for contact data in the logged message
            const message = args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            // Look for custom_method_invoked logs with contact data
            if (message.includes('custom_method_invoked') && message.includes('contact=')) {
              console.log('🎯 Found contact data in real-time log interception!');
              try {
                // Extract the result from the message
                const resultMatch = message.match(/"result":"([^"]+)"/);
                if (resultMatch && resultMatch[1]) {
                  const result = resultMatch[1];
                  console.log('📱 Extracted result from intercepted log:', result);
                  const phone = extractPhoneNumber(result);
                  if (phone) {
                    handleSuccess(phone);
                    return;
                  }
                }
              } catch (err) {
                console.error('Error parsing contact from intercepted log:', err);
              }
            }
            
            // Handle cancellation
            if (message.includes('phone_requested') && message.includes('"status":"cancelled"')) {
              console.warn('🚫 User cancelled phone sharing (from real-time interception).');
              handleError('Phone number sharing was cancelled. Please try again and allow access to continue.');
              return;
            }
          };
          
          // Replace console.log temporarily
          console.log = consoleLogInterceptor;
          
          return () => {
            // Restore original console.log
            console.log = originalConsoleLog;
          };
        };

        // Enhanced event handler for multiple event patterns (keep as backup)
        const globalEventHandler = (event: any) => {
          try {
            console.log('[WebApp] receiveEvent handler called:', JSON.stringify(event));
            const data = event?.data || event?.detail;
            
            // Handle cancellation immediately
            if (data?.type === 'phone_requested' && data?.status === 'cancelled') {
              console.warn('🚫 User cancelled phone sharing.');
              handleError('Phone number sharing was cancelled. Please try again and allow access to continue.');
              return;
            }
            
            // Handle successful phone request
            if (data?.type === 'phone_requested' && data?.status === 'sent') {
              console.log('📲 Phone request was sent, waiting for contact data...');
              return;
            }
            
            // Handle custom method invoked with contact data
            if (data?.type === 'custom_method_invoked' && data?.result) {
              console.log('🎯 Found contact data in receiveEvent (type custom_method_invoked)');
              console.log('Raw result:', data.result);
              
              if (typeof data.result === 'string' && data.result.includes('contact=')) {
                const phone = extractPhoneNumber(data.result);
                if (phone) {
                  handleSuccess(phone);
                  return;
                }
              }
            }
            
          } catch (err) {
            console.error('Error processing receiveEvent:', err);
          }
        };

        // Setup both console interception and event listeners
        const addEventListener = () => {
          // Setup real-time console interception (primary method)
          const restoreConsole = setupConsoleInterception();
          
          // Standard DOM event (backup method)
          window.addEventListener('receiveEvent', globalEventHandler);
          
          // Also try document level (backup method)
          document.addEventListener('receiveEvent', globalEventHandler);
          
          // Try custom event pattern that some Telegram versions use (backup method)
          const telegramEventHandler = (e: any) => {
            globalEventHandler({ data: e.detail || e.data });
          };
          window.addEventListener('TelegramWebviewReceiveEvent', telegramEventHandler);
          
          return () => {
            restoreConsole();
            window.removeEventListener('receiveEvent', globalEventHandler);
            document.removeEventListener('receiveEvent', globalEventHandler);
            window.removeEventListener('TelegramWebviewReceiveEvent', telegramEventHandler);
          };
        };

        const cleanup = addEventListener();

        // Enhanced contact request handling
        console.log('📱 Requesting contact from Telegram...');
        tgWebApp.requestContact((result: any) => {
          console.log('📞 Contact callback received:', JSON.stringify(result));
          
          // Check if we already resolved (e.g., due to cancellation)
          if (phoneResolvedRef.current) {
            console.log('ℹ️ Promise already resolved, ignoring callback');
            return;
          }
          
          // Direct phone number in callback
          if (result && result.phone_number) {
            console.log('✅ Got phone from direct callback:', result.phone_number);
            handleSuccess(result.phone_number);
            return;
          }
          
          // Check if result is a string with contact data
          if (typeof result === 'string' && result.includes('contact=')) {
            console.log('✅ Got phone from string callback');
            const phone = extractPhoneNumber(result);
            if (phone) {
              handleSuccess(phone);
              return;
            }
          }
          
          // If callback is truthy but no direct phone, it might come via logs
          if (result) {
            console.log('ℹ️ Callback returned truthy value, monitoring for contact data via console interception...');
            // Reduce timeout since we got a positive callback
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = setTimeout(() => {
                if (!phoneResolvedRef.current) {
                  console.warn('⏰ Phone request timed out after callback');
                  handleError('Phone number request timed out. Please try again.');
                }
              }, 5000); // Even shorter timeout with real-time interception
            }
          } else {
            console.log('ℹ️ No direct phone in callback, waiting for contact data via console interception...');
          }
        });

        // Set initial timeout
        timeoutId = setTimeout(() => {
          if (!phoneResolvedRef.current) {
            console.warn('⏰ Phone request timed out after 15 seconds');
            handleError('Phone number request timed out. Please try again.');
          }
        }, 15000); // Shorter timeout with better detection
      });

      console.log('🎉 Successfully retrieved phone number:', phoneNumber);
      setPhone(phoneNumber);
      // Auto advance to next step after success animation
      setTimeout(() => {
        setStep(RegistrationStep.NAME);
      }, 1500);
      setIsProcessing(false);

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
  const submitRegistration = async () => {
    setStep(RegistrationStep.SUBMITTING);
    setError('');
    console.log('Submitting registration data');

    try {
      const registrationData = {
        initData,
        fingerprint,
        phone: phone,
        location: location,
        name: displayName || userName || '',
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
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError('Network error during registration');
      setStep(RegistrationStep.ERROR);
    }
  };

  // Enhanced step indicator with detailed status
  const StepIndicator = ({ stepNum, isActive, isCompleted, title, details }: { 
    stepNum: number, 
    isActive: boolean, 
    isCompleted: boolean, 
    title: string,
    details?: string 
  }) => (
    <div className={`flex items-center p-3 mb-3 rounded-xl border transition-all duration-500 ${
      isCompleted ? 'bg-green-50 border-green-200' :
      isActive ? 'bg-blue-50 border-blue-200 shadow-md' :
      'bg-gray-50 border-gray-200'
    }`}>
      <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-500 ${
        isCompleted ? 'bg-green-500 border-green-500' :
        isActive ? 'bg-blue-500 border-blue-500' :
        'bg-gray-300 border-gray-300'
      }`}>
        {isCompleted ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className={`text-xs font-bold ${isActive || isCompleted ? 'text-white' : 'text-gray-500'}`}>
            {stepNum}
          </span>
        )}
      </div>
      
      <div className="ml-3 flex-1">
        <h3 className={`font-semibold text-sm ${
          isActive ? 'text-blue-600' : 
          isCompleted ? 'text-green-600' : 
          'text-gray-500'
        }`}>
          {title}
        </h3>
        {details && (
          <p className={`text-xs mt-1 ${
            isCompleted ? 'text-green-500' : 'text-gray-400'
          }`}>
            {details}
          </p>
        )}
      </div>

      {isCompleted && (
        <div className="ml-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ Verified
          </span>
        </div>
      )}
    </div>
  );

  // Current step content
  const getCurrentStepContent = () => {
    if (step === RegistrationStep.LOCATION) {
      return (
        <div className="animate-slideIn">
          <div className="text-center p-6 bg-white rounded-2xl border shadow-lg">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            
            <h2 className="text-lg font-bold text-gray-800 mb-2">Verify Your Location</h2>
            <p className="text-gray-600 mb-4 text-sm">We need to check if you're in our delivery area</p>
            
            {locationError && (
              <div className="text-red-600 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="font-medium text-sm">❌ {locationError}</div>
              </div>
            )}
            
            {location ? (
              <div className="animate-successPulse p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-center text-green-600 mb-2">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-sm">Location Verified!</span>
                </div>
                <p className="text-xs text-green-600">Moving to next step...</p>
              </div>
            ) : (
              <button
                className={`w-full ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 transform hover:scale-105'} text-white py-3 px-6 rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl text-sm`}
                onClick={requestLocation}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Checking Location...
                  </div>
                ) : (
                  'Verify Location'
                )}
              </button>
            )}
          </div>
        </div>
      );
    }

    if (step === RegistrationStep.PHONE) {
      return (
        <div className="animate-slideIn">
          <div className="text-center p-6 bg-white rounded-2xl border shadow-lg">
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            
            <h2 className="text-lg font-bold text-gray-800 mb-2">Verify Your Phone</h2>
            <p className="text-gray-600 mb-4 text-sm">We need your phone number for order updates</p>
            
            {phoneError && (
              <div className="text-red-600 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="font-medium text-sm">❌ {phoneError}</div>
              </div>
            )}
            
            {phone ? (
              <div className="animate-successPulse p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-center text-green-600 mb-2">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-sm">Phone Verified!</span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                    📞 {phone}
                  </span>
                </div>
                <p className="text-xs text-green-600 mt-2">Moving to next step...</p>
              </div>
            ) : (
              <button
                className={`w-full ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 transform hover:scale-105'} text-white py-3 px-6 rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl text-sm`}
                onClick={requestPhone}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Verifying Phone...
                  </div>
                ) : (
                  'Verify Phone Number'
                )}
              </button>
            )}
          </div>
        </div>
      );
    }

    if (step === RegistrationStep.NAME) {
      return (
        <div className="animate-slideIn">
          <div className="text-center p-6 bg-white rounded-2xl border shadow-lg">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            
            <h2 className="text-lg font-bold text-gray-800 mb-2">Confirm Your Name</h2>
            <p className="text-gray-600 mb-4 text-sm">How would you like us to address you?</p>
            
            <div className="mb-4">
              {!isEditingName ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="flex items-center px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-blue-800 font-medium text-sm">
                      {displayName || userName || 'No name provided'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:outline-none text-center font-medium transition-all duration-200 text-sm"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setDisplayName(displayName || userName);
                      }}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded-lg font-medium transition-all duration-200 text-sm"
                    >
                      ✓ Save
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setDisplayName(userName);
                      }}
                      className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-3 rounded-lg font-medium transition-all duration-200 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {!isEditingName && (
              <button
                onClick={submitRegistration}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 px-6 rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-sm"
              >
                Create My Account
              </button>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // Main render
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-4 px-4 flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <img
              src={safariLogo}
              alt="Safari Cheemeni Logo"
              className="w-20 h-20 rounded-full object-cover shadow-lg"
              style={{
                boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 1.5px 4px rgba(0,0,0,0.10)'
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            Welcome to Safari Cheemeni
          </h1>
          <p className="text-gray-600 text-sm">Set up your account in 3 simple steps</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-6 space-y-2">
          <StepIndicator 
            stepNum={1} 
            isActive={step === RegistrationStep.LOCATION} 
            isCompleted={location !== null} 
            title="Location Verification"
            details={location ? "✓ Delivery area confirmed" : "Verify your delivery location"}
          />
          <StepIndicator 
            stepNum={2} 
            isActive={step === RegistrationStep.PHONE} 
            isCompleted={phone !== ''} 
            title="Phone Verification"
            details={phone ? `✓ ${phone}` : "Secure your account with phone"}
          />
          <StepIndicator 
            stepNum={3} 
            isActive={step === RegistrationStep.NAME} 
            isCompleted={step > RegistrationStep.NAME} 
            title="Name Confirmation"
            details={step > RegistrationStep.NAME ? `✓ ${displayName || userName}` : "Confirm your display name"}
          />
        </div>

        {/* Current Step Content */}
        <div className="flex-1 flex flex-col justify-center">
          {getCurrentStepContent()}
        </div>

        {/* Professional Footer */}
        <footer className="mt-8 pt-6 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg">
          <div className="flex items-center justify-center px-4 py-3">
            <div className="flex items-center space-x-2">
              {/* Logo Text with Professional Styling */}
              <div className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-500 via-blue-500 to-purple-600">
                Magpie Web
              </div>

              {/* Animated SVG Logo */}
              <div className="relative">
                <svg
                  className="w-12 h-12 text-purple-500 -ml-2"
                  viewBox="0 0 100 100"
                >
                  <path
                    d="M20,50 Q35,20 50,50 T80,50"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="animate-pulse"
                  />
                  <path
                    d="M30,40 Q45,60 60,40"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="animate-pulse"
                    style={{ animationDelay: '0.5s' }}
                  />
                  {/* Additional decorative elements */}
                  <circle 
                    cx="25" 
                    cy="50" 
                    r="2" 
                    fill="currentColor" 
                    className="animate-pulse"
                  />
                  <circle 
                    cx="75" 
                    cy="50" 
                    r="2" 
                    fill="currentColor" 
                    className="animate-pulse"
                    style={{ animationDelay: '1s' }}
                  />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Professional tagline */}
          <div className="text-center pb-4">
            <p className="text-xs text-gray-500 font-medium">
              Developed with ❤️ by Magpie Web Solutions
            </p>
            <div className="flex items-center justify-center mt-2 space-x-1">
              <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse"></div>
              <p className="text-xs text-gray-400">
                Innovative • Reliable • Professional
              </p>
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
            </div>
          </div>
        </footer>

        {/* Submitting State */}
        {step === RegistrationStep.SUBMITTING && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm mx-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Creating Account</h2>
              <p className="text-gray-600 text-sm">Please wait while we set up your account...</p>
            </div>
          </div>
        )}

        {/* Success State */}
        {step === RegistrationStep.COMPLETE && (
          <div className="fixed inset-0 bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm mx-4 animate-successScale">
              <div className="relative mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div className="absolute -top-2 -right-2">
                  <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
                    <span className="text-lg">🎉</span>
                  </div>
                </div>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                  Welcome Aboard!
                </h2>
                <p className="text-gray-600 mb-4">Your account has been created successfully</p>
                
                <div className="flex items-center justify-center mb-4">
                  <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-100 to-blue-100 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-green-800">Ready to shop!</span>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">Redirecting you to the app...</p>
                  <div className="flex justify-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {step === RegistrationStep.ERROR && (
          <div className="fixed inset-0 bg-red-500 bg-opacity-90 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm mx-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
              <p className="text-gray-600 mb-4 text-sm">{error}</p>
              <button
                onClick={() => {
                  setStep(RegistrationStep.LOCATION);
                  setError('');
                  setLocationError('');
                  setPhoneError('');
                  phoneRequestActiveRef.current = false;
                  phoneResolvedRef.current = false;
                }}
                className="bg-red-500 hover:bg-red-600 text-white py-2 px-6 rounded-lg font-medium transition-all duration-200 text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Custom Styles */}
        <style jsx>{`
          @keyframes slideIn {
            from { 
              opacity: 0; 
              transform: translateY(20px); 
            }
            to { 
              opacity: 1; 
              transform: translateY(0); 
            }
          }
          
          @keyframes successPulse {
            0% { 
              transform: scale(0.95); 
              opacity: 0.8; 
            }
            50% { 
              transform: scale(1.02); 
              opacity: 1; 
            }
            100% { 
              transform: scale(1); 
              opacity: 1; 
            }
          }
          
          @keyframes successScale {
            0% { 
              transform: scale(0.8) rotate(-10deg); 
              opacity: 0; 
            }
            25% { 
              transform: scale(0.9) rotate(-5deg); 
              opacity: 0.3; 
            }
            50% { 
              transform: scale(1.1) rotate(5deg); 
              opacity: 0.7; 
            }
            75% { 
              transform: scale(1.05) rotate(-2deg); 
              opacity: 0.9; 
            }
            100% { 
              transform: scale(1) rotate(0deg); 
              opacity: 1; 
            }
          }
          
          .animate-slideIn {
            animation: slideIn 0.6s ease-out;
          }
          
          .animate-successPulse {
            animation: successPulse 1s ease-out;
          }
          
          .animate-successScale {
            animation: successScale 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          }
        `}</style>
      </div>
    </div>
  );
};

export default WebAppRegistration;