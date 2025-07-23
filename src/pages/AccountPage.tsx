import React, { useState, useEffect } from 'react';
import { Listbox } from '@headlessui/react';
import { Globe, MapPin } from 'lucide-react';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAddresses } from '../hooks/useAddresses';
import AddressModal, { Address } from '../components/AddressModal';
import { useProductLanguage } from '../hooks/useProductLanguage';

interface User {
  name?: string;
  phone?: string;
}

interface AccountPageProps {
  userId?: string | null;
  onOpenAddressModal?: () => void;
  onCloseAddressModal?: () => void;
}

const AccountPage: React.FC<AccountPageProps> = ({ userId, onOpenAddressModal, onCloseAddressModal }) => {
  const { language, setLanguage } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState<'list' | 'add' | 'edit'>('list');
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

  // Use the product language hook
  const { settings: productLanguageSettings, updateMode, updateSingleLanguage } = useProductLanguage();

  // Use the addresses hook
  const {
    addresses,
    saveAddress,
    deleteAddress,
    refreshAddresses,
    error: addressError
  } = useAddresses(userId) as any;

  const languages: { key: Language; label: string; malayalamLabel: string }[] = [
    { key: 'english', label: 'English', malayalamLabel: 'ഇംഗ്ലീഷ്' },
    { key: 'malayalam', label: 'Malayalam', malayalamLabel: 'മലയാളം' }
  ];

  // Fetch user data when userId changes
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getDoc(doc(db, "users", String(userId)))
      .then(docSnap => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setUser(userData);
        } else {
          setUser(null);
        }
        setLoading(false);
      })
      .catch(error => {
        setError('Failed to load user data');
        setLoading(false);
      });
  }, [userId]);

  // --- Modal navigation integration ---
  // Listen for custom event to close AddressModal (from App.tsx navigation stack)
  useEffect(() => {
    const handler = () => {
      setShowAddressModal(false);
      if (onCloseAddressModal) onCloseAddressModal();
    };
    window.addEventListener('closeAddressModal', handler);
    return () => window.removeEventListener('closeAddressModal', handler);
  }, [onCloseAddressModal]);

  const getLanguageLabel = (lang: Language) => {
    const langObj = languages.find(l => l.key === lang);
    if (!langObj) return lang;

    switch (language) {
      case 'malayalam':
        return langObj.malayalamLabel;
      default:
        return langObj.label;
    }
  };

  const handleAddressModalSave = async (address: Address, _action: 'add' | 'edit') => {
    try {
      await saveAddress(address);
      refreshAddresses();
      setShowAddressModal(false);
      if (onCloseAddressModal) onCloseAddressModal();
    } catch (error) {
      // Optionally handle error
    }
  };

  const handleAddressModalDelete = async (addressId: string) => {
    try {
      await deleteAddress(addressId);
      refreshAddresses();
    } catch (error) {
      // Optionally handle error
    }
  };

  const handleAddressSelect = (address: Address) => {
    setSelectedAddress(address);
    setShowAddressModal(false);
    if (onCloseAddressModal) onCloseAddressModal();
  };

  const openChangeAddressModal = () => {
    setAddressModalMode('list');
    setShowAddressModal(true);
    if (onOpenAddressModal) onOpenAddressModal();
  };

  const defaultAddress = addresses?.find((addr: any) => addr.isDefault);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center text-gray-600">
          <p>User not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
      <div className="bg-white border-b border-gray-200 p-4 sm:p-6">
        {/* User Name and Phone - Large, Bold Display */}
        <div className="text-center relative flex flex-col items-center">
          <div className="flex flex-col items-center justify-center py-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 block mb-1" style={{ lineHeight: '1.1', letterSpacing: '-0.02em' }}>
              {user?.name || 'User'}
            </span>
            <span className="text-lg sm:text-xl text-gray-600 block">
              {user?.phone || 'Phone not provided'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Address Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <MapPin className="text-gray-400" size={18} />
              <h2 className="text-base sm:text-lg font-semibold text-gray-800">Delivery Address</h2>
            </div>
          </div>

          {defaultAddress ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-teal-200 bg-teal-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="font-medium text-sm text-gray-800">{defaultAddress.label}</p>
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-teal-600 text-white rounded">
                        Default
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{defaultAddress.details || defaultAddress.address}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={openChangeAddressModal}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors text-sm"
              >
                Change Address
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <MapPin className="mx-auto mb-2 text-gray-300" size={24} />
              <p className="text-sm text-gray-500 mb-3">No delivery address set</p>
              <button
                onClick={openChangeAddressModal}
                className="bg-teal-600 hover:bg-teal-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors text-sm"
              >
                Add Address
              </button>
            </div>
          )}

          {addressError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{addressError}</p>
            </div>
          )}
        </div>

        {/* Language Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
            <Globe className="text-gray-400" size={18} />
            <h2 className="text-base sm:text-lg font-semibold text-gray-800">Language Settings</h2>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">App Language</h3>
            <div className="space-y-2">
              {languages.map(lang => (
                <button
                  key={lang.key}
                  onClick={() => setLanguage(lang.key)}
                  className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border transition-colors ${
                    language === lang.key
                      ? 'bg-teal-50 border-teal-200 text-teal-800'
                      : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm sm:text-base break-words">{getLanguageLabel(lang.key)}</span>
                    {language === lang.key && (
                      <div className="w-3 h-3 sm:w-4 sm:h-4 bg-teal-600 rounded-full flex-shrink-0"></div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Product Language Display Settings */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Product Display Language</h3>
            <div className="space-y-3">
              {/* English + Malayalam option */}
              <button
                onClick={() => updateMode('english-malayalam')}
                className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border transition-colors ${
                  productLanguageSettings.mode === 'english-malayalam'
                    ? 'bg-teal-50 border-teal-200 text-teal-800'
                    : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm sm:text-base">English + Malayalam</span>
                  {productLanguageSettings.mode === 'english-malayalam' && (
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-teal-600 rounded-full flex-shrink-0"></div>
                  )}
                </div>
              </button>

              {/* English + Manglish option */}
              <button
                onClick={() => updateMode('english-manglish')}
                className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border transition-colors ${
                  productLanguageSettings.mode === 'english-manglish'
                    ? 'bg-teal-50 border-teal-200 text-teal-800'
                    : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm sm:text-base">English + Manglish</span>
                  {productLanguageSettings.mode === 'english-manglish' && (
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-teal-600 rounded-full flex-shrink-0"></div>
                  )}
                </div>
              </button>

              {/* Single Language option */}
              <div>
                <button
                  onClick={() => updateMode('single')}
                  className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border transition-colors ${
                    productLanguageSettings.mode === 'single'
                      ? 'bg-teal-50 border-teal-200 text-teal-800'
                      : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm sm:text-base">Single Language</span>
                    {productLanguageSettings.mode === 'single' && (
                      <div className="w-3 h-3 sm:w-4 sm:h-4 bg-teal-600 rounded-full flex-shrink-0"></div>
                    )}
                  </div>
                </button>

                {/* Single Language Dropdown */}
                {productLanguageSettings.mode === 'single' && (
                  <div className="mt-3 ml-4 w-full max-w-xs">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Select Language</label>
                    <Listbox
                      value={productLanguageSettings.singleLanguage}
                      onChange={updateSingleLanguage}
                    >
                      <div className="relative">
                        <Listbox.Button className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-left">
                          {(() => {
                            switch (productLanguageSettings.singleLanguage) {
                              case 'malayalam': return 'Malayalam';
                              case 'manglish': return 'Manglish';
                              default: return 'English';
                            }
                          })()}
                        </Listbox.Button>
                        <Listbox.Options className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto focus:outline-none">
                          <Listbox.Option value="english" className={({ active }) => `cursor-pointer select-none relative py-2 pl-3 pr-9 ${active ? 'bg-teal-100 text-teal-900' : 'text-gray-900'}`}>English</Listbox.Option>
                          <Listbox.Option value="malayalam" className={({ active }) => `cursor-pointer select-none relative py-2 pl-3 pr-9 ${active ? 'bg-teal-100 text-teal-900' : 'text-gray-900'}`}>Malayalam</Listbox.Option>
                          <Listbox.Option value="manglish" className={({ active }) => `cursor-pointer select-none relative py-2 pl-3 pr-9 ${active ? 'bg-teal-100 text-teal-900' : 'text-gray-900'}`}>Manglish</Listbox.Option>
                        </Listbox.Options>
                      </div>
                    </Listbox>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Address Modal */}
      {showAddressModal && (
        <AddressModal
          open={showAddressModal}
          onClose={() => {
            setShowAddressModal(false);
            if (onCloseAddressModal) onCloseAddressModal();
          }}
          onSave={handleAddressModalSave}
          onDelete={handleAddressModalDelete}
          onSelect={handleAddressSelect}
          addresses={addresses || []}
          selectedAddress={selectedAddress}
          mode={addressModalMode}
          setMode={setAddressModalMode}
        />
      )}
    </div>
  );
};

export default AccountPage;