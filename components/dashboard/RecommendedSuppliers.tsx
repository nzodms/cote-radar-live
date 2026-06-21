"use client";

import Link from "next/link";
import { ArrowRight, Star, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { cn, flag } from "@/lib/utils";
import type { Supplier } from "@/types";

export function RecommendedSuppliers({ suppliers }: { suppliers: Supplier[] }) {
  const top = suppliers
    .filter((s) => !s.blocked)
    .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    .slice(0, 4);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Fournisseurs recommandés</CardTitle>
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
        >
          Tous
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <div className="space-y-1 px-2 pb-3">
        {top.map((s) => {
          const tone =
            s.reliabilityScore >= 90 ? "bg-success" : s.reliabilityScore >= 75 ? "bg-primary" : "bg-warning";
          return (
            <Link
              key={s.id}
              href={`/suppliers?supplier=${s.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-secondary/60"
            >
              <Avatar initials={s.initials} seed={s.id} online={s.online} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {s.preferred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                </div>
                <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                  <span className="truncate">{flag(s.countryCode)} {s.specialty}</span>
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    <Clock className="h-2.5 w-2.5" /> {s.averageDelayDays} j
                  </span>
                </div>
                {/* reliability bar */}
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted-foreground/12">
                  <div className={cn("h-full rounded-full transition-all duration-700 ease-premium", tone)} style={{ width: `${s.reliabilityScore}%` }} />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-semibold tabular-nums">{s.reliabilityScore}</span>
                <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground/70">fiab.</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
