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
    <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
      {/* Main Animation Container */}
      <div 
        className={`
          relative transform transition-all duration-300 ease-out
          ${animationState === 'adding' ? 'scale-100 opacity-100 rotate-0' : 
            animationState === 'success' ? 'scale-100 opacity-100 rotate-0' : 
            animationState === 'celebration' ? 'scale-110 opacity-100 rotate-0' :
            'scale-95 opacity-0 rotate-12'}
        `}
        style={{ isolation: 'isolate' }}
      >
        {/* Background Card */}
        <div className={`rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full border-2 relative overflow-hidden transition-all duration-500 ${
          (typeof savings === 'number' && savings > 0 && animationState === 'celebration') ?
          'bg-gradient-to-br from-amber-50 via-yellow-50 to-yellow-100 border-yellow-300' :
          'bg-gradient-to-br from-white via-green-50 to-green-100 border-green-200'
        }`}>
          
          {/* Animated Background Particles - Contained within card bounds */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-2 h-2 rounded-full transition-all duration-1000 ${
                  animationState === 'success' || animationState === 'celebration' 
                    ? 'opacity-100 animate-bounce' 
                    : 'opacity-0'
                }`}
                style={{
                  background: (typeof savings === 'number' && savings > 0 && animationState === 'celebration') ?
                    `hsl(${45 + i * 15}, 80%, 65%)` : // Golden particles for savings
                    `hsl(${120 + i * 30}, 70%, 60%)`, // Green particles for regular
                  left: `${20 + (i * 10)}%`,
                  top: `${25 + (i % 2) * 35}%`,
                  animationDelay: `${i * 200}ms`,
                  animationDuration: '1.8s'
                }}
              />
            ))}
          </div>

          <div className="flex flex-col items-center text-center space-y-6 relative z-10">
            {/* Main Icon Animation */}
            <div className="relative">
              {/* Outer Glow Ring */}
              <div 
                className={`absolute inset-0 w-20 h-20 rounded-full transition-all duration-700 ${
                  animationState === 'adding' ? 'bg-green-200 scale-50 opacity-0' :
                  animationState === 'success' ? 'bg-green-300 scale-100 opacity-30 animate-ping' :
                  (typeof savings === 'number' && savings > 0) ? 'bg-yellow-300 scale-150 opacity-40 animate-pulse' :
                  'bg-green-400 scale-150 opacity-20 animate-pulse'
                }`}
              />
              
              {/* Main Icon Container */}
              <div 
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center relative transition-all duration-500 transform
                  ${animationState === 'adding' ? 'bg-green-100 scale-100 rotate-0' : 
                    animationState === 'success' ? 'bg-gradient-to-br from-green-500 to-green-600 scale-100 rotate-0' :
                    (typeof savings === 'number' && savings > 0) ? 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 scale-110 rotate-12 shadow-2xl' :
                    'bg-gradient-to-br from-green-400 to-green-700 scale-110 rotate-12'}
                `}
              >
                {/* Icon with smooth transitions */}
                {animationState === 'adding' ? (
                  <Plus 
                    className="text-green-600 transition-all duration-300 animate-spin" 
                    size={32} 
                  />
                ) : animationState === 'success' ? (
                  <Check 
                    className="text-white animate-bounce transition-all duration-300" 
                    size={32} 
                  />
                ) : (typeof savings === 'number' && savings > 0) ? (
                  /* 3D Gold Coin when there are savings */
                  <div className="relative">
                    {/* Coin Base */}
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 shadow-inner border-4 border-yellow-500 flex items-center justify-center relative overflow-hidden">
                      {/* Inner shine effect */}
                      <div className="absolute inset-1 rounded-full bg-gradient-to-tr from-yellow-200 to-transparent opacity-60"></div>
                      
                      {/* Rupee symbol */}
                      <span className="text-yellow-900 text-2xl font-black relative z-10 animate-pulse">₹</span>
                      
                      {/* Rotating light reflection */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-spin" 
                           style={{ animationDuration: '3s', transform: 'rotate(45deg)' }}></div>
                    </div>
                    
                    {/* 3D Edge Effect */}
                    <div className="absolute -bottom-1 left-1 w-14 h-3 bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-full blur-sm opacity-80 transform rotate-3"></div>                      {/* Floating sparkles around coin - Better contained positioning */}
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-1 h-1 bg-yellow-200 rounded-full animate-ping"
                          style={{
                            top: `${15 + Math.sin(i * Math.PI / 2) * 15}px`,
                            left: `${15 + Math.cos(i * Math.PI / 2) * 15}px`,
                            animationDelay: `${i * 250}ms`,
                            animationDuration: '1.2s'
                          }}
                        />
                      ))}
                  </div>
                ) : (
                  <ShoppingCart 
                    className="text-white animate-pulse" 
                    size={32} 
                  />
                )}

                {/* Enhanced Sparkle Effects */}
                {(animationState === 'success' || animationState === 'celebration') && (
                  <>
                    <Sparkles 
                      className={`absolute -top-1 -right-1 animate-ping ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-200' : 'text-yellow-400'
                      }`}
                      size={16} 
                    />
                    <Sparkles 
                      className={`absolute -bottom-1 -left-1 animate-ping ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-300' : 'text-yellow-500'
                      }`}
                      size={12}
                      style={{ animationDelay: '200ms' }}
                    />
                    <Heart 
                      className={`absolute top-0 left-0 animate-bounce ${
                        (typeof savings === 'number' && savings > 0) ? 'text-yellow-400' : 'text-pink-400'
                      }`}
                      size={10}
                      style={{ animationDelay: '400ms' }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Text Content */}
            <div className="space-y-2">
              <h3 
                className={`text-xl font-bold transition-all duration-300 ${
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
                  {/* Product Name */}
                  {animationState === 'success' && productName && (
                    <p className="text-sm font-medium text-green-600">
                      {productName}
                    </p>
                  )}
                  
                  {/* Savings Display with Gold Coin Animation - Only if savings > 0 */}
                  {typeof savings === 'number' && savings > 0 && animationState === 'celebration' && (
                    <div className="flex flex-col items-center space-y-2">
                      {/* Animated Gold Coins - Moved to side to avoid covering text */}
                      <div className="relative flex items-center justify-center h-8">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute animate-bounce"
                            style={{
                              left: `${-40 + i * 15}px`, // Moved further left to avoid text
                              top: '15px', // Moved further down below the text area
                              animationDelay: `${i * 100}ms`,
                              animationDuration: '1s'
                            }}
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 shadow-lg flex items-center justify-center text-yellow-900 text-xs font-bold transform hover:scale-110 transition-transform">
                              ₹
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Savings Text with Modern Styling */}
                      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-2 rounded-full border-2 border-yellow-200 shadow-md">
                        <p className="text-sm font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                          💎 You Saved ₹{savings.toFixed(2)}!
                        </p>
                      </div>
                      
                      {/* Keep Shopping Text - Clear space below */}
                      <p className="text-sm font-medium text-green-600 animate-pulse mt-2">
                        🛍️ Keep shopping for more savings!
                      </p>
                    </div>
                  )}
                  
                  {/* Regular Keep Shopping - Only if no savings */}
                  {(typeof savings !== 'number' || savings <= 0) && animationState === 'celebration' && (
                    <p className="text-sm font-medium text-green-600 animate-pulse">
                      🛍️ Keep shopping for more offers!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Fun Progress Bar */}
            {animationState === 'adding' && (
              <div className="w-full bg-green-100 rounded-full h-2 overflow-hidden">
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

          {/* Floating Elements - Properly contained within animation bounds */}
          {animationState === 'celebration' && (
            <div className="absolute inset-4 pointer-events-none overflow-hidden rounded-2xl">
              {/* Conditional Floating Elements based on savings */}
              {typeof savings === 'number' && savings > 0 ? (
                <>
                  {/* Floating Gold Coins when there are savings - Better positioning */}
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={`coin-${i}`}
                      className="absolute animate-bounce opacity-60"
                      style={{
                        left: i < 2 ? `${10 + i * 20}%` : `${60 + (i - 2) * 20}%`,
                        top: i < 2 ? `${20 + i * 30}%` : `${30 + (i - 2) * 30}%`,
                        animationDelay: `${i * 200}ms`,
                        animationDuration: '2s'
                      }}
                    >
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-sm flex items-center justify-center text-yellow-900 text-xs font-bold">
                        ₹
                      </div>
                    </div>
                  ))}
                  
                  {/* Floating Sparkles for savings - Corner positioning only */}
                  {[...Array(2)].map((_, i) => (
                    <div
                      key={`sparkle-${i}`}
                      className="absolute text-yellow-400 animate-pulse opacity-50"
                      style={{
                        left: i === 0 ? '15%' : '80%',
                        top: i === 0 ? '25%' : '70%',
                        animationDelay: `${i * 500}ms`,
                        fontSize: '12px'
                      }}
                    >
                      ✨
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {/* Regular Shopping Bags when no savings - Reduced and better positioned */}
                  {[...Array(2)].map((_, i) => (
                    <div
                      key={`bag-${i}`}
                      className="absolute text-green-500 animate-bounce opacity-50"
                      style={{
                        left: `${25 + i * 50}%`,
                        top: `${30 + i * 20}%`,
                        animationDelay: `${i * 300}ms`,
                        animationDuration: '1.5s'
                      }}
                    >
                      🛍️
                    </div>
                  ))}
                  
                  {/* Floating Hearts - Corner positioning only */}
                  {[...Array(2)].map((_, i) => (
                    <div
                      key={`heart-${i}`}
                      className="absolute text-pink-400 animate-pulse opacity-60"
                      style={{
                        right: `${15 + i * 50}%`,
                        top: `${25 + i * 40}%`,
                        animationDelay: `${i * 400}ms`,
                        fontSize: '10px'
                      }}
                    >
                      💖
                    </div>
                  ))}
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
