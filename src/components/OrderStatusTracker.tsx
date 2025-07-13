import React from "react";
import { CheckCircle, Clock } from "lucide-react";

const STATUS_STEPS = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

const statusOrder = STATUS_STEPS.map(s => s.key);


type StatusKey = "placed" | "confirmed" | "packed" | "out_for_delivery" | "delivered";

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
  const currentStep = getCurrentStep(status);

  // Map statusHistory to a lookup for timestamps
  const statusTimestamps: Record<string, { seconds: number; nanoseconds?: number }> = {};
  if (Array.isArray(statusHistory)) {
    statusHistory.forEach((entry) => {
      statusTimestamps[entry.status] = entry.timestamp;
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      {STATUS_STEPS.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;
        const isLast = idx === STATUS_STEPS.length - 1;
        const timestamp = statusTimestamps[step.key];
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={`rounded-full w-7 h-7 flex items-center justify-center
                  ${isCompleted || isCurrent ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-400"}
                  border-2 ${isCurrent ? "border-teal-700" : "border-transparent"}
                `}
              >
                {isCompleted || isCurrent ? (
                  step.key === "out_for_delivery" && isCurrent
                    ? <Clock size={18} />
                    : <CheckCircle size={18} />
                ) : (
                  <span className="font-bold">{idx + 1}</span>
                )}
              </div>
              <span className={`text-xs mt-1 ${isCompleted || isCurrent ? "text-teal-700" : "text-gray-400"}`}>
                {step.label}
              </span>
              {timestamp && (
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(timestamp.seconds * 1000).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              )}
            </div>
            {!isLast && (
              <div className={`flex-1 h-1 ${idx < currentStep ? "bg-teal-600" : "bg-gray-200"}`}></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
