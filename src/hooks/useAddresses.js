import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function useAddresses(userId) {
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addressesError, setAddressesError] = useState(null);

  // Load addresses from Firebase when userId changes
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const loadAddresses = async () => {
      try {
        setAddressesError(null);
        console.log('🔄 Loading addresses for user:', userId);
        const userRef = doc(db, "users", String(userId));
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const userAddresses = userData.addresses || [];
          console.log('📋 Loaded addresses:', userAddresses);
          setAddresses(userAddresses);
          // Set default address if available
          const defaultAddr = userAddresses.find(addr => addr.isDefault);
          if (defaultAddr) {
            setSelectedAddress(defaultAddr);
            console.log('🎯 Set default address:', defaultAddr.label);
          } else if (userAddresses.length > 0) {
            // If no default, use first address
            setSelectedAddress(userAddresses[0]);
            console.log('🎯 Using first address as default:', userAddresses[0].label);
          }
        } else {
          console.log('🆕 New user - no addresses found');
          setAddresses([]);
          setSelectedAddress(null);
        }
      } catch (error) {
        setAddressesError(error?.message || 'Failed to load addresses.');
        console.error("❌ Error loading addresses:", error);
        setAddresses([]);
        setSelectedAddress(null);
      } finally {
        setLoading(false);
      }
    };

    loadAddresses();
  }, [userId]);

  // Save address to Firebase
  const saveAddress = async (address, action = 'add') => {
    try {
      setAddressesError(null);
      console.log('💾 Saving address:', address, 'Action:', action);
      
      let updatedAddresses = [...addresses];
      
      if (action === 'add') {
        // 🔥 FIX: Generate unique ID for new address
        const newAddress = {
          ...address,
          id: address.id || `addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString()
        };
        
        // If this is the first address, make it default
        if (addresses.length === 0) {
          newAddress.isDefault = true;
          console.log('🎯 First address - setting as default');
        }
        
        // If setting as default, remove default from others
        if (newAddress.isDefault) {
          updatedAddresses = updatedAddresses.map(addr => ({
            ...addr,
            isDefault: false
          }));
        }
        
        updatedAddresses.push(newAddress);
        
        // 🔥 FIX: Return the new address with ID for auto-selection
        address = newAddress;
        
      } else if (action === 'edit') {
        // If setting as default, remove default from others
        if (address.isDefault) {
          updatedAddresses = updatedAddresses.map(addr => ({
            ...addr,
            isDefault: addr.id === address.id ? true : false
          }));
        } else {
          updatedAddresses = updatedAddresses.map(addr => 
            addr.id === address.id ? { ...address, updatedAt: new Date().toISOString() } : addr
          );
        }
      }
      
      // Save to Firebase
      const userRef = doc(db, "users", String(userId));
      await updateDoc(userRef, {
        addresses: updatedAddresses
      });
      
      console.log('✅ Address saved to Firebase');
      setAddresses(updatedAddresses);
      
      // 🔥 FIX: Always return the saved address for auto-selection
      return address;
      
    } catch (error) {
      setAddressesError(error?.message || 'Failed to save address.');
      console.error('❌ Error saving address:', error);
      throw error;
    }
  };

  // Delete address
  const deleteAddress = async (addressId) => {
    try {
      setAddressesError(null);
      console.log('🗑️ Deleting address:', addressId);
      
      const updatedAddresses = addresses.filter(addr => addr.id !== addressId);
      
      // If deleted address was selected, select first remaining address
      if (selectedAddress?.id === addressId) {
        const newSelected = updatedAddresses.length > 0 ? updatedAddresses[0] : null;
        setSelectedAddress(newSelected);
        console.log('🎯 Selected new address after deletion:', newSelected?.label || 'None');
      }
      
      // 🔥 FIX: If deleted address was default, make first address default
      if (updatedAddresses.length > 0) {
        const hasDefault = updatedAddresses.some(addr => addr.isDefault);
        if (!hasDefault) {
          updatedAddresses[0].isDefault = true;
          console.log('🎯 Made first address default after deletion');
        }
      }
      
      // Save to Firebase
      const userRef = doc(db, "users", String(userId));
      await updateDoc(userRef, {
        addresses: updatedAddresses
      });
      
      console.log('✅ Address deleted from Firebase');
      setAddresses(updatedAddresses);
      
    } catch (error) {
      setAddressesError(error?.message || 'Failed to delete address.');
      console.error('❌ Error deleting address:', error);
      throw error;
    }
  };

  // Select address
  const selectAddress = (address) => {
    console.log('🎯 Selecting address:', address?.label || 'None');
    setSelectedAddress(address);
  };

  // Set default address
  const setDefaultAddress = async (addressId) => {
    try {
      setAddressesError(null);
      console.log('🎯 Setting default address:', addressId);
      
      const updatedAddresses = addresses.map(addr => ({
        ...addr,
        isDefault: addr.id === addressId
      }));
      
      // Save to Firebase
      const userRef = doc(db, "users", String(userId));
      await updateDoc(userRef, {
        addresses: updatedAddresses
      });
      
      setAddresses(updatedAddresses);
      
      // Update selected address
      const defaultAddr = updatedAddresses.find(addr => addr.id === addressId);
      if (defaultAddr) {
        setSelectedAddress(defaultAddr);
        console.log('✅ Default address set and selected:', defaultAddr.label);
      }
      
    } catch (error) {
      setAddressesError(error?.message || 'Failed to set default address.');
      console.error('❌ Error setting default address:', error);
      throw error;
    }
  };

  // 🔥 NEW: Refresh addresses function
  const refreshAddresses = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setAddressesError(null);
      console.log('🔄 Refreshing addresses for user:', userId);
      const userRef = doc(db, "users", String(userId));
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const userAddresses = userData.addresses || [];
        setAddresses(userAddresses);
        // Maintain selected address if it still exists
        if (selectedAddress) {
          const stillExists = userAddresses.find(addr => addr.id === selectedAddress.id);
          if (stillExists) {
            setSelectedAddress(stillExists); // Update with latest data
          } else if (userAddresses.length > 0) {
            // Select first address if current selection no longer exists
            setSelectedAddress(userAddresses[0]);
          } else {
            setSelectedAddress(null);
          }
        } else if (userAddresses.length > 0) {
          // Auto-select default or first address
          const defaultAddr = userAddresses.find(addr => addr.isDefault) || userAddresses[0];
          setSelectedAddress(defaultAddr);
        }
        console.log('✅ Addresses refreshed successfully');
      }
    } catch (error) {
      setAddressesError(error?.message || 'Failed to refresh addresses.');
      console.error('❌ Error refreshing addresses:', error);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 NEW: Helper function to check if user has addresses
  const hasAddresses = addresses.length > 0;
  const needsAddress = !hasAddresses;

  return {
    addresses,
    selectedAddress,
    loading,
    hasAddresses,
    needsAddress,
    saveAddress,
    deleteAddress,
    selectAddress,
    setDefaultAddress,
    refreshAddresses,
    error: addressesError
  };
}