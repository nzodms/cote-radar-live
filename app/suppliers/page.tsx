"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Plus, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierCard } from "@/components/suppliers/SupplierCard";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";
import type { Supplier } from "@/types";

function SuppliersContent() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const suppliers = useStore((s) => s.suppliers);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  // Deep link: open editor for ?supplier=
  useEffect(() => {
    const id = params.get("supplier");
    if (id) {
      const s = suppliers.find((x) => x.id === id);
      if (s) {
        setEditing(s);
        setDialogOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers
      .filter((s) => (filter === "preferred" ? s.preferred : filter === "blocked" ? s.blocked : true))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.specialty.toLowerCase().includes(q) ||
          s.country.toLowerCase().includes(q),
      );
  }, [suppliers, query, filter]);

  const tabs = [
    { key: "all", label: "Tous", count: suppliers.length },
    { key: "preferred", label: "Préférés", count: suppliers.filter((s) => s.preferred).length },
    { key: "blocked", label: "Bloqués", count: suppliers.filter((s) => s.blocked).length },
  ];

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented items={tabs} value={filter} onChange={setFilter} layoutId="suppliers-tabs" />
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="pl-9" />
          </div>
          <Button onClick={openAdd} className="shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter</span>
          </Button>
        </div>
      </div>

      {!hydrated ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="Aucun fournisseur"
          description="Ajoutez votre premier fournisseur pour commencer à demander des devis."
          className="mt-6"
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Ajouter un fournisseur
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <SupplierCard key={s.id} supplier={s} onEdit={openEdit} />
          ))}
        </div>
      )}

      <SupplierFormDialog supplier={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full animate-pulse rounded-2xl bg-muted/50" />}>
      <SuppliersContent />
    </Suspense>
  );
}
