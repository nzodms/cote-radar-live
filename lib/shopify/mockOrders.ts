import type { ShopifyOrderPayload } from "./types";

/** Demo Shopify webhook payloads used to test the orders/create route. */
export const MOCK_SHOPIFY_ORDERS: ShopifyOrderPayload[] = [
  {
    id: 9001053,
    order_number: 1053,
    name: "#1053",
    currency: "EUR",
    total_price: "219.90",
    created_at: new Date().toISOString(),
    customer: { first_name: "Camille", last_name: "Roux" },
    shipping_address: { country: "France", country_code: "FR", city: "Lyon" },
    line_items: [
      {
        id: 5301,
        title: "Lampadaire arc marbre & laiton",
        quantity: 1,
        price: "219.90",
        variant_title: "Hauteur 180 cm / Laiton",
        sku: "LMP-ARC-180-LT",
        image: {
          src: "https://images.unsplash.com/photo-1543198126-a8ad8e47fb22?w=600&q=80",
        },
      },
    ],
  },
];

export function sampleShopifyOrder(): ShopifyOrderPayload {
  return MOCK_SHOPIFY_ORDERS[0];
}
