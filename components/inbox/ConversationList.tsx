"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn, timeAgo } from "@/lib/utils";
import type { Conversation, Order, Supplier } from "@/types";

const STATUS_DOT: Record<Conversation["status"], string> = {
  active: "bg-success",
  awaiting_reply: "bg-warning",
  quote_received: "bg-info",
  selected: "bg-primary",
  closed: "bg-muted-foreground",
};

export function ConversationList({
  conversations,
  suppliers,
  orders,
  activeId,
  onSelect,
  query,
  onQuery,
}: {
  conversations: Conversation[];
  suppliers: Supplier[];
  orders: Order[];
  activeId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Rechercher…"
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sorted.map((c) => {
          const supplier = suppliers.find((s) => s.id === c.supplierId);
          const order = orders.find((o) => o.id === c.orderId);
          const last = c.messages[c.messages.length - 1];
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors",
                active ? "bg-primary-soft/70 ring-1 ring-primary/15" : "hover:bg-secondary/60",
              )}
            >
              <div className="relative">
                <Avatar initials={supplier?.initials ?? "?"} seed={c.supplierId} online={supplier?.online} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{supplier?.name}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground/70">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[c.status])} />
                  <span className="truncate text-2xs text-muted-foreground">{order?.shopifyOrderNumber}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {last?.senderType === "merchant" && "Vous : "}
                  {last?.content.split("\n")[0]}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <span className="mt-1 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
