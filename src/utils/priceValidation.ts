import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { BACKEND_URL } from '../config';

export interface PriceValidationResult {
  isValid: boolean;
  hasChanges: boolean;
  updatedItems: any[];
  priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
  }[];
}

/**
 * Validates cart items against current backend prices (server-first).
 * Falls back to Firestore if backend is unavailable.
 * Always sets 'available' flag for each item.
 */
export const validateCartPrices = async (cartItems: any[]): Promise<PriceValidationResult> => {
  const priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
  }[] = [];
  let hasChanges = false;

  // --- SERVER-FIRST VALIDATION ---
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

      const updatedItems = cartItems.map(ci => {
        const s = serverMap.get(String(ci.id));
        if (!s) {
          // Mark missing as unavailable
          return { ...ci, available: false };
        }
        const newPrice = typeof s.sellingPrice === 'number'
          ? s.sellingPrice
          : (typeof s.price === 'number' ? s.price : (ci.sellingPrice ?? ci.price));

        return {
          ...ci,
          name: s.name ?? ci.name,
          mrp: typeof s.mrp === 'number' ? s.mrp : (ci.mrp ?? newPrice),
          sellingPrice: newPrice,
          price: newPrice,
          category: s.category ?? ci.category,
          available: s.available !== false,
          imageUrl: s.imageUrl ?? ci.imageUrl ?? ci.image,
          unit: s.unit ?? ci.unit
        };
      });

      // Build priceChanges
      updatedItems.forEach(u => {
        const prev = cartItems.find(x => x.id === u.id) || {};
        const oldPrice = (prev as any).sellingPrice ?? (prev as any).price ?? 0;
        const newPrice = (u as any).sellingPrice ?? (u as any).price ?? 0;
        if (Number(oldPrice) !== Number(newPrice)) {
          hasChanges = true;
          priceChanges.push({
            itemId: u.id,
            itemName: u.name || (prev as any).name || 'Item',
            oldPrice: Number(oldPrice),
            newPrice: Number(newPrice)
          });
        }
      });

      return {
        isValid: true,
        hasChanges,
        updatedItems,
        priceChanges
      };
    }
  } catch (e) {
    // Network/server error → fall through to Firestore fallback
    // console.warn('Server validation failed, falling back to Firestore:', e);
  }

  // --- FALLBACK: Firestore-per-item logic ---
  try {
    // Fetch current prices for all cart items in parallel
    const priceChecks = cartItems.map(async (cartItem) => {
      try {
        const productDoc = await getDoc(doc(db, 'products', cartItem.id));
        
        if (!productDoc.exists()) {
          // Product no longer exists
          return {
            ...cartItem,
            currentPrice: null,
            exists: false,
            available: false // Mark unavailable
          };
        }

        const currentData = productDoc.data();
        const currentPrice = currentData.sellingPrice;

        // Check if price has changed
        if (currentPrice !== cartItem.price) {
          hasChanges = true;
          priceChanges.push({
            itemId: cartItem.id,
            itemName: cartItem.name,
            oldPrice: cartItem.price,
            newPrice: currentPrice
          });
        }

        return {
          ...cartItem,
          price: currentPrice, // Update to current price
          sellingPrice: currentPrice,
          currentPrice,
          exists: true,
          // Also update other fields that might have changed
          name: currentData.name_en || currentData.name || cartItem.name,
          malayalamName: currentData.name_ml || cartItem.malayalamName,
          manglishName: currentData.name_manglish || cartItem.manglishName,
          unit: currentData.unit || cartItem.unit,
          image: currentData.imageUrl || currentData.image || cartItem.image,
          imageUrl: currentData.imageUrl || currentData.image || cartItem.imageUrl,
          netQuantity: currentData.netQuantity || cartItem.netQuantity,
          available: currentData.available !== false // Mark availability
        };
      } catch (error) {
        // On error, keep original item but mark as potentially outdated
        return {
          ...cartItem,
          currentPrice: null,
          exists: true,
          error: true
        };
      }
    });

    const results = await Promise.all(priceChecks);
    // Filter out products that no longer exist
    const existingItems = results.filter(item => item.exists);

    return {
      isValid: !hasChanges && existingItems.length === cartItems.length,
      hasChanges,
      updatedItems: existingItems,
      priceChanges
    };

  } catch (error) {
    // On validation error, return original items but mark as invalid
    return {
      isValid: false,
      hasChanges: false,
      updatedItems: cartItems,
      priceChanges: []
    };
  }
};

/**
 * Formats price change messages for user display
 */
export const formatPriceChanges = (priceChanges: PriceValidationResult['priceChanges']) => {
  if (priceChanges.length === 0) return '';
  
  const messages = priceChanges.map(change => {
    const priceDiff = change.newPrice - change.oldPrice;
    const direction = priceDiff > 0 ? 'increased' : 'decreased';
    const diffAmount = Math.abs(priceDiff);
    
    return `• ${change.itemName}: ₹${change.oldPrice} → ₹${change.newPrice} (${direction} by ₹${diffAmount})`;
  });
  
  return messages.join('\n');
};