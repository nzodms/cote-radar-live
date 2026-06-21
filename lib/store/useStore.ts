"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ActivityEvent,
  AIRules,
  Conversation,
  Message,
  Order,
  OrderStatus,
  Supplier,
  SupplierQuote,
} from "@/types";
import type { SupplierFormValues } from "@/schemas";
import type { ExtractedQuote } from "@/lib/ai/extractQuoteFromMessage";
import type { ShopifyProductSummary } from "@/lib/shopify/types";
import { recommendSupplier } from "@/lib/recommendation/recommendSupplier";
import { initialsFromName, uid } from "@/lib/utils";
import { makeInitialData } from "@/lib/data/seed";

export type DataSource = "demo" | "shopify" | "error";

export interface ShopifyMeta {
  shopDomain: string | null;
  apiVersion: string | null;
  lastSyncAt: string | null;
  ordersImported: number;
  productsImported: number;
  error: string | null;
}

const INITIAL_SHOPIFY: ShopifyMeta = {
  shopDomain: null,
  apiVersion: null,
  lastSyncAt: null,
  ordersImported: 0,
  productsImported: 0,
  error: null,
};

interface ContactSuppliersInput {
  orderId: string;
  supplierIds: string[];
  /** message builder per supplier (already AI-generated or templated). */
  buildMessage: (supplier: Supplier) => string;
}

interface AddQuoteInput {
  orderId: string;
  supplierId: string;
  conversationId?: string;
  messageId?: string;
  extracted: ExtractedQuote;
}

export interface AppState {
  hydrated: boolean;
  suppliers: Supplier[];
  orders: Order[];
  quotes: SupplierQuote[];
  conversations: Conversation[];
  rules: AIRules;
  activity: ActivityEvent[];

  // ---- data source / Shopify ----
  dataSource: DataSource;
  shopify: ShopifyMeta;
  shopifyProducts: ShopifyProductSummary[];

  // ---- suppliers ----
  addSupplier: (values: SupplierFormValues) => Supplier;
  updateSupplier: (id: string, values: SupplierFormValues) => void;
  deleteSupplier: (id: string) => void;
  toggleBlockSupplier: (id: string) => void;
  togglePreferredSupplier: (id: string) => void;

  // ---- orders ----
  addOrder: (order: Order) => void;
  setOrderStatus: (orderId: string, status: OrderStatus) => void;
  selectSupplierForOrder: (orderId: string, supplierId: string) => void;
  markPaid: (orderId: string) => void;
  requestTracking: (orderId: string) => void;
  addTracking: (orderId: string, trackingNumber: string) => void;
  reportIncident: (orderId: string, note: string) => void;

  // ---- quotes ----
  addQuoteFromExtraction: (input: AddQuoteInput) => SupplierQuote;
  recomputeRecommendation: (orderId: string) => void;
  recomputeAllRecommendations: () => void;

  // ---- inbox ----
  contactSuppliers: (input: ContactSuppliersInput) => void;
  appendMessage: (conversationId: string, message: Omit<Message, "id" | "conversationId">) => Message;
  sendMerchantMessage: (conversationId: string, content: string) => void;
  simulateSupplierReply: (conversationId: string, content: string) => Message;
  markConversationRead: (conversationId: string) => void;

  // ---- rules ----
  updateRules: (patch: Partial<AIRules>) => void;

  // ---- shopify ----
  importShopifyOrders: (orders: Order[], meta: { shopDomain?: string; apiVersion?: string }) => void;
  importShopifyProducts: (
    products: ShopifyProductSummary[],
    meta?: { shopDomain?: string; apiVersion?: string },
  ) => void;
  setShopifyError: (message: string) => void;
  loadDemoData: () => void;

  // ---- misc ----
  pushActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  resetDemo: () => void;
}

function quotesForOrder(quotes: SupplierQuote[], orderId: string) {
  return quotes.filter((q) => q.orderId === orderId);
}

