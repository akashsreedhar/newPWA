import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface ServerValidationResult {
  success: boolean;
  priceChanges: {
    itemId: string;
    itemName: string;
    submittedPrice: number;
    currentPrice: number;
    difference: number;
  }[];
  blockedItems: string[]; // Items no longer available
  totalDifference: number;
  validatedAt: string;
  sessionId: string;
}

/**
 * Server-side price validation using Firebase Cloud Functions
 * This is the AUTHORITATIVE validation that prevents any price manipulation
 */
export const validateOrderServerSide = async (orderData: {
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  userId: string;
  sessionId: string;
}): Promise<ServerValidationResult> => {
  try {
    const validateOrder = httpsCallable(functions, 'validateOrderPrices');
    const result = await validateOrder(orderData);
    return result.data as ServerValidationResult;
  } catch (error) {
    console.error('Server validation failed:', error);
    throw new Error('Unable to validate order. Please try again.');
  }
};

/**
 * Lock prices for a short period during checkout to prevent race conditions
 */
export const lockOrderPrices = async (orderData: {
  items: Array<{ id: string; quantity: number }>;
  userId: string;
  sessionId: string;
  lockDurationMinutes?: number;
}): Promise<{
  success: boolean;
  lockedUntil: string;
  lockId: string;
}> => {
  try {
    const lockPrices = httpsCallable(functions, 'lockOrderPrices');
    const result = await lockPrices({
      ...orderData,
      lockDurationMinutes: orderData.lockDurationMinutes || 10 // 10 min default
    });
    return result.data as any;
  } catch (error) {
    console.error('Price locking failed:', error);
    throw new Error('Unable to lock prices. Please try again.');
  }
};
