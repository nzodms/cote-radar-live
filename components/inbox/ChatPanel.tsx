"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  RefreshCw,
  Tag,
  Truck,
  ImageIcon,
  Package,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { SimulateReplyDialog } from "./SimulateReplyDialog";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import { requestQuoteExtraction } from "@/lib/ai/requests";
import { cn } from "@/lib/utils";
import type { Conversation, Order, Supplier, Message } from "@/types";
import type { BadgeTone } from "@/lib/labels";

const STATUS_LABEL: Record<Conversation["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Conversation active", tone: "success" },
  awaiting_reply: { label: "En attente de réponse", tone: "warning" },
  quote_received: { label: "Devis reçu", tone: "info" },
  selected: { label: "Fournisseur sélectionné", tone: "primary" },
  closed: { label: "Clôturée", tone: "neutral" },
};

const QUICK_ACTIONS = [
  { key: "relance", icon: RefreshCw, label: "Relancer", text: "Bonjour, avez-vous eu le temps de regarder ma demande ? Merci d'avance." },
  { key: "price", icon: Tag, label: "Demander prix", text: "Pouvez-vous me confirmer votre meilleur prix produit + livraison ainsi que le délai ?" },
  { key: "tracking", icon: Truck, label: "Demander suivi", text: "Le paiement est effectué. Pouvez-vous m'envoyer le numéro de suivi ? Merci." },
];

export function ChatPanel({
  conversation,
  supplier,
  order,
}: {
  conversation: Conversation;
  supplier: Supplier;
  order: Order;
}) {
  const sendMerchantMessage = useStore((s) => s.sendMerchantMessage);
  const appendMessage = useStore((s) => s.appendMessage);
  const addQuoteFromExtraction = useStore((s) => s.addQuoteFromExtraction);

  const [input, setInput] = useState("");
  const [simulateOpen, setSimulateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.messages.length, conversation.id]);

  const send = () => {
    if (!input.trim()) return;
    sendMerchantMessage(conversation.id, input);
    setInput("");
  };

  const sendPhoto = () => {
    appendMessage(conversation.id, {
      senderType: "merchant",
      content: "Voici la photo du produit concerné.",
      timestamp: new Date().toISOString(),
      channel: "whatsapp",
      status: "sent",
      attachments: [{ id: "att", type: "image", url: order.productImage, name: order.productName }],
    });
  };

  const handleExtract = async (m: Message) => {
    const extracted = await requestQuoteExtraction(m.content);
    addQuoteFromExtraction({
      orderId: order.id,
      supplierId: supplier.id,
      conversationId: conversation.id,
      messageId: m.id,
      extracted,
    });
    toast("Devis extrait", { description: supplier.name, tone: "success" });
  };

  const status = STATUS_LABEL[conversation.status];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-white/50 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar initials={supplier.initials} seed={supplier.id} online={supplier.online} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{supplier.name}</span>
              <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
                <Package className="h-3 w-3" />
                {order.shopifyOrderNumber}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", supplier.online ? "bg-success" : "bg-muted-foreground/40")} />
              {supplier.online ? "En ligne" : "Hors ligne"} · {supplier.whatsappNumber}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={status.tone} className="hidden md:inline-flex">{status.label}</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSimulateOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Simuler réponse</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-secondary/20 to-transparent px-4 py-4">
        {conversation.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            supplierInitials={supplier.initials}
            supplierId={supplier.id}
            salePrice={order.salePrice}
            quantity={order.quantity}
            onExtract={handleExtract}
          />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-white/60 p-3 backdrop-blur-xl">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {QUICK_ACTIONS.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.key}
                onClick={() => setInput(qa.text)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <Icon className="h-3 w-3" />
                {qa.label}
              </button>
            );
          })}
          <button
            onClick={sendPhoto}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            <ImageIcon className="h-3 w-3" />
            Photo produit
          </button>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Écrivez un message…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm shadow-xs transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
          />
          <Button size="icon" onClick={send} disabled={!input.trim()} className="h-[42px] w-[42px] shrink-0">
            <Send className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      <SimulateReplyDialog
        conversation={conversation}
        order={order}
        supplier={supplier}
        open={simulateOpen}
        onOpenChange={setSimulateOpen}
      />
    </div>
  );
}
