"use client";

import { useEffect, useState } from "react";
import {
  Plug,
  RefreshCw,
  Package,
  ShoppingBag,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Store,
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";
import { toast } from "@/lib/store/toast";
import { apiTestConnection, apiSyncOrders, apiSyncProducts } from "@/lib/shopify/requests";
import type { ShopifyConnectionStatus } from "@/lib/shopify/types";

const SCOPES = ["read_orders", "read_products", "read_customers", "read_inventory"];

export default function ConnectionPage() {
  const hydrated = useHydrated();
  const dataSource = useStore((s) => s.dataSource);
  const shopify = useStore((s) => s.shopify);
  const importShopifyOrders = useStore((s) => s.importShopifyOrders);
  const importShopifyProducts = useStore((s) => s.importShopifyProducts);
  const setShopifyError = useStore((s) => s.setShopifyError);
  const loadDemoData = useStore((s) => s.loadDemoData);

  const [conn, setConn] = useState<ShopifyConnectionStatus | null>(null);
  const [busy, setBusy] = useState<null | "test" | "orders" | "products">(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiTestConnection().then(setConn);
  }, []);

  const runTest = async () => {
    setBusy("test");
    const s = await apiTestConnection();
    setConn(s);
    setBusy(null);
    if (!s.configured) toast("Shopify non configuré", { description: "Ajoutez vos variables d'environnement.", tone: "warning" });
    else if (s.ok) toast("Connexion réussie", { description: s.shopName, tone: "success" });
    else {
      setShopifyError(s.error ?? "Connexion échouée");
      toast("Connexion échouée", { description: s.error, tone: "danger" });
    }
  };

  const runSyncOrders = async () => {
    setBusy("orders");
    const r = await apiSyncOrders();
    setBusy(null);
    if (r.ok && r.orders) {
      importShopifyOrders(r.orders, { shopDomain: r.shopDomain, apiVersion: r.apiVersion });
      toast("Commandes synchronisées", { description: `${r.count} commande(s) importée(s)`, tone: "success" });
    } else {
      if (r.configured) setShopifyError(r.error ?? "Échec de la synchronisation");
      toast(r.configured ? "Échec de la synchronisation" : "Shopify non configuré", { description: r.error, tone: r.configured ? "danger" : "warning" });
    }
  };

  const runSyncProducts = async () => {
    setBusy("products");
    const r = await apiSyncProducts();
    setBusy(null);
    if (r.ok && r.products) {
      importShopifyProducts(r.products, { shopDomain: r.shopDomain, apiVersion: r.apiVersion });
      toast("Produits synchronisés", { description: `${r.count} produit(s) importé(s)`, tone: "success" });
    } else {
      if (r.configured) setShopifyError(r.error ?? "Échec de la synchronisation");
      toast(r.configured ? "Échec de la synchronisation" : "Shopify non configuré", { description: r.error, tone: r.configured ? "danger" : "warning" });
    }
  };

  const copyEnv = () => {
    navigator.clipboard?.writeText(
      "SHOPIFY_SHOP_DOMAIN=votre-boutique.myshopify.com\nSHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxx\nSHOPIFY_API_VERSION=2026-04\nSHOPIFY_WEBHOOK_SECRET=",
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Copié", { tone: "success" });
  };

  const mode =
    dataSource === "shopify"
      ? { label: "Shopify connecté", tone: "success" as const, icon: CheckCircle2, dot: "bg-success" }
      : dataSource === "error"
        ? { label: "Erreur Shopify", tone: "danger" as const, icon: AlertTriangle, dot: "bg-danger" }
        : { label: "Mode démo", tone: "warning" as const, icon: FlaskConical, dot: "bg-warning" };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Status card */}
        <Card className="overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
                <Plug className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Connexion Shopify</CardTitle>
                <CardDescription>Synchronisez vos commandes et produits réels.</CardDescription>
              </div>
            </div>
            {hydrated && (
              <Badge tone={mode.tone}>
                <span className={cn("h-1.5 w-1.5 rounded-full", mode.dot)} />
                {mode.label}
              </Badge>
            )}
          </CardHeader>

          <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4">
            <Info label="Domaine" value={conn === null ? null : conn.shop ?? shopify.shopDomain ?? "—"} icon={Store} />
            <Info label="Version API" value={conn === null ? null : conn.apiVersion} icon={KeyRound} />
            <Info
              label="Dernière sync"
              value={hydrated ? (shopify.lastSyncAt ? `${formatDate(shopify.lastSyncAt)} ${formatTime(shopify.lastSyncAt)}` : "Jamais") : null}
              icon={RefreshCw}
            />
            <Info
              label="Connexion"
              value={
                conn === null
                  ? null
                  : conn.configured
                    ? conn.ok
                      ? "Valide"
                      : "Échec"
                    : "Non configurée"
              }
              icon={ShieldCheck}
            />
          </div>

          {conn && !conn.configured && (
            <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/60 p-3.5 text-sm text-warning-foreground">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Aucune boutique configurée. L&apos;application fonctionne en <strong>mode démo</strong>.
                Configurez <code className="rounded bg-white/70 px-1 text-xs">SHOPIFY_SHOP_DOMAIN</code> et{" "}
                <code className="rounded bg-white/70 px-1 text-xs">SHOPIFY_ADMIN_ACCESS_TOKEN</code>, puis testez la connexion.
              </span>
            </div>
          )}
          {conn && conn.configured && !conn.ok && (
            <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft/60 p-3.5 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{conn.error}</span>
            </div>
          )}
          {conn && conn.configured && conn.ok && (
            <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success-soft/60 p-3.5 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Connecté à <strong>{conn.shopName}</strong> ({conn.shop}).</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border/60 px-5 py-4">
            <Button onClick={runTest} loading={busy === "test"} variant="secondary">
              <RefreshCw className="h-4 w-4" /> Tester la connexion
            </Button>
            <Button onClick={runSyncOrders} loading={busy === "orders"} disabled={!conn?.ok}>
              <ShoppingBag className="h-4 w-4" /> Synchroniser les commandes
            </Button>
            <Button onClick={runSyncProducts} loading={busy === "products"} disabled={!conn?.ok} variant="secondary">
              <Package className="h-4 w-4" /> Synchroniser les produits
            </Button>
            <Button onClick={() => { loadDemoData(); toast("Données démo restaurées", { tone: "success" }); }} variant="ghost">
              <FlaskConical className="h-4 w-4" /> Utiliser les données démo
            </Button>
          </div>
        </Card>

        {/* Sync stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-soft text-info">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              {hydrated ? <div className="text-xl font-semibold tabular-nums">{shopify.ordersImported}</div> : <Skeleton className="h-6 w-10" />}
              <div className="text-xs text-muted-foreground">Commandes importées</div>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Package className="h-5 w-5" />
            </span>
            <div>
              {hydrated ? <div className="text-xl font-semibold tabular-nums">{shopify.productsImported}</div> : <Skeleton className="h-6 w-10" />}
              <div className="text-xs text-muted-foreground">Produits importés</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> Configuration
            </CardTitle>
            <CardDescription>App personnalisée Shopify (privée).</CardDescription>
          </CardHeader>
          <div className="space-y-4 px-5 pb-5 text-sm">
            <ol className="space-y-2.5 text-muted-foreground">
              <Step n={1}>Shopify Admin → Settings → Apps and sales channels → Develop apps.</Step>
              <Step n={2}>Créez une app personnalisée et installez-la sur votre boutique.</Step>
              <Step n={3}>Copiez l&apos;Admin API access token (commence par <code className="rounded bg-secondary px-1 text-xs">shpat_</code>).</Step>
              <Step n={4}>Ajoutez les variables d&apos;environnement ci-dessous, puis testez.</Step>
            </ol>

            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Variables d&apos;environnement</span>
                <button onClick={copyEnv} className="flex items-center gap-1 text-2xs font-medium text-primary hover:text-primary-deep">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copier
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-2xs leading-relaxed text-foreground/80">
{`SHOPIFY_SHOP_DOMAIN=ma-boutique.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxx
SHOPIFY_API_VERSION=2026-04
SHOPIFY_WEBHOOK_SECRET=`}
              </pre>
            </div>

            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Scopes requis</div>
              <div className="flex flex-wrap gap-1.5">
                {SCOPES.map((s) => (
                  <Badge key={s} tone="neutral" size="sm" className="font-mono">{s}</Badge>
                ))}
              </div>
              <p className="mt-2 text-2xs text-muted-foreground">
                Les champs client (nom, pays) nécessitent l&apos;accès aux données client protégées.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-white p-2.5 text-2xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Le token reste côté serveur (variables d&apos;environnement) et n&apos;est jamais exposé au navigateur.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string | null; icon: typeof Store }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {value === null ? <Skeleton className="mt-1.5 h-4 w-20" /> : <div className="mt-1 truncate text-sm font-semibold">{value}</div>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xs font-bold text-primary">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
