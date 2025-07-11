import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CartAnimationContextType {
  showAnimation: (productName?: string, savings?: number) => void;
  isAnimating: boolean;
  currentProductName?: string;
  currentSavings?: number;
  onAnimationComplete: () => void;
}

const CartAnimationContext = createContext<CartAnimationContextType | undefined>(undefined);

export const CartAnimationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentProductName, setCurrentProductName] = useState<string | undefined>();
  const [currentSavings, setCurrentSavings] = useState<number | undefined>();

  const showAnimation = (productName?: string, savings?: number) => {
    setCurrentProductName(productName);
    setCurrentSavings(savings);
    setIsAnimating(true);
  };

  const onAnimationComplete = () => {
    setIsAnimating(false);
    setCurrentProductName(undefined);
    setCurrentSavings(undefined);
  };

  return (
    <CartAnimationContext.Provider value={{
      showAnimation,
      isAnimating,
      currentProductName,
      currentSavings,
      onAnimationComplete
    }}>
      {children}
    </CartAnimationContext.Provider>
  );
};

export const useCartAnimation = () => {
  const context = useContext(CartAnimationContext);
  if (!context) {
    throw new Error('useCartAnimation must be used within a CartAnimationProvider');
  }
  return context;
};
