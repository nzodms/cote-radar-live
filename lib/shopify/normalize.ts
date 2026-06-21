import type { Currency, Order } from "@/types";
import { uid } from "@/lib/utils";
import type {
  ShopifyGraphOrder,
  ShopifyGraphProduct,
  ShopifyOrderPayload,
  ShopifyProductSummary,
  ShopifySelectedOption,
} from "./types";

export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&q=80";

/** Configurable default cost target (≈ default 38% of sale price). */
export const DEFAULT_TARGET_COST_RATIO = (() => {
  const raw = Number(process.env.SUPPLIERPILOT_TARGET_COST_RATIO);
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.38;
})();

export function targetCostFor(salePrice: number): number {
  return Math.round(salePrice * DEFAULT_TARGET_COST_RATIO * 100) / 100;
}

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

function splitVariant(variantTitle?: string | null): { variant: string; size: string; color: string } {
  if (!variantTitle || variantTitle === "Default Title") return { variant: "Standard", size: "", color: "" };
  const parts = variantTitle.split("/").map((p) => p.trim());
  return { variant: variantTitle, size: parts[0] ?? "", color: parts[1] ?? "" };
}

/** Map Shopify selected options (size/color/finish/material…) to size + color. */
function sizeColorFromOptions(
  options: ShopifySelectedOption[] | undefined,
  variantTitle: string,
): { size: string; color: string } {
  const find = (needles: string[]) =>
    options?.find((o) => needles.some((n) => o.name.toLowerCase().includes(n)))?.value ?? "";

  const size = find(["size", "taille", "dimension", "longueur", "hauteur", "length", "diam"]);
  const color = find(["color", "colour", "couleur", "finish", "finition", "model", "modèle", "material", "matière", "matiere"]);

  if (!size && !color) return splitVariant(variantTitle);
  return { size, color };
}

// --------------------------------------------------------------------------
// REST webhook payload → internal Order
// --------------------------------------------------------------------------
export function normalizeShopifyOrder(payload: ShopifyOrderPayload): Order {
  const line = payload.line_items?.[0];
  const salePrice = line ? parseFloat(line.price) : parseFloat(payload.total_price) || 0;
  const quantity = line?.quantity ?? 1;
  const { variant, size, color } = splitVariant(line?.variant_title);

  const countryName = payload.shipping_address?.country || payload.billing_address?.country || "France";
  const countryCode = payload.shipping_address?.country_code || COUNTRY_CODE[countryName] || "FR";
  const customerName = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ");

  return {
    id: uid("ord"),
    shopifyOrderNumber: payload.name || `#${payload.order_number}`,
    productName: line?.title ?? "Produit",
    productImage: line?.image?.src || FALLBACK_IMAGE,
    variant,
    size,
    color,
    quantity,
    country: countryName,
    countryCode,
    customerName: customerName || "Client Shopify",
    salePrice,
    currency: (payload.currency as Currency) || "EUR",
    targetMaxCost: targetCostFor(salePrice),
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

// --------------------------------------------------------------------------
// GraphQL Admin order → internal Order
// --------------------------------------------------------------------------
export function normalizeGraphOrder(node: ShopifyGraphOrder): Order {
  const line = node.lineItems?.edges?.[0]?.node;
  const variant = line?.variant ?? null;
  const variantTitle = variant?.title && variant.title !== "Default Title" ? variant.title : "";
  const { size, color } = sizeColorFromOptions(variant?.selectedOptions, variantTitle || line?.title || "");

  const unitPrice =
    parseFloat(line?.originalUnitPriceSet?.shopMoney?.amount || node.totalPriceSet?.shopMoney?.amount || "0") || 0;
  const currency = (node.currencyCode || node.totalPriceSet?.shopMoney?.currencyCode || "EUR") as Currency;

  const countryName = node.shippingAddress?.country || "Non renseigné";
  const countryCode = node.shippingAddress?.countryCodeV2 || COUNTRY_CODE[countryName] || "FR";

  const image =
    line?.image?.url || variant?.image?.url || variant?.product?.featuredImage?.url || FALLBACK_IMAGE;

  const numericId = node.id.split("/").pop() ?? uid("ord");

  return {
    id: `shop_${numericId}`,
    shopifyOrderNumber: node.name,
    productName: line?.title || variant?.product?.title || "Produit",
    productImage: image,
    variant: variantTitle || [size, color].filter(Boolean).join(" / ") || "Standard",
    size,
    color,
    quantity: line?.quantity || 1,
    country: countryName,
    countryCode,
    customerName: node.customer?.displayName || "Client Shopify",
    salePrice: unitPrice,
    currency,
    targetMaxCost: targetCostFor(unitPrice),
    status: "awaiting_reply",
    selectedSupplierId: null,
    recommendedSupplierId: null,
    paymentStatus: "pending",
    trackingStatus: "none",
    trackingNumber: null,
    paymentDate: null,
    expectedTrackingDate: null,
    createdAt: node.createdAt || new Date().toISOString(),
  };
}

export interface NormalizedLineItem {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  image: string | null;
  productId: string | null;
  variantId: string | null;
}

/** Extract all line items from a GraphQL order node for DB persistence. */
export function normalizeGraphLineItems(node: ShopifyGraphOrder): NormalizedLineItem[] {
  return (node.lineItems?.edges ?? []).map(({ node: li }) => ({
    title: li.title,
    variantTitle: li.variant?.title && li.variant.title !== "Default Title" ? li.variant.title : null,
    sku: li.variant?.sku ?? null,
    quantity: li.quantity,
    price: parseFloat(li.originalUnitPriceSet?.shopMoney?.amount || "0") || 0,
    image: li.image?.url || li.variant?.image?.url || li.variant?.product?.featuredImage?.url || null,
    productId: li.variant?.product?.id ?? null,
    variantId: li.variant?.id ?? null,
  }));
}

export function normalizeGraphProduct(node: ShopifyGraphProduct): ShopifyProductSummary {
  return {
    id: node.id,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    variants: node.variants?.edges?.length ?? 0,
    status: (node.status ?? "ACTIVE").toLowerCase(),
    inventory: node.totalInventory ?? null,
  };
}
