import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { useAddresses } from '../hooks/useAddresses';
import { db } from '../firebase.ts';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

interface OrdersPageProps {
  userId?: string | null;
  onNavigateToCart?: () => void;
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface OrderData {
  id: string;
  orderNumber?: string;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  status: string;
  items: OrderItem[];
  total: number;
  address?: {
    label: string;
    details: string;
    phone?: string;
  };
  message?: string | null;
  user: string;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ userId, onNavigateToCart }) => {
  const { t } = useLanguage();
  const { reorderItems } = useCart();
  const { selectAddress } = useAddresses(userId);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);

  useEffect(() => {
    console.log('🆔 OrdersPage received userId:', userId, typeof userId);
    
    if (!userId) {
      console.log('⚠️ No userId provided, showing empty state');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // Query Firestore for orders belonging to this user
    const fetchOrders = async () => {
      try {
        console.log('🔍 Fetching orders for userId:', userId);
        
        const q = query(
          collection(db, "orders"),
          where("user", "==", userId),
          orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(q);
        console.log('📦 Found', snapshot.docs.length, 'orders');
        
        const fetchedOrders = snapshot.docs.map(doc => {
          const data = doc.data();
          console.log('📄 Order data:', { id: doc.id, ...data });
          return {
            id: doc.id,
            ...data
          };
        }) as OrderData[];
        
        setOrders(fetchedOrders);
      } catch (err) {
        console.error('❌ Error fetching orders:', err);
        setError('Failed to load orders. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [userId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="text-orange-500" size={16} />;
      case 'delivered':
        return <CheckCircle className="text-green-500" size={16} />;
      default:
        return <Clock className="text-gray-500" size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'bg-orange-100 text-orange-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (order: OrderData) => {
    if (order.createdAt?.toDate) {
      return order.createdAt.toDate().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    // Fallback for any other date format
    return 'Unknown date';
  };

  const handleReorder = async (order: OrderData) => {
    try {
      console.log('🔄 Starting reorder for order:', order.id);
      setReorderingOrderId(order.id);
      
      // 1. Fetch complete product details from Firestore for each item
      const cartItems = [];
      
      for (const orderItem of order.items) {
        try {
          // Try to fetch the complete product details
          const productQuery = query(
            collection(db, "products"),
            where("name", "==", orderItem.name)
          );
          
          const productSnapshot = await getDocs(productQuery);
          
          if (!productSnapshot.empty) {
            // Product found - use complete details
            const productData = productSnapshot.docs[0].data();
            cartItems.push({
              id: orderItem.id,
              name: orderItem.name,
              price: orderItem.price,
              quantity: orderItem.quantity,
              malayalamName: productData.malayalamName || '',
              manglishName: productData.manglishName || '',
              unit: productData.unit || 'piece',
              image: productData.image || '',
              imageUrl: productData.imageUrl || productData.image || ''
            });
          } else {
            // Product not found - use order data with defaults
            console.warn('⚠️ Product not found in database:', orderItem.name);
            cartItems.push({
              id: orderItem.id,
              name: orderItem.name,
              price: orderItem.price,
              quantity: orderItem.quantity,
              malayalamName: '',
              manglishName: '',
              unit: 'piece',
              image: '',
              imageUrl: ''
            });
          }
        } catch (productError) {
          console.error('❌ Error fetching product details for:', orderItem.name, productError);
          // Fallback to order data
          cartItems.push({
            id: orderItem.id,
            name: orderItem.name,
            price: orderItem.price,
            quantity: orderItem.quantity,
            malayalamName: '',
            manglishName: '',
            unit: 'piece',
            image: '',
            imageUrl: ''
          });
        }
      }
      
      console.log('📦 Prepared cart items with product details:', cartItems);
      
      // Add items to cart
      reorderItems(cartItems);
      
      // 2. Pre-select the delivery address if available
      if (order.address && selectAddress) {
        console.log('📍 Pre-selecting address:', order.address.label);
        // Adapt order address format to match the addresses hook format
        const adaptedAddress = {
          id: `order_addr_${Date.now()}`, // Temporary ID for this session
          label: order.address.label,
          details: order.address.details,
          phone: order.address.phone || '',
          address: order.address.details, // The actual address string
          isDefault: false // Don't set as default, just select for this session
        };
        selectAddress(adaptedAddress);
      }
      
      // 3. Navigate to cart page
      console.log('🚀 Navigating to cart page');
      if (onNavigateToCart) {
        onNavigateToCart();
      }
      
    } catch (error) {
      console.error('❌ Error during reorder:', error);
      // You could add a toast notification here if available
    } finally {
      setReorderingOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
        <div className="bg-white border-b border-gray-200 p-3 sm:p-4">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">{t('orders')}</h1>
        </div>
        <div className="p-3 sm:p-4 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your orders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
        <div className="bg-white border-b border-gray-200 p-3 sm:p-4">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">{t('orders')}</h1>
        </div>
        <div className="p-3 sm:p-4 flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
      <div className="bg-white border-b border-gray-200 p-3 sm:p-4">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-800">{t('orders')}</h1>
      </div>

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4">
              <Clock className="mx-auto h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
            <p className="text-gray-600">When you place your first order, it will appear here.</p>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
              <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-base">
                    Order #{order.orderNumber || order.id.slice(-6)}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600">{formatDate(order)}</p>
                </div>
                <div className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 sm:gap-2 ${getStatusColor(order.status)} flex-shrink-0`}>
                  {getStatusIcon(order.status)}
                  <span className="hidden sm:inline">{order.status}</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">{order.items.length} item(s)</p>
                <div className="space-y-1">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-xs text-gray-600 flex justify-between">
                      <span>{item.quantity}x {item.name}</span>
                      <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{order.items.length - 3} more items
                    </div>
                  )}
                </div>
              </div>

              {/* Address */}
              {order.address && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Delivery Address:</p>
                  <p className="text-xs text-gray-600">{order.address.label} - {order.address.details}</p>
                </div>
              )}

              {/* Message */}
              {order.message && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Special Instructions:</p>
                  <p className="text-xs text-gray-600">{order.message}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-base sm:text-lg font-semibold text-gray-800">₹{order.total.toFixed(2)}</span>
                </div>
                <button 
                  onClick={() => handleReorder(order)}
                  disabled={reorderingOrderId === order.id}
                  className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors flex-shrink-0 ${
                    reorderingOrderId === order.id 
                      ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {reorderingOrderId === order.id ? (
                    <>
                      <div className="animate-spin h-3 w-3 sm:h-4 sm:w-4 border-2 border-white border-t-transparent rounded-full" />
                      <span className="text-xs sm:text-sm font-medium">Loading...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} className="sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm font-medium">{t('reorder')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OrdersPage;