"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, MessageSquareReply } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Field } from "@/components/ui/input";
import { StockBadge } from "@/components/ui/status-badge";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import { mockExtract } from "@/lib/ai/extractQuoteFromMessage";
import { requestQuoteExtraction } from "@/lib/ai/requests";
import { formatCurrency, formatDelay } from "@/lib/utils";
import type { Conversation, Order, Supplier } from "@/types";

export function SimulateReplyDialog({
  conversation,
  order,
  supplier,
  open,
  onOpenChange,
}: {
  conversation: Conversation;
  order: Order;
  supplier: Supplier;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const simulateSupplierReply = useStore((s) => s.simulateSupplierReply);
  const addQuoteFromExtraction = useStore((s) => s.addQuoteFromExtraction);

  const suggested = useMemo(() => {
    const product = Math.max(8, Math.round(order.targetMaxCost * 0.72));
    const shipping = Math.max(4, Math.round(order.targetMaxCost * 0.2));
    return `Hello! Price ${product}€, shipping ${shipping}€, total ${product + shipping}€. Delivery 10-14 days. Stock confirmed, ready to ship.`;
  }, [order.targetMaxCost]);

  const [text, setText] = useState(suggested);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setText(suggested);
  }, [open, suggested]);

  const preview = useMemo(() => mockExtract(text), [text]);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const msg = simulateSupplierReply(conversation.id, text.trim());
    const extracted = await requestQuoteExtraction(text.trim());
    addQuoteFromExtraction({
      orderId: order.id,
      supplierId: supplier.id,
      conversationId: conversation.id,
      messageId: msg.id,
      extracted,
    });
    setLoading(false);
    toast("Devis extrait du message", {
      description: `${supplier.name} · total ${formatCurrency(extracted.totalCost || extracted.productCost + extracted.shippingCost)}`,
      tone: "success",
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Simuler une réponse fournisseur"
      description={`${supplier.name} · ${order.shopifyOrderNumber}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} loading={loading}>
            <Sparkles className="h-4 w-4" />
            Ajouter &amp; extraire le devis
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <Field
          label="Réponse du fournisseur"
          hint="Le devis sera extrait automatiquement (Claude si configuré, sinon analyse locale)."
        >
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[110px]" />
        </Field>

        {/* Live extraction preview */}
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MessageSquareReply className="h-3.5 w-3.5" />
            Aperçu de l&apos;extraction
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Line label="Produit" value={formatCurrency(preview.productCost)} />
            <Line label="Livraison" value={formatCurrency(preview.shippingCost)} />
            <Line label="Total" value={formatCurrency(preview.totalCost || preview.productCost + preview.shippingCost)} strong />
            <Line label="Délai" value={preview.deliveryMaxDays ? formatDelay(preview.deliveryMinDays, preview.deliveryMaxDays) : "—"} />
          </div>
          <div className="mt-2.5">
            <StockBadge status={preview.stockStatus} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
