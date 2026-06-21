import type { Order } from "@/types";
import type { ShopifyConnectionStatus, ShopifyProductSummary } from "./types";

export interface SyncOrdersResult {
  ok: boolean;
  configured: boolean;
  count?: number;
  orders?: Order[];
  shopDomain?: string;
  apiVersion?: string;
  syncedAt?: string;
  error?: string;
}

export interface SyncProductsResult {
  ok: boolean;
  configured: boolean;
  count?: number;
  products?: ShopifyProductSummary[];
  shopDomain?: string;
  apiVersion?: string;
  error?: string;
}

export async function apiTestConnection(): Promise<ShopifyConnectionStatus> {
  try {
    const res = await fetch("/api/shopify/test-connection", { cache: "no-store" });
    return (await res.json()) as ShopifyConnectionStatus;
  } catch (e) {
    return { configured: false, ok: false, apiVersion: "—", error: (e as Error).message };
  }
}

export async function apiSyncOrders(): Promise<SyncOrdersResult> {
  try {
    const res = await fetch("/api/shopify/sync/orders", { method: "POST" });
    return (await res.json()) as SyncOrdersResult;
  } catch (e) {
    return { ok: false, configured: false, error: (e as Error).message };
  }
}

export async function apiSyncProducts(): Promise<SyncProductsResult> {
  try {
    const res = await fetch("/api/shopify/sync/products", { method: "POST" });
    return (await res.json()) as SyncProductsResult;
  } catch (e) {
    return { ok: false, configured: false, error: (e as Error).message };
  }
}
