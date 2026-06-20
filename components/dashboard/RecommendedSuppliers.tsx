"use client";

import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { flag } from "@/lib/utils";
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
          className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-deep"
        >
          Tous
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <div className="space-y-3 px-5 pb-5">
        {top.map((s) => (
          <Link
            key={s.id}
            href={`/suppliers?supplier=${s.id}`}
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/50"
          >
            <Avatar initials={s.initials} seed={s.id} online={s.online} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.preferred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
              </div>
              <div className="truncate text-2xs text-muted-foreground">
                {flag(s.countryCode)} {s.specialty}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Progress
                  value={s.reliabilityScore}
                  tone={s.reliabilityScore >= 90 ? "success" : s.reliabilityScore >= 75 ? "primary" : "warning"}
                  className="h-1.5 flex-1"
                />
                <span className="text-2xs font-semibold tabular-nums text-muted-foreground">{s.reliabilityScore}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
