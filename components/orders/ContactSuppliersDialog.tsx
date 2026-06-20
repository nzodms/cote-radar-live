"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check, Star, MessageSquare, Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import { requestSupplierMessage } from "@/lib/ai/requests";
import { createWhatsAppMessageLink } from "@/lib/whatsapp/createWhatsAppMessageLink";
import type { Order, Supplier } from "@/types";

function personalize(message: string, name: string): string {
  if (/^bonjour/i.test(message.trimStart())) {
    return message.replace(/^(\s*)bonjour[^\n,]*,?/i, `$1Bonjour ${name},`);
  }
  return `Bonjour ${name},\n\n${message}`;
}

export function ContactSuppliersDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const suppliers = useStore((s) => s.suppliers);
  const contactSuppliers = useStore((s) => s.contactSuppliers);

  const available = useMemo(() => suppliers.filter((s) => !s.blocked), [suppliers]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [source, setSource] = useState<"ai" | "mock" | null>(null);

  // Initialize selection + auto-generate message when opening.
  useEffect(() => {
    if (!open) return;
    const defaults = available
      .slice()
      .sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.reliabilityScore - a.reliabilityScore)
      .slice(0, 3)
      .map((s) => s.id);
    setSelected(new Set(defaults));
    if (!message) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generate = async () => {
    setGenerating(true);
    const res = await requestSupplierMessage({
      productName: order.productName,
      variant: order.variant,
      quantity: order.quantity,
      country: order.country,
      targetMaxCost: order.targetMaxCost,
      language: "fr",
    });
    setMessage(res.message);
    setSource(res.source);
    setGenerating(false);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const ids = Array.from(selected);

  const handleSend = (openWhatsApp: boolean) => {
    if (ids.length === 0) {
      toast("Sélectionnez au moins un fournisseur", { tone: "warning" });
      return;
    }
    contactSuppliers({
      orderId: order.id,
      supplierIds: ids,
      buildMessage: (s) => personalize(message, s.name),
    });

    if (openWhatsApp) {
      ids.forEach((id) => {
        const s = suppliers.find((x) => x.id === id);
        if (s) window.open(createWhatsAppMessageLink(s.whatsappNumber, personalize(message, s.name)), "_blank");
      });
    }

    toast(`Demande envoyée à ${ids.length} fournisseur${ids.length > 1 ? "s" : ""}`, {
      description: `${order.shopifyOrderNumber} · conversations créées dans la messagerie`,
      tone: "success",
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Contacter les fournisseurs"
      description={`${order.shopifyOrderNumber} · ${order.productName}`}
      footer={
        <>
          <Button variant="outline" onClick={() => handleSend(true)}>
            <MessageSquare className="h-4 w-4" />
            Préparer WhatsApp
          </Button>
          <Button onClick={() => handleSend(false)}>
            <Send className="h-4 w-4" />
            Envoyer la demande ({ids.length})
          </Button>
        </>
      }
    >
      <div className="space-y-5 py-2">
        {/* Suppliers */}
        <div>
          <Label>Fournisseurs à contacter</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {available.map((s) => (
              <SupplierPick key={s.id} supplier={s} checked={selected.has(s.id)} onToggle={() => toggle(s.id)} />
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Message fournisseur</Label>
            <div className="flex items-center gap-2">
              {source && (
                <Badge tone={source === "ai" ? "primary" : "neutral"} size="sm">
                  <Sparkles className="h-3 w-3" />
                  {source === "ai" ? "Généré par Claude" : "Modèle intelligent"}
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={generate} loading={generating}>
                <Sparkles className="h-3.5 w-3.5" />
                Régénérer
              </Button>
            </div>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[180px] font-mono text-xs leading-relaxed"
            placeholder={generating ? "Génération du message en cours…" : "Votre message…"}
          />
          <p className="mt-1.5 text-2xs text-muted-foreground">
            Le message est personnalisé automatiquement avec le nom de chaque fournisseur.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function SupplierPick({
  supplier,
  checked,
  onToggle,
}: {
  supplier: Supplier;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
        checked
          ? "border-primary/40 bg-primary-soft/60 shadow-xs"
          : "border-border bg-white hover:border-border-strong hover:bg-secondary/40",
      )}
    >
      <Avatar initials={supplier.initials} seed={supplier.id} size="sm" online={supplier.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{supplier.name}</span>
          {supplier.preferred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
        </div>
        <div className="truncate text-2xs text-muted-foreground">
          {supplier.specialty} · fiab. {supplier.reliabilityScore}
        </div>
      </div>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked ? "border-primary bg-primary text-white" : "border-border bg-white",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
