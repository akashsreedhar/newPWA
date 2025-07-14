import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { validateCartPrices, PriceValidationResult } from '../utils/priceValidation';
import { doc, getDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { db } from '../firebase';

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
  available?: boolean; // <-- Add available property for runtime checks
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
  validatePricesManually: () => Promise<PriceValidationResult>;
  onCartItemAdded?: (productName: string) => void;
  revalidateCartAvailability: () => Promise<CartItem[]>; // <-- Add to context
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

  // PATCH: Always check latest availability before adding to cart
  const addToCart = async (item: Omit<CartItem, 'quantity'>, showAnimation: boolean = true) => {
    try {
      const productDoc = await getDoc(doc(db, 'products', item.id));
      if (!productDoc.exists()) {
        alert('Product no longer exists.');
        return;
      }
      const productData = productDoc.data();
      if (productData.available === false) {
        alert('Sorry, this product is now out of stock.');
        return;
      }

      setCartItems(prev => {
        const existingItem = prev.find(cartItem => cartItem.id === item.id);
        const imageUrl = (item as any).imageUrl || (item as any).image || '';
        const image = (item as any).image || (item as any).imageUrl || '';

        const itemWithComplete = {
          ...item,
          image,
          imageUrl,
          price: item.sellingPrice || 0,
          mrp: item.mrp || 0,
          sellingPrice: item.sellingPrice || 0,
          available: true // Always set available true if adding
        };

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
    } catch (err) {
      alert('Could not add to cart. Please try again.');
    }
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
      if (item.mrp) {
        return total + (item.mrp * item.quantity);
      }
      const currentPrice = item.price || item.sellingPrice || 0;
      return total + (currentPrice * item.quantity);
    }, 0);
  };

  const getItemCount = () => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  };

  const reorderItems = (items: CartItem[]) => {
    setCartItems([...items]);
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

    setCartItems(updatedItems);
    localStorage.setItem("cart", JSON.stringify(updatedItems));

    console.log('✅ Cart prices updated successfully');

    window.dispatchEvent(new CustomEvent('cartUpdated', {
      detail: { updatedItems, timestamp: Date.now() }
    }));
  };

  // --- AVAILABILITY REVALIDATION LOGIC ---
  // This function checks the latest availability for all cart items from Firestore
  const revalidateCartAvailability = async (): Promise<CartItem[]> => {
    const ids = cartItems.map(item => item.id);
    if (ids.length === 0) return [];

    // Firestore 'in' queries are limited to 10 items per query
    const chunkSize = 10;
    let unavailableItems: CartItem[] = [];
    let updatedCart: CartItem[] = [...cartItems];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const productsRef = collection(db, 'products');
      const q = query(productsRef, where('__name__', 'in', chunk));
      const snapshot = await getDocs(q);

      const availabilityMap: Record<string, boolean> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        availabilityMap[docSnap.id] = data.available !== false;
      });

      updatedCart = updatedCart.map(item =>
        chunk.includes(item.id)
          ? { ...item, available: availabilityMap[item.id] !== undefined ? availabilityMap[item.id] : false }
          : item
      );
    }

    setCartItems(updatedCart);
    localStorage.setItem("cart", JSON.stringify(updatedCart));

    unavailableItems = updatedCart.filter(item => item.available === false);

    return unavailableItems;
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
      onCartItemAdded,
      revalidateCartAvailability // <-- Make available in context
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