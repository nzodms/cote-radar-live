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

const TONE_BG: Record<BadgeTone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
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
        description: `Litige en cours avec ${nameOf(o.selectedSupplierId)}. Contactez le fournisseur.`,
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
        description: `Aucune réponse depuis ${Math.round(hoursSince)} h pour ${o?.shopifyOrderNumber ?? ""}.`,
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
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
            <Sparkles className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Tour de contrôle IA
              <StatusDot color="bg-primary" size="sm" />
            </CardTitle>
            <p className="text-sm text-muted-foreground">Vos prochaines actions prioritaires</p>
          </div>
        </div>
      </CardHeader>

      <div className="px-2 pb-2">
        {top.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Rien d&apos;urgent. Tout est sous contrôle ✨
          </p>
        ) : (
          <div className="space-y-1">
            {top.map((s) => {
              const Icon = s.icon;
              const inner = (
                <div className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE_BG[s.tone])}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
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
