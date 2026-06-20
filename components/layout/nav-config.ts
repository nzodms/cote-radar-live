import {
  LayoutDashboard,
  Package,
  MessagesSquare,
  Scale,
  Wallet,
  Factory,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "orders" | "inbox" | "payments";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  subtitle: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      {
        label: "Tableau de bord",
        href: "/dashboard",
        icon: LayoutDashboard,
        subtitle: "Vue d'ensemble de vos opérations fournisseurs",
      },
      {
        label: "Commandes",
        href: "/orders",
        icon: Package,
        badge: "orders",
        subtitle: "Transformez chaque commande Shopify en demande fournisseur",
      },
      {
        label: "Messagerie",
        href: "/inbox",
        icon: MessagesSquare,
        badge: "inbox",
        subtitle: "Centralisez toutes vos conversations fournisseurs",
      },
      {
        label: "Comparaison",
        href: "/comparison",
        icon: Scale,
        subtitle: "Comparez les devis et choisissez le meilleur fournisseur",
      },
    ],
  },
  {
    label: "Gestion",
    items: [
      {
        label: "Achats & paiements",
        href: "/payments",
        icon: Wallet,
        badge: "payments",
        subtitle: "Suivez paiements, expéditions et numéros de suivi",
      },
      {
        label: "Fournisseurs",
        href: "/suppliers",
        icon: Factory,
        subtitle: "Votre CRM fournisseurs et leurs scores de fiabilité",
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        label: "Règles IA",
        href: "/settings",
        icon: SlidersHorizontal,
        subtitle: "Réglez la recommandation automatique et l'automatisation",
      },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function navItemForPath(pathname: string): NavItem | undefined {
  return (
    ALL_NAV_ITEMS.find((i) => pathname === i.href) ??
    ALL_NAV_ITEMS.find((i) => pathname.startsWith(i.href))
  );
}
