/**
 * Shopify adapter types.
 *  - REST-style payload  → used by the orders/create webhook
 *  - GraphQL Admin types → used by the sync endpoints
 */

// --------------------------------------------------------------------------
// REST webhook payload (orders/create)
// --------------------------------------------------------------------------
export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  variant_title?: string | null;
  sku?: string | null;
  vendor?: string | null;
  properties?: { name: string; value: string }[];
  image?: { src: string } | null;
}

export interface ShopifyAddress {
  country?: string;
  country_code?: string;
  province?: string;
  city?: string;
}

export interface ShopifyCustomer {
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface ShopifyOrderPayload {
  id: number;
  order_number: number;
  name: string; // e.g. "#1048"
  currency: string;
  total_price: string;
  created_at: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  tags?: string;
  note?: string | null;
  customer?: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
}

// --------------------------------------------------------------------------
// GraphQL Admin API (partial response shapes)
// --------------------------------------------------------------------------
export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}
export interface ShopifyMoneySet {
  shopMoney: ShopifyMoney;
}
export interface ShopifyImage {
  url: string;
  altText?: string | null;
}
export interface ShopifySelectedOption {
  name: string;
  value: string;
}
export interface ShopifyGraphVariant {
  id: string;
  title: string;
  sku?: string | null;
  selectedOptions?: ShopifySelectedOption[];
  image?: ShopifyImage | null;
  product?: {
    id: string;
    title: string;
    featuredImage?: ShopifyImage | null;
  } | null;
}
export interface ShopifyGraphLineItem {
  id: string;
  title: string;
  quantity: number;
  originalUnitPriceSet?: ShopifyMoneySet | null;
  image?: ShopifyImage | null;
  variant?: ShopifyGraphVariant | null;
}
export interface ShopifyGraphAddress {
  country?: string | null;
  countryCodeV2?: string | null;
  province?: string | null;
  city?: string | null;
}
export interface ShopifyGraphOrder {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  currencyCode?: string | null;
  totalPriceSet?: ShopifyMoneySet | null;
  note?: string | null;
  tags?: string[];
  customer?: { displayName?: string | null } | null;
  shippingAddress?: ShopifyGraphAddress | null;
  lineItems: { edges: { node: ShopifyGraphLineItem }[] };
}
export interface ShopifyGraphProduct {
  id: string;
  title: string;
  status?: string | null;
  totalInventory?: number | null;
  featuredImage?: ShopifyImage | null;
  variants: { edges: { node: { id: string; title: string; sku?: string | null; price?: string | null } }[] };
}

// --------------------------------------------------------------------------
// SupplierPilot-facing shapes
// --------------------------------------------------------------------------
export interface ShopifyConnectionStatus {
  configured: boolean;
  ok: boolean;
  shop?: string;
  shopName?: string;
  apiVersion: string;
  error?: string;
}

export interface ShopifyProductSummary {
  id: string;
  title: string;
  image: string | null;
  variants: number;
  status: string;
  inventory: number | null;
}
