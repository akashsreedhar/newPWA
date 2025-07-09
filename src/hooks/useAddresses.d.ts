interface Address {
  id: string;
  label: string;
  address: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UseAddressesResult {
  addresses: Address[];
  selectedAddress: Address | null;
  loading: boolean;
  hasAddresses: boolean;
  needsAddress: boolean;
  saveAddress: (address: Omit<Address, 'id'>, action?: 'add' | 'edit') => Promise<Address>;
  deleteAddress: (addressId: string) => Promise<void>;
  selectAddress: (address: Address | null) => void;
  setDefaultAddress: (addressId: string) => Promise<void>;
  refreshAddresses: () => Promise<void>;
  error: string | null;
}

export function useAddresses(userId: string | null | undefined): UseAddressesResult;
