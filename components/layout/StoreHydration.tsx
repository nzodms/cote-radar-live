"use client";

import { useStoreHydration } from "@/lib/store/selectors";

/** Mount-once component that rehydrates the persisted store on the client. */
export function StoreHydration() {
  useStoreHydration();
  return null;
}
