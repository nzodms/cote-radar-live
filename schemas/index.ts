import { z } from "zod";

export const currencySchema = z.enum(["EUR", "USD", "GBP", "CNY"]);
export const stockStatusSchema = z.enum([
  "confirmed",
  "uncertain",
  "out_of_stock",
  "unknown",
]);
export const orderStatusSchema = z.enum([
  "awaiting_reply",
  "quoted",
  "selected",
  "to_pay",
  "paid",
  "awaiting_tracking",
  "shipped",
  "delayed",
  "incident",
]);
export const paymentStatusSchema = z.enum(["pending", "to_pay", "paid"]);
export const trackingStatusSchema = z.enum([
  "none",
  "awaiting",
  "shipped",
  "delayed",
  "delivered",
]);

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nom requis"),
  initials: z.string(),
  country: z.string().min(1, "Pays requis"),
  countryCode: z.string(),
  specialty: z.string(),
  whatsappNumber: z.string(),
  language: z.enum(["fr", "en"]),
  reliabilityScore: z.number().min(0).max(100),
  performance90d: z.number().min(0).max(100),
  averageDelayDays: z.number().min(0),
  averageCost: z.number().min(0),
  totalOrders: z.number().min(0),
  totalPaid: z.number().min(0),
  incidents: z.number().min(0),
  tags: z.array(z.string()),
  notes: z.string(),
  preferred: z.boolean(),
  blocked: z.boolean(),
  online: z.boolean(),
  createdAt: z.string(),
});

/** Form schema for create/edit supplier (subset, the rest is derived). */
export const supplierFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  country: z.string().min(1, "Pays requis"),
  countryCode: z.string().min(2, "Code pays requis").max(2),
  specialty: z.string().min(1, "Spécialité requise"),
  whatsappNumber: z.string().min(6, "Numéro WhatsApp invalide"),
  language: z.enum(["fr", "en"]),
  reliabilityScore: z.coerce.number().min(0).max(100),
  averageDelayDays: z.coerce.number().min(0).max(120),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const supplierQuoteSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  supplierId: z.string(),
  productCost: z.number().min(0),
  shippingCost: z.number().min(0),
  totalCost: z.number().min(0),
  currency: currencySchema,
  deliveryMinDays: z.number().min(0),
  deliveryMaxDays: z.number().min(0),
  stockStatus: stockStatusSchema,
  reliabilityScore: z.number(),
  performance90d: z.number(),
  incidents: z.number(),
  notes: z.string(),
  createdAt: z.string(),
});

export const recommendationWeightsSchema = z.object({
  price: z.number().min(0).max(100),
  delay: z.number().min(0).max(100),
  reliability: z.number().min(0).max(100),
  stock: z.number().min(0).max(100),
  margin: z.number().min(0).max(100),
});

export const aiRulesSchema = z.object({
  minimumMarginPercent: z.number().min(0).max(100),
  maximumDeliveryDays: z.number().min(1).max(120),
  manualValidationAbove: z.number().min(0),
  autoReminderHours: z.number().min(1).max(168),
  preferConfirmedStock: z.boolean(),
  excludeReliabilityBelow: z.number().min(0).max(100),
  preferredSupplierIds: z.array(z.string()),
  blockedSupplierIds: z.array(z.string()),
  allowedCountries: z.array(z.string()),
  weights: recommendationWeightsSchema,
});

export const extractedQuoteSchema = z.object({
  productCost: z.number(),
  shippingCost: z.number(),
  totalCost: z.number(),
  deliveryMinDays: z.number(),
  deliveryMaxDays: z.number(),
  stockStatus: stockStatusSchema,
  notes: z.string(),
});

export const generateMessageInputSchema = z.object({
  productName: z.string(),
  variant: z.string().optional(),
  quantity: z.number().optional(),
  country: z.string(),
  productImageUrl: z.string().optional(),
  language: z.enum(["fr", "en"]).optional(),
  supplierName: z.string().optional(),
  targetMaxCost: z.number().optional(),
});

/** Loose validation of an inbound Shopify order webhook. */
export const shopifyOrderPayloadSchema = z.object({
  id: z.number(),
  order_number: z.number(),
  name: z.string(),
  currency: z.string(),
  total_price: z.string(),
  created_at: z.string().default(() => new Date().toISOString()),
  customer: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  shipping_address: z
    .object({
      country: z.string().optional(),
      country_code: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
  line_items: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      quantity: z.number(),
      price: z.string(),
      variant_title: z.string().nullable().optional(),
      sku: z.string().nullable().optional(),
      image: z.object({ src: z.string() }).nullable().optional(),
    }),
  ),
});
