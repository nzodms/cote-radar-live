"use client";

import { create } from "zustand";
import { uid } from "@/lib/utils";

export type ToastTone = "default" | "success" | "warning" | "danger";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = uid("toast");
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Imperative helper usable from anywhere. */
export const toast = (title: string, opts?: { description?: string; tone?: ToastTone }) =>
  useToastStore.getState().push({ title, description: opts?.description, tone: opts?.tone ?? "default" });
