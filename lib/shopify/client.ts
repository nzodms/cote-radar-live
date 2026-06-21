/**
 * Server-only Shopify Admin GraphQL client.
 *
 * Credentials come from environment variables and NEVER reach the client:
 *   SHOPIFY_SHOP_DOMAIN          e.g. my-store  or  my-store.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN   custom/private app Admin API token (shpat_…)
 *   SHOPIFY_API_VERSION          defaults to 2026-04
 *
 * Imported exclusively from /app/api/** server routes.
 */
import { SHOP_QUERY } from "./queries";
import type { ShopifyConnectionStatus } from "./types";

const DEFAULT_API_VERSION = "2026-04";

export interface ShopifyConfig {
  shop: string;
  token: string;
  apiVersion: string;
  configured: boolean;
}

function normalizeShopDomain(input: string): string {
  if (!input) return "";
  let shop = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (shop && !shop.includes(".")) shop = `${shop}.myshopify.com`;
  return shop;
}

export function getShopifyConfig(): ShopifyConfig {
  const shop = normalizeShopDomain(
    process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN || "",
  );
  const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN || "").trim();
  const apiVersion = (process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION).trim();
  return { shop, token, apiVersion, configured: Boolean(shop && token) };
}

export class ShopifyError extends Error {
  constructor(
    message: string,
    public code:
      | "not_configured"
      | "unauthorized"
      | "http_error"
      | "graphql_error"
      | "network_error",
    public status?: number,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { shop, token, apiVersion, configured } = getShopifyConfig();
  if (!configured) {
    throw new ShopifyError(
      "Shopify non configuré : définissez SHOPIFY_SHOP_DOMAIN et SHOPIFY_ADMIN_ACCESS_TOKEN.",
      "not_configured",
    );
  }

  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch (e) {
    throw new ShopifyError(
      `Connexion impossible à ${shop}. Vérifiez le domaine. (${(e as Error).message})`,
      "network_error",
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyError(
      "Token Admin invalide ou scopes insuffisants (read_orders, read_products, read_customers).",
      "unauthorized",
      res.status,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ShopifyError(`Erreur HTTP Shopify ${res.status}. ${text.slice(0, 180)}`, "http_error", res.status);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new ShopifyError(json.errors.map((e) => e.message).join(" · "), "graphql_error");
  }
  if (!json.data) {
    throw new ShopifyError("Réponse Shopify vide.", "graphql_error");
  }
  return json.data;
}

export async function testShopifyConnection(): Promise<ShopifyConnectionStatus> {
  const { shop, apiVersion, configured } = getShopifyConfig();
  if (!configured) {
    return {
      configured: false,
      ok: false,
      apiVersion,
      error: "Variables d'environnement Shopify manquantes.",
    };
  }
  try {
    const data = await shopifyGraphQL<{ shop: { name: string; myshopifyDomain: string } }>(SHOP_QUERY);
    return { configured: true, ok: true, shop, shopName: data.shop.name, apiVersion };
  } catch (e) {
    return { configured: true, ok: false, shop, apiVersion, error: (e as ShopifyError).message };
  }
}
