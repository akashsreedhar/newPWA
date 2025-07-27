export interface RegistrationLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface RegistrationData {
  initData: string;
  fingerprint: string;
  phone: string;
  location: RegistrationLocation;
  name?: string;
}

export interface RegistrationResponse {
  success: boolean;
  user_id: string;
  token: string;
  refreshToken: string;
  firebaseCustomToken?: string;
  lastLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  error?: string;
}