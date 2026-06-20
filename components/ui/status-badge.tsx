import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
  STOCK_STATUS_META,
  TRACKING_STATUS_META,
} from "@/lib/labels";
import type { OrderStatus, PaymentStatus, StockStatus, TrackingStatus } from "@/types";

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export function TrackingStatusBadge({ status, className }: { status: TrackingStatus; className?: string }) {
  const meta = TRACKING_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  const meta = STOCK_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}
