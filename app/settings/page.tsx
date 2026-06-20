"use client";

import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Percent,
  Clock,
  ShieldCheck,
  Scale,
  Sparkles,
  Star,
  Ban,
  Globe,
  RotateCcw,
  Coins,
  BellRing,
  PackageCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, flag, formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { getRecommendation, selectQuotesForOrder, useHydrated } from "@/lib/store/selectors";
import { toast } from "@/lib/store/toast";
import type { RecommendationWeights } from "@/types";

const WEIGHT_META: { key: keyof RecommendationWeights; label: string; icon: typeof Percent }[] = [
  { key: "price", label: "Prix", icon: Coins },
  { key: "delay", label: "Délai", icon: Clock },
  { key: "reliability", label: "Fiabilité", icon: ShieldCheck },
  { key: "stock", label: "Stock", icon: PackageCheck },
  { key: "margin", label: "Marge", icon: Percent },
];

export default function SettingsPage() {
  const hydrated = useHydrated();
  const rules = useStore((s) => s.rules);
  const suppliers = useStore((s) => s.suppliers);
  const orders = useStore((s) => s.orders);
  const quotes = useStore((s) => s.quotes);
  const updateRules = useStore((s) => s.updateRules);
  const togglePreferred = useStore((s) => s.togglePreferredSupplier);
  const toggleBlock = useStore((s) => s.toggleBlockSupplier);
  const resetDemo = useStore((s) => s.resetDemo);

  const [confirmReset, setConfirmReset] = useState(false);

  // Live preview order (first with >=2 quotes)
  const previewOrder = useMemo(
    () => orders.find((o) => selectQuotesForOrder(quotes, o.id).length >= 2) ?? null,
    [orders, quotes],
  );
  const recommendation = useMemo(
    () => (previewOrder ? getRecommendation({ quotes, suppliers, rules }, previewOrder) : null),
    [previewOrder, quotes, suppliers, rules],
  );
  const recommendedSupplier = suppliers.find((s) => s.id === recommendation?.recommendedSupplierId);

  const weightSum = Object.values(rules.weights).reduce((a, b) => a + b, 0) || 1;
  const countries = Array.from(new Set(suppliers.map((s) => s.countryCode)));

  const setWeight = (key: keyof RecommendationWeights, value: number) =>
    updateRules({ weights: { ...rules.weights, [key]: value } });

  if (!hydrated) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Margins & delays */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" /> Marges &amp; délais
            </CardTitle>
            <CardDescription>Seuils appliqués pour qualifier un fournisseur.</CardDescription>
          </CardHeader>
          <div className="space-y-1 px-5 pb-5">
            <SliderRow
              title="Marge minimale"
              description="En dessous, le fournisseur est exclu."
              value={rules.minimumMarginPercent}
              min={0}
              max={80}
              suffix=" %"
              onChange={(v) => updateRules({ minimumMarginPercent: v })}
            />
            <SliderRow
              title="Délai de livraison maximum"
              description="Au-delà, le devis est jugé non conforme."
              value={rules.maximumDeliveryDays}
              min={3}
              max={45}
              suffix=" j"
              onChange={(v) => updateRules({ maximumDeliveryDays: v })}
            />
            <SliderRow
              title="Validation manuelle au-dessus de"
              description="Un montant élevé nécessite votre confirmation."
              value={rules.manualValidationAbove}
              min={0}
              max={2000}
              step={50}
              format={(v) => formatCurrency(v, "EUR", { decimals: 0 })}
              onChange={(v) => updateRules({ manualValidationAbove: v })}
            />
            <SliderRow
              title="Relance automatique"
              description="Sans réponse fournisseur après ce délai."
              value={rules.autoReminderHours}
              min={2}
              max={72}
              suffix=" h"
              icon={BellRing}
              onChange={(v) => updateRules({ autoReminderHours: v })}
            />
          </div>
        </Card>

        {/* Stock & reliability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Stock &amp; fiabilité
            </CardTitle>
          </CardHeader>
          <div className="space-y-1 px-5 pb-5">
            <SwitchRow
              title="Privilégier le stock confirmé"
              description="Pénalise fortement les devis au stock incertain."
              checked={rules.preferConfirmedStock}
              onChange={(v) => updateRules({ preferConfirmedStock: v })}
            />
            <SliderRow
              title="Exclure si fiabilité inférieure à"
              description="Les fournisseurs peu fiables sont écartés."
              value={rules.excludeReliabilityBelow}
              min={0}
              max={100}
              onChange={(v) => updateRules({ excludeReliabilityBelow: v })}
            />
          </div>
        </Card>

        {/* Recommendation weights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Pondération de la recommandation
            </CardTitle>
            <CardDescription>Réglez l&apos;importance de chaque critère. La recommandation se met à jour en direct.</CardDescription>
          </CardHeader>
          <div className="space-y-1 px-5 pb-5">
            {WEIGHT_META.map((w) => {
              const Icon = w.icon;
              const pct = Math.round((rules.weights[w.key] / weightSum) * 100);
              return (
                <div key={w.key} className="py-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" /> {w.label}
                    </span>
                    <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {pct} %
                    </span>
                  </div>
                  <Slider value={rules.weights[w.key]} min={0} max={100} onValueChange={(v) => setWeight(w.key, v)} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Suppliers preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" /> Fournisseurs &amp; pays
            </CardTitle>
            <CardDescription>Préférés, bloqués et pays autorisés.</CardDescription>
          </CardHeader>
          <div className="space-y-4 px-5 pb-5">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Préférés</div>
              <div className="flex flex-wrap gap-2">
                {suppliers.map((s) => (
                  <Chip key={s.id} active={s.preferred} onClick={() => togglePreferred(s.id)} icon={Star} tone="primary">
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bloqués</div>
              <div className="flex flex-wrap gap-2">
                {suppliers.map((s) => (
                  <Chip key={s.id} active={s.blocked} onClick={() => toggleBlock(s.id)} icon={Ban} tone="danger">
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pays autorisés {rules.allowedCountries.length === 0 && "(tous)"}
              </div>
              <div className="flex flex-wrap gap-2">
                {countries.map((code) => {
                  const active = rules.allowedCountries.includes(code);
                  return (
                    <Chip
                      key={code}
                      active={active}
                      onClick={() =>
                        updateRules({
                          allowedCountries: active
                            ? rules.allowedCountries.filter((c) => c !== code)
                            : [...rules.allowedCountries, code],
                        })
                      }
                      icon={Globe}
                      tone="info"
                    >
                      {flag(code)} {code}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Danger zone */}
        <Card className="border-danger/20">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Réinitialiser la démo</div>
              <div className="text-xs text-muted-foreground">Restaure les données de démonstration d&apos;origine.</div>
            </div>
            {confirmReset ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    resetDemo();
                    setConfirmReset(false);
                    toast("Démo réinitialisée", { tone: "success" });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Confirmer
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-20 space-y-4">
          <Card className="overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <CardHeader className="flex-row items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
                <Sparkles className="h-[18px] w-[18px] text-white" />
              </div>
              <div>
                <CardTitle>Aperçu en direct</CardTitle>
                <CardDescription>{previewOrder?.shopifyOrderNumber} · {previewOrder?.productName}</CardDescription>
              </div>
            </CardHeader>
            <div className="px-5 pb-5">
              {recommendedSupplier ? (
                <div className="rounded-xl border border-primary/25 bg-primary-soft/40 p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={recommendedSupplier.initials} seed={recommendedSupplier.id} />
                    <div className="min-w-0 flex-1">
                      <div className="text-2xs font-medium uppercase tracking-wider text-primary">Recommandé</div>
                      <div className="truncate text-sm font-semibold">{recommendedSupplier.name}</div>
                    </div>
                    <span className="text-lg font-semibold text-primary tabular-nums">
                      {recommendation?.scores.find((s) => s.supplierId === recommendedSupplier.id)?.total}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-danger-soft p-3 text-xs text-danger">
                  Aucun fournisseur ne respecte vos règles actuelles.
                </p>
              )}

              <div className="mt-3 space-y-1.5">
                {recommendation?.scores.map((s) => {
                  const sup = suppliers.find((x) => x.id === s.supplierId);
                  return (
                    <div key={s.supplierId} className="flex items-center gap-2 text-xs">
                      <span className={cn("h-1.5 w-1.5 rounded-full", s.eligible ? "bg-success" : "bg-danger")} />
                      <span className="flex-1 truncate text-muted-foreground">{sup?.name}</span>
                      <span className="font-semibold tabular-nums">{s.total}</span>
                    </div>
                  );
                })}
              </div>

              {recommendation?.explanation && (
                <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                  {recommendation.explanation}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- local controls --------------------------------------------------------
function SliderRow({
  title,
  description,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  icon: Icon,
  format,
  onChange,
}: {
  title: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  icon?: typeof Clock;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="border-b border-border/50 py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <span className="shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-sm font-semibold tabular-nums">
          {format ? format(value) : `${value}${suffix}`}
        </span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </div>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  icon: Icon,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Star;
  tone: "primary" | "danger" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    primary: "border-primary/40 bg-primary-soft text-primary",
    danger: "border-danger/40 bg-danger-soft text-danger",
    info: "border-info/40 bg-info-soft text-info",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active ? tones[tone] : "border-border bg-white text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", active && tone === "primary" && "fill-current")} />
      {children}
    </button>
  );
}
