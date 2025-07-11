// Optimized configuration for 30K users
export const PRODUCTION_CONFIG_30K = {
  // Caching - Aggressive for smaller scale
  PRICE_CACHE_TTL: 60000, // 1 minute (longer cache for smaller scale)
  BACKGROUND_VALIDATION_INTERVAL: 300000, // 5 minutes (less frequent)
  
  // Batch Processing
  FIREBASE_BATCH_SIZE: 10, // Firebase limit
  MAX_CONCURRENT_VALIDATIONS: 5, // Limit concurrent requests
  
  // Risk Thresholds - Tuned for smaller business
  RISK_THRESHOLDS: {
    PERCENTAGE_CHANGE_MEDIUM: 3, // More sensitive (3% vs 5%)
    PERCENTAGE_CHANGE_HIGH: 15, // More sensitive (15% vs 20%)
    PRICE_IMPACT_MEDIUM: 10, // Lower threshold (₹10 vs ₹20)
    PRICE_IMPACT_HIGH: 50, // Lower threshold (₹50 vs ₹100)
  },
  
  // Performance
  VALIDATION_TIMEOUT: 10000, // 10 seconds
  DEBOUNCE_DELAY: 500, // Prevent rapid-fire validations
  
  // Features for smaller scale
  ANALYTICS_SAMPLING_RATE: 1.0, // Track 100% (vs 10% for millions)
  ERROR_TRACKING_ENABLED: true,
  BACKGROUND_VALIDATION_ENABLED: true,
  
  // Business Logic
  MAX_CART_AGE_MINUTES: 60, // Validate carts older than 1 hour
  AUTO_UPDATE_LOW_RISK_CHANGES: true, // Auto-accept changes < 2%
  
  // Resource Management
  MAX_CACHE_SIZE: 1000, // Limit memory usage
  CACHE_CLEANUP_INTERVAL: 600000, // 10 minutes
};

// Smart validation strategy for 30K users
export const shouldValidateCart = (cartAge: number, userActivity: 'high' | 'medium' | 'low') => {
  switch (userActivity) {
    case 'high': return cartAge > 30000; // 30 seconds
    case 'medium': return cartAge > 120000; // 2 minutes  
    case 'low': return cartAge > 300000; // 5 minutes
    default: return true;
  }
};

// Simplified risk assessment for smaller business
export const getSimplifiedRiskLevel = (priceChanges: any[], totalImpact: number): 'low' | 'medium' | 'high' => {
  const maxChange = Math.max(...priceChanges.map(c => Math.abs(c.percentageChange)));
  
  if (maxChange > 15 || Math.abs(totalImpact) > 50) return 'high';
  if (maxChange > 3 || Math.abs(totalImpact) > 10) return 'medium';
  return 'low';
};
