// Production monitoring and analytics for price validation
export class PriceValidationAnalytics {
  private static instance: PriceValidationAnalytics;
  private metrics: {
    validations: number;
    priceChanges: number;
    ordersCancelled: number;
    averageValidationTime: number;
    lastValidation: string;
  } = {
    validations: 0,
    priceChanges: 0,
    ordersCancelled: 0,
    averageValidationTime: 0,
    lastValidation: ''
  };

  static getInstance() {
    if (!PriceValidationAnalytics.instance) {
      PriceValidationAnalytics.instance = new PriceValidationAnalytics();
    }
    return PriceValidationAnalytics.instance;
  }

  trackValidation(duration: number, hasChanges: boolean) {
    this.metrics.validations++;
    this.metrics.lastValidation = new Date().toISOString();
    
    // Update average validation time
    this.metrics.averageValidationTime = 
      (this.metrics.averageValidationTime * (this.metrics.validations - 1) + duration) / this.metrics.validations;
    
    if (hasChanges) {
      this.metrics.priceChanges++;
    }

    // Send to analytics service (Google Analytics, Mixpanel, etc.)
    this.sendToAnalytics('price_validation', {
      duration,
      hasChanges,
      timestamp: this.metrics.lastValidation
    });
  }

  trackOrderCancellation(reason: 'price_change' | 'stock_issue' | 'unavailable_items') {
    this.metrics.ordersCancelled++;
    
    this.sendToAnalytics('order_cancelled', {
      reason,
      timestamp: new Date().toISOString()
    });
  }

  getMetrics() {
    return { ...this.metrics };
  }

  private sendToAnalytics(event: string, data: any) {
    // Example: Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', event, {
        custom_parameter: JSON.stringify(data)
      });
    }

    // Example: Send to custom analytics endpoint
    if (process.env.NODE_ENV === 'production') {
      const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
      fetch(analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data })
      }).catch(error => console.error('Analytics error:', error));
    }
  }
}

// Error tracking for production debugging
export class PriceValidationErrorTracker {
  static trackError(error: Error, context: {
    userId?: string;
    cartItems?: any[];
    validationType: 'client' | 'server';
    timestamp: string;
  }) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Price Validation Error:', errorData);
    }

    // Send to error tracking service (Sentry, Bugsnag, etc.)
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry
      // Sentry.captureException(error, { extra: errorData });
      const errorEndpoint = import.meta.env.VITE_ERROR_ENDPOINT || '/api/errors';
      // Example: Custom error endpoint
      fetch(errorEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      }).catch(err => console.error('Error reporting failed:', err));
    }
  }
}

declare global {
  function gtag(...args: any[]): void;
}
