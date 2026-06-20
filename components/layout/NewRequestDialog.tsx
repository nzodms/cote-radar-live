"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ShoppingBag, ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store/useStore";
import { normalizeShopifyOrder } from "@/lib/shopify/normalize";
import type { ShopifyOrderPayload } from "@/lib/shopify/types";
import { flag, formatCurrency } from "@/lib/utils";

const DEMO_PRODUCTS: { title: string; variant: string; price: string; country: string; code: string; image: string }[] = [
  {
    title: "Lampadaire arc marbre & laiton",
    variant: "Hauteur 180 cm / Laiton",
    price: "219.90",
    country: "France",
    code: "FR",
    image: "https://images.unsplash.com/photo-1543198126-a8ad8e47fb22?w=600&q=80",
  },
  {
    title: "Suspension cannage rotin XL",
    variant: "Ø60 cm / Naturel",
    price: "169.90",
    country: "Belgique",
    code: "BE",
    image: "https://images.unsplash.com/photo-1530603907829-659ab2b4d0e9?w=600&q=80",
  },
  {
    title: "Lampe champignon verre opalin",
    variant: "Moyen / Crème",
    price: "149.90",
    country: "Suisse",
    code: "CH",
    image: "https://images.unsplash.com/photo-1517991104123-1d56a6e81ed9?w=600&q=80",
  },
];

export function NewRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const orders = useStore((s) => s.orders);
  const addOrder = useStore((s) => s.addOrder);
  const [index, setIndex] = useState(0);

  const nextNumber = useMemo(() => {
    const nums = orders
      .map((o) => parseInt(o.shopifyOrderNumber.replace("#", ""), 10))
      .filter((n) => !Number.isNaN(n));
    return (nums.length ? Math.max(...nums) : 1052) + 1;
  }, [orders]);

  const product = DEMO_PRODUCTS[index % DEMO_PRODUCTS.length];

  const handleImport = () => {
    const payload: ShopifyOrderPayload = {
      id: 9_000_000 + nextNumber,
      order_number: nextNumber,
      name: `#${nextNumber}`,
      currency: "EUR",
      total_price: product.price,
      created_at: new Date().toISOString(),
      shipping_address: { country: product.country, country_code: product.code },
      line_items: [
        {
          id: nextNumber * 10,
          title: product.title,
          quantity: 1,
          price: product.price,
          variant_title: product.variant,
          image: { src: product.image },
        },
      ],
    };
    const order = normalizeShopifyOrder(payload);
    addOrder(order);
    onOpenChange(false);
    router.push(`/orders?order=${order.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle demande fournisseur"
      description="Importez une commande Shopify, puis contactez vos fournisseurs."
      footer={
        <>
          <Button variant="ghost" onClick={() => setIndex((i) => i + 1)}>
            Autre produit
          </Button>
          <Button onClick={handleImport}>
            Importer la commande
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary-soft/60 px-3.5 py-2.5 text-sm text-primary">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            En production, ces commandes arrivent automatiquement via le webhook Shopify{" "}
            <code className="rounded bg-white/70 px-1 text-xs">orders/create</code>.
          </span>
        </div>

        <div className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
          <ProductImage src={product.image} alt={product.title} className="h-24 w-24" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="neutral">
                <ShoppingBag className="h-3 w-3" /> #{nextNumber}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {flag(product.code)} {product.country}
              </span>
            </div>
            <h4 className="mt-1.5 font-semibold leading-tight">{product.title}</h4>
            <p className="text-sm text-muted-foreground">{product.variant}</p>
            <p className="mt-2 text-lg font-semibold">{formatCurrency(Number(product.price))}</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
