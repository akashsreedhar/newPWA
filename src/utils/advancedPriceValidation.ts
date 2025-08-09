import { db } from '../firebase';
import { BACKEND_URL } from '../config';
import { doc, getDoc } from 'firebase/firestore';
// Price cache to reduce Firebase calls
const priceCache = new Map<string, { price: number; timestamp: number; ttl: number }>();
const CACHE_TTL = 60000; // Increased to 60 seconds for fewer reads

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
  stockWarnings?: {
    itemId: string;
    itemName: string;
    requestedQuantity: number;
    availableStock: number;
  }[];
  validationTimestamp?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

/**
 * Production-grade price validation with caching, batching, and risk assessment
 * Set forceFresh=true to bypass cache for critical operations like checkout
 */
export const validateCartPricesAdvanced = async (
  cartItems: any[],
  forceFresh: boolean = false
): Promise<EnhancedPriceValidationResult> => {
  const validationTimestamp = new Date().toISOString();
  const updatedItems: any[] = [];
  const priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
    percentageChange: number;
  }[] = [];
  const unavailableItems: any[] = [];
  const stockWarnings: {
    itemId: string;
    itemName: string;
    requestedQuantity: number;
    availableStock: number;
  }[] = [];
  let hasChanges = false;
  let totalPriceImpact = 0;

  // --- SERVER-FIRST PATH for forceFresh (authoritative) ---
  if (forceFresh) {
    try {
      const resp = await fetch(`${BACKEND_URL}/validate-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems.map(i => ({ id: i.id, quantity: i.quantity }))
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const serverItems = Array.isArray(data.normalizedItems) ? data.normalizedItems : [];

        const serverMap = new Map<string, any>(
          serverItems.map((p: any) => [String(p.id), p])
        );

        for (const ci of cartItems) {
          const s = serverMap.get(String(ci.id));
          if (!s) {
            unavailableItems.push(ci);
            hasChanges = true;
            continue;
          }

          const currentPrice = typeof s.sellingPrice === 'number'
            ? s.sellingPrice
            : (typeof s.price === 'number' ? s.price : (ci.sellingPrice ?? ci.price));

          const oldPrice = ci.price;
          if (typeof currentPrice === 'number' && typeof oldPrice === 'number' && Math.abs(currentPrice - oldPrice) > 0.01) {
            const percentageChange = ((currentPrice - oldPrice) / oldPrice) * 100;
            priceChanges.push({
              itemId: ci.id,
              itemName: s.name || ci.name,
              oldPrice,
              newPrice: currentPrice,
              percentageChange: Math.round(percentageChange * 100) / 100
            });
            totalPriceImpact += (currentPrice - oldPrice) * ci.quantity;
            hasChanges = true;
          }

          // Optional: stock warnings if server exposes stock or availableStock
          const availableStock = typeof s.stock === 'number' ? s.stock : (typeof s.availableStock === 'number' ? s.availableStock : undefined);
          if (typeof availableStock === 'number' && availableStock < ci.quantity) {
            stockWarnings.push({
              itemId: ci.id,
              itemName: s.name || ci.name,
              requestedQuantity: ci.quantity,
              availableStock
            });
          }

          // update local cache with server price
          if (typeof currentPrice === 'number') {
            priceCache.set(ci.id, { price: currentPrice, timestamp: Date.now(), ttl: CACHE_TTL });
          }

          updatedItems.push({
            ...ci,
            price: currentPrice,
            sellingPrice: currentPrice,
            name: s.name ?? ci.name,
            malayalamName: s.name_ml ?? ci.malayalamName,
            manglishName: s.name_manglish ?? ci.manglishName,
            imageUrl: s.imageUrl ?? ci.imageUrl,
            available: s.available !== false,
            stock: availableStock,
            lastUpdated: validationTimestamp,
            category: s.category ?? ci.category
          });
        }

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
      }
      // non-OK → fall through to Firestore path
    } catch (e) {
      // network/server error → fall through to Firestore path
    }
  }

  // --- existing Firestore/caching path (unchanged) ---
  // Price cache and batching logic
  const idsToFetch: string[] = [];
  const now = Date.now();

  for (const item of cartItems) {
    const cached = priceCache.get(item.id);
    if (
      !cached ||
      forceFresh ||
      now - cached.timestamp > (cached.ttl || CACHE_TTL)
    ) {
      idsToFetch.push(item.id);
    }
  }

  // Firestore 'in' queries are limited to 10 items per query
  const chunkSize = 10;
  const fetchedProducts: Record<string, any> = {};

  for (let i = 0; i < idsToFetch.length; i += chunkSize) {
    const chunk = idsToFetch.slice(i, i + chunkSize);
    const productDocs = await Promise.all(
      chunk.map(async (id) => {
        try {
          const docRef = doc(db, 'products', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            return { id, ...docSnap.data() };
          }
        } catch (e) {}
        return null;
      })
    );
    for (const p of productDocs) {
      if (p) {
        fetchedProducts[p.id] = p;
        priceCache.set(p.id, { price: p.sellingPrice, timestamp: now, ttl: CACHE_TTL });
      }
    }
  }

  for (const ci of cartItems) {
    const cached = priceCache.get(ci.id);
    const product = fetchedProducts[ci.id];
    let currentPrice = ci.sellingPrice ?? ci.price;
    let available = ci.available !== false;

    if (product) {
      currentPrice = product.sellingPrice;
      available = product.available !== false;
    } else if (cached) {
      currentPrice = cached.price;
    }

    if (typeof currentPrice === 'number' && typeof ci.price === 'number' && Math.abs(currentPrice - ci.price) > 0.01) {
      const percentageChange = ((currentPrice - ci.price) / ci.price) * 100;
      priceChanges.push({
        itemId: ci.id,
        itemName: product?.name || ci.name,
        oldPrice: ci.price,
        newPrice: currentPrice,
        percentageChange: Math.round(percentageChange * 100) / 100
      });
      totalPriceImpact += (currentPrice - ci.price) * ci.quantity;
      hasChanges = true;
    }

    if (!available) {
      unavailableItems.push(ci);
      hasChanges = true;
    }

    updatedItems.push({
      ...ci,
      price: currentPrice,
      sellingPrice: currentPrice,
      available,
      lastUpdated: validationTimestamp,
      name: product?.name ?? ci.name,
      malayalamName: product?.name_ml ?? ci.malayalamName,
      manglishName: product?.name_manglish ?? ci.manglishName,
      imageUrl: product?.imageUrl ?? ci.imageUrl,
      category: product?.category ?? ci.category
    });
  }

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
};

/**
 * Calculate risk level based on price changes
 */
function calculateRiskLevel(
  priceChanges: any[],
  totalPriceImpact: number,
  unavailableCount: number
): 'low' | 'medium' | 'high' {
  if (unavailableCount > 0) return 'high';
  if (totalPriceImpact > 100 || priceChanges.length > 2) return 'high';
  if (totalPriceImpact > 30 || priceChanges.length > 1) return 'medium';
  if (priceChanges.length > 0) return 'low';
  return 'low';
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
  let hits = 0, misses = 0;
  const now = Date.now();
  for (const [id, entry] of priceCache.entries()) {
    if (now - entry.timestamp < (entry.ttl || CACHE_TTL)) hits++;
    else misses++;
  }
  return { hits, misses, size: priceCache.size };
};