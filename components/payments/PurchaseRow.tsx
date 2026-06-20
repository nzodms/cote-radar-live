"use client";

import { useRouter } from "next/navigation";
import {
  CreditCard,
  Truck,
  PackageCheck,
  MessageSquare,
  CalendarClock,
  AlertTriangle,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ProductImage } from "@/components/ui/product-image";
import { PaymentStatusBadge, OrderStatusBadge } from "@/components/ui/status-badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import type { Order, Purchase, Supplier } from "@/types";

export function PurchaseRow({
  order,
  supplier,
  purchase,
  onAddTracking,
}: {
  order: Order;
  supplier: Supplier | undefined;
  purchase: Purchase;
  onAddTracking: (order: Order) => void;
}) {
  const router = useRouter();
  const markPaid = useStore((s) => s.markPaid);
  const requestTracking = useStore((s) => s.requestTracking);
  const conversations = useStore((s) => s.conversations);

  const lateDays = purchase.isLate
    ? Math.max(1, Math.floor((Date.now() - new Date(purchase.expectedTrackingDate!).getTime()) / 86400000))
    : 0;

  const handlePaid = () => {
    markPaid(order.id);
    toast("Paiement enregistré", { description: order.shopifyOrderNumber, tone: "success" });
  };

  const handleRequestTracking = () => {
    requestTracking(order.id);
    toast("Demande de suivi envoyée", { description: "Un message a été ajouté à la messagerie.", tone: "success" });
  };

  const goToConversation = () => {
    const conv = conversations.find((c) => c.orderId === order.id && c.supplierId === order.selectedSupplierId);
    router.push(conv ? `/inbox?c=${conv.id}` : "/inbox");
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card transition-all hover:shadow-elevated sm:flex-row sm:items-center",
        purchase.isLate ? "border-danger/30" : "border-border/80",
      )}
    >
      <ProductImage src={order.productImage} alt={order.productName} className="h-16 w-16 shrink-0" rounded="rounded-xl" />

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{order.shopifyOrderNumber}</span>
          <OrderStatusBadge status={order.status} />
          {purchase.isLate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-2xs font-semibold text-danger">
              <AlertTriangle className="h-3 w-3" /> Retard {lateDays} j
            </span>
          )}
        </div>
        <div className="truncate text-sm font-medium">{order.productName}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {supplier && <Avatar initials={supplier.initials} seed={supplier.id} size="sm" className="!h-4 !w-4 text-[8px]" />}
          {supplier?.name ?? "—"}
        </div>
      </div>

      {/* Dates / tracking */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs sm:w-56">
        <Meta icon={CreditCard} label="Paiement">
          <PaymentStatusBadge status={purchase.paymentStatus} className="text-2xs" />
        </Meta>
        <Meta icon={CalendarClock} label="Suivi prévu">
          <span className={cn(purchase.isLate && "font-semibold text-danger")}>
            {formatDate(purchase.expectedTrackingDate)}
          </span>
        </Meta>
        {purchase.paymentDate && (
          <Meta icon={CreditCard} label="Payé le">
            <span>{formatDate(purchase.paymentDate)}</span>
          </Meta>
        )}
        {purchase.trackingNumber && (
          <Meta icon={Hash} label="Suivi">
            <span className="font-mono text-2xs">{purchase.trackingNumber}</span>
          </Meta>
        )}
      </div>

      {/* Amount */}
      <div className="text-right sm:w-24">
        <div className="text-2xs uppercase tracking-wider text-muted-foreground">Montant</div>
        <div className="text-base font-semibold tabular-nums">{formatCurrency(purchase.amount, purchase.currency)}</div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-wrap gap-2 sm:w-40 sm:flex-col">
        {purchase.paymentStatus === "to_pay" && (
          <Button size="sm" onClick={handlePaid} className="flex-1">
            <CreditCard className="h-3.5 w-3.5" /> Marquer payé
          </Button>
        )}
        {(order.status === "awaiting_tracking" || order.status === "delayed" || order.status === "incident") && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onAddTracking(order)} className="flex-1">
              <Truck className="h-3.5 w-3.5" /> Ajouter suivi
            </Button>
            <Button size="sm" variant="outline" onClick={handleRequestTracking} className="flex-1">
              <PackageCheck className="h-3.5 w-3.5" /> Demander suivi
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={goToConversation} className="flex-1">
          <MessageSquare className="h-3.5 w-3.5" /> Conversation
        </Button>
      </div>
    </div>
  );
}

function Meta({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CreditCard;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="text-xs">{children}</span>
    </div>
  );
}
