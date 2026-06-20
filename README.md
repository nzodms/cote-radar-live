# SupplierPilot

**Shopify + WhatsApp + AI supplier operations for premium e-commerce merchants.**

SupplierPilot turns every Shopify order into a supplier request: contact multiple
suppliers, compare quotes, get an AI/deterministic recommendation, track payments
and shipping — all from one calm, high-end control center.

> Built with Next.js 14 (App Router), TypeScript, Tailwind, Zustand, Framer Motion,
> Zod. Premium "liquid glass" light UI. Fully functional V1 on demo state with
> ready-to-connect Shopify / WhatsApp / Claude adapters.

---

## ✨ What was built

A complete, **functional** V1 — not a static mockup. Every important button works
and mutates shared state that persists to `localStorage`.

### Pages (`/app`)
| Route | Screen | Highlights |
|------|--------|-----------|
| `/dashboard` | Tableau de bord | 6 derived KPI cards w/ sparklines, "Tour de contrôle IA" smart suggestions, activity timeline, recommended suppliers, orders-to-process |
| `/orders` | Commandes | Status tabs + search, table/list hybrid, **order detail drawer** with full lifecycle actions |
| `/inbox` | Messagerie | 3-column WhatsApp-style control center: conversations · chat · order context. Send messages, simulate replies, **extract quotes**, select supplier |
| `/comparison` | Comparaison | Supplier cards + criteria matrix + AI explanation panel; recommendation computed from rule weights |
| `/payments` | Achats & paiements | À payer / Payé / Attente suivi / Expédié / Incidents tabs, late warnings, working status transitions |
| `/suppliers` | Fournisseurs | Supplier CRM cards, add/edit (Zod-validated), block/unblock, preferred, contact |
| `/settings` | Règles IA | Sliders/switches/weights that **live-update the recommendation** |

### Architecture
```
app/                     # routes + API routes
  api/shopify/webhooks/orders-create   # Shopify adapter (normalize + echo)
  api/ai/generate-message              # Claude or mock (server-side)
  api/ai/extract-quote                 # Claude or mock (server-side)
components/
  layout/  ui/  orders/  suppliers/  inbox/  comparison/  payments/  dashboard/  settings/
lib/
  ai/            generateSupplierMessage · extractQuoteFromMessage · client · requests
  recommendation/ recommendSupplier (weighted, deterministic)
  shopify/       types · normalize · mockOrders
  whatsapp/      createWhatsAppMessageLink · sendWhatsAppMessage · types
  store/         useStore (Zustand + persist) · selectors · toast
  data/          seed (realistic French demo dataset)
types/           domain model
schemas/         Zod schemas (forms, rules, AI I/O, Shopify payload)
legacy/          previous CoteRadar Live app, archived (excluded from build)
```

---

## 🚀 How to run

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /dashboard
```

Other scripts:
```bash
npm run build        # production build
npm start            # run the production build
npm run typecheck    # tsc --noEmit
npm run lint
```

Requires Node 18+ (developed on Node 22). No database or external service is
needed for the demo — everything runs locally on mock data.

---

## 🔑 Environment variables

All keys are **optional**. Without them the app runs on a deterministic mock AI
layer, `wa.me` links, and in-memory demo data. Copy `.env.example` → `.env.local`.

| Variable | Purpose | Without it |
|---------|---------|-----------|
| `ANTHROPIC_API_KEY` | Real Claude for message generation + quote extraction | Deterministic mock layer |
| `ANTHROPIC_MODEL` | Claude model id (default `claude-sonnet-4-6`) | — |
| `SHOPIFY_WEBHOOK_SECRET` | Verify `orders/create` HMAC | Demo accepts unsigned payloads |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ADMIN_API_TOKEN` | Future Admin API reads | Demo uses mock orders |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Cloud API sending | Generates `wa.me` links + internal inbox sends |

**No secret is ever exposed client-side** — Claude and WhatsApp Cloud calls run
only in server API routes / server modules.

---

## 🧪 What is mocked (and how it stays real-ready)

| Area | V1 behaviour | Production swap-in |
|------|--------------|--------------------|
| **Data** | `lib/data/seed.ts` → Zustand store persisted to `localStorage` | Replace store hydration with API/DB reads; the same `types/` model is the contract |
| **AI** | `lib/ai/*` fall back to deterministic templates / regex parser | Set `ANTHROPIC_API_KEY`; the same functions call Claude automatically |
| **Shopify** | `POST /api/shopify/webhooks/orders-create` validates (Zod) + normalizes a demo payload and echoes it | Add HMAC verification + persistence; `normalizeShopifyOrder` already maps to the internal model |
| **WhatsApp** | `wa.me` links + internal inbox logging | Set Cloud API creds; `sendWhatsAppMessage` already posts to the Graph API |

### Try the adapters
```bash
# Shopify normalize (sample)
curl localhost:3000/api/shopify/webhooks/orders-create

# AI message (mock unless ANTHROPIC_API_KEY set)
curl -X POST localhost:3000/api/ai/generate-message -H 'Content-Type: application/json' \
  -d '{"productName":"Lustre cascade","variant":"L / Gris","quantity":1,"country":"France"}'

# Quote extraction
curl -X POST localhost:3000/api/ai/extract-quote -H 'Content-Type: application/json' \
  -d '{"text":"Price 62€, shipping 18€, delivery 10-14 days, stock ok."}'
# → {"productCost":62,"shippingCost":18,"totalCost":80,"deliveryMinDays":10,"deliveryMaxDays":14,"stockStatus":"confirmed",...}
```

---

## 🧠 The recommendation engine

`lib/recommendation/recommendSupplier.ts` is **deterministic and rule-driven** — it
does *not* always pick the cheapest supplier.

1. **Eligibility gates** (hard rules): max delivery days, reliability floor, min
   margin, blocked suppliers, allowed countries.
2. **Weighted score** (0–100) blends 5 normalized sub-scores — price, delay,
   reliability, stock, margin — using the weights from `/settings`.
3. Preferred suppliers get a small bonus; large amounts flag manual validation.
4. The recommended supplier is the **highest-scoring eligible** candidate, with a
   human-readable explanation.

Change the weights or rules in **Règles IA** and watch the recommendation update
live on the comparison screen and the settings preview.

---

## 🔌 Next steps to connect production APIs

1. **Shopify** — register the `orders/create` webhook, verify HMAC with
   `SHOPIFY_WEBHOOK_SECRET`, persist normalized orders (Postgres/Prisma), and stream
   new orders to the client (or refetch).
2. **WhatsApp Cloud API** — add `WHATSAPP_*` creds, wire the inbound webhook to
   append supplier replies, and run quote extraction on inbound messages.
3. **Claude** — add `ANTHROPIC_API_KEY`; message generation and quote extraction
   become live with zero code change.
4. **Persistence & auth** — replace the Zustand/localStorage demo store with a DB +
   multi-tenant auth (the `types/` + `schemas/` already define the data contract).

---

## 📦 Legacy

The repository previously hosted **CoteRadar Live** (a football live-betting
analysis app). It is preserved under [`/legacy`](./legacy) and excluded from the
build, lint and typecheck. The full history remains in git.
