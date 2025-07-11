import React, { useState, useEffect } from 'react';
import { Check, Plus, ShoppingCart, Sparkles, Heart } from 'lucide-react';

interface CartAnimationProps {
  show: boolean;
  onComplete: () => void;
  productName?: string;
}

const CartAnimation: React.FC<CartAnimationProps> = ({ show, onComplete, productName }) => {
  const [animationState, setAnimationState] = useState<'hidden' | 'adding' | 'success' | 'celebration' | 'fadeOut'>('hidden');

  useEffect(() => {
    if (show) {
      // Start immediately without delay
      setAnimationState('adding');
      
      // Show success state after 1000ms (slightly reduced)
      const successTimer = setTimeout(() => {
        setAnimationState('success');
      }, 1000);

      // Show celebration after 2200ms 
      const celebrationTimer = setTimeout(() => {
        setAnimationState('celebration');
      }, 2200);

      // Start fade out after 3600ms
      const fadeTimer = setTimeout(() => {
        setAnimationState('fadeOut');
      }, 3600);

      // Complete animation after 4200ms
      const completeTimer = setTimeout(() => {
        setAnimationState('hidden');
        onComplete();
      }, 4200);

      return () => {
        clearTimeout(successTimer);
        clearTimeout(celebrationTimer);
        clearTimeout(fadeTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [show, onComplete]);

  if (!show || animationState === 'hidden') {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
      {/* Main Animation Container */}
      <div 
        className={`
          relative transform transition-all duration-300 ease-out
          ${animationState === 'adding' ? 'scale-100 opacity-100 rotate-0' : 
            animationState === 'success' ? 'scale-100 opacity-100 rotate-0' : 
            animationState === 'celebration' ? 'scale-110 opacity-100 rotate-0' :
            'scale-95 opacity-0 rotate-12'}
        `}
      >
        {/* Background Card */}
        <div className="bg-gradient-to-br from-white via-green-50 to-green-100 rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full border-2 border-green-200 relative overflow-hidden">
          
          {/* Animated Background Particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-2 h-2 rounded-full transition-all duration-1000 ${
                  animationState === 'success' || animationState === 'celebration' 
                    ? 'opacity-100 animate-bounce' 
                    : 'opacity-0'
                }`}
                style={{
                  background: `hsl(${120 + i * 30}, 70%, 60%)`,
                  left: `${10 + (i * 8)}%`,
                  top: `${15 + (i % 3) * 25}%`,
                  animationDelay: `${i * 150}ms`,
                  animationDuration: '2s'
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
                  'bg-green-400 scale-150 opacity-20 animate-pulse'
                }`}
              />
              
              {/* Main Icon Container */}
              <div 
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center relative transition-all duration-300 transform
                  ${animationState === 'adding' ? 'bg-green-100 scale-100 rotate-0' : 
                    animationState === 'success' ? 'bg-gradient-to-br from-green-500 to-green-600 scale-100 rotate-0' :
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
                ) : (
                  <ShoppingCart 
                    className="text-white animate-pulse" 
                    size={32} 
                  />
                )}

                {/* Sparkle Effects */}
                {(animationState === 'success' || animationState === 'celebration') && (
                  <>
                    <Sparkles 
                      className="absolute -top-1 -right-1 text-yellow-400 animate-ping" 
                      size={16} 
                    />
                    <Sparkles 
                      className="absolute -bottom-1 -left-1 text-yellow-500 animate-ping" 
                      size={12}
                      style={{ animationDelay: '200ms' }}
                    />
                    <Heart 
                      className="absolute top-0 left-0 text-pink-400 animate-bounce" 
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
                 '🛍️ Keep shopping  !'}
              </h3>
              
              {(animationState === 'success' || animationState === 'celebration') && (
                <p 
                  className={`text-sm font-medium text-green-600 transition-all duration-500 ${
                    animationState === 'celebration' ? 'animate-pulse' : ''
                  }`}
                >
                  {animationState === 'success' && productName ? productName : 'For More Offers'}
                </p>
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

          {/* Floating Elements */}
          {animationState === 'celebration' && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Floating Shopping Bags */}
              {[...Array(3)].map((_, i) => (
                <div
                  key={`bag-${i}`}
                  className="absolute text-green-500 animate-bounce opacity-60"
                  style={{
                    left: `${20 + i * 30}%`,
                    top: `${10 + i * 15}%`,
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '1.5s'
                  }}
                >
                  🛍️
                </div>
              ))}
              
              {/* Floating Hearts */}
              {[...Array(4)].map((_, i) => (
                <div
                  key={`heart-${i}`}
                  className="absolute text-pink-400 animate-pulse opacity-70"
                  style={{
                    right: `${10 + i * 20}%`,
                    top: `${20 + i * 10}%`,
                    animationDelay: `${i * 300}ms`,
                    fontSize: '12px'
                  }}
                >
                  💖
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Screen Flash Effect */}
      {animationState === 'success' && (
        <div className="fixed inset-0 bg-green-400 opacity-10 animate-ping pointer-events-none" />
      )}
    </div>
  );
};

export default CartAnimation;
