/**
 * Construit la liste structurée des "Marchés à surveiller" (avant match).
 * PUR (testable sans réseau). Partagé par /analyse (compact) et /markets.
 *
 * Règles :
 *  - Marchés joueurs UNIQUEMENT si compositions confirmées (sinon masqués).
 *  - Jamais "à jouer" sans condition. Chaque marché porte une condition d'entrée.
 *  - Sans cote exploitable : on reste en "à surveiller", jamais "value confirmée".
 */

import type { DisplayOdds } from "@/types/odds";
import type { RecentForm } from "@/types/match";

export type MarketStatus = "PREMATCH" | "LIVE ONLY" | "AVOID" | "WAIT";
export type MarketRisk = "low" | "medium" | "high";
export type MarketCategory = "team" | "match" | "player";

export interface WatchMarket {
  name: string;
  category: MarketCategory;
  status: MarketStatus;
  /** Condition d'entrée (toujours présente). */
  entry: string;
  /** Pourquoi ce marché est intéressant. */
  reason: string;
  risk: MarketRisk;
  /** Priorité interne (plus haut = plus intéressant à surveiller). */
  priority: number;
}

export interface MarketWatchlist {
  teamMarkets: WatchMarket[];
  matchMarkets: WatchMarket[];
  playerMarkets: WatchMarket[];
  playerMarketsAvailable: boolean;
  avoid: string[];
  /** Meilleurs marchés à surveiller, classés (nom + statut). */
  ranked: { name: string; status: MarketStatus }[];
}

export interface MarketWatchlistInput {
  homeName: string;
  awayName: string;
  favoriteName: string;
  underdogName: string;
  favoriteSide: "home" | "away" | null;
  homeForm: RecentForm | null;
  awayForm: RecentForm | null;
  lineupsConfirmed: boolean;
  odds: DisplayOdds;
}

function perMatch(n: number | undefined, d: number): number | null {
  return d > 0 && n !== undefined ? n / d : null;
}
function counted(rf: RecentForm | null): number {
  return rf ? rf.wins + rf.draws + rf.losses : 0;
}

interface ScoringProfile {
  expectedGoals: number | null;
  highScoring: boolean;
  lowScoring: boolean;
  favAttackHint: boolean;
  undAttackHint: boolean;
}

function scoringProfile(input: MarketWatchlistInput): ScoringProfile {
  const hm = counted(input.homeForm);
  const am = counted(input.awayForm);
  const homeFor = perMatch(input.homeForm?.goalsFor, hm);
  const homeAg = perMatch(input.homeForm?.goalsAgainst, hm);
  const awayFor = perMatch(input.awayForm?.goalsFor, am);
  const awayAg = perMatch(input.awayForm?.goalsAgainst, am);

  let expectedGoals: number | null = null;
  if (homeFor !== null && awayAg !== null && awayFor !== null && homeAg !== null) {
    expectedGoals = (homeFor + awayAg) / 2 + (awayFor + homeAg) / 2;
  }
  const favFor = input.favoriteSide === "away" ? awayFor : homeFor;
  const undFor = input.favoriteSide === "away" ? homeFor : awayFor;

  return {
    expectedGoals,
    highScoring: expectedGoals !== null && expectedGoals >= 2.6,
    lowScoring: expectedGoals !== null && expectedGoals <= 1.9,
    favAttackHint: favFor !== null && favFor >= 1.4,
    undAttackHint: undFor !== null && undFor >= 1.1,
  };
}

export function buildMarketWatchlist(input: MarketWatchlistInput): MarketWatchlist {
  const fav = input.favoriteName;
  const und = input.underdogName;
  const favKnown = input.favoriteSide !== null;
  const prof = scoringProfile(input);
  const hasOdds = input.odds.available;

  const team: WatchMarket[] = [];
  const match: WatchMarket[] = [];
  const player: WatchMarket[] = [];

  /* --------- Marchés équipe (autour du favori principalement) --------- */
  team.push({
    name: `Prochain but ${fav}`,
    category: "team",
    status: "LIVE ONLY",
    entry: `pression réelle de ${fav} (tir cadré + corner rapprochés), cote non compressée`,
    reason: "marché live prioritaire si le favori convertit sa domination",
    risk: "medium",
    priority: 9,
  });
  team.push({
    name: `${fav} tirs cadrés`,
    category: "team",
    status: "LIVE ONLY",
    entry: `${fav} cadre dès les 15-20 premières minutes`,
    reason: "mesure directe de la vraie domination (pas la possession)",
    risk: "medium",
    priority: 8,
  });
  team.push({
    name: `${fav} corners`,
    category: "team",
    status: "LIVE ONLY",
    entry: `${fav} pousse sur les côtés et installe le camp adverse`,
    reason: "domination territoriale = corners, marché plus lisible que la victoire",
    risk: "medium",
    priority: 6,
  });
  team.push({
    name: `${fav} nombre de tirs`,
    category: "team",
    status: "LIVE ONLY",
    entry: `${fav} multiplie les tentatives même sans marquer`,
    reason: "volume de tirs souvent décorrélé du score, exploitable en live",
    risk: "medium",
    priority: 5,
  });
  if (prof.undAttackHint) {
    team.push({
      name: `Prochain but ${und}`,
      category: "team",
      status: "LIVE ONLY",
      entry: `${und} sort vite en transition et obtient une vraie occasion`,
      reason: `${und} a un profil capable de punir sur peu de ballon`,
      risk: "high",
      priority: 4,
    });
  }

  /* --------------------------- Marchés match --------------------------- */
  match.push({
    name: "Over 1.5 buts",
    category: "match",
    status: prof.lowScoring ? "WAIT" : "LIVE ONLY",
    entry: "les deux équipes cadrent et le rythme s'ouvre",
    reason: prof.lowScoring ? "profils plutôt fermés : à confirmer en live" : "rythme attendu correct, marché souvent atteint",
    risk: prof.lowScoring ? "medium" : "low",
    priority: prof.highScoring ? 7 : prof.lowScoring ? 3 : 5,
  });
  match.push({
    name: "Over 2.5 buts",
    category: "match",
    status: prof.lowScoring ? "AVOID" : "LIVE ONLY",
    entry: "match franchement ouvert (tirs cadrés des deux côtés, but précoce)",
    reason: prof.lowScoring ? "rythme attendu faible : à éviter par défaut" : "seulement si le match s'emballe vraiment",
    risk: prof.highScoring ? "medium" : "high",
    priority: prof.highScoring ? 6 : 3,
  });
  match.push({
    name: "Under 2.5 buts",
    category: "match",
    status: prof.lowScoring ? "PREMATCH" : "WAIT",
    entry: "match fermé, peu de tirs cadrés après 25-30 min",
    reason: prof.lowScoring ? "deux blocs prudents : scénario fermé crédible" : "uniquement si le match se verrouille",
    risk: "medium",
    priority: prof.lowScoring ? 6 : 3,
  });
  match.push({
    name: "BTTS (les deux marquent)",
    category: "match",
    status: "LIVE ONLY",
    entry: "les DEUX équipes produisent (tir cadré de chaque côté)",
    reason: prof.undAttackHint ? "outsider capable de marquer : BTTS crédible si ça s'ouvre" : "à confirmer : l'outsider doit vraiment attaquer",
    risk: "medium",
    priority: prof.undAttackHint ? 6 : 4,
  });
  match.push({
    name: "Corners totaux",
    category: "match",
    status: "LIVE ONLY",
    entry: "une équipe installe sa domination territoriale",
    reason: "marché lisible en live selon la poussée réelle",
    risk: "medium",
    priority: 5,
  });
  match.push({
    name: "Cartons totaux",
    category: "match",
    status: "LIVE ONLY",
    entry: "match tendu, arbitre strict ou enjeu fort",
    reason: "enjeu de phase de groupes + sélections = duels engagés",
    risk: "high",
    priority: 4,
  });

  /* --------------------------- Marchés joueurs ------------------------- */
  if (input.lineupsConfirmed) {
    player.push({
      name: `Buteur (attaquant ${fav})`,
      category: "player",
      status: "PREMATCH",
      entry: "titulaire offensif confirmé et en forme",
      reason: "compositions confirmées : marché buteur exploitable",
      risk: "high",
      priority: 5,
    });
    player.push({
      name: "Tirs / tirs cadrés joueur",
      category: "player",
      status: "LIVE ONLY",
      entry: "joueur très impliqué offensivement en début de match",
      reason: "compositions confirmées : on peut cibler un joueur précis",
      risk: "medium",
      priority: 4,
    });
    player.push({
      name: "Carton joueur",
      category: "player",
      status: "LIVE ONLY",
      entry: "défenseur déjà averti ou duels répétés",
      reason: "compositions confirmées : ciblage possible",
      risk: "high",
      priority: 3,
    });
  }

  /* ------------------------------- À éviter ---------------------------- */
  const avoid: string[] = [];
  avoid.push(`Victoire sèche ${favKnown ? fav : "d'une sélection"} en pré-match (trop d'aléa, cote souvent déjà courte)`);
  if (!hasOdds) avoid.push("Tout marché sans cote exploitable (aucune value chiffrée possible)");
  if (prof.lowScoring) avoid.push("Over 2.5 par défaut (rythme attendu faible)");
  if (!input.lineupsConfirmed) avoid.push("Marchés joueurs (compositions non confirmées)");

  /* -------------------------------- Ranking ---------------------------- */
  const ranked = [...team, ...match, ...player]
    .filter((m) => m.status !== "AVOID")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((m) => ({ name: m.name, status: m.status }));

  return {
    teamMarkets: team,
    matchMarkets: match,
    playerMarkets: player,
    playerMarketsAvailable: input.lineupsConfirmed,
    avoid,
    ranked,
  };
}

