import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Currency } from "@/types";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_LOCALE: Record<Currency, string> = {
  EUR: "fr-FR",
  USD: "en-US",
  GBP: "en-GB",
  CNY: "zh-CN",
};

export function formatCurrency(
  amount: number,
  currency: Currency = "EUR",
  opts: { decimals?: number } = {},
): string {
  const decimals = opts.decimals ?? 2;
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)} %`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDelay(minDays: number, maxDays: number): string {
  if (minDays === maxDays) return `${minDays} j`;
  return `${minDays}–${maxDays} j`;
}

/** Relative time in French ("il y a 5 min", "il y a 2 h", "hier"). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (sec < 45) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (hr < 24) return `il y a ${hr} h`;
  if (day === 1) return "hier";
  if (day < 7) return `il y a ${day} j`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Stable-ish id for demo objects. */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Average of a delivery window. */
export function avgDelay(minDays: number, maxDays: number): number {
  return (minDays + maxDays) / 2;
}

export const FLAG: Record<string, string> = {
  FR: "🇫🇷",
  BE: "🇧🇪",
  CH: "🇨🇭",
  ES: "🇪🇸",
  CN: "🇨🇳",
  DE: "🇩🇪",
  IT: "🇮🇹",
  GB: "🇬🇧",
  US: "🇺🇸",
};

export function flag(code: string): string {
  return FLAG[code?.toUpperCase()] ?? "🏳️";
}
