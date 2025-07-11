import React, { createContext, useContext, useState, ReactNode } from 'react';
import { validateCartPrices, PriceValidationResult } from '../utils/priceValidation';

export interface CartItem {
  id: string;
  name: string;
  malayalamName: string;
  manglishName: string;
  price: number;
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
  reorderItems: (items: CartItem[]) => void;
  validatePrices: () => Promise<PriceValidationResult>;
  updateCartPrices: (updatedItems: CartItem[]) => void;
  onCartItemAdded?: (productName: string) => void; // Callback for animations
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode; onCartItemAdded?: (productName: string) => void }> = ({ children, onCartItemAdded }) => {
  // Load cart from localStorage if available
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem("cart");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ORD001',
      items: [],
      total: 245,
      status: 'delivered',
      date: '2024-01-15'
    },
    {
      id: 'ORD002',
      items: [],
      total: 180,
      status: 'processing',
      date: '2024-01-16'
    }
  ]);

  // Save cart to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (item: Omit<CartItem, 'quantity'>, showAnimation: boolean = true) => {
    setCartItems(prev => {
      const existingItem = prev.find(cartItem => cartItem.id === item.id);
      // Always ensure both image and imageUrl are set for cart compatibility
      const imageUrl = (item as any).imageUrl || (item as any).image || '';
      const image = (item as any).image || (item as any).imageUrl || '';
      const itemWithImages = { ...item, image, imageUrl };
      
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
      return [...prev, { ...itemWithImages, quantity: 1 }];
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
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
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
    return await validateCartPrices(cartItems);
  };

  const updateCartPrices = (updatedItems: CartItem[]) => {
    setCartItems(updatedItems);
    localStorage.setItem("cart", JSON.stringify(updatedItems));
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
      reorderItems,
      validatePrices,
      updateCartPrices,
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