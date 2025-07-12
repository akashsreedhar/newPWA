import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
 * Validates cart items against current Firestore prices
 * Returns updated cart items with current prices and details about any changes
 */
export const validateCartPrices = async (cartItems: any[]): Promise<PriceValidationResult> => {
  const priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
  }[] = [];
  let hasChanges = false;

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
            exists: false
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
          sellingPrice: currentPrice, // CRITICAL: Also update sellingPrice for consistency
          currentPrice,
          exists: true,
          // Also update other fields that might have changed
          name: currentData.name_en || currentData.name || cartItem.name,
          malayalamName: currentData.name_ml || cartItem.malayalamName,
          manglishName: currentData.name_manglish || cartItem.manglishName,
          unit: currentData.unit || cartItem.unit,
          image: currentData.imageUrl || currentData.image || cartItem.image,
          imageUrl: currentData.imageUrl || currentData.image || cartItem.imageUrl,
          netQuantity: currentData.netQuantity || cartItem.netQuantity
        };
      } catch (error) {
        console.error(`Error checking price for item ${cartItem.id}:`, error);
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
    console.error('Error validating cart prices:', error);
    
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
