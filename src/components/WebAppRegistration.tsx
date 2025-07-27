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

  // Access Telegram WebApp
  const tgWebApp = window.Telegram?.WebApp;

  useEffect(() => {
    // Telegram MainButton setup
    if (tgWebApp) {
      tgWebApp.ready();
      tgWebApp.MainButton.hide();
    }
  }, [tgWebApp]);

  // Request location from Telegram
  const requestLocation = async () => {
    setLocationError('');
    
    if (!tgWebApp) {
      setLocationError('Telegram WebApp is not available');
      return;
    }
    
    try {
      // Request location via Telegram
      const locationData = await new Promise((resolve, reject) => {
        tgWebApp.showPopup({
          title: 'Location Required',
          message: 'Please share your location to continue. We need this to verify if you are within our delivery area.',
          buttons: [
            {text: 'Share Location', type: 'default', id: 'share'},
            {text: 'Cancel', type: 'cancel', id: 'cancel'}
          ]
        }, (buttonId) => {
          if (buttonId === 'share') {
            tgWebApp.requestLocation((result) => {
              if (result) {
                resolve({
                  latitude: result.latitude,
                  longitude: result.longitude,
                  // Try to extract address if available
                  address: result.address || undefined
                });
              } else {
                reject(new Error('Location permission denied'));
              }
            });
          } else {
            reject(new Error('Location sharing cancelled'));
          }
        });
      });
      
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
      
      // If verifyResult includes address info, add it to location data
      if (verifyResult.address && !locationData.address) {
        locationData.address = verifyResult.address;
      }
      
      // Location is valid, proceed to next step
      setLocation(locationData);
      setStep(RegistrationStep.PHONE);
      
    } catch (error) {
      console.error('Location error:', error);
      setLocationError(error.message || 'Failed to get location');
    }
  };

  // Request phone number from Telegram
  const requestPhone = async () => {
    setPhoneError('');
    
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
      const phoneData = await new Promise((resolve, reject) => {
        tgWebApp.showPopup({
          title: 'Phone Number Required',
          message: 'Please share your phone number for delivery coordination.',
          buttons: [
            {text: 'Share Phone Number', type: 'default', id: 'share'},
            {text: 'Enter Manually', type: 'default', id: 'manual'},
            {text: 'Cancel', type: 'cancel', id: 'cancel'}
          ]
        }, (buttonId) => {
          if (buttonId === 'share') {
            tgWebApp.requestContact((result) => {
              if (result) {
                resolve(result.phone_number);
              } else {
                reject(new Error('Phone sharing denied'));
              }
            });
          } else if (buttonId === 'manual') {
            setManualPhone(true);
          } else {
            reject(new Error('Phone sharing cancelled'));
          }
        });
      });
      
      // Phone is provided, proceed with registration
      setPhone(phoneData);
      submitRegistration();
      
    } catch (error) {
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
    
    try {
      const response = await fetch(`${BOT_SERVER_URL}/register-user-webapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          fingerprint,
          phone,
          location,
          // Telegram provides name automatically via initData
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        setStep(RegistrationStep.COMPLETE);
        // Pass registration data to parent component
        onRegistrationComplete(result);
      } else {
        setError(result.error || 'Registration failed');
        setStep(RegistrationStep.ERROR);
      }
    } catch (error) {
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
    </div>
  );
};

export default WebAppRegistration;