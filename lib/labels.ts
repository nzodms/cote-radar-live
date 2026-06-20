import type {
  OrderStatus,
  PaymentStatus,
  StockStatus,
  TrackingStatus,
  ActivityType,
} from "@/types";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** small dot color class for animated indicators */
  dot: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  awaiting_reply: { label: "En attente", tone: "neutral", dot: "bg-muted-foreground" },
  quoted: { label: "Devis reçu", tone: "info", dot: "bg-info" },
  selected: { label: "Sélectionné", tone: "primary", dot: "bg-primary" },
  to_pay: { label: "À payer", tone: "warning", dot: "bg-warning" },
  paid: { label: "Payé", tone: "success", dot: "bg-success" },
  awaiting_tracking: { label: "Attente suivi", tone: "info", dot: "bg-info" },
  shipped: { label: "Expédié", tone: "success", dot: "bg-success" },
  delayed: { label: "En retard", tone: "danger", dot: "bg-danger" },
  incident: { label: "Incident", tone: "danger", dot: "bg-danger" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: "Non dû", tone: "neutral", dot: "bg-muted-foreground" },
  to_pay: { label: "À payer", tone: "warning", dot: "bg-warning" },
  paid: { label: "Payé", tone: "success", dot: "bg-success" },
};

export const TRACKING_STATUS_META: Record<TrackingStatus, StatusMeta> = {
  none: { label: "—", tone: "neutral", dot: "bg-muted-foreground" },
  awaiting: { label: "Attente suivi", tone: "info", dot: "bg-info" },
  shipped: { label: "Expédié", tone: "success", dot: "bg-success" },
  delayed: { label: "En retard", tone: "danger", dot: "bg-danger" },
  delivered: { label: "Livré", tone: "success", dot: "bg-success" },
};

export const STOCK_STATUS_META: Record<StockStatus, StatusMeta> = {
  confirmed: { label: "Stock confirmé", tone: "success", dot: "bg-success" },
  uncertain: { label: "Stock incertain", tone: "warning", dot: "bg-warning" },
  out_of_stock: { label: "Rupture", tone: "danger", dot: "bg-danger" },
  unknown: { label: "Stock inconnu", tone: "neutral", dot: "bg-muted-foreground" },
};

export const ACTIVITY_META: Record<ActivityType, { tone: BadgeTone }> = {
  quote: { tone: "info" },
  message: { tone: "neutral" },
  payment: { tone: "warning" },
  shipment: { tone: "success" },
  selection: { tone: "primary" },
  incident: { tone: "danger" },
  system: { tone: "neutral" },
};

/** Order list tabs (Commandes page). */
export const ORDER_TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "all", label: "Tous", statuses: [] },
  { key: "awaiting_reply", label: "En attente", statuses: ["awaiting_reply"] },
  { key: "quoted", label: "Devis reçu", statuses: ["quoted"] },
  { key: "selected", label: "Sélectionné", statuses: ["selected"] },
  { key: "to_pay", label: "À payer", statuses: ["to_pay"] },
  { key: "shipped", label: "Expédié", statuses: ["shipped", "awaiting_tracking", "paid"] },
  { key: "incident", label: "Incident", statuses: ["incident", "delayed"] },
];
