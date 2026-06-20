"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatPanel } from "@/components/inbox/ChatPanel";
import { OrderContextPanel } from "@/components/inbox/OrderContextPanel";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

function InboxContent() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const conversations = useStore((s) => s.conversations);
  const suppliers = useStore((s) => s.suppliers);
  const orders = useStore((s) => s.orders);
  const markRead = useStore((s) => s.markConversationRead);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const sortedIds = useMemo(
    () =>
      [...conversations]
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
        .map((c) => c.id),
    [conversations],
  );

  // Resolve active conversation from ?c= param or default to the most recent.
  useEffect(() => {
    const fromParam = params.get("c");
    if (fromParam && conversations.some((c) => c.id === fromParam)) {
      setActiveId(fromParam);
    } else if (!activeId && sortedIds.length > 0) {
      setActiveId(sortedIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, sortedIds.length]);

  const select = (id: string) => {
    setActiveId(id);
    markRead(id);
  };

  useEffect(() => {
    if (activeId) markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeSupplier = active ? suppliers.find((s) => s.id === active.supplierId) ?? null : null;
  const activeOrder = active ? orders.find((o) => o.id === active.orderId) ?? null : null;

  return (
    <Card className="h-[calc(100vh-8.5rem)] min-h-[540px] overflow-hidden p-0">
      <div className="grid h-full lg:grid-cols-[300px_1fr] xl:grid-cols-[310px_1fr_340px]">
        {/* Left: conversations */}
        <div className={cn("h-full border-border/70 lg:border-r", activeId && "hidden lg:block")}>
          {hydrated ? (
            <ConversationList
              conversations={conversations}
              suppliers={suppliers}
              orders={orders}
              activeId={activeId}
              onSelect={select}
              query={query}
              onQuery={setQuery}
            />
          ) : (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          )}
        </div>

        {/* Center: chat */}
        <div className={cn("h-full min-w-0 flex-col", activeId ? "flex" : "hidden lg:flex")}>
          {active && activeSupplier && activeOrder ? (
            <>
              <button
                onClick={() => setActiveId(null)}
                className="flex items-center gap-1.5 border-b border-border/70 px-4 py-2 text-sm text-muted-foreground lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" /> Conversations
              </button>
              <div className="min-h-0 flex-1">
                <ChatPanel conversation={active} supplier={activeSupplier} order={activeOrder} />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={MessagesSquare}
                title="Sélectionnez une conversation"
                description="Choisissez un fournisseur dans la liste pour afficher la discussion."
                className="border-0 bg-transparent"
              />
            </div>
          )}
        </div>

        {/* Right: order context */}
        <div className="hidden h-full border-l border-border/70 xl:block">
          {active && activeSupplier && activeOrder ? (
            <OrderContextPanel order={activeOrder} supplier={activeSupplier} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Aucune commande sélectionnée
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-8.5rem)] w-full animate-pulse rounded-2xl bg-muted/50" />}>
      <InboxContent />
    </Suspense>
  );
}
