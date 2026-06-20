"use client";

import { Check, CheckCheck, Sparkles, ImageIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { QuoteCard } from "@/components/orders/QuoteCard";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/types";

export function MessageBubble({
  message,
  supplierInitials,
  supplierId,
  salePrice,
  quantity,
  onExtract,
}: {
  message: Message;
  supplierInitials: string;
  supplierId: string;
  salePrice?: number;
  quantity?: number;
  onExtract?: (m: Message) => void;
}) {
  if (message.senderType === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-secondary px-3 py-1 text-2xs text-muted-foreground">{message.content}</span>
      </div>
    );
  }

  const isMerchant = message.senderType === "merchant";
  const couldHaveQuote =
    !isMerchant && !message.quote && /\d/.test(message.content) && /(€|eur|\$|price|prix|day|jour|stock)/i.test(message.content);

  return (
    <div className={cn("flex items-end gap-2", isMerchant ? "justify-end" : "justify-start")}>
      {!isMerchant && <Avatar initials={supplierInitials} seed={supplierId} size="sm" className="!h-7 !w-7 self-end" />}

      <div className={cn("flex max-w-[78%] flex-col gap-1.5", isMerchant ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs",
            isMerchant
              ? "rounded-br-md bg-primary-gradient text-primary-foreground"
              : "rounded-bl-md border border-border bg-white text-foreground",
          )}
        >
          {message.attachments?.some((a) => a.type === "image") && (
            <span className="mb-1 flex items-center gap-1 text-2xs opacity-80">
              <ImageIcon className="h-3 w-3" /> Photo produit
            </span>
          )}
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.quote && (
          <QuoteCard
            quote={message.quote}
            salePrice={salePrice}
            quantity={quantity}
            className="w-[280px] max-w-full"
            title="Devis extrait"
          />
        )}

        {couldHaveQuote && onExtract && (
          <button
            onClick={() => onExtract(message)}
            className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/60 px-2.5 py-1 text-2xs font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            <Sparkles className="h-3 w-3" />
            Extraire le devis
          </button>
        )}

        <div className={cn("flex items-center gap-1 px-1 text-2xs text-muted-foreground/70", isMerchant && "flex-row-reverse")}>
          <span>{formatTime(message.timestamp)}</span>
          {isMerchant && message.status && (
            <span className="text-primary">
              {message.status === "read" ? (
                <CheckCheck className="h-3 w-3" />
              ) : message.status === "delivered" ? (
                <CheckCheck className="h-3 w-3 opacity-60" />
              ) : (
                <Check className="h-3 w-3 opacity-60" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
