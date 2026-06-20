/**
 * Minimal subset of the Shopify "orders/create" webhook payload that
 * SupplierPilot consumes. The real adapter can extend these freely.
 */
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
  customer?: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
}
