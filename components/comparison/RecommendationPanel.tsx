"use client";

import { Sparkles, Check, X, Info } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { RecommendationResult, Supplier } from "@/types";

export function RecommendationPanel({
  recommendation,
  suppliers,
}: {
  recommendation: RecommendationResult;
  suppliers: Supplier[];
}) {
  const nameOf = (id: string) => suppliers.find((s) => s.id === id);

  return (
    <Card className="overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <CardHeader className="flex-row items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
          <Sparkles className="h-[18px] w-[18px] text-white" />
        </div>
        <div>
          <CardTitle>Analyse &amp; recommandation</CardTitle>
          <p className="text-sm text-muted-foreground">Calculée à partir de vos règles IA</p>
        </div>
      </CardHeader>

      <div className="space-y-4 px-5 pb-5">
        <p className="rounded-xl border border-primary/15 bg-primary-soft/50 p-3.5 text-sm leading-relaxed text-foreground/85">
          {recommendation.explanation || "Ajoutez au moins deux devis pour obtenir une recommandation."}
        </p>

        <div className="space-y-2">
          {recommendation.scores.map((s, i) => {
            const supplier = nameOf(s.supplierId);
            if (!supplier) return null;
            const isRec = s.supplierId === recommendation.recommendedSupplierId;
            return (
              <div
                key={s.supplierId}
                className={cn(
                  "rounded-xl border p-3",
                  isRec ? "border-primary/30 bg-primary-soft/30" : "border-border bg-secondary/20",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-2xs font-bold text-muted-foreground ring-1 ring-border">
                    {i + 1}
                  </span>
                  <Avatar initials={supplier.initials} seed={supplier.id} size="sm" className="!h-7 !w-7" />
                  <span className="flex-1 truncate text-sm font-medium">{supplier.name}</span>
                  <span className={cn("text-sm font-semibold tabular-nums", isRec ? "text-primary" : "text-muted-foreground")}>
                    {s.total}/100
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full",
                      s.eligible ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                    )}
                  >
                    {s.eligible ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                </div>
                {(s.violations.length > 0 || s.reasons.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                    {s.violations.map((v) => (
                      <span key={v} className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-2xs text-danger">
                        <X className="h-2.5 w-2.5" /> {v}
                      </span>
                    ))}
                    {s.reasons.slice(0, 3).map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
                        <Info className="h-2.5 w-2.5" /> {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
