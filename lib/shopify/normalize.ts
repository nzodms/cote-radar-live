import type { Currency, Order } from "@/types";
import { uid } from "@/lib/utils";
import type { ShopifyOrderPayload } from "./types";

const COUNTRY_CODE: Record<string, string> = {
  France: "FR",
  Belgique: "BE",
  Belgium: "BE",
  Suisse: "CH",
  Switzerland: "CH",
  Espagne: "ES",
  Spain: "ES",
  Allemagne: "DE",
  Germany: "DE",
  Italie: "IT",
  Italy: "IT",
  "United Kingdom": "GB",
  "United States": "US",
};

/** Best-effort split of a Shopify variant title into size/color. */
function splitVariant(variantTitle?: string | null): {
  variant: string;
  size: string;
  color: string;
} {
  if (!variantTitle) return { variant: "Standard", size: "", color: "" };
  const parts = variantTitle.split("/").map((p) => p.trim());
  return {
    variant: variantTitle,
    size: parts[0] ?? "",
    color: parts[1] ?? "",
  };
}

/**
 * Adapter: Shopify order payload → internal Order model.
 * Uses the first line item as the sourced product (V1 assumption).
 */
export function normalizeShopifyOrder(payload: ShopifyOrderPayload): Order {
  const line = payload.line_items?.[0];
  const salePrice = line ? parseFloat(line.price) : parseFloat(payload.total_price) || 0;
  const quantity = line?.quantity ?? 1;
  const { variant, size, color } = splitVariant(line?.variant_title);

  const countryName =
    payload.shipping_address?.country || payload.billing_address?.country || "France";
  const countryCode =
    payload.shipping_address?.country_code ||
    COUNTRY_CODE[countryName] ||
    "FR";

  const customerName = [payload.customer?.first_name, payload.customer?.last_name]
    .filter(Boolean)
    .join(" ");

  // Heuristic target cost: keep ~55% margin by default.
  const targetMaxCost = Math.round(salePrice * 0.42 * 100) / 100;

  return {
    id: uid("ord"),
    shopifyOrderNumber: payload.name || `#${payload.order_number}`,
    productName: line?.title ?? "Produit",
    productImage:
      line?.image?.src ||
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&q=80",
    variant,
    size,
    color,
    quantity,
    country: countryName,
    countryCode,
    customerName: customerName || "Client Shopify",
    salePrice,
    currency: (payload.currency as Currency) || "EUR",
    targetMaxCost,
    status: "awaiting_reply",
    selectedSupplierId: null,
    recommendedSupplierId: null,
    paymentStatus: "pending",
    trackingStatus: "none",
    trackingNumber: null,
    paymentDate: null,
    expectedTrackingDate: null,
    createdAt: payload.created_at || new Date().toISOString(),
  };
}
