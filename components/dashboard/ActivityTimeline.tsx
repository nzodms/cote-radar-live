"use client";

import { useRouter } from "next/navigation";
import {
  FileText,
  MessageSquare,
  CreditCard,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityEvent, ActivityType } from "@/types";

const ICON: Record<ActivityType, LucideIcon> = {
  quote: FileText,
  message: MessageSquare,
  payment: CreditCard,
  shipment: Truck,
  selection: CheckCircle2,
  incident: AlertTriangle,
  system: Bell,
};

const COLOR: Record<ActivityType, string> = {
  quote: "bg-info-soft text-info",
  message: "bg-secondary text-muted-foreground",
  payment: "bg-warning-soft text-warning-foreground",
  shipment: "bg-success-soft text-success",
  selection: "bg-primary-soft text-primary",
  incident: "bg-danger-soft text-danger",
  system: "bg-secondary text-muted-foreground",
};

export function ActivityTimeline({ activity }: { activity: ActivityEvent[] }) {
  const router = useRouter();
  const items = activity.slice(0, 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activité récente</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        <div className="relative space-y-1">
          <div className="absolute bottom-2 left-[15px] top-2 w-px bg-border" />
          {items.map((a) => {
            const Icon = ICON[a.type];
            return (
              <button
                key={a.id}
                onClick={() => a.orderId && router.push(`/orders?order=${a.orderId}`)}
                className="group relative flex w-full items-start gap-3 rounded-lg py-2 pl-0 pr-2 text-left transition-colors hover:bg-secondary/40"
              >
                <span
                  className={cn(
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                    COLOR[a.type],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="block text-sm font-medium leading-snug">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-2xs text-muted-foreground/70">{timeAgo(a.timestamp)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
