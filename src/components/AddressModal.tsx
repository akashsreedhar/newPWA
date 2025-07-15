import React, { useState, useEffect, useRef } from 'react';
import MapPicker from './MapPicker';

export interface Address {
  id: string;
  label: string;
  details: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

interface AddressModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (address: Address, action: 'add' | 'edit') => Promise<void>;
  onDelete: (addressId: string) => Promise<void>;
  onSelect: (address: Address) => void;
  addresses: Address[];
  selectedAddress: Address | null;
  isRequired?: boolean;
  mode: 'list' | 'add' | 'edit';
  setMode: (mode: 'list' | 'add' | 'edit') => void;
  force?: boolean; // Prevent closing if true
}

const SUPERMARKET_LAT = 12.238109985896054;
const SUPERMARKET_LNG = 75.2316570229633;
const DELIVERY_RADIUS_KM = 1000;

const AddressModal: React.FC<AddressModalProps> = ({
  open,
  onClose,
  force = false,
  onSave,
  onDelete,
  onSelect,
  addresses,
  selectedAddress,
  isRequired = false,
  mode,
  setMode
}) => {
  const [addressForm, setAddressForm] = useState<Address>({
    id: '',
    label: '',
    details: '',
    phone: '',
    latitude: null,
    longitude: null,
    isDefault: false
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [distanceError, setDistanceError] = useState('');

  // Refs for inputs to scroll into view on focus (mobile UX)
  const labelRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setAddressForm({
        id: '',
        label: '',
        details: '',
        phone: '',
        latitude: null,
        longitude: null,
        isDefault: false
      });
      setErrors({});
      setDistanceError('');
    }
  }, [open]);

  useEffect(() => {
    if (mode === 'edit' && selectedAddress) {
      setAddressForm(selectedAddress);
    } else if (mode === 'add') {
      // Try to get geolocation for new address
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setAddressForm({
              id: '',
              label: '',
              details: '',
              phone: '',
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              isDefault: addresses.length === 0
            });
          },
          () => {
            setAddressForm({
              id: '',
              label: '',
              details: '',
              phone: '',
              latitude: null,
              longitude: null,
              isDefault: addresses.length === 0
            });
          }
        );
      } else {
        setAddressForm({
          id: '',
          label: '',
          details: '',
          phone: '',
          latitude: null,
          longitude: null,
          isDefault: addresses.length === 0
        });
      }
    }
  }, [mode, selectedAddress, addresses.length]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!addressForm.label.trim()) newErrors.label = 'Label is required';
    if (!addressForm.details.trim()) newErrors.details = 'Address is required';
    if (!addressForm.phone.trim()) newErrors.phone = 'Phone number is required';
    if (addressForm.phone && !/^\d{10}$/.test(addressForm.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }
    if (!addressForm.latitude || !addressForm.longitude) {
      newErrors.location = 'Please select location on map';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkDeliveryDistance = () => {
    if (!addressForm.latitude || !addressForm.longitude) return false;
    const lat = addressForm.latitude;
    const lng = addressForm.longitude;
    const R = 6371;
    const dLat = ((SUPERMARKET_LAT - lat) * Math.PI) / 180;
    const dLon = ((SUPERMARKET_LNG - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((SUPERMARKET_LAT * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distance = +(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))).toFixed(2);
    if (distance > DELIVERY_RADIUS_KM) {
      setDistanceError(`This address is ${distance.toFixed(1)}km away. We only deliver within ${DELIVERY_RADIUS_KM}km radius.`);
      return false;
    }
    setDistanceError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateForm() || !checkDeliveryDistance()) return;
    const addressToSave = {
      ...addressForm,
      id: addressForm.id || `addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isDefault: true
    };
    await onSave(addressToSave, mode === 'edit' ? 'edit' : 'add');
    setMode('list');
  };

  const handleEdit = (address: Address) => {
    setMode('edit');
  };

  const handleDelete = async (addressId: string) => {
    await onDelete(addressId);
  };

  const handleSelect = (address: Address) => {
    onSelect(address);
    setMode('list');
  };

  const handleMapChange = (lat: number, lng: number) => {
    setAddressForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setDistanceError('');
  };

  if (!open) return null;

  // UI: List, Add, Edit
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
      style={{
        alignItems: window.innerWidth < 640 ? 'flex-start' : 'center',
        overflowY: 'auto'
      }}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative"
        style={{
          marginTop: window.innerWidth < 640 ? 24 : 0,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          paddingBottom: 80
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
            onClick={force ? undefined : onClose}
            disabled={force}
          >
            Cancel
          </button>
          <h2 className="text-xl font-bold text-center flex-1">Manage Addresses</h2>
          <div style={{ width: 60 }}></div>
        </div>
        {mode === 'list' && (
          <div>
            {addresses.length === 0 ? (
              <div className="text-gray-500 text-sm mb-2">No addresses found. Please add one below.</div>
            ) : (
              <div className="space-y-2 mb-2">
                {addresses.map(addr => (
                  <div key={addr.id} className={`border rounded p-2 flex items-center justify-between ${selectedAddress?.id === addr.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}>
                    <div>
                      <div className="font-medium">{addr.label}</div>
                      <div className="text-xs text-gray-500">{addr.details}</div>
                      <div className="text-xs text-gray-500">{addr.phone}</div>
                      {addr.isDefault && <span className="text-xs text-teal-600 font-semibold">Default</span>}
                    </div>
                    <div className="flex gap-2">
                      <button className="px-2 py-1 rounded bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition border border-teal-600" onClick={() => handleSelect(addr)}>Select</button>
                      <button className="px-2 py-1 rounded bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition border border-blue-500" onClick={() => { setAddressForm(addr); setMode('edit'); }}>Edit</button>
                      {!addr.isDefault && <button className="px-2 py-1 rounded bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition border border-red-500" onClick={() => handleDelete(addr.id)}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="bg-teal-100 text-teal-700 px-3 py-1 rounded text-xs mt-2" onClick={() => setMode('add')}>+ Add Address</button>
          </div>
        )}
        {(mode === 'add' || mode === 'edit') && (
          <div className="space-y-2 mb-2">
            <input
              ref={labelRef}
              className="w-full border rounded p-2 text-sm mb-1"
              placeholder="Label (e.g. Home, Work)"
              value={addressForm.label}
              onFocus={() => labelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              onChange={e => setAddressForm({ ...addressForm, label: e.target.value })}
            />
            <input
              ref={detailsRef}
              className="w-full border rounded p-2 text-sm mb-1"
              placeholder="Full address details"
              value={addressForm.details}
              onFocus={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              onChange={e => setAddressForm({ ...addressForm, details: e.target.value })}
            />
            <input
              ref={phoneRef}
              className="w-full border rounded p-2 text-sm mb-1"
              placeholder="Phone number"
              value={addressForm.phone}
              onFocus={() => phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
            />
            <MapPicker lat={addressForm.latitude} lng={addressForm.longitude} onChange={handleMapChange} />
            {errors.label && <div className="text-xs text-red-500">{errors.label}</div>}
            {errors.details && <div className="text-xs text-red-500">{errors.details}</div>}
            {errors.phone && <div className="text-xs text-red-500">{errors.phone}</div>}
            {errors.location && <div className="text-xs text-red-500">{errors.location}</div>}
            {distanceError && <div className="text-xs text-red-500">{distanceError}</div>}
            <label className="inline-flex items-center text-xs">
              <input type="checkbox" className="mr-1" checked={addressForm.isDefault} onChange={e => setAddressForm({ ...addressForm, isDefault: e.target.checked })} />
              Set as default
            </label>
            <div className="flex gap-2 mt-1">
              <button className="bg-teal-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-teal-700 transition border border-teal-600" onClick={handleSave}>Save</button>
              <button className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-semibold hover:bg-gray-300 transition border border-gray-300" onClick={() => setMode('list')}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddressModal;