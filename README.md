# CoteRadar Live ⚽📡

Outil **privé** d'analyse **live et pré-match** des matchs de **Coupe du monde 2026**, basé sur
l'API-Football / API-SPORTS. Data-first, dark mode premium, mobile-first.

> **Ce n'est pas un bookmaker.** C'est un outil d'analyse **informative** : il suit les matchs,
> récupère les données live, calcule des signaux de momentum / risque / value, et affiche des
> **marchés à surveiller** avec prudence. Aucun résultat n'est garanti.

---

## ✨ Caractéristiques

- **Filtrage strict Coupe du monde** : `league.id = 1`, `league.name = "World Cup"`, `season = 2026`. Les autres ligues retournées par l'API sont ignorées.
- **Moteur d'analyse maison** (sans IA obligatoire) : momentum, marchés à surveiller, risques, verdict prudent.
- **Stockage Supabase** : matchs, snapshots de stats, événements, compositions, analyses, logs API.
- **Garde-fous plan Free (100 req/jour)** : lectures depuis la base, compteur d'appels, logs, mode `SAFE_FREE_PLAN`.
- **Clé API jamais exposée** : tous les appels API-Football sont côté serveur.
- **Vercel-ready**, Next.js 14 App Router + TypeScript + Tailwind.

---

## 🧱 Stack

| Élément        | Détail                                   |
| -------------- | ---------------------------------------- |
| Framework      | Next.js 14 (App Router)                  |
| Langage        | TypeScript                               |
| UI             | Tailwind CSS (dark premium, mobile-first)|
| Base de données| Supabase (Postgres)                      |
| Données sport  | API-Football / API-SPORTS (v3)           |
| Déploiement    | Vercel                                   |

---

## 🚀 Installation

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local
# puis éditez .env.local (voir ci-dessous)

# 3. Lancer en dev
npm run dev
# http://localhost:3000  -> redirige vers /dashboard
```

### Commandes npm

```bash
npm run dev      # serveur de développement
npm run build    # build de production
npm run start    # serveur de production (après build)
npm run lint     # ESLint
```

---

## 🔑 Variables d'environnement

Copiez `.env.example` → `.env.local` et remplissez :

```bash
APISPORTS_KEY=                 # clé API-Football (SERVEUR uniquement, jamais exposée)
APISPORTS_BASE_URL=https://v3.football.api-sports.io
NEXT_PUBLIC_APP_URL=http://localhost:3000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # SERVEUR uniquement (bypass RLS)

API_REFRESH_INTERVAL_SECONDS=120
SAFE_FREE_PLAN=true
API_DAILY_QUOTA=100

WORLD_CUP_LEAGUE_ID=1
WORLD_CUP_LEAGUE_NAME=World Cup
WORLD_CUP_SEASON=2026

CRON_SECRET=                   # optionnel: protège les routes /api/cron/*
```

> `.env` / `.env.local` sont dans `.gitignore`. **Ne committez jamais votre vraie clé.**
> L'app ne crashe pas si une clé manque : elle affiche un statut clair et des erreurs propres.

---

## 🗄️ Configurer Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Récupérez dans **Project Settings → API** :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, serveur uniquement)
3. Ouvrez **SQL Editor → New query**, collez le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis **Run**.
4. Le schéma crée les tables et active **RLS sans policy publique** : seul le `service_role`
   (utilisé côté serveur) peut lire/écrire. Parfait pour un outil privé.

> Sans Supabase, l'app fonctionne quand même pour **tester l'API** (les données ne sont
> simplement pas persistées, un avertissement s'affiche).

---

## 🔐 Ajouter la clé API-Football

1. Créez un compte sur [api-football.com](https://www.api-football.com/) (ou via RapidAPI/API-SPORTS).
2. Copiez votre clé dans `.env.local` → `APISPORTS_KEY=...`.
3. Allez sur **/settings** et cliquez **« Tester l'API »** : vous verrez le plan et le quota réel
   (`requests current / limit_day`) via l'endpoint `/status`.

Header utilisé pour chaque appel (côté serveur) :

```
x-apisports-key: <APISPORTS_KEY>
```

---

## 🧪 Tester le match Iran vs New Zealand (fixture #1489378)

Match test :

| Champ        | Valeur                       |
| ------------ | ---------------------------- |
| fixture.id   | `1489378`                    |
| league.id    | `1` (World Cup)              |
| season       | `2026`                       |
| date         | `2026-06-16T01:00:00+00:00`  |

### Via l'interface (recommandé)

1. `npm run dev` → ouvrez **/settings**.
2. Cliquez **« Sync World Cup 2026-06-16 »** → récupère et filtre les matchs du jour.
3. Cliquez **« Sync match test (#1489378) »** → récupère statut, stats, events, compositions
   (+ contexte forme/H2H/cotes) et génère l'analyse.
4. Ouvrez **/matches/1489378** : header, momentum, stats live, événements, compositions,
   forme récente, H2H, marchés à surveiller, risques, verdict prudent, historique, fraîcheur.

### Via l'API (curl)

```bash
# Sync de la journée (filtré World Cup)
curl -X POST "http://localhost:3000/api/cron/sync-world-cup?date=2026-06-16"

# Sync complet du match test
curl -X POST "http://localhost:3000/api/cron/sync-live/1489378?context=1"

# Lire le détail (depuis la base, sans appel API)
curl "http://localhost:3000/api/matches/1489378"

# Lire uniquement l'analyse
curl "http://localhost:3000/api/matches/1489378/analysis"
```

> Si le match n'est pas en cours, l'analyse renvoie prudemment « match non démarré » ou
> « données insuffisantes » — c'est volontaire (le moteur n'invente pas de signal).

---

## 📡 Endpoints

### Routes de SYNC (consomment le quota API-Football)

| Route                                   | Rôle                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| `GET/POST /api/cron/sync-world-cup?date=YYYY-MM-DD` | Fixtures du jour → filtre World Cup → upsert + logs.    |
| `GET/POST /api/cron/sync-live/{fixtureId}?context=1` | Fixture + stats + events (+ lineups/contexte) → snapshots + analyse.|

`?context=1` ajoute forme récente (last 5 × 2), H2H et tentative de cotes (≈ 4 appels de plus).

### Routes de LECTURE (lisent la base, **0 appel API**)

| Route                                   | Rôle                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `GET /api/matches/today?date=&live=1`   | Matchs World Cup du jour (ou live uniquement).              |
| `GET /api/matches/{fixtureId}`          | Match + dernières stats + events + lineups + analyse + historique. |
| `GET /api/matches/{fixtureId}/analysis` | Dernière analyse uniquement.                                |
| `GET /api/usage`                        | Consommation API estimée + intervalle de refresh.          |
| `GET /api/settings/status`              | Statut de configuration (jamais la clé).                   |
| `GET/POST /api/test-api`                | Test clé + quota réel via `/status`.                       |

### Endpoints API-Football utilisés (côté serveur)

`/fixtures?date=`, `/fixtures?id=`, `/fixtures/statistics`, `/fixtures/events`,
`/fixtures/lineups`, `/fixtures/headtohead`, `/fixtures?team=&last=5`, `/odds` (si dispo), `/status`.

---

## 🧠 Moteur de scoring (momentum, marchés, risques)

Code : `lib/momentum.ts`, `lib/market-signals.ts`, `lib/risk-engine.ts`, orchestrés par
`lib/analyzer.ts` → `analyzeMatch(...)`.

### Momentum (extrait des règles)

| Condition                                   | Effet                       |
| ------------------------------------------- | --------------------------- |
| Possession > 58 % / > 65 %                  | +8 / +12                    |
| Avantage tirs totaux ≥ 3                    | +12                         |
| Avantage tirs cadrés ≥ 2                    | +15                         |
| Avantage corners ≥ 2                        | +8                          |
| Carton rouge adverse                        | +20                         |
| But récent (≤ 10′)                          | +10                         |
| Séquence offensive récente                  | +10                         |
| Domination sans tir cadré                   | **−15** + « domination stérile » |
| Dominé mais corners/transitions             | flag « risque de contre »   |
| 0-0 après 60′ + peu de tirs cadrés          | overs réduits               |
| Score serré après 75′                       | risque live ↑               |

### Marchés à surveiller

`home_win_live`, `away_win_live`, `next_goal_home`, `next_goal_away`, `over_1_5`, `over_2_5`,
`btts`, `draw_no_bet`, `avoid`. Chaque signal expose : `label`, `signal` (faible/moyen/fort),
`reason`, et une **condition d'invalidation**.

Le moteur est **volontairement prudent** : il dit souvent « aucun signal intéressant » plutôt que
d'inventer. `avoid` est généré si données insuffisantes, domination stérile, marché trop évident ou
match trop fermé.

### Sortie de `analyzeMatch`

```ts
{
  summary, homeMomentum, awayMomentum,
  signalLevel: "none" | "weak" | "medium" | "strong",
  confidenceLevel: "low" | "medium" | "high",
  marketSignals: [{ market, label, signal, reason, invalidation }],
  risks: [{ type, label, severity, explanation }],
  verdict,
  dataQuality: { hasStats, hasEvents, hasLineups, hasOdds, freshnessSeconds }
}
```

---

## 💸 Respecter le plan Free (100 requêtes/jour)

- Les **pages lisent la base** (dashboard, matchs, détail, historique) → **0 appel API**.
- Seuls les **syncs** consomment le quota. Un sync live ≈ **3-4 appels** ; `?context=1` ≈ **+4**.
- Le badge **API x/100** (topbar) et **/settings** affichent la consommation estimée + un
  **avertissement** dès 80 % du quota.
- Chaque appel est **loggé** dans `api_usage_logs` (source de vérité) + compteur mémoire.
- Cadence recommandée :
  - **Pré-match** : sync toutes les **30 à 60 min**.
  - **Live** : sync au maximum toutes les **120 s** (`API_REFRESH_INTERVAL_SECONDS`). **Jamais 5-10 s.**
- Sur **/live**, l'auto-rafraîchissement (120 s) **ne lit que la base** ; le bouton
  « Synchroniser via API » déclenche les vrais appels et se bloque si le quota est atteint.

### Passer plus tard à un refresh plus rapide

1. Passez à un **plan payant** API-Football (quota plus élevé).
2. Baissez `API_REFRESH_INTERVAL_SECONDS` (ex. `30`).
3. Mettez `SAFE_FREE_PLAN=false`.
4. (Optionnel) Branchez un **cron** régulier sur `/api/cron/sync-live/{fixtureId}` pour
   automatiser le live. Un cron quotidien `sync-world-cup` est déjà configuré dans `vercel.json`.

---

## 🗃️ Schéma de données

Tables (voir `supabase/schema.sql`) :

`world_cup_matches`, `match_statistics_snapshots`, `match_events`, `match_lineups`,
`analysis_snapshots`, `api_usage_logs`, `affiliate_clicks` (prévue pour l'affiliation, non utilisée en V1).

---

## 🛣️ Pages

`/dashboard` · `/matches` · `/matches/[fixtureId]` · `/live` · `/history` · `/settings`

---

## 🔒 Sécurité

- `APISPORTS_KEY` et `SUPABASE_SERVICE_ROLE_KEY` : **serveur uniquement**, jamais envoyées au client.
- `.env*` ignorés par git ; `.env.example` fourni sans secret.
- Gestion d'erreur si la clé est absente, retries réseau, timeouts, réponses vides gérées sans crash.
- Routes `/api/cron/*` protégeables via `CRON_SECRET` (query, header `x-cron-secret`, ou `Authorization: Bearer`).

---

## 🧭 Wording (charte)

**Autorisé** : signal faible/moyen/fort, marché à surveiller, risque élevé, domination stérile,
value potentielle, données insuffisantes, verdict prudent, condition d'invalidation.

**Interdit** : pari sûr, gain garanti, all-in, mise forte, récupère tes pertes, argent facile,
100 % gagnant, cote cadeau.

---

## 🧱 Évolutions prévues (post-V1)

Cotes / comparateur, liens affiliés (table `affiliate_clicks` déjà prête), historique public,
couche IA optionnelle (Claude/OpenAI) au-dessus du moteur maison, Stripe, comptes utilisateurs.

---

## ⚠️ Avertissement légal

> Analyse informative. Aucun résultat n'est garanti. Les paris sportifs comportent un risque de
> perte d'argent. Réservé aux personnes majeures. Jouez de manière responsable.
