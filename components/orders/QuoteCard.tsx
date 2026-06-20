import { Package, Truck, Clock, FileText } from "lucide-react";
import { StockBadge } from "@/components/ui/status-badge";
import { cn, formatCurrency, formatDelay } from "@/lib/utils";
import type { SupplierQuote } from "@/types";

interface QuoteCardProps {
  quote: SupplierQuote;
  salePrice?: number;
  quantity?: number;
  className?: string;
  title?: string;
}

/** Compact, embeddable quote summary (chat, drawer, comparison). */
export function QuoteCard({ quote, salePrice, quantity = 1, className, title = "Devis fournisseur" }: QuoteCardProps) {
  const margin = salePrice ? (salePrice - quote.totalCost) * quantity : null;
  const marginPct = salePrice ? ((salePrice - quote.totalCost) / salePrice) * 100 : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-white shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-secondary/40 px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" />
          {title}
        </span>
        <StockBadge status={quote.stockStatus} className="text-2xs" />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 py-3">
        <Row icon={Package} label="Produit" value={formatCurrency(quote.productCost, quote.currency)} />
        <Row icon={Truck} label="Livraison" value={formatCurrency(quote.shippingCost, quote.currency)} />
        <Row
          icon={Clock}
          label="Délai"
          value={formatDelay(quote.deliveryMinDays, quote.deliveryMaxDays)}
        />
        <div className="flex flex-col">
          <span className="text-2xs text-muted-foreground">Coût total</span>
          <span className="text-sm font-semibold">{formatCurrency(quote.totalCost, quote.currency)}</span>
        </div>
      </div>

      {margin !== null && (
        <div className="flex items-center justify-between border-t border-border/70 bg-success-soft/50 px-3.5 py-2">
          <span className="text-xs font-medium text-muted-foreground">Marge estimée</span>
          <span className="text-sm font-semibold text-success">
            {formatCurrency(margin)} · {marginPct!.toFixed(0)} %
          </span>
        </div>
      )}

      {quote.notes && (
        <p className="border-t border-border/70 px-3.5 py-2 text-xs italic text-muted-foreground">
          “{quote.notes}”
        </p>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
