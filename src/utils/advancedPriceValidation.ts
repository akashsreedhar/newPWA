import { doc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

// Price cache to reduce Firebase calls
const priceCache = new Map<string, { price: number; timestamp: number; ttl: number }>();
const CACHE_TTL = 15000; // Reduced to 15 seconds for more accurate price validation

export interface EnhancedPriceValidationResult {
  isValid: boolean;
  hasChanges: boolean;
  updatedItems: any[];
  priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
    percentageChange: number;
  }[];
  unavailableItems: any[];
  stockWarnings: {
    itemId: string;
    itemName: string;
    requestedQuantity: number;
    availableStock: number;
  }[];
  validationTimestamp: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Production-grade price validation with caching, batching, and risk assessment
 * Set forceFresh=true to bypass cache for critical operations like checkout
 */
export const validateCartPricesAdvanced = async (cartItems: any[], forceFresh: boolean = false): Promise<EnhancedPriceValidationResult> => {
  const validationTimestamp = new Date().toISOString();
  const updatedItems = [];
  const priceChanges = [];
  const unavailableItems = [];
  const stockWarnings = [];
  let hasChanges = false;
  let totalPriceImpact = 0;

  console.log(`🔍 Starting advanced validation (forceFresh: ${forceFresh})`);

  try {
    // Batch fetch for better performance
    const productIds = cartItems.map(item => item.id);
    const cachedItems = new Map();
    const itemsToFetch = [];

    // Check cache first (unless forcing fresh data)
    if (!forceFresh) {
      for (const item of cartItems) {
        const cached = priceCache.get(item.id);
        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
          cachedItems.set(item.id, cached);
        } else {
          itemsToFetch.push(item.id);
        }
      }
    } else {
      // Force fresh - fetch all items
      itemsToFetch.push(...productIds);
      console.log('🔄 Bypassing cache for fresh price validation');
    }

    // Batch fetch uncached items
    let freshData = new Map();
    if (itemsToFetch.length > 0) {
      // Firebase doesn't support IN queries with more than 10 items, so batch them
      const batches = [];
      for (let i = 0; i < itemsToFetch.length; i += 10) {
        batches.push(itemsToFetch.slice(i, i + 10));
      }

      const batchPromises = batches.map(async (batch) => {
        const q = query(collection(db, 'products'), where('__name__', 'in', batch));
        const snapshot = await getDocs(q);
        const batchData = new Map();
        snapshot.forEach(doc => {
          const data = doc.data();
          batchData.set(doc.id, data);
          // Update cache
          priceCache.set(doc.id, {
            price: data.sellingPrice,
            timestamp: Date.now(),
            ttl: CACHE_TTL
          });
        });
        return batchData;
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(batchData => {
        batchData.forEach((value, key) => {
          freshData.set(key, value);
        });
      });
    }

    // Process each cart item
    for (const cartItem of cartItems) {
      let currentData;
      
      // Get data from cache or fresh fetch
      if (cachedItems.has(cartItem.id)) {
        currentData = { sellingPrice: cachedItems.get(cartItem.id).price };
      } else {
        currentData = freshData.get(cartItem.id);
      }

      if (!currentData) {
        // Product no longer exists
        unavailableItems.push(cartItem);
        hasChanges = true;
        continue;
      }

      const currentPrice = currentData.sellingPrice || currentData.price; // fallback to legacy field
      const oldPrice = cartItem.price;

      // Check for price changes
      if (Math.abs(currentPrice - oldPrice) > 0.01) { // Account for floating point precision
        const percentageChange = ((currentPrice - oldPrice) / oldPrice) * 100;
        
        priceChanges.push({
          itemId: cartItem.id,
          itemName: cartItem.name,
          oldPrice,
          newPrice: currentPrice,
          percentageChange: Math.round(percentageChange * 100) / 100
        });

        totalPriceImpact += (currentPrice - oldPrice) * cartItem.quantity;
        hasChanges = true;
      }

      // Check stock availability (if stock field exists)
      if (currentData.stock !== undefined && currentData.stock < cartItem.quantity) {
        stockWarnings.push({
          itemId: cartItem.id,
          itemName: cartItem.name,
          requestedQuantity: cartItem.quantity,
          availableStock: currentData.stock
        });
      }

      // Update item with fresh data
      updatedItems.push({
        ...cartItem,
        price: currentPrice,
        sellingPrice: currentPrice, // CRITICAL: Keep both fields in sync
        name: currentData.name_en || currentData.name || cartItem.name,
        malayalamName: currentData.name_ml || cartItem.malayalamName,
        manglishName: currentData.name_manglish || cartItem.manglishName,
        imageUrl: currentData.imageUrl || cartItem.imageUrl,
        available: currentData.available !== false, // Default to true if not specified
        stock: currentData.stock,
        lastUpdated: validationTimestamp
      });
    }

    // Calculate risk level
    const riskLevel = calculateRiskLevel(priceChanges, totalPriceImpact, unavailableItems.length);

    return {
      isValid: !hasChanges && unavailableItems.length === 0 && stockWarnings.length === 0,
      hasChanges,
      updatedItems,
      priceChanges,
      unavailableItems,
      stockWarnings,
      validationTimestamp,
      riskLevel
    };

  } catch (error) {
    console.error('Advanced price validation failed:', error);
    
    // Fallback: return original items but mark as invalid
    return {
      isValid: false,
      hasChanges: false,
      updatedItems: cartItems,
      priceChanges: [],
      unavailableItems: [],
      stockWarnings: [],
      validationTimestamp,
      riskLevel: 'high'
    };
  }
};

/**
 * Calculate risk level based on price changes
 */
function calculateRiskLevel(
  priceChanges: any[], 
  totalPriceImpact: number, 
  unavailableCount: number
): 'low' | 'medium' | 'high' {
  const significantChanges = priceChanges.filter(change => Math.abs(change.percentageChange) > 5).length;
  const majorChanges = priceChanges.filter(change => Math.abs(change.percentageChange) > 20).length;

  if (unavailableCount > 0 || majorChanges > 0 || Math.abs(totalPriceImpact) > 100) {
    return 'high';
  } else if (significantChanges > 0 || Math.abs(totalPriceImpact) > 20) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Clear price cache (useful for testing or after price updates)
 */
export const clearPriceCache = () => {
  priceCache.clear();
};

/**
 * Get cache statistics for monitoring
 */
export const getCacheStats = () => {
  return {
    size: priceCache.size,
    items: Array.from(priceCache.entries()).map(([id, data]) => ({
      id,
      price: data.price,
      age: Date.now() - data.timestamp,
      ttl: data.ttl
    }))
  };
};