const init = makeInitialData();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...init,
      dataSource: "demo" as DataSource,
      shopify: { ...INITIAL_SHOPIFY },
      shopifyProducts: [],

      // ---------------------------------------------------------------- suppliers
      addSupplier: (values) => {
        const supplier: Supplier = {
          id: uid("sup"),
          name: values.name,
          initials: initialsFromName(values.name),
          country: values.country,
          countryCode: values.countryCode.toUpperCase(),
          specialty: values.specialty,
          whatsappNumber: values.whatsappNumber,
          language: values.language,
          reliabilityScore: values.reliabilityScore,
          performance90d: Math.max(0, values.reliabilityScore - 4),
          averageDelayDays: values.averageDelayDays,
          averageCost: 0,
          totalOrders: 0,
          totalPaid: 0,
          incidents: 0,
          tags: values.tags,
          notes: values.notes,
          preferred: false,
          blocked: false,
          online: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ suppliers: [supplier, ...s.suppliers] }));
        return supplier;
      },

      updateSupplier: (id, values) => {
        set((s) => ({
          suppliers: s.suppliers.map((sup) =>
            sup.id === id
              ? {
                  ...sup,
                  ...values,
                  countryCode: values.countryCode.toUpperCase(),
                  initials: initialsFromName(values.name),
                }
              : sup,
          ),
        }));
        get().recomputeAllRecommendations();
      },

      deleteSupplier: (id) =>
        set((s) => ({ suppliers: s.suppliers.filter((sup) => sup.id !== id) })),

      toggleBlockSupplier: (id) => {
        set((s) => ({
          suppliers: s.suppliers.map((sup) =>
            sup.id === id ? { ...sup, blocked: !sup.blocked } : sup,
          ),
        }));
        const sup = get().suppliers.find((x) => x.id === id);
        set((s) => ({
          rules: {
            ...s.rules,
            blockedSupplierIds: sup?.blocked
              ? Array.from(new Set([...s.rules.blockedSupplierIds, id]))
              : s.rules.blockedSupplierIds.filter((x) => x !== id),
          },
        }));
        get().recomputeAllRecommendations();
      },

      togglePreferredSupplier: (id) => {
        set((s) => ({
          suppliers: s.suppliers.map((sup) =>
            sup.id === id ? { ...sup, preferred: !sup.preferred } : sup,
          ),
        }));
        const sup = get().suppliers.find((x) => x.id === id);
        set((s) => ({
          rules: {
            ...s.rules,
            preferredSupplierIds: sup?.preferred
              ? Array.from(new Set([...s.rules.preferredSupplierIds, id]))
              : s.rules.preferredSupplierIds.filter((x) => x !== id),
          },
        }));
        get().recomputeAllRecommendations();
      },

      // ------------------------------------------------------------------- orders
      addOrder: (order) =>
        set((s) => ({
          orders: [order, ...s.orders],
          activity: [
            {
              id: uid("act"),
              type: "system",
              title: "Nouvelle commande Shopify",
              description: `${order.shopifyOrderNumber} — ${order.productName}`,
              orderId: order.id,
              timestamp: new Date().toISOString(),
            },
            ...s.activity,
          ],
        })),

      setOrderStatus: (orderId, status) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        })),

      selectSupplierForOrder: (orderId, supplierId) => {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  selectedSupplierId: supplierId,
                  status: o.status === "awaiting_reply" || o.status === "quoted" ? "selected" : o.status,
                }
              : o,
          ),
          conversations: s.conversations.map((c) =>
            c.orderId === orderId && c.supplierId === supplierId
              ? { ...c, status: "selected" }
              : c,
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        const supplier = get().suppliers.find((x) => x.id === supplierId);
        if (order && supplier) {
          get().pushActivity({
            type: "selection",
            title: "Fournisseur sélectionné",
            description: `${supplier.name} retenu pour la commande ${order.shopifyOrderNumber}`,
            orderId,
            supplierId,
          });
        }
        // Move to "to_pay" right after selection so the purchase appears on the board.
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId && o.status === "selected"
              ? { ...o, status: "to_pay", paymentStatus: "to_pay" }
              : o,
          ),
        }));
      },

      markPaid: (orderId) => {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  paymentStatus: "paid",
                  status: "awaiting_tracking",
                  trackingStatus: "awaiting",
                  paymentDate: new Date().toISOString(),
                  expectedTrackingDate:
                    o.expectedTrackingDate ?? new Date(Date.now() + 4 * 86400000).toISOString(),
                }
              : o,
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) {
          get().pushActivity({
            type: "payment",
            title: "Paiement effectué",
            description: `${order.shopifyOrderNumber} marqué comme payé`,
            orderId,
            supplierId: order.selectedSupplierId ?? undefined,
          });
        }
      },

      requestTracking: (orderId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order || !order.selectedSupplierId) return;
        // find or create a conversation with the selected supplier
        let conv = get().conversations.find(
          (c) => c.orderId === orderId && c.supplierId === order.selectedSupplierId,
        );
        const message =
          "Bonjour, le paiement a bien été effectué. Pouvez-vous me communiquer le numéro de suivi de l'expédition ? Merci.";
        if (!conv) {
          const newConv: Conversation = {
            id: uid("conv"),
            supplierId: order.selectedSupplierId,
            orderId,
            unreadCount: 0,
            status: "active",
            lastMessageAt: new Date().toISOString(),
            messages: [],
          };
          set((s) => ({ conversations: [newConv, ...s.conversations] }));
          conv = newConv;
        }
        get().appendMessage(conv.id, {
          senderType: "merchant",
          content: message,
          timestamp: new Date().toISOString(),
          channel: "whatsapp",
          status: "delivered",
        });
        get().pushActivity({
          type: "message",
          title: "Suivi demandé",
          description: `Demande de suivi envoyée pour ${order.shopifyOrderNumber}`,
          orderId,
          supplierId: order.selectedSupplierId,
        });
      },

      addTracking: (orderId, trackingNumber) => {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  trackingNumber,
                  trackingStatus: "shipped",
                  status: "shipped",
                  paymentStatus: o.paymentStatus === "pending" ? "paid" : o.paymentStatus,
                }
              : o,
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) {
          get().pushActivity({
            type: "shipment",
            title: "Suivi ajouté",
            description: `${order.shopifyOrderNumber} expédié — ${trackingNumber}`,
            orderId,
            supplierId: order.selectedSupplierId ?? undefined,
          });
        }
      },

      reportIncident: (orderId, note) => {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status: "incident" } : o,
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) {
          get().pushActivity({
            type: "incident",
            title: "Incident signalé",
            description: `${order.shopifyOrderNumber} — ${note}`,
            orderId,
            supplierId: order.selectedSupplierId ?? undefined,
          });
        }
      },

      // ------------------------------------------------------------------- quotes
      addQuoteFromExtraction: ({ orderId, supplierId, conversationId, messageId, extracted }) => {
        const supplier = get().suppliers.find((s) => s.id === supplierId);
        const order = get().orders.find((o) => o.id === orderId);
        const quote: SupplierQuote = {
          id: uid("qte"),
          orderId,
          supplierId,
          productCost: extracted.productCost,
          shippingCost: extracted.shippingCost,
          totalCost: extracted.totalCost || extracted.productCost + extracted.shippingCost,
          currency: order?.currency ?? "EUR",
          deliveryMinDays: extracted.deliveryMinDays,
          deliveryMaxDays: extracted.deliveryMaxDays,
          stockStatus: extracted.stockStatus,
          reliabilityScore: supplier?.reliabilityScore ?? 80,
          performance90d: supplier?.performance90d ?? 80,
          incidents: supplier?.incidents ?? 0,
          notes: extracted.notes,
          createdAt: new Date().toISOString(),
        };

        set((s) => ({
          // replace an existing quote for the same order+supplier, else add
          quotes: [
            ...s.quotes.filter((q) => !(q.orderId === orderId && q.supplierId === supplierId)),
            quote,
          ],
          orders: s.orders.map((o) =>
            o.id === orderId && (o.status === "awaiting_reply")
              ? { ...o, status: "quoted" }
              : o,
          ),
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              status: "quote_received",
              messages: messageId
                ? c.messages.map((m) => (m.id === messageId ? { ...m, quote } : m))
                : c.messages,
            };
          }),
        }));

        if (supplier && order) {
          get().pushActivity({
            type: "quote",
            title: "Devis extrait",
            description: `${supplier.name} — ${order.shopifyOrderNumber} — total ${quote.totalCost} €`,
            orderId,
            supplierId,
          });
        }
        get().recomputeRecommendation(orderId);
        return quote;
      },

      recomputeRecommendation: (orderId) => {
        const { orders, quotes, suppliers, rules } = get();
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;
        const result = recommendSupplier(order, quotesForOrder(quotes, orderId), suppliers, rules);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, recommendedSupplierId: result.recommendedSupplierId } : o,
          ),
        }));
      },

      recomputeAllRecommendations: () => {
        const { orders, quotes, suppliers, rules } = get();
        set({
          orders: orders.map((order) => {
            const oq = quotesForOrder(quotes, order.id);
            if (oq.length === 0) return order;
            const result = recommendSupplier(order, oq, suppliers, rules);
            return { ...order, recommendedSupplierId: result.recommendedSupplierId };
          }),
        });
      },

      // -------------------------------------------------------------------- inbox
      contactSuppliers: ({ orderId, supplierIds, buildMessage }) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order) return;
        const now = new Date().toISOString();
        const newConvs: Conversation[] = [];

        supplierIds.forEach((supplierId) => {
          const supplier = get().suppliers.find((s) => s.id === supplierId);
          if (!supplier) return;
          const existing = get().conversations.find(
            (c) => c.orderId === orderId && c.supplierId === supplierId,
          );
          const message: Message = {
            id: uid("m"),
            conversationId: existing?.id ?? "",
            senderType: "merchant",
            content: buildMessage(supplier),
            timestamp: now,
            channel: "whatsapp",
            status: "sent",
          };
          if (existing) {
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.id === existing.id
                  ? {
                      ...c,
                      status: "awaiting_reply",
                      lastMessageAt: now,
                      messages: [...c.messages, { ...message, conversationId: c.id }],
                    }
                  : c,
              ),
            }));
          } else {
            const convId = uid("conv");
            newConvs.push({
              id: convId,
              supplierId,
              orderId,
              unreadCount: 0,
              status: "awaiting_reply",
              lastMessageAt: now,
              messages: [{ ...message, conversationId: convId }],
            });
          }
        });

        if (newConvs.length > 0) {
          set((s) => ({ conversations: [...newConvs, ...s.conversations] }));
        }
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId && o.status === "awaiting_reply"
              ? o
              : o.id === orderId && o.selectedSupplierId == null && o.status !== "quoted"
                ? { ...o, status: "awaiting_reply" }
                : o,
          ),
        }));
        get().pushActivity({
          type: "message",
          title: "Demande envoyée",
          description: `${supplierIds.length} fournisseur${supplierIds.length > 1 ? "s" : ""} contacté${
            supplierIds.length > 1 ? "s" : ""
          } pour ${order.shopifyOrderNumber}`,
          orderId,
        });
      },

      appendMessage: (conversationId, message) => {
        const full: Message = { ...message, id: uid("m"), conversationId };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, full],
                  lastMessageAt: full.timestamp,
                  unreadCount: full.senderType === "supplier" ? c.unreadCount + 1 : c.unreadCount,
                }
              : c,
          ),
        }));
        return full;
      },

      sendMerchantMessage: (conversationId, content) => {
        if (!content.trim()) return;
        get().appendMessage(conversationId, {
          senderType: "merchant",
          content: content.trim(),
          timestamp: new Date().toISOString(),
          channel: "whatsapp",
          status: "sent",
        });
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId && c.status === "quote_received"
              ? c
              : c.id === conversationId
                ? { ...c, status: c.status === "selected" ? "selected" : "awaiting_reply" }
                : c,
          ),
        }));
      },

      simulateSupplierReply: (conversationId, content) => {
        const msg = get().appendMessage(conversationId, {
          senderType: "supplier",
          content,
          timestamp: new Date().toISOString(),
          channel: "whatsapp",
        });
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, status: "active" } : c,
          ),
        }));
        return msg;
      },

      markConversationRead: (conversationId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c,
          ),
        })),

      // -------------------------------------------------------------------- rules
      updateRules: (patch) => {
        set((s) => ({ rules: { ...s.rules, ...patch, weights: { ...s.rules.weights, ...(patch.weights ?? {}) } } }));
        get().recomputeAllRecommendations();
      },

      // ------------------------------------------------------------------ shopify
      importShopifyOrders: (orders, meta) => {
        set((s) => ({
          orders,
          // Quotes/conversations from demo orders no longer apply to real orders.
          quotes: [],
          conversations: [],
          dataSource: "shopify",
          shopify: {
            ...s.shopify,
            shopDomain: meta.shopDomain ?? s.shopify.shopDomain,
            apiVersion: meta.apiVersion ?? s.shopify.apiVersion,
            lastSyncAt: new Date().toISOString(),
            ordersImported: orders.length,
            error: null,
          },
          activity: [
            {
              id: uid("act"),
              type: "system" as const,
              title: "Synchronisation Shopify",
              description: `${orders.length} commande${orders.length > 1 ? "s" : ""} importée${
                orders.length > 1 ? "s" : ""
              } depuis Shopify`,
              timestamp: new Date().toISOString(),
            },
            ...s.activity,
          ].slice(0, 60),
        }));
        get().recomputeAllRecommendations();
      },

      importShopifyProducts: (products, meta) =>
        set((s) => ({
          shopifyProducts: products,
          shopify: {
            ...s.shopify,
            productsImported: products.length,
            lastSyncAt: new Date().toISOString(),
            shopDomain: meta?.shopDomain ?? s.shopify.shopDomain,
            apiVersion: meta?.apiVersion ?? s.shopify.apiVersion,
          },
        })),

      setShopifyError: (message) =>
        set((s) => ({ dataSource: "error", shopify: { ...s.shopify, error: message } })),

      loadDemoData: () =>
        set({
          ...makeInitialData(),
          dataSource: "demo",
          shopify: { ...INITIAL_SHOPIFY },
          shopifyProducts: [],
        }),

      // --------------------------------------------------------------------- misc
      pushActivity: (event) =>
        set((s) => ({
          activity: [
            { ...event, id: uid("act"), timestamp: new Date().toISOString() },
            ...s.activity,
          ].slice(0, 60),
        })),

      resetDemo: () =>
        set({
          ...makeInitialData(),
          dataSource: "demo",
          shopify: { ...INITIAL_SHOPIFY },
          shopifyProducts: [],
        }),
    }),
    {
      name: "supplierpilot-v1",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        suppliers: state.suppliers,
        orders: state.orders,
        quotes: state.quotes,
        conversations: state.conversations,
        rules: state.rules,
        activity: state.activity,
        dataSource: state.dataSource,
        shopify: state.shopify,
        shopifyProducts: state.shopifyProducts,
      }),
    },
  ),
);
