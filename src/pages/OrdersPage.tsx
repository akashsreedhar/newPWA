import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, RefreshCw, AlertTriangle, XCircle } from 'lucide-react';
import { OrderStatusTracker } from '../components/OrderStatusTracker';
import { useLanguage } from '../contexts/LanguageContext';
import { useCart } from '../contexts/CartContext';
import { useAddresses } from '../hooks/useAddresses';
import { db } from '../firebase.ts';
import { collection, query, where, orderBy, onSnapshot, getDocs, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { telegramRateLimit } from '../services/TelegramRateLimit';

interface OrdersPageProps {
  userId?: string | null;
  onNavigateToCart?: () => void;
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  outOfStock?: boolean;
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
  statusHistory?: { status: string; timestamp: { seconds: number; nanoseconds?: number } }[];
  items: OrderItem[];
  total: number;
  originalTotal?: number;
  address?: {
    label: string;
    details: string;
    phone?: string;
  };
  message?: string | null;
  user: string;
  customerResponse?: string;
  cancelledByCustomer?: boolean;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ userId, onNavigateToCart }) => {
  const { t } = useLanguage();
  const { reorderItems } = useCart();
  const { selectAddress } = useAddresses(userId);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ [orderId: string]: boolean }>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "orders"),
      where("user", "==", userId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      }) as OrderData[];
      setOrders(fetchedOrders);
      setLoading(false);
    }, (err) => {
      setError('Failed to load orders. Please try again.');
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  // Monitor order status changes for rate limiting
  useEffect(() => {
    if (!userId) return;
    
    const processOrderStatuses = (orders: OrderData[]) => {
      orders.forEach(order => {
        // If order is in a terminal state, update rate limiting
        if (['delivered', 'completed', 'cancelled'].includes(order.status)) {
          telegramRateLimit.recordOrderCompletion(order.id);
        }
      });
    };
    
    // Process initial order data
    if (orders.length > 0) {
      processOrderStatuses(orders);
    }
  }, [orders, userId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="text-orange-500" size={16} />;
      case 'accepted':
        return <CheckCircle className="text-blue-500" size={16} />;
      case 'ready':
        return <CheckCircle className="text-purple-500" size={16} />;
      case 'out_for_delivery':
        return <Clock className="text-orange-500" size={16} />;
      case 'delivered':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'pending_customer_action':
        return <AlertTriangle className="text-yellow-500" size={16} />;
      case 'cancelled':
        return <XCircle className="text-red-500" size={16} />;
      default:
        return <Clock className="text-gray-500" size={16} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Placed';
      case 'accepted':
        return 'Confirmed';
      case 'ready':
        return 'Ready';
      case 'out_for_delivery':
        return 'Out for Delivery';
      case 'delivered':
        return 'Delivered';
      case 'pending_customer_action':
        return 'Action Required';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'ready':
        return 'bg-purple-100 text-purple-800';
      case 'out_for_delivery':
        return 'bg-orange-100 text-orange-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'pending_customer_action':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
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
    return 'Unknown date';
  };

  const handleReorder = async (order: OrderData) => {
    try {
      setReorderingOrderId(order.id);
      
      // Check rate limits before allowing reorder
      const canPlaceOrder = await telegramRateLimit.canPlaceOrder();
      if (!canPlaceOrder.allowed) {
        alert(canPlaceOrder.reason || 'Cannot place order at this time. Please try again later.');
        setReorderingOrderId(null);
        return;
      }
      
      const cartItems = [];
      for (const orderItem of order.items) {
        try {
          const productQuery = query(
            collection(db, "products"),
            where("name", "==", orderItem.name)
          );
          const productSnapshot = await getDocs(productQuery);
          if (!productSnapshot.empty) {
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
              imageUrl: productData.imageUrl || productData.image || '',
              mrp: productData.mrp || orderItem.price,
              sellingPrice: productData.sellingPrice || orderItem.price
            });
          } else {
            cartItems.push({
              id: orderItem.id,
              name: orderItem.name,
              price: orderItem.price,
              quantity: orderItem.quantity,
              malayalamName: '',
              manglishName: '',
              unit: 'piece',
              image: '',
              imageUrl: '',
              mrp: orderItem.price,
              sellingPrice: orderItem.price
            });
          }
        } catch (productError) {
          cartItems.push({
            id: orderItem.id,
            name: orderItem.name,
            price: orderItem.price,
            quantity: orderItem.quantity,
            malayalamName: '',
            manglishName: '',
            unit: 'piece',
            image: '',
            imageUrl: '',
            mrp: orderItem.price,
            sellingPrice: orderItem.price
          });
        }
      }
      reorderItems(cartItems);
      if (order.address && selectAddress) {
        const adaptedAddress = {
          id: `order_addr_${Date.now()}`,
          label: order.address.label,
          details: order.address.details,
          phone: order.address.phone || '',
          address: order.address.details,
          isDefault: false
        };
        selectAddress(adaptedAddress);
      }
      if (onNavigateToCart) {
        onNavigateToCart();
      }
    } catch (error) {
      // Optionally handle error
    } finally {
      setReorderingOrderId(null);
    }
  };

  // Accept/Cancel handlers for out-of-stock orders
  const handleCustomerAction = async (orderId: string, action: 'accept' | 'cancel') => {
    setActionLoading(orderId + action);
    try {
      const orderRef = doc(db, "orders", orderId);
      if (action === 'accept') {
        await updateDoc(orderRef, {
          status: 'accepted',
          customerResponse: 'accepted',
          customerResponseAt: serverTimestamp()
        });
      } else {
        await updateDoc(orderRef, {
          status: 'cancelled',
          customerResponse: 'cancelled',
          cancelledByCustomer: true,
          cancellationReason: 'Cancelled by customer',
          customerResponseAt: serverTimestamp()
        });
        
        // Record order completion for cancelled orders
        if (userId) {
          await telegramRateLimit.recordOrderCompletion(orderId);
        }
      }

      // --- Add orderLogs entry for customer response ---
      const logRef = collection(db, "orders", orderId, "orderLogs");
      await addDoc(logRef, {
        action: 'customer_response',
        response: action === 'accept' ? 'accepted' : 'cancelled',
        timestamp: serverTimestamp()
      });

    } catch (err) {
      console.error("Order update failed:", err);
      alert("Failed to update order. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // New function to handle customer cancellation of pending orders
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    
    setActionLoading(orderId + 'cancel');
    try {
      const orderRef = doc(db, "orders", orderId);
      
      // Update order status
      await updateDoc(orderRef, {
        status: 'cancelled',
        customerResponse: 'cancelled',
        cancelledByCustomer: true,
        cancellationReason: 'Cancelled by customer',
        customerResponseAt: serverTimestamp()
      });
      
      // Add log entry
      const logRef = collection(db, "orders", orderId, "orderLogs");
      await addDoc(logRef, {
        action: 'customer_cancellation',
        response: 'cancelled',
        timestamp: serverTimestamp()
      });
      
      // Grant exemption from rate limiting
      if (userId) {
        await telegramRateLimit.grantCancellationExemption(orderId);
        await telegramRateLimit.recordOrderCompletion(orderId);
      }
      
      // Optional: Show success message
      alert("Your order has been cancelled successfully. You can place a new order immediately.");
      
    } catch (err) {
      console.error("Order cancellation failed:", err);
      alert("Failed to cancel order. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // Check if an order can be cancelled by the customer
  const canCancel = (order: OrderData) => {
    return ['pending', 'accepted'].includes(order.status);
  };

  // Helper to show out-of-stock details
  const renderOutOfStockDetails = (order: OrderData, showActions: boolean) => {
    const availableItems = order.items.filter(i => !i.outOfStock);
    const outOfStockItems = order.items.filter(i => i.outOfStock);
    return (
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="text-yellow-500" size={18} />
          <span className="text-yellow-800 font-semibold text-sm">
            Some items in your order are out of stock!
          </span>
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-1">Available Items:</div>
          <div className="space-y-1">
            {availableItems.map((item, idx) => (
              <div key={idx} className="text-xs text-gray-700 flex justify-between">
                <span>{item.quantity}x {item.name}</span>
                <span>₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-1">Out of Stock:</div>
          <div className="space-y-1">
            {outOfStockItems.map((item, idx) => (
              <div key={idx} className="text-xs text-red-600 flex justify-between">
                <span>{item.quantity}x {item.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-2 flex flex-col sm:flex-row gap-2 sm:gap-4">
          <div className="text-xs text-gray-500">
            <span>Original Total: </span>
            <span className="font-semibold text-gray-700">₹{order.originalTotal?.toFixed(2) ?? order.total.toFixed(2)}</span>
          </div>
          <div className="text-xs text-gray-500">
            <span>New Total: </span>
            <span className="font-semibold text-gray-700">₹{order.total.toFixed(2)}</span>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleCustomerAction(order.id, 'accept')}
              disabled={actionLoading === order.id + 'accept'}
              className={`px-4 py-2 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition ${
                actionLoading === order.id + 'accept' ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {actionLoading === order.id + 'accept' ? 'Accepting...' : 'Accept'}
            </button>
            <button
              onClick={() => handleCustomerAction(order.id, 'cancel')}
              disabled={actionLoading === order.id + 'cancel'}
              className={`px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition ${
                actionLoading === order.id + 'cancel' ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {actionLoading === order.id + 'cancel' ? 'Cancelling...' : 'Cancel Order'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen pb-20 sm:pb-24">
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
          <>
            {orders.map(order => {
              // Special handling for cancelled and pending_customer_action
              const isActive = order.status !== "delivered";
              const isPendingCustomerAction = order.status === "pending_customer_action";
              const isCancelled = order.status === "cancelled";
              const wasOutOfStock = !!order.items.find(i => i.outOfStock);

              // If cancelled or pending_customer_action, show full details
              if (isPendingCustomerAction || isCancelled) {
                return (
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
                        <span className="hidden sm:inline">{getStatusLabel(order.status)}</span>
                      </div>
                    </div>
                    <OrderStatusTracker status={order.status} statusHistory={order.statusHistory} />
                    {wasOutOfStock && (
                      renderOutOfStockDetails(
                        order,
                        isPendingCustomerAction && !order.customerResponse
                      )
                    )}
                    {isCancelled && (
                      <div className="mb-3 flex items-center gap-2">
                        <XCircle className="text-red-500" size={18} />
                        <span className="text-red-700 font-semibold text-sm">
                          Order cancelled {order.cancelledByCustomer ? 'by you' : 'by staff'}.
                        </span>
                      </div>
                    )}
                    {isPendingCustomerAction && order.customerResponse === 'accepted' && (
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle className="text-green-500" size={18} />
                        <span className="text-green-700 font-semibold text-sm">
                          You accepted the available items. Your order will be processed.
                        </span>
                      </div>
                    )}
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-2">{order.items.length} item(s)</p>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className={`text-xs flex justify-between ${item.outOfStock ? 'text-red-600' : 'text-gray-600'}`}>
                            <span>{item.quantity}x {item.name}</span>
                            <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {order.address && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-1">Delivery Address:</p>
                        <p className="text-xs text-gray-600">{order.address.label} - {order.address.details}</p>
                      </div>
                    )}
                    {order.message && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-1">Special Instructions:</p>
                        <p className="text-xs text-gray-600">{order.message}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-base sm:text-lg font-semibold text-gray-800">₹{order.total.toFixed(2)}</span>
                        {order.originalTotal && order.originalTotal !== order.total && (
                          <span className="ml-2 text-xs text-gray-500 line-through">₹{order.originalTotal.toFixed(2)}</span>
                        )}
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
                );
              }

              // Normal active/delivered order cards
              if (isActive) {
                return (
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
                        <span className="hidden sm:inline">{getStatusLabel(order.status)}</span>
                      </div>
                    </div>
                    <OrderStatusTracker status={order.status} statusHistory={order.statusHistory} />
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
                    {order.address && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-1">Delivery Address:</p>
                        <p className="text-xs text-gray-600">{order.address.label} - {order.address.details}</p>
                      </div>
                    )}
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
                      <div className="flex items-center gap-2">
                        {canCancel(order) && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={actionLoading === order.id + 'cancel'}
                            className={`px-3 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition ${
                              actionLoading === order.id + 'cancel' ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                          >
                            {actionLoading === order.id + 'cancel' ? 'Cancelling...' : 'Cancel Order'}
                          </button>
                        )}
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
                  </div>
                );
              } else {
                // Delivered order: show summary with expand/collapse
                const isOpen = expanded[order.id] || false;
                return (
                  <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 mb-2">
                    <button
                      className="w-full flex items-center justify-between p-3 sm:p-4 focus:outline-none hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(prev => ({ ...prev, [order.id]: !isOpen }))}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="text-green-500" size={18} />
                        <span className="font-semibold text-gray-800 text-sm sm:text-base">
                          Order #{order.orderNumber || order.id.slice(-6)}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">{formatDate(order)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-700 bg-green-50 rounded px-2 py-1">Delivered</span>
                        <span className="text-gray-400 text-sm">{isOpen ? '−' : '+'}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 sm:px-4">
                        <OrderStatusTracker status={order.status} statusHistory={order.statusHistory} />
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
                        {order.address && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-1">Delivery Address:</p>
                            <p className="text-xs text-gray-600">{order.address.label} - {order.address.details}</p>
                          </div>
                        )}
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
                    )}
                  </div>
                );
              }
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default OrdersPage;