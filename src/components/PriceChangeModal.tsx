import React from 'react';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface PriceChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  priceChanges: {
    itemId: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
  }[];
  cartTotal: number;
  newCartTotal: number;
}

const PriceChangeModal: React.FC<PriceChangeModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  priceChanges,
  cartTotal,
  newCartTotal
}) => {
  if (!isOpen) return null;

  const totalDifference = newCartTotal - cartTotal;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Price Update Notice</h3>
              <p className="text-sm text-gray-600">Some prices have changed since you added items to cart</p>
            </div>
          </div>
        </div>

        {/* Price Changes List */}
        <div className="p-6 max-h-64 overflow-y-auto">
          <div className="space-y-3">
            {priceChanges.map((change) => {
              const priceDiff = change.newPrice - change.oldPrice;
              const isIncrease = priceDiff > 0;
              
              return (
                <div key={change.itemId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{change.itemName}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-sm text-gray-500 line-through">₹{change.oldPrice}</span>
                      <span className="text-sm font-medium text-gray-800">₹{change.newPrice}</span>
                    </div>
                  </div>
                  <div className={`flex items-center space-x-1 ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                    {isIncrease ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">
                      {isIncrease ? '+' : ''}₹{priceDiff.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total Impact */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Impact:</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500 line-through">₹{cartTotal.toFixed(2)}</span>
              <span className="text-lg font-semibold text-gray-800">₹{newCartTotal.toFixed(2)}</span>
              <span className={`text-sm font-medium ${totalDifference >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                ({totalDifference >= 0 ? '+' : ''}₹{totalDifference.toFixed(2)})
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            Cancel Order
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors"
          >
            Accept & Continue
          </button>
        </div>

        {/* Footer Note */}
        <div className="px-6 pb-6">
          <p className="text-xs text-gray-500 text-center">
            Prices are updated in real-time. By continuing, you agree to pay the updated prices.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PriceChangeModal;
