import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Supermarket coordinates (same as in bot)
const SUPERMARKET_LAT = Number(import.meta.env.VITE_SUPERMARKET_LAT);
const SUPERMARKET_LNG = Number(import.meta.env.VITE_SUPERMARKET_LNG);
const DELIVERY_RADIUS_KM = Number(import.meta.env.VITE_DELIVERY_RADIUS_KM);

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

// Fix default marker icon for leaflet
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return +(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))).toFixed(2);
}

const LocationMarker: React.FC<{
  onChange: (lat: number, lng: number) => void;
}> = ({ onChange }) => {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapPicker: React.FC<MapPickerProps> = ({ lat, lng, onChange }) => {
  const [currentLat, setCurrentLat] = useState(lat || SUPERMARKET_LAT);
  const [currentLng, setCurrentLng] = useState(lng || SUPERMARKET_LNG);
  const [distanceError, setDistanceError] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (lat && lng) {
      setCurrentLat(lat);
      setCurrentLng(lng);
      verifyDeliveryRadius(lat, lng);
    }
    // eslint-disable-next-line
  }, [lat, lng]);

  function verifyDeliveryRadius(lat: number, lng: number) {
    const distance = getDistance(lat, lng, SUPERMARKET_LAT, SUPERMARKET_LNG);
    if (distance > DELIVERY_RADIUS_KM) {
      setDistanceError(
        `This address is ${distance.toFixed(1)}km away. We only deliver within ${DELIVERY_RADIUS_KM}km radius.`
      );
      return false;
    }
    setDistanceError('');
    return true;
  }

  const handleMarkerDrag = (e: any) => {
    const { lat, lng } = e.target.getLatLng();
    setCurrentLat(lat);
    setCurrentLng(lng);
    onChange(lat, lng);
    verifyDeliveryRadius(lat, lng);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLat(position.coords.latitude);
          setCurrentLng(position.coords.longitude);
          onChange(position.coords.latitude, position.coords.longitude);
          verifyDeliveryRadius(position.coords.latitude, position.coords.longitude);
          setLocating(false);
        },
        () => {
          setDistanceError('Unable to get your location.');
          setLocating(false);
        }
      );
    } else {
      setDistanceError('Geolocation is not supported.');
    }
  };

  return (
    <div className="mb-2 p-2 border rounded bg-gray-50">
      <div className="mb-2 font-semibold">Select Location</div>
      <div className="mb-2" style={{ height: 260, width: '100%' }}>
        <MapContainer
          center={[currentLat, currentLng]}
          zoom={15}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', borderRadius: 12 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={[currentLat, currentLng]}
            icon={markerIcon}
            draggable={true}
            eventHandlers={{ dragend: handleMarkerDrag }}
          />
          <Circle
            center={[SUPERMARKET_LAT, SUPERMARKET_LNG]}
            radius={DELIVERY_RADIUS_KM * 1000}
            pathOptions={{ color: 'teal', fillColor: '#14b8a6', fillOpacity: 0.1 }}
          />
          <LocationMarker onChange={onChange} />
        </MapContainer>
      </div>
      <button
        className="bg-teal-600 text-white px-2 py-1 rounded text-xs mb-2 flex items-center justify-center"
        onClick={handleUseCurrentLocation}
        disabled={locating}
        style={{ minWidth: 120 }}
      >
        {locating ? (
          <>
            <span className="mr-2">
              <svg
                className="animate-spin"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{ display: 'inline', verticalAlign: 'middle' }}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="white"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            </span>
            Locating...
          </>
        ) : (
          "Use My Location"
        )}
      </button>
      {distanceError && <div className="text-xs text-red-500">{distanceError}</div>}
      <div className="text-xs text-gray-500">
        Tap the map or drag the marker to set your delivery location. Delivery available within {DELIVERY_RADIUS_KM}km.
      </div>
    </div>
  );
};

export default MapPicker;