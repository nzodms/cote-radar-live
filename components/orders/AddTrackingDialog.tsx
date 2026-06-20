"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import type { Order } from "@/types";

export function AddTrackingDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addTracking = useStore((s) => s.addTracking);
  const [value, setValue] = useState(order.trackingNumber ?? "");

  const submit = () => {
    if (!value.trim()) {
      toast("Numéro de suivi requis", { tone: "warning" });
      return;
    }
    addTracking(order.id, value.trim());
    toast("Suivi ajouté", {
      description: `${order.shopifyOrderNumber} marqué comme expédié`,
      tone: "success",
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Ajouter un numéro de suivi"
      description={`${order.shopifyOrderNumber} · ${order.productName}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit}>
            <Truck className="h-4 w-4" />
            Confirmer l'expédition
          </Button>
        </>
      }
    >
      <div className="py-3">
        <Field label="Numéro de suivi" hint="L'ajout d'un suivi passe la commande au statut « Expédié ».">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="ex : LX-983412775ES"
          />
        </Field>
      </div>
    </Dialog>
  );
}
