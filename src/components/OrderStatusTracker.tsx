import React from "react";
import { CheckCircle, Clock, AlertTriangle, XCircle } from "lucide-react";

// Show all statuses to customer (including 'pending')
const STATUS_STEPS = [
  { key: "pending", label: "Placed" },
  { key: "accepted", label: "Confirmed" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

type StatusKey = "pending" | "accepted" | "ready" | "out_for_delivery" | "delivered";
const statusOrder = STATUS_STEPS.map(s => s.key);

function getCurrentStep(status: StatusKey | string): number {
  const idx = statusOrder.indexOf(status);
  return idx === -1 ? 0 : idx;
}

interface StatusHistoryEntry {
  status: StatusKey | string;
  timestamp: { seconds: number; nanoseconds?: number };
}

interface OrderStatusTrackerProps {
  status: StatusKey | string;
  statusHistory?: StatusHistoryEntry[];
}

export const OrderStatusTracker: React.FC<OrderStatusTrackerProps> = ({ status, statusHistory }) => {
  // Map statusHistory to a lookup for timestamps, only for customer-visible statuses
  const statusTimestamps: Record<string, { seconds: number; nanoseconds?: number }> = {};
  let lastVisibleStatus: StatusKey = statusOrder[0] as StatusKey;
  if (Array.isArray(statusHistory)) {
    statusHistory.forEach((entry) => {
      if (statusOrder.includes(entry.status)) {
        statusTimestamps[entry.status] = entry.timestamp;
        lastVisibleStatus = entry.status as StatusKey;
      }
    });
  }

  // Treat both 'delivered' and 'completed' as delivered for customer
  // Add support for pending_customer_action and cancelled
  let effectiveStatus: StatusKey;
  let specialStatus: "pending_customer_action" | "cancelled" | null = null;
  if (status === 'completed' || status === 'payment_pending') {
    effectiveStatus = 'delivered';
  } else if (status === 'pending_customer_action') {
    effectiveStatus = lastVisibleStatus;
    specialStatus = "pending_customer_action";
  } else if (status === 'cancelled') {
    effectiveStatus = lastVisibleStatus;
    specialStatus = "cancelled";
  } else if (statusOrder.includes(status)) {
    effectiveStatus = status as StatusKey;
  } else {
    effectiveStatus = lastVisibleStatus;
  }
  const currentStep = getCurrentStep(effectiveStatus);

  // Animation helpers
  const getPulseClass = (isCurrent: boolean) =>
    isCurrent ? "animate-pulse shadow-lg shadow-teal-200" : "";

  // Icon helpers
  const getIcon = (stepKey: string, isCompleted: boolean, isCurrent: boolean) => {
    // Always show green checkmark for delivered/completed as final step
    if (stepKey === "delivered" && (isCompleted || isCurrent)) {
      return <CheckCircle size={24} className="text-green-500 transition-all duration-300" />;
    }
    if (isCurrent && stepKey === "out_for_delivery") return <Clock size={24} className="animate-spin-slow" />;
    if (isCompleted || isCurrent) return <CheckCircle size={24} className="transition-all duration-300" />;
    return <span className="font-bold text-base">•</span>;
  };

  // Friendly status notes for each step (no 'pending')
  const statusNotes: Record<StatusKey, string> = {
    accepted: "We confirmed your order! We'll start packaging soon.",
    ready: "Your order is packed and ready for delivery.",
    out_for_delivery: "Your order is on the way! Our delivery agent will reach you soon.",
    delivered: "Order delivered! Thank you for shopping with us.",
    pending: "We are reviewing your order. Please wait for confirmation.", // not shown
  };

  // Special notes for out-of-stock and cancelled
  const specialStatusNotes: Record<string, { icon: React.ReactNode; text: string; color: string }> = {
    pending_customer_action: {
      icon: <AlertTriangle className="inline mr-1 text-yellow-500" size={18} />,
      text: "Some items are out of stock. Please review and accept/cancel.",
      color: "text-yellow-800 bg-yellow-50"
    },
    cancelled: {
      icon: <XCircle className="inline mr-1 text-red-500" size={18} />,
      text: "Order cancelled.",
      color: "text-red-800 bg-red-50"
    }
  };

  return (
    <>
      <div className="flex flex-row items-start justify-between w-full px-1 py-3 gap-2 sm:gap-4">
        {STATUS_STEPS.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          const timestamp = statusTimestamps[step.key];
          return (
            <div
              key={step.key}
              className={`flex flex-col items-center flex-1 ${isCurrent ? "z-10" : "z-0"}`}
            >
              <div
                className={`flex items-center justify-center rounded-full w-10 h-10 mb-1
                  ${isCompleted ? "bg-teal-600 text-white" : isCurrent ? "bg-white text-teal-700 border-2 border-teal-600" : "bg-gray-100 text-gray-400 border border-gray-300"}
                  ${getPulseClass(isCurrent)}
                  transition-all duration-300 shadow-md`}
                style={{ boxShadow: isCurrent ? "0 0 0 4px #14b8a622" : undefined }}
              >
                {getIcon(step.key, isCompleted, isCurrent)}
              </div>
              <span className={`text-xs font-medium text-center leading-tight ${isCompleted || isCurrent ? "text-teal-700" : "text-gray-400"}`}>{step.label}</span>
              {timestamp && (
                <span className="text-[10px] text-gray-400 mt-0.5 text-center">
                  {new Date(timestamp.seconds * 1000).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="w-full text-center mt-2 mb-1">
        {specialStatus ? (
          <span className={`inline-block text-sm sm:text-base font-medium rounded-lg px-3 py-2 shadow-sm ${specialStatusNotes[specialStatus].color}`}>
            {specialStatusNotes[specialStatus].icon}
            {specialStatusNotes[specialStatus].text}
          </span>
        ) : (
          <span className="inline-block text-sm sm:text-base font-medium text-teal-700 bg-teal-50 rounded-lg px-3 py-2 shadow-sm">
            {statusNotes[effectiveStatus as StatusKey]}
          </span>
        )}
      </div>
    </>
  );
};