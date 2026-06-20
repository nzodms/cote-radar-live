"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, Star, Clock, ShieldCheck, TrendingUp, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StockBadge } from "@/components/ui/status-badge";
import { cn, flag, formatCurrency, formatDelay } from "@/lib/utils";
import type { Order, Supplier, SupplierQuote, SupplierScore } from "@/types";

const DIMS: { key: keyof SupplierScore["breakdown"]; label: string }[] = [
  { key: "price", label: "Prix" },
  { key: "delay", label: "Délai" },
  { key: "reliability", label: "Fiab." },
  { key: "stock", label: "Stock" },
  { key: "margin", label: "Marge" },
];

export function SupplierComparisonCard({
  order,
  supplier,
  quote,
  score,
  isRecommended,
  isSelected,
  onSelect,
  index,
}: {
  order: Order;
  supplier: Supplier;
  quote: SupplierQuote;
  score: SupplierScore;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full"
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
          <Badge tone="primary" className="border-primary/30 bg-primary-gradient text-white shadow-glow-soft">
            <Sparkles className="h-3 w-3" />
            Recommandé par l&apos;IA
          </Badge>
        </div>
      )}

      <Card
        className={cn(
          "flex h-full flex-col p-5 transition-all duration-300",
          isRecommended && "border-primary/40 shadow-glow ring-1 ring-primary/20",
          !score.eligible && "opacity-80",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar initials={supplier.initials} seed={supplier.id} online={supplier.online} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold">{supplier.name}</span>
              {supplier.preferred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {flag(supplier.countryCode)} {supplier.country} · {supplier.specialty}
            </div>
          </div>
          {isSelected && (
            <Badge tone="success" size="sm">
              <Check className="h-3 w-3" /> Choisi
            </Badge>
          )}
        </div>

        {/* Score */}
        <div className="mt-4 flex items-end justify-between rounded-xl bg-secondary/40 px-3.5 py-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Score IA</div>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-3xl font-semibold tabular-nums", isRecommended ? "text-primary" : "text-foreground")}>
                {score.total}
              </span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Coût total</div>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(quote.totalCost, quote.currency)}</div>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {DIMS.map((d) => {
            const v = score.breakdown[d.key];
            return (
              <div key={d.key} className="flex flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted-foreground/10">
                  <div
                    className={cn(
                      "w-full rounded-md transition-all duration-700 ease-premium",
                      v >= 70 ? "bg-primary-gradient" : v >= 40 ? "bg-info/70" : "bg-warning/70",
                    )}
                    style={{ height: `${Math.max(6, v)}%` }}
                  />
                </div>
                <span className="text-2xs text-muted-foreground">{d.label}</span>
              </div>
            );
          })}
        </div>

        {/* Facts */}
        <div className="mt-4 space-y-2 text-sm">
          <Fact icon={Clock} label="Délai" value={formatDelay(quote.deliveryMinDays, quote.deliveryMaxDays)} />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Stock
            </span>
            <StockBadge status={quote.stockStatus} className="text-2xs" />
          </div>
          <Fact icon={ShieldCheck} label="Fiabilité" value={`${quote.reliabilityScore} %`} />
          <Fact icon={TrendingUp} label="Perf. 90 j" value={`${quote.performance90d} %`} />
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <span className="text-muted-foreground">Marge estimée</span>
            <span className="font-semibold text-success">
              {formatCurrency(score.marginValue)} · {score.marginPercent.toFixed(0)} %
            </span>
          </div>
        </div>

        {/* Violations */}
        {score.violations.length > 0 && (
          <div className="mt-3 space-y-1">
            {score.violations.map((v) => (
              <div key={v} className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {v}
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        <Button
          onClick={onSelect}
          disabled={isSelected}
          variant={isSelected ? "secondary" : isRecommended ? "default" : "secondary"}
          className="mt-4 w-full"
        >
          <Check className="h-4 w-4" />
          {isSelected ? "Sélectionné" : "Sélectionner ce fournisseur"}
        </Button>
      </Card>
    </motion.div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
