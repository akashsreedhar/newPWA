import React, { useState, useEffect } from 'react';
import { Check, Plus, ShoppingCart, Sparkles, Heart } from 'lucide-react';

interface CartAnimationProps {
  show: boolean;
  onComplete: () => void;
  productName?: string;
  savings?: number;
}

const CartAnimation: React.FC<CartAnimationProps> = ({ show, onComplete, productName, savings }) => {
  const [animationState, setAnimationState] = useState<'hidden' | 'adding' | 'success' | 'celebration' | 'fadeOut'>('hidden');

  useEffect(() => {
    if (show) {
      // Start immediately without delay
      setAnimationState('adding');
      
      // Show success state after 1000ms (1 second)
      const successTimer = setTimeout(() => {
        setAnimationState('success');
      }, 1000);

      // Show celebration after 2000ms (1 second for success state)
      const celebrationTimer = setTimeout(() => {
        setAnimationState('celebration');
      }, 2000);

      // Determine timing based on whether there are savings
      const hasSavings = typeof savings === 'number' && savings > 0;
      const celebrationDuration = hasSavings ? 4500 : 4500; // 2.5 seconds for celebration (both cases)
      const totalDuration = hasSavings ? 5000 : 5000; // 0.5 seconds for fade out

      // Start fade out after celebration duration
      const fadeTimer = setTimeout(() => {
        setAnimationState('fadeOut');
      }, celebrationDuration);

      // Complete animation after total duration
      const completeTimer = setTimeout(() => {
        setAnimationState('hidden');
        onComplete();
      }, totalDuration);

      return () => {
        clearTimeout(successTimer);
        clearTimeout(celebrationTimer);
        clearTimeout(fadeTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [show, onComplete, savings]);

  if (!show || animationState === 'hidden') {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4">
      {/* Main Animation Container - Mobile Optimized & Perfectly Centered */}
      <div 
        className={`
          relative transition-all duration-300 ease-out w-full max-w-xs sm:max-w-sm
          ${animationState === 'adding' ? 'scale-100 opacity-100' : 
            animationState === 'success' ? 'scale-100 opacity-100' : 
            animationState === 'celebration' ? 'scale-105 opacity-100' :
            'scale-95 opacity-0'}
        `}
        style={{ isolation: 'isolate' }}
      >
        {/* Background Card - Mobile Optimized */}
        <div className={`rounded-2xl shadow-xl p-6 w-full border-2 relative overflow-hidden transition-all duration-500 ${
          (typeof savings === 'number' && savings > 0 && animationState === 'celebration') ?
          'bg-gradient-to-br from-amber-50 via-yellow-50 to-yellow-100 border-yellow-300' :
          'bg-gradient-to-br from-white via-green-50 to-green-100 border-green-200'
        }`}>
          
          {/* Animated Background Particles - Mobile Optimized */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-1.5 h-1.5 rounded-full transition-all duration-1000 ${
                  animationState === 'success' || animationState === 'celebration' 
                    ? 'opacity-80 animate-bounce' 
                    : 'opacity-0'
                }`}
                style={{
                  background: (typeof savings === 'number' && savings > 0 && animationState === 'celebration') ?
                    `hsl(${45 + i * 20}, 75%, 65%)` : // Golden particles for savings
                    `hsl(${120 + i * 30}, 65%, 60%)`, // Green particles for regular
                  left: `${25 + (i * 12)}%`,
                  top: `${30 + (i % 2) * 30}%`,
                  animationDelay: `${i * 250}ms`,
                  animationDuration: '1.6s'
                }}
              />
            ))}
          </div>

          <div className="flex flex-col items-center text-center space-y-4 relative z-10">
            {/* Main Icon Animation - Mobile Optimized */}
            <div className="relative">
              {/* Outer Glow Ring - Smaller for mobile */}
              <div 
                className={`absolute inset-0 w-16 h-16 rounded-full transition-all duration-700 ${
                  animationState === 'adding' ? 'bg-green-200 scale-50 opacity-0' :
                  animationState === 'success' ? 'bg-green-300 scale-100 opacity-25 animate-ping' :
                  (typeof savings === 'number' && savings > 0) ? 'bg-yellow-300 scale-125 opacity-35 animate-pulse' :
                  'bg-green-400 scale-125 opacity-15 animate-pulse'
                }`}
              />
              
              {/* Main Icon Container - Compact for mobile */}
              <div 
                className={`
                  w-16 h-16 rounded-full flex items-center justify-center relative transition-all duration-500
                  ${animationState === 'adding' ? 'bg-green-100 scale-100' : 
                    animationState === 'success' ? 'bg-gradient-to-br from-green-500 to-green-600 scale-100' :
                    (typeof savings === 'number' && savings > 0) ? 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 scale-105 shadow-xl' :
                    'bg-gradient-to-br from-green-400 to-green-700 scale-105'}
                `}
              >
                {/* Icon with smooth transitions - Mobile optimized */}
                {animationState === 'adding' ? (
                  <Plus 
                    className="text-green-600 transition-all duration-300 animate-spin" 
                    size={24} 
                  />
                ) : animationState === 'success' ? (
                  <Check 
                    className="text-white animate-bounce transition-all duration-300" 
                    size={24} 
                  />
                ) : (typeof savings === 'number' && savings > 0) ? (
                  /* 3D Gold Coin when there are savings - Mobile optimized */
                  <div className="relative">
                    {/* Coin Base - Smaller for mobile */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 shadow-inner border-3 border-yellow-500 flex items-center justify-center relative overflow-hidden">
                      {/* Inner shine effect */}
                      <div className="absolute inset-1 rounded-full bg-gradient-to-tr from-yellow-200 to-transparent opacity-60"></div>
                      
                      {/* Rupee symbol - Smaller for mobile */}
                      <span className="text-yellow-900 text-lg font-black relative z-10 animate-pulse">₹</span>
                      
                      {/* Rotating light reflection */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-spin" 
                           style={{ animationDuration: '3s' }}></div>
                    </div>
                    
                    {/* 3D Edge Effect - Smaller */}
                    <div className="absolute -bottom-0.5 left-0.5 w-11 h-2 bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-full blur-sm opacity-70"></div>
                    
                    {/* Floating sparkles around coin - Mobile optimized */}
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-0.5 h-0.5 bg-yellow-200 rounded-full animate-ping"
                        style={{
                          top: `${12 + Math.sin(i * Math.PI / 1.5) * 12}px`,
                          left: `${12 + Math.cos(i * Math.PI / 1.5) * 12}px`,
                          animationDelay: `${i * 300}ms`,
                          animationDuration: '1s'
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <ShoppingCart 
                    className="text-white animate-pulse" 
                    size={24} 
                  />
                )}

                {/* Enhanced Sparkle Effects - Mobile optimized */}
                {(animationState === 'success' || animationState === 'celebration') && (
                  <>
                    <Sparkles 
                      className={`absolute -top-1 -right-1 animate-ping ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-200' : 'text-yellow-400'
                      }`}
                      size={12} 
                    />
                    <Sparkles 
                      className={`absolute -bottom-1 -left-1 animate-ping ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-300' : 'text-yellow-500'
                      }`}
                      size={10}
                      style={{ animationDelay: '200ms' }}
                    />
                    <Heart 
                      className={`absolute top-0 left-0 animate-bounce ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-400' : 'text-pink-400'
                      }`}
                      size={8}
                      style={{ animationDelay: '400ms' }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Text Content - Mobile Optimized */}
            <div className="space-y-2">
              <h3 
                className={`text-lg sm:text-xl font-bold transition-all duration-300 ${
                  animationState === 'adding' ? 'text-green-600' : 
                  animationState === 'success' ? 'text-green-700' :
                  'text-green-800'
                }`}
              >
                {animationState === 'adding' ? '✨ Adding magic...' : 
                 animationState === 'success' ? '🎉 Added to cart!' :
                 '🛍️ Keep shopping!'}
              </h3>
              
              {(animationState === 'success' || animationState === 'celebration') && (
                <div className="space-y-2">
                  {/* Product Name - Mobile optimized */}
                  {animationState === 'success' && productName && (
                    <p className="text-xs sm:text-sm font-medium text-green-600 truncate">
                      {productName}
                    </p>
                  )}
                  
                  {/* Savings Display with Gold Coin Animation - Mobile optimized */}
                  {typeof savings === 'number' && savings > 0 && animationState === 'celebration' && (
                    <div className="flex flex-col items-center space-y-2">
                      {/* Animated Gold Coins - Mobile optimized positioning */}
                      <div className="relative flex items-center justify-center h-6">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute animate-bounce"
                            style={{
                              left: `${-30 + i * 12}px`, // Tighter spacing for mobile
                              top: '10px',
                              animationDelay: `${i * 100}ms`,
                              animationDuration: '1s'
                            }}
                          >
                            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 shadow-md flex items-center justify-center text-yellow-900 text-xs font-bold">
                              ₹
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Savings Text - Mobile optimized */}
                      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-3 py-1.5 rounded-full border-2 border-yellow-200 shadow-sm">
                        <p className="text-xs sm:text-sm font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                          💎 You Saved ₹{savings.toFixed(2)}!
                        </p>
                      </div>
                      
                      {/* Keep Shopping Text */}
                      <p className="text-xs sm:text-sm font-medium text-green-600 animate-pulse mt-1">
                        🛍️ Keep shopping for more savings!
                      </p>
                    </div>
                  )}
                  
                  {/* Regular Keep Shopping - Mobile optimized */}
                  {(typeof savings !== 'number' || savings <= 0) && animationState === 'celebration' && (
                    <p className="text-xs sm:text-sm font-medium text-green-600 animate-pulse">
                      🛍️ Keep shopping for more offers!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Fun Progress Bar - Mobile optimized */}
            {animationState === 'adding' && (
              <div className="w-full bg-green-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-600 ease-out"
                  style={{
                    animation: 'progressFill 0.6s ease-out forwards',
                    transform: 'scaleX(0)',
                    transformOrigin: 'left'
                  }}
                />
              </div>
            )}
          </div>

          {/* Floating Elements - Mobile optimized and contained */}
          {animationState === 'celebration' && (
            <div className="absolute inset-3 pointer-events-none overflow-hidden rounded-xl">
              {/* Conditional Floating Elements based on savings */}
              {typeof savings === 'number' && savings > 0 ? (
                <>
                  {/* Floating Gold Coins - Mobile optimized */}
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={`coin-${i}`}
                      className="absolute animate-bounce opacity-50"
                      style={{
                        left: i === 0 ? '15%' : i === 1 ? '70%' : '45%',
                        top: i === 0 ? '25%' : i === 1 ? '30%' : '65%',
                        animationDelay: `${i * 250}ms`,
                        animationDuration: '1.8s'
                      }}
                    >
                      <div className="w-3 h-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-sm flex items-center justify-center text-yellow-900 text-xs font-bold">
                        ₹
                      </div>
                    </div>
                  ))}
                  
                  {/* Floating Sparkles - Corner positioning only */}
                  <div
                    className="absolute text-yellow-400 animate-pulse opacity-40"
                    style={{
                      left: '20%',
                      top: '70%',
                      fontSize: '10px'
                    }}
                  >
                    ✨
                  </div>
                  <div
                    className="absolute text-yellow-400 animate-pulse opacity-40"
                    style={{
                      right: '20%',
                      top: '20%',
                      fontSize: '10px',
                      animationDelay: '500ms'
                    }}
                  >
                    ✨
                  </div>
                </>
              ) : (
                <>
                  {/* Regular Shopping Bags - Mobile optimized */}
                  <div
                    className="absolute text-green-500 animate-bounce opacity-40"
                    style={{
                      left: '20%',
                      top: '30%',
                      animationDuration: '1.5s'
                    }}
                  >
                    🛍️
                  </div>
                  <div
                    className="absolute text-green-500 animate-bounce opacity-40"
                    style={{
                      right: '20%',
                      top: '60%',
                      animationDelay: '300ms',
                      animationDuration: '1.5s'
                    }}
                  >
                    🛍️
                  </div>
                  
                  {/* Floating Hearts - Mobile optimized */}
                  <div
                    className="absolute text-pink-400 animate-pulse opacity-50"
                    style={{
                      right: '25%',
                      top: '25%',
                      fontSize: '8px'
                    }}
                  >
                    💖
                  </div>
                  <div
                    className="absolute text-pink-400 animate-pulse opacity-50"
                    style={{
                      left: '25%',
                      top: '65%',
                      animationDelay: '400ms',
                      fontSize: '8px'
                    }}
                  >
                    💖
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartAnimation;
