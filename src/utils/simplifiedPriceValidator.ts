// Simplified price validation optimized for 30K users
import { validateCartPricesAdvanced } from './advancedPriceValidation';
import { PRODUCTION_CONFIG_30K } from './productionConfig30K';

export class SimplifiedPriceValidator {
  private lastValidation = new Map<string, number>();
  private cache = new Map<string, any>();

  async validateForCheckout(cartItems: any[], userId: string) {
    const now = Date.now();
    const lastCheck = this.lastValidation.get(userId) || 0;
    
    // Skip validation if checked recently (within 1 minute)
    if (now - lastCheck < PRODUCTION_CONFIG_30K.PRICE_CACHE_TTL) {
      return { isValid: true, hasChanges: false, updatedItems: cartItems };
    }

    try {
      const validation = await validateCartPricesAdvanced(cartItems);
      this.lastValidation.set(userId, now);

      // Auto-accept very small changes (< 2% and < ₹5 total impact)
      if (validation.riskLevel === 'low' && PRODUCTION_CONFIG_30K.AUTO_UPDATE_LOW_RISK_CHANGES) {
        const totalImpact = validation.priceChanges.reduce(
          (sum, change) => sum + (change.newPrice - change.oldPrice), 0
        );
        
        if (Math.abs(totalImpact) < 5) {
          return {
            ...validation,
            autoAccepted: true,
            message: `Prices updated automatically (${totalImpact >= 0 ? '+' : ''}₹${totalImpact.toFixed(2)})`
          };
        }
      }

      return validation;
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, hasChanges: false, updatedItems: cartItems, error: true };
    }
  }

  // Lightweight background validation for active users
  async backgroundValidate(cartItems: any[], userId: string) {
    if (cartItems.length === 0) return;

    const now = Date.now();
    const lastCheck = this.lastValidation.get(userId) || 0;
    
    // Only validate if cart is "stale"
    if (now - lastCheck < PRODUCTION_CONFIG_30K.BACKGROUND_VALIDATION_INTERVAL) {
      return;
    }

    try {
      const validation = await validateCartPricesAdvanced(cartItems);
      
      // Only update cache, don't interrupt user
      if (validation.hasChanges && validation.riskLevel !== 'high') {
        this.cache.set(userId, validation);
        console.log('Background validation: price changes detected but not critical');
      }
    } catch (error) {
      // Silent fail for background validation
      console.warn('Background validation failed:', error);
    }
  }

  getBackgroundChanges(userId: string) {
    return this.cache.get(userId);
  }

  clearUserCache(userId: string) {
    this.lastValidation.delete(userId);
    this.cache.delete(userId);
  }
}

// Singleton instance
export const priceValidator = new SimplifiedPriceValidator();