/* ------------------------------- Rendu texte ------------------------------- */

function statusTag(s: MarketStatus): string {
  switch (s) {
    case "PREMATCH":
      return "pré-match";
    case "LIVE ONLY":
      return "LIVE";
    case "AVOID":
      return "à éviter";
    case "WAIT":
      return "attendre";
  }
}

function marketLineCompact(m: WatchMarket): string {
  return `• ${m.name} (${statusTag(m.status)}) — ${m.entry}.`;
}

function marketLineDetailed(m: WatchMarket): string {
  return `• ${m.name} (${statusTag(m.status)})\n   ↳ Entrée : ${m.entry}\n   ↳ Pourquoi : ${m.reason} · Risque ${m.risk}.`;
}

/** Section compacte "Marchés à surveiller" pour /analyse. */
export function renderMarketWatchlistCompact(w: MarketWatchlist): string[] {
  const L: string[] = [];
  L.push("🎯 Marchés à surveiller");
  L.push("Équipe :");
  for (const m of w.teamMarkets.filter((x) => x.status !== "AVOID")) L.push(marketLineCompact(m));
  L.push("Match :");
  for (const m of w.matchMarkets) L.push(marketLineCompact(m));
  L.push("Joueurs :");
  if (w.playerMarketsAvailable) {
    for (const m of w.playerMarkets) L.push(marketLineCompact(m));
  } else {
    L.push("• Marchés joueurs à attendre : compositions non confirmées.");
  }
  return L;
}

/** Vue dédiée /markets (un peu plus détaillée, toujours courte et classée). */
export function renderMarketWatchlistDetailed(w: MarketWatchlist, home: string, away: string): string {
  const L: string[] = [];
  L.push(`🎯 Marchés à surveiller — ${home} vs ${away}`);
  L.push("");
  L.push("Classement (à surveiller en priorité) :");
  w.ranked.forEach((r, i) => L.push(`${i + 1}. ${r.name} (${statusTag(r.status)})`));
  L.push("");
  L.push("Marchés équipe :");
  for (const m of w.teamMarkets) L.push(marketLineDetailed(m));
  L.push("");
  L.push("Marchés match :");
  for (const m of w.matchMarkets) L.push(marketLineDetailed(m));
  L.push("");
  L.push("Marchés joueurs :");
  if (w.playerMarketsAvailable) {
    for (const m of w.playerMarkets) L.push(marketLineDetailed(m));
  } else {
    L.push("• À attendre : compositions non confirmées (aucun joueur inventé).");
  }
  L.push("");
  L.push("⛔ À éviter pour l'instant :");
  for (const a of w.avoid) L.push(`• ${a}`);
  L.push("");
  L.push("⚠️ Marchés « à surveiller », pas « à jouer ». La décision se prend en live selon la pression réelle. Réservé aux majeurs.");
  return L.join("\n");
}
