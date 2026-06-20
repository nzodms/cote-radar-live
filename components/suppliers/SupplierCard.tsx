"use client";

import { useRouter } from "next/navigation";
import {
  Star,
  Ban,
  MessageSquare,
  MoreVertical,
  Pencil,
  Trash2,
  ShieldCheck,
  Clock,
  Coins,
  ShoppingBag,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover } from "@/components/ui/popover";
import { cn, flag, formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import type { Supplier } from "@/types";

function ScoreRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 90 ? "hsl(var(--success))" : value >= 75 ? "hsl(var(--primary))" : "hsl(var(--warning))";
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--muted-foreground) / 0.15)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function SupplierCard({ supplier, onEdit }: { supplier: Supplier; onEdit: (s: Supplier) => void }) {
  const router = useRouter();
  const conversations = useStore((s) => s.conversations);
  const togglePreferred = useStore((s) => s.togglePreferredSupplier);
  const toggleBlock = useStore((s) => s.toggleBlockSupplier);
  const deleteSupplier = useStore((s) => s.deleteSupplier);

  const contact = () => {
    const conv = conversations.find((c) => c.supplierId === supplier.id);
    router.push(conv ? `/inbox?c=${conv.id}` : "/inbox");
  };

  return (
    <Card interactive className={cn("flex h-full flex-col p-5", supplier.blocked && "opacity-70")}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar initials={supplier.initials} seed={supplier.id} online={supplier.online} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold">{supplier.name}</h3>
            {supplier.preferred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            {supplier.blocked && (
              <Badge tone="danger" size="sm">
                <Ban className="h-3 w-3" /> Bloqué
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {flag(supplier.countryCode)} {supplier.country} · {supplier.specialty}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
            <Phone className="h-3 w-3" /> {supplier.whatsappNumber}
          </p>
        </div>
        <ScoreRing value={supplier.reliabilityScore} />
      </div>

      {/* Tags */}
      {supplier.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {supplier.tags.map((t) => (
            <Badge key={t} tone="neutral" size="sm">{t}</Badge>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat icon={Clock} label="Délai moy." value={`${supplier.averageDelayDays} j`} />
        <Stat icon={Coins} label="Coût moy." value={supplier.averageCost ? formatCurrency(supplier.averageCost, "EUR", { decimals: 0 }) : "—"} />
        <Stat icon={ShoppingBag} label="Commandes" value={String(supplier.totalOrders)} />
        <Stat icon={ShieldCheck} label="Perf. 90 j" value={`${supplier.performance90d} %`} />
        <Stat icon={Coins} label="Total payé" value={formatCurrency(supplier.totalPaid, "EUR", { decimals: 0 })} />
        <Stat icon={AlertTriangle} label="Incidents" value={String(supplier.incidents)} tone={supplier.incidents > 3 ? "danger" : undefined} />
      </div>

      {/* Notes */}
      {supplier.notes && (
        <p className="mt-3 line-clamp-2 rounded-lg bg-secondary/40 p-2.5 text-xs italic text-muted-foreground">
          {supplier.notes}
        </p>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button size="sm" className="flex-1" onClick={contact}>
          <MessageSquare className="h-3.5 w-3.5" /> Contacter
        </Button>
        <Button size="sm" variant="outline" onClick={() => onEdit(supplier)}>
          <Pencil className="h-3.5 w-3.5" /> Modifier
        </Button>
        <Popover
          align="end"
          trigger={
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </span>
          }
          contentClassName="w-52"
        >
          {(close) => (
            <div className="text-sm">
              <MenuItem
                icon={Star}
                onClick={() => {
                  togglePreferred(supplier.id);
                  toast(supplier.preferred ? "Retiré des préférés" : "Marqué comme préféré", { tone: "success" });
                  close();
                }}
              >
                {supplier.preferred ? "Retirer des préférés" : "Marquer préféré"}
              </MenuItem>
              <MenuItem
                icon={Ban}
                onClick={() => {
                  toggleBlock(supplier.id);
                  toast(supplier.blocked ? "Fournisseur débloqué" : "Fournisseur bloqué", {
                    tone: supplier.blocked ? "success" : "warning",
                  });
                  close();
                }}
              >
                {supplier.blocked ? "Débloquer" : "Bloquer"}
              </MenuItem>
              <div className="my-1 h-px bg-border" />
              <MenuItem
                icon={Trash2}
                danger
                onClick={() => {
                  deleteSupplier(supplier.id);
                  toast("Fournisseur supprimé", { tone: "danger" });
                  close();
                }}
              >
                Supprimer
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 p-2">
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "danger" && "text-danger")}>{value}</div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: typeof Star;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary",
        danger ? "text-danger hover:bg-danger-soft" : "text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
