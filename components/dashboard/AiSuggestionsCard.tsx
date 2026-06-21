"use client";

import Link from "next/link";
import {
  Scale,
  CreditCard,
  Truck,
  AlertTriangle,
  BellRing,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/labels";
import type { AIRules, Conversation, Order, Supplier, SupplierQuote } from "@/types";

interface Suggestion {
  id: string;
  icon: LucideIcon;
  tone: BadgeTone;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  priority: number;
}

const TONE_STYLES: Record<BadgeTone, { box: string; bar: string; chip: string; level: string }> = {
  neutral: { box: "bg-secondary text-muted-foreground", bar: "bg-muted-foreground/40", chip: "bg-secondary text-muted-foreground", level: "Info" },
  primary: { box: "bg-primary-soft text-primary ring-primary/15", bar: "bg-primary", chip: "bg-primary-soft text-primary", level: "Recommandé" },
  success: { box: "bg-success-soft text-success ring-success/15", bar: "bg-success", chip: "bg-success-soft text-success", level: "OK" },
  warning: { box: "bg-warning-soft text-warning-foreground ring-warning/20", bar: "bg-warning", chip: "bg-warning-soft text-warning-foreground", level: "À faire" },
  danger: { box: "bg-danger-soft text-danger ring-danger/15", bar: "bg-danger", chip: "bg-danger-soft text-danger", level: "Urgent" },
  info: { box: "bg-info-soft text-info ring-info/15", bar: "bg-info", chip: "bg-info-soft text-info", level: "Relance" },
};

export function AiSuggestionsCard({
  orders,
  suppliers,
  quotes,
  conversations,
  rules,
  onOpenOrder,
}: {
  orders: Order[];
  suppliers: Supplier[];
  quotes: SupplierQuote[];
  conversations: Conversation[];
  rules: AIRules;
  onOpenOrder: (id: string) => void;
}) {
  const nameOf = (id?: string | null) => suppliers.find((s) => s.id === id)?.name ?? "le fournisseur";
  const suggestions: Suggestion[] = [];

  for (const o of orders) {
    if (o.status === "incident") {
      suggestions.push({
        id: `inc-${o.id}`,
        icon: AlertTriangle,
        tone: "danger",
        title: `Incident à résoudre · ${o.shopifyOrderNumber}`,
        description: `Litige en cours avec ${nameOf(o.selectedSupplierId)}.`,
        onClick: () => onOpenOrder(o.id),
        priority: 1,
      });
    } else if (o.trackingStatus === "delayed") {
      suggestions.push({
        id: `late-${o.id}`,
        icon: Truck,
        tone: "danger",
        title: `Expédition en retard · ${o.shopifyOrderNumber}`,
        description: `Délai dépassé chez ${nameOf(o.selectedSupplierId)}. Demandez le suivi.`,
        onClick: () => onOpenOrder(o.id),
        priority: 2,
      });
    } else if (o.paymentStatus === "to_pay") {
      suggestions.push({
        id: `pay-${o.id}`,
        icon: CreditCard,
        tone: "warning",
        title: `Paiement à effectuer · ${o.shopifyOrderNumber}`,
        description: `${nameOf(o.selectedSupplierId)} sélectionné. Réglez pour lancer la production.`,
        href: "/payments",
        priority: 3,
      });
    }

    const oq = quotes.filter((q) => q.orderId === o.id);
    if (oq.length >= 2 && !o.selectedSupplierId) {
      suggestions.push({
        id: `cmp-${o.id}`,
        icon: Scale,
        tone: "primary",
        title: `${oq.length} devis à comparer · ${o.shopifyOrderNumber}`,
        description: `Recommandation IA prête : ${nameOf(o.recommendedSupplierId)}.`,
        href: `/comparison?order=${o.id}`,
        priority: 4,
      });
    }
  }

  for (const c of conversations) {
    if (c.status !== "awaiting_reply") continue;
    const hoursSince = (Date.now() - new Date(c.lastMessageAt).getTime()) / 3.6e6;
    if (hoursSince >= rules.autoReminderHours) {
      const o = orders.find((x) => x.id === c.orderId);
      suggestions.push({
        id: `rem-${c.id}`,
        icon: BellRing,
        tone: "info",
        title: `Relancer ${nameOf(c.supplierId)}`,
        description: `Sans réponse depuis ${Math.round(hoursSince)} h · ${o?.shopifyOrderNumber ?? ""}.`,
        href: `/inbox?c=${c.id}`,
        priority: 5,
      });
    }
  }

  const top = suggestions.sort((a, b) => a.priority - b.priority).slice(0, 4);

  return (
    <Card className="overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
            <Sparkles className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Tour de contrôle IA
              <StatusDot color="bg-primary" size="sm" />
            </CardTitle>
            <p className="text-sm text-muted-foreground">Vos actions prioritaires</p>
          </div>
        </div>
        {top.length > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-muted-foreground tabular-nums">
            {top.length} action{top.length > 1 ? "s" : ""}
          </span>
        )}
      </CardHeader>

      <div className="px-2 pb-2">
        {top.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Rien d&apos;urgent. Tout est sous contrôle ✨
          </p>
        ) : (
          <div className="space-y-1">
            {top.map((s) => {
              const Icon = s.icon;
              const st = TONE_STYLES[s.tone];
              const inner = (
                <div className="group relative flex w-full items-center gap-3 rounded-xl py-2.5 pl-4 pr-2.5 text-left transition-colors hover:bg-secondary/60">
                  <span className={cn("absolute bottom-0 left-0 top-0 my-auto h-7 w-1 rounded-r-full", st.bar)} />
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", st.box)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                  </div>
                  <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold sm:inline-flex", st.chip)}>
                    {st.level}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                </div>
              );
              return s.href ? (
                <Link key={s.id} href={s.href}>
                  {inner}
                </Link>
              ) : (
                <button key={s.id} onClick={s.onClick} className="w-full">
                  {inner}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
