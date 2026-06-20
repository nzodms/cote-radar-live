/**
 * SupplierPilot — domain model.
 * Single source of truth for the demo state. Real Shopify / WhatsApp / Claude
 * adapters normalize their payloads into these shapes.
 */

export type Currency = "EUR" | "USD" | "GBP" | "CNY";

export type SupplierLanguage = "fr" | "en";

/** Canonical order lifecycle. Drives KPIs, status badges and board columns. */
export type OrderStatus =
  | "awaiting_reply" // demande envoyée, en attente fournisseur
  | "quoted" // au moins un devis reçu
  | "selected" // fournisseur sélectionné
  | "to_pay" // à payer
  | "paid" // payé
  | "awaiting_tracking" // payé, en attente du suivi
  | "shipped" // expédié
  | "delayed" // expédition en retard
  | "incident"; // incident détecté

export type PaymentStatus = "pending" | "to_pay" | "paid";

export type TrackingStatus =
  | "none"
  | "awaiting"
  | "shipped"
  | "delayed"
  | "delivered";

export type StockStatus = "confirmed" | "uncertain" | "out_of_stock" | "unknown";

export type SenderType = "merchant" | "supplier" | "system";

export type ConversationStatus =
  | "active"
  | "awaiting_reply"
  | "quote_received"
  | "selected"
  | "closed";

export interface Supplier {
  id: string;
  name: string;
  initials: string;
  country: string;
  countryCode: string;
  specialty: string;
  whatsappNumber: string;
  language: SupplierLanguage;
  reliabilityScore: number; // 0-100
  performance90d: number; // 0-100
  averageDelayDays: number;
  averageCost: number;
  totalOrders: number;
  totalPaid: number;
  incidents: number;
  tags: string[];
  notes: string;
  preferred: boolean;
  blocked: boolean;
  online: boolean;
  createdAt: string;
}

export interface SupplierQuote {
  id: string;
  orderId: string;
  supplierId: string;
  productCost: number;
  shippingCost: number;
  totalCost: number;
  currency: Currency;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  stockStatus: StockStatus;
  reliabilityScore: number; // snapshot at quote time
  performance90d: number;
  incidents: number;
  notes: string;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  type: "image" | "file";
  url: string;
  name: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  content: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  /** When a supplier reply has been parsed into a quote, the embedded card. */
  quote?: SupplierQuote;
  channel: "whatsapp" | "internal";
  status?: "sent" | "delivered" | "read";
}

export interface Conversation {
  id: string;
  supplierId: string;
  orderId: string;
  messages: Message[];
  unreadCount: number;
  status: ConversationStatus;
  lastMessageAt: string;
}

export interface Order {
  id: string;
  shopifyOrderNumber: string; // "#1048"
  productName: string;
  productImage: string;
  variant: string;
  size: string;
  color: string;
  quantity: number;
  country: string;
  countryCode: string;
  customerName: string;
  salePrice: number;
  currency: Currency;
  targetMaxCost: number;
  status: OrderStatus;
  selectedSupplierId: string | null;
  recommendedSupplierId: string | null;
  paymentStatus: PaymentStatus;
  trackingStatus: TrackingStatus;
  trackingNumber: string | null;
  paymentDate: string | null;
  expectedTrackingDate: string | null;
  createdAt: string;
}

/** Derived from an Order + its selected supplier/quote for the Payments board. */
export interface Purchase {
  id: string;
  orderId: string;
  supplierId: string;
  productName: string;
  productImage: string;
  shopifyOrderNumber: string;
  supplierName: string;
  amount: number;
  currency: Currency;
  paymentStatus: PaymentStatus;
  paymentDate: string | null;
  expectedTrackingDate: string | null;
  trackingNumber: string | null;
  status: OrderStatus;
  isLate: boolean;
}

export interface RecommendationWeights {
  price: number; // 0-100 sliders, normalized by the engine
  delay: number;
  reliability: number;
  stock: number;
  margin: number;
}

export interface AIRules {
  minimumMarginPercent: number;
  maximumDeliveryDays: number;
  manualValidationAbove: number;
  autoReminderHours: number;
  preferConfirmedStock: boolean;
  excludeReliabilityBelow: number;
  preferredSupplierIds: string[];
  blockedSupplierIds: string[];
  allowedCountries: string[]; // empty = all allowed
  weights: RecommendationWeights;
}

export interface SupplierScore {
  supplierId: string;
  quoteId: string;
  total: number; // 0-100 weighted score
  breakdown: {
    price: number;
    delay: number;
    reliability: number;
    stock: number;
    margin: number;
  };
  marginValue: number;
  marginPercent: number;
  eligible: boolean;
  preferredBonus: number;
  needsManualValidation: boolean;
  violations: string[];
  reasons: string[];
}

export interface RecommendationResult {
  orderId: string;
  recommendedSupplierId: string | null;
  scores: SupplierScore[]; // sorted: eligible desc, then ineligible
  explanation: string;
}

export type ActivityType =
  | "quote"
  | "message"
  | "payment"
  | "shipment"
  | "selection"
  | "incident"
  | "system";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  orderId?: string;
  supplierId?: string;
  timestamp: string;
}
