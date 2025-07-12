import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { validateCartPrices, PriceValidationResult } from '../utils/priceValidation';

export interface CartItem {
  id: string;
  name: string;
  malayalamName: string;
  manglishName: string;
  price: number; // Keep for Firebase/legacy compatibility - will equal sellingPrice
  mrp: number; // Maximum Retail Price
  sellingPrice: number; // Actual selling price
  quantity: number;
  unit: string;
  image: string;
  imageUrl?: string; // Optional, for Firestore compatibility
}

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: 'processing' | 'delivered';
  date: string;
}

interface CartContextType {
  cartItems: CartItem[];
  orders: Order[];
  addToCart: (item: Omit<CartItem, 'quantity'>, showAnimation?: boolean) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  placeOrder: () => void;
  getCartTotal: () => number;
  getItemCount: () => number;
  getTotalSavings: () => number;
  getTotalMRP: () => number;
  reorderItems: (items: CartItem[]) => void;
  validatePrices: () => Promise<PriceValidationResult>;
  updateCartPrices: (updatedItems: CartItem[]) => void;
  validatePricesManually: () => Promise<PriceValidationResult>; // For manual cart page validation
  onCartItemAdded?: (productName: string) => void; // Callback for animations
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode; onCartItemAdded?: (productName: string) => void }> = ({ children, onCartItemAdded }) => {
  // Load cart from localStorage if available
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem("cart");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading cart from localStorage:', error);
      return [];
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const stored = localStorage.getItem("orders");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading orders from localStorage:', error);
      return [];
    }
  });

  // Add price validation state
  const [lastPriceCheck, setLastPriceCheck] = useState<number>(0);
  const [priceValidationInProgress, setPriceValidationInProgress] = useState(false);

  // Auto-validate prices every 30 seconds if cart has items
  useEffect(() => {
    if (cartItems.length === 0) return;

    const interval = setInterval(async () => {
      try {
        await validatePrices();
      } catch (error) {
        console.error('Auto price validation failed:', error);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [cartItems.length]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  // Save orders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("orders", JSON.stringify(orders));
  }, [orders]);

  const addToCart = (item: Omit<CartItem, 'quantity'>, showAnimation: boolean = true) => {
    setCartItems(prev => {
      const existingItem = prev.find(cartItem => cartItem.id === item.id);
      // Always ensure both image and imageUrl are set for cart compatibility
      const imageUrl = (item as any).imageUrl || (item as any).image || '';
      const image = (item as any).image || (item as any).imageUrl || '';
      
      // Ensure pricing fields are properly set
      const itemWithComplete = { 
        ...item, 
        image, 
        imageUrl,
        // Ensure all pricing fields are set correctly
        price: item.sellingPrice || 0, // Set price to sellingPrice for legacy compatibility
        mrp: item.mrp || 0,
        sellingPrice: item.sellingPrice || 0
      };
      
      // Trigger animation callback if provided and it's a new item or showAnimation is true
      if (showAnimation && onCartItemAdded) {
        const productName = item.name || item.malayalamName || item.manglishName || 'Product';
        onCartItemAdded(productName);
      }
      
      if (existingItem) {
        return prev.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prev, { ...itemWithComplete, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCartItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const placeOrder = () => {
    const newOrder: Order = {
      id: `ORD${Date.now()}`,
      items: [...cartItems],
      total: getCartTotal(),
      status: 'processing',
      date: new Date().toISOString().split('T')[0]
    };
    setOrders(prev => [newOrder, ...prev]);
    clearCart();
  };

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => {
      // Use price as the primary field for consistency with validation
      const itemPrice = item.price || item.sellingPrice || 0;
      return total + (itemPrice * item.quantity);
    }, 0);
  };

  const getTotalSavings = () => {
    return cartItems.reduce((savings, item) => {
      const currentPrice = item.price || item.sellingPrice || 0;
      if (item.mrp && currentPrice) {
        return savings + ((item.mrp - currentPrice) * item.quantity);
      }
      return savings;
    }, 0);
  };

  const getTotalMRP = () => {
    return cartItems.reduce((total, item) => {
      // Use MRP if available
      if (item.mrp) {
        return total + (item.mrp * item.quantity);
      }
      // Fallback to current price if MRP not available
      const currentPrice = item.price || item.sellingPrice || 0;
      return total + (currentPrice * item.quantity);
    }, 0);
  };

  const getItemCount = () => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  };

  const reorderItems = (items: CartItem[]) => {
    // Clear current cart and add all items from the previous order
    setCartItems([...items]);
    // Save to localStorage
    try {
      localStorage.setItem("cart", JSON.stringify(items));
      console.log('🔄 Reorder: Added', items.length, 'items to cart');
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  };

  const validatePrices = async (): Promise<PriceValidationResult> => {
    if (priceValidationInProgress) {
      console.log('Price validation already in progress, skipping...');
      return { isValid: true, hasChanges: false, updatedItems: cartItems, priceChanges: [] };
    }

    try {
      setPriceValidationInProgress(true);
      const result = await validateCartPrices(cartItems);
      setLastPriceCheck(Date.now());
      
      console.log('🔍 Cart validation result:', result);
      
      // If prices have changed, do NOT automatically update the cart
      // Let the user decide via the price change modal
      if (result.hasChanges && result.priceChanges.length > 0) {
        console.log('⚠️ Price changes detected - user intervention required');
      }
      
      return result;
    } catch (error) {
      console.error('Price validation failed:', error);
      return { isValid: false, hasChanges: false, updatedItems: cartItems, priceChanges: [] };
    } finally {
      setPriceValidationInProgress(false);
    }
  };

  const validatePricesManually = async (): Promise<PriceValidationResult> => {
    // Force validation regardless of timing - for manual cart page checks
    try {
      const result = await validateCartPrices(cartItems);
      setLastPriceCheck(Date.now());
      
      console.log('Manual price validation result:', result);
      
      return result;
    } catch (error) {
      console.error('Manual price validation failed:', error);
      return { isValid: false, hasChanges: false, updatedItems: cartItems, priceChanges: [] };
    }
  };

  const updateCartPrices = (updatedItems: CartItem[]) => {
    console.log('📝 Updating cart prices:', {
      oldCount: cartItems.length,
      newCount: updatedItems.length,
      oldItems: cartItems.map(item => ({ id: item.id, name: item.name, price: item.price })),
      newItems: updatedItems.map(item => ({ id: item.id, name: item.name, price: item.price }))
    });
    
    // Update both state and localStorage immediately
    setCartItems(updatedItems);
    localStorage.setItem("cart", JSON.stringify(updatedItems));
    
    console.log('✅ Cart prices updated successfully');
    
    // Trigger immediate custom event for synchronization
    window.dispatchEvent(new CustomEvent('cartUpdated', { 
      detail: { updatedItems, timestamp: Date.now() } 
    }));
  };

  return (
    <CartContext.Provider value={{
      cartItems,
      orders,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      placeOrder,
      getCartTotal,
      getItemCount,
      getTotalSavings,
      getTotalMRP,
      reorderItems,
      validatePrices,
      updateCartPrices,
      validatePricesManually,
      onCartItemAdded
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};