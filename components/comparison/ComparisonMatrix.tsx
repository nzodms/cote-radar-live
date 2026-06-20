"use client";

import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StockBadge } from "@/components/ui/status-badge";
import { cn, avgDelay, formatCurrency, formatDelay } from "@/lib/utils";
import type { Supplier, SupplierQuote, SupplierScore } from "@/types";

export interface ComparisonEntry {
  supplier: Supplier;
  quote: SupplierQuote;
  score: SupplierScore;
}

interface Row {
  key: string;
  label: string;
  render: (e: ComparisonEntry) => React.ReactNode;
  metric?: (e: ComparisonEntry) => number;
  better?: "low" | "high";
}

const ROWS: Row[] = [
  { key: "product", label: "Prix produit", render: (e) => formatCurrency(e.quote.productCost), metric: (e) => e.quote.productCost, better: "low" },
  { key: "shipping", label: "Livraison", render: (e) => formatCurrency(e.quote.shippingCost), metric: (e) => e.quote.shippingCost, better: "low" },
  { key: "total", label: "Coût total", render: (e) => <strong>{formatCurrency(e.quote.totalCost)}</strong>, metric: (e) => e.quote.totalCost, better: "low" },
  { key: "delay", label: "Délai estimé", render: (e) => formatDelay(e.quote.deliveryMinDays, e.quote.deliveryMaxDays), metric: (e) => avgDelay(e.quote.deliveryMinDays, e.quote.deliveryMaxDays), better: "low" },
  { key: "stock", label: "Stock", render: (e) => <StockBadge status={e.quote.stockStatus} className="text-2xs" /> },
  { key: "reliability", label: "Fiabilité", render: (e) => `${e.quote.reliabilityScore} %`, metric: (e) => e.quote.reliabilityScore, better: "high" },
  { key: "perf", label: "Performance 90 j", render: (e) => `${e.quote.performance90d} %`, metric: (e) => e.quote.performance90d, better: "high" },
  { key: "margin", label: "Marge estimée", render: (e) => `${formatCurrency(e.score.marginValue)} · ${e.score.marginPercent.toFixed(0)} %`, metric: (e) => e.score.marginPercent, better: "high" },
  { key: "incidents", label: "Incidents", render: (e) => String(e.quote.incidents), metric: (e) => e.quote.incidents, better: "low" },
  { key: "score", label: "Score IA", render: (e) => <strong>{e.score.total}/100</strong>, metric: (e) => e.score.total, better: "high" },
];

export function ComparisonMatrix({
  entries,
  recommendedId,
}: {
  entries: ComparisonEntry[];
  recommendedId: string | null;
}) {
  const bestFor = (row: Row): string | null => {
    if (!row.metric || !row.better) return null;
    let best: ComparisonEntry | null = null;
    for (const e of entries) {
      if (!best) {
        best = e;
        continue;
      }
      const a = row.metric(e);
      const b = row.metric(best);
      if ((row.better === "low" && a < b) || (row.better === "high" && a > b)) best = e;
    }
    return best?.supplier.id ?? null;
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Critère
              </th>
              {entries.map((e) => {
                const isRec = e.supplier.id === recommendedId;
                return (
                  <th
                    key={e.supplier.id}
                    className={cn("px-4 py-3 text-left", isRec && "bg-primary-soft/40")}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar initials={e.supplier.initials} seed={e.supplier.id} size="sm" className="!h-6 !w-6" />
                      <span className="text-xs font-semibold">{e.supplier.name}</span>
                      {isRec && <Sparkles className="h-3 w-3 text-primary" />}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              const bestId = bestFor(row);
              return (
                <tr key={row.key} className={cn(ri % 2 === 1 && "bg-secondary/20")}>
                  <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{row.label}</td>
                  {entries.map((e) => {
                    const isRec = e.supplier.id === recommendedId;
                    const isBest = bestId === e.supplier.id;
                    return (
                      <td
                        key={e.supplier.id}
                        className={cn(
                          "px-4 py-2.5 tabular-nums",
                          isRec && "bg-primary-soft/20",
                          isBest ? "font-semibold text-foreground" : "text-foreground/80",
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {row.render(e)}
                          {isBest && row.metric && <Check className="h-3 w-3 text-success" />}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
