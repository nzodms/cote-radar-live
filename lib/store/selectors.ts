"use client";

import { useEffect, useState } from "react";
import type {
  Conversation,
  Order,
  Purchase,
  Supplier,
  SupplierQuote,
} from "@/types";
import { recommendSupplier, marginForQuote } from "@/lib/recommendation/recommendSupplier";
import { useStore, type AppState } from "./useStore";

/** Returns true once the store has hydrated (from DB or localStorage). */
export function useHydrated(): boolean {
  return useStore((s) => s.hydrated);
}

/** The slice of state persisted to the database (write-through snapshot). */
export function snapshotForDb(s: AppState) {
  return {
    suppliers: s.suppliers,
    orders: s.orders,
    quotes: s.quotes,
    conversations: s.conversations,
    rules: s.rules,
  };
}

/**
 * Bootstraps the store on mount:
 *  - If the server reports DB mode, load state from the database and enable
 *    debounced write-through persistence (DB is the source of truth).
 *  - Otherwise fall back to the localStorage demo store (unchanged behavior).
 */
export function useStoreHydration() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanup: (() => void) | undefined;
    let suppress = true;

    const saveSnapshot = (keepalive = false) => {
      const s = useStore.getState();
      if (s.persistMode !== "db" || !s.hydrated) return;
      void fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshotForDb(s)),
        keepalive,
      }).catch(() => {});
    };

    const enableWriteThrough = () => {
      const unsub = useStore.subscribe((state) => {
        if (state.persistMode !== "db" || !state.hydrated || suppress) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveSnapshot(), 700);
      });
      const onHide = () => saveSnapshot(true);
      window.addEventListener("pagehide", onHide);
      cleanup = () => {
        unsub();
        window.removeEventListener("pagehide", onHide);
      };
      // Ignore the state changes caused by the initial load.
      setTimeout(() => {
        suppress = false;
      }, 150);
    };

    (async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (data?.mode === "db") {
          useStore.getState().loadServerState({
            suppliers: data.suppliers ?? [],
            orders: data.orders ?? [],
            quotes: data.quotes ?? [],
            conversations: data.conversations ?? [],
            rules: data.rules,
            dataSource: data.dataSource ?? "demo",
            shopify: data.shopify,
            shopifyProducts: data.shopifyProducts ?? [],
          });
          enableWriteThrough();
          setDone(true);
          return;
        }
      } catch {
        /* fall through to demo mode */
      }
      if (!active) return;
      // Demo mode: localStorage (unchanged V1 behavior).
      await useStore.persist.rehydrate();
      useStore.setState({ hydrated: true, persistMode: "demo" });
      useStore.getState().recomputeAllRecommendations();
      setDone(true);
    })();

    return () => {
      active = false;
      if (saveTimer) clearTimeout(saveTimer);
      cleanup?.();
    };
  }, []);

  return done;
}

// ---- pure selectors --------------------------------------------------------
export function selectSupplier(suppliers: Supplier[], id?: string | null) {
  return suppliers.find((s) => s.id === id) ?? null;
}

export function selectQuotesForOrder(quotes: SupplierQuote[], orderId: string) {
  return quotes.filter((q) => q.orderId === orderId);
}

export function selectConversationsForOrder(conversations: Conversation[], orderId: string) {
  return conversations.filter((c) => c.orderId === orderId);
}

export function getRecommendation(state: Pick<AppState, "quotes" | "suppliers" | "rules">, order: Order) {
  return recommendSupplier(
    order,
    selectQuotesForOrder(state.quotes, order.id),
    state.suppliers,
    state.rules,
  );
}

/** Build the Payments board view from orders + selected supplier + quote. */
export function buildPurchases(
  orders: Order[],
  suppliers: Supplier[],
  quotes: SupplierQuote[],
  now: Date = new Date(),
): Purchase[] {
  return orders
    .filter((o) => o.selectedSupplierId)
    .map((o) => {
      const supplier = suppliers.find((s) => s.id === o.selectedSupplierId);
      const quote =
        quotes.find((q) => q.orderId === o.id && q.supplierId === o.selectedSupplierId) ?? null;
      const amount = quote ? quote.totalCost * o.quantity : o.targetMaxCost * o.quantity;
      const isLate =
        !!o.expectedTrackingDate &&
        new Date(o.expectedTrackingDate).getTime() < now.getTime() &&
        (o.trackingStatus === "awaiting" || o.trackingStatus === "delayed" || o.status === "incident");
      return {
        id: `pur_${o.id}`,
        orderId: o.id,
        supplierId: o.selectedSupplierId!,
        productName: o.productName,
        productImage: o.productImage,
        shopifyOrderNumber: o.shopifyOrderNumber,
        supplierName: supplier?.name ?? "—",
        amount,
        currency: o.currency,
        paymentStatus: o.paymentStatus,
        paymentDate: o.paymentDate,
        expectedTrackingDate: o.expectedTrackingDate,
        trackingNumber: o.trackingNumber,
        status: o.status,
        isLate,
      };
    });
}

export interface DashboardKpis {
  ordersToProcess: number;
  awaitingReplies: number;
  awaitingPayment: number;
  awaitingTracking: number;
  lateShipments: number;
  protectedMargin: number;
}

export function computeKpis(state: Pick<AppState, "orders" | "conversations" | "quotes">): DashboardKpis {
  const { orders, conversations, quotes } = state;

  const protectedMargin = orders.reduce((sum, order) => {
    const supplierId = order.selectedSupplierId ?? order.recommendedSupplierId;
    if (!supplierId) return sum;
    const quote = quotes.find((q) => q.orderId === order.id && q.supplierId === supplierId);
    if (!quote) return sum;
    return sum + marginForQuote(order, quote).value;
  }, 0);

  return {
    ordersToProcess: orders.filter(
      (o) => o.status === "awaiting_reply" || o.status === "quoted",
    ).length,
    awaitingReplies: conversations.filter((c) => c.status === "awaiting_reply").length,
    awaitingPayment: orders.filter((o) => o.paymentStatus === "to_pay").length,
    awaitingTracking: orders.filter((o) => o.trackingStatus === "awaiting").length,
    lateShipments: orders.filter(
      (o) => o.trackingStatus === "delayed" || o.status === "delayed",
    ).length,
    protectedMargin,
  };
}

/** Total unread across the inbox (top bar badge). */
export function totalUnread(conversations: Conversation[]): number {
  return conversations.reduce((n, c) => n + c.unreadCount, 0);
}
