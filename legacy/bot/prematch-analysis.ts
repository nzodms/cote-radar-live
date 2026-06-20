/**
 * Analyse AVANT match.
 *
 * Deux formats :
 *  - composePreMatchAnalysis()  : COMPACT et orienté marchés (/analyse). Tient
 *    idéalement en 1 message Telegram, 2 maximum. C'est le format par défaut.
 *  - composeFullPreMatchAnalysis() : version longue détaillée (/analyse_full).
 *
 * + composeMarketsWatch() (/markets) et composeBrief() (/brief).
 *
 * Tout est PUR (testable sans réseau). Règles : ne JAMAIS inventer (blessures,
 * joueurs, météo, cotes). Donnée manquante => "non disponible" + plan
 * conditionnel. Jamais "à jouer" sans cote : "à surveiller".
 */

import {
  getFixtureById,
  getFixtureLineups,
  getHeadToHead,
  getOdds,
  getTeamLastFixtures,
} from "@/lib/api-football";
import {
  normalizeFixture,
  normalizeH2H,
  normalizeLineups,
  normalizeRecentForm,
} from "@/lib/world-cup-filter";
import { buildContextIntelligence } from "@/lib/context-engine";
import { extractDisplayOdds, extractFavoriteFromOdds } from "@/lib/odds-engine";
import { formatKickoff } from "@/lib/utils";
import type {
  H2HSummary,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedStatsPair,
  NormalizedTeamStats,
  RecentForm,
} from "@/types/match";
import type { ContextIntelligence } from "@/types/live-advice";
import type { DisplayOdds } from "@/types/odds";
import { sameTeam } from "./team-normalizer";
import { getGroupInfo } from "./schedule-service";
import {
  buildMarketWatchlist,
  renderMarketWatchlistCompact,
  renderMarketWatchlistDetailed,
  type MarketWatchlistInput,
} from "./market-watchlist";
import { fetchWeather, formatWeatherHeader, type WeatherInfo } from "./weather-service";

export interface PreMatchData {
  fixture: NormalizedFixture;
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  lineups: NormalizedLineup[];
  context: ContextIntelligence;
  group: { name: string | null; others: string[] };
  odds: DisplayOdds;
  weather?: WeatherInfo | null;
}

function emptyStatsPair(): NormalizedStatsPair {
  const z: NormalizedTeamStats = {
    shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null,
    shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null,
    offsides: null, ballPossession: null, yellowCards: null, redCards: null,
    goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null,
  };
  return { home: { ...z }, away: { ...z }, hasData: false };
}

function counted(rf: RecentForm | null): number {
  return rf ? rf.wins + rf.draws + rf.losses : 0;
}
function cleanSheets(rf: RecentForm | null): number {
  return rf ? rf.results.filter((r) => r.outcome !== "?" && (r.goalsAgainst ?? 1) === 0).length : 0;
}
function perMatch(num: number, d: number): number | null {
  return d > 0 ? num / d : null;
}
function fmt(num: number | null): string {
  return num === null ? "—" : num.toFixed(2);
}
function formString(rf: RecentForm | null): string {
  if (!rf || rf.results.length === 0) return "non disponible";
  return rf.results.slice(0, 5).map((r) => r.outcome).join(" ");
}

interface PositionGroups {
  forwards: string[];
  mids: string[];
  defs: string[];
  gk: string[];
  coach: string | null;
}
function positionsFor(lineups: NormalizedLineup[], teamName: string): PositionGroups | null {
  const l = lineups.find((x) => sameTeam(x.teamName, teamName));
  if (!l || l.startXI.length === 0) return null;
  const pick = (codes: string[]) =>
    l.startXI
      .filter((player) => codes.includes((player.pos ?? "").toUpperCase()))
      .map((player) => player.name)
      .filter((nm): nm is string => Boolean(nm));
  return { forwards: pick(["F"]), mids: pick(["M"]), defs: pick(["D"]), gk: pick(["G"]), coach: l.coachName };
}

/* ----------------------------- Helpers partagés ----------------------------- */

function favoriteNames(context: ContextIntelligence, f: NormalizedFixture): { fav: string; und: string; favKnown: boolean } {
  return {
    fav: context.favoriteTeam ?? f.home.name,
    und: context.underdogTeam ?? f.away.name,
    favKnown: context.favoriteSide !== null,
  };
}

function watchlistInputFrom(data: PreMatchData): MarketWatchlistInput {
  const { fav, und } = favoriteNames(data.context, data.fixture);
  return {
    homeName: data.fixture.home.name,
    awayName: data.fixture.away.name,
    favoriteName: fav,
    underdogName: und,
    favoriteSide: data.context.favoriteSide,
    homeForm: data.recentForm.home,
    awayForm: data.recentForm.away,
    lineupsConfirmed: data.lineups.length > 0,
    odds: data.odds,
  };
}

/** Forme récente résumée : "W L W W W — 2.40 buts/match, 1.20 encaissés · CS x". */
function formLine(name: string, rf: RecentForm | null): string {
  const m = counted(rf);
  const gf = perMatch(rf?.goalsFor ?? 0, m);
  const ga = perMatch(rf?.goalsAgainst ?? 0, m);
  if (!rf || m === 0) return `${name} : forme non disponible.`;
  return `${name} : ${formString(rf)} — ${fmt(gf)} buts/match, ${fmt(ga)} encaissés · clean sheets ${cleanSheets(rf)}`;
}

interface ReadingScore {
  signal: "WATCH" | "WAIT" | "AVOID";
  confidence: number;
  risk: "faible" | "moyen" | "élevé";
}

function computeReadingScore(data: PreMatchData): ReadingScore {
  const hasForm = Boolean(data.recentForm.home && data.recentForm.away);
  const { favKnown } = favoriteNames(data.context, data.fixture);

  let confidence = 45;
  if (favKnown) confidence += 15;
  if (hasForm) confidence += 10;
  if (data.h2h && data.h2h.totalMatches > 0) confidence += 5;
  if (data.lineups.length > 0) confidence += 10;
  if (!data.odds.available) confidence -= 5;
  confidence = Math.max(10, Math.min(85, confidence));

  let signal: ReadingScore["signal"];
  if (!hasForm || confidence < 30) signal = "AVOID";
  else if (!favKnown || confidence < 52) signal = "WAIT";
  else signal = "WATCH";

  const risk: ReadingScore["risk"] = !data.odds.available || !hasForm ? "élevé" : "moyen";
  return { signal, confidence, risk };
}

/* ============================================================================
 *  FORMAT COMPACT (/analyse) — orienté marchés, 1-2 messages
 * ========================================================================= */

export function composePreMatchAnalysis(data: PreMatchData): string {
  const { fixture: f, recentForm, h2h, context, group, odds, weather } = data;
  const home = f.home.name;
  const away = f.away.name;
  const { fav, und, favKnown } = favoriteNames(context, f);
  const round = f.round ?? "";
  const isFirstGroupMatch = /group/i.test(round) && /\b1\b/.test(round);
  const lineupsConfirmed = data.lineups.length > 0;

  const groupLine = group.name
    ? `🏆 ${group.name} : ${[home, away, ...group.others].join(", ")}`
    : `🏆 Groupe à confirmer`;

  const L: string[] = [];

  // En-tête (reste groupé avec le titre lors du découpage Telegram).
  L.push(`🏟 Analyse — ${home} vs ${away}`);
  L.push(
    `⏱ ${formatKickoff(f.kickoffAt)}${f.venueName ? ` · ${f.venueName}${f.venueCity ? ` (${f.venueCity})` : ""}` : ""}`
  );
  L.push(formatWeatherHeader(weather ?? null));
  L.push(groupLine);
  L.push("");

  // 1. Résumé express (3-5 lignes)
  L.push("1. Résumé express");
  if (favKnown) {
    L.push(`• Favori : ${fav} · Outsider : ${und}.`);
    L.push(`• Style : ${fav} prend l'initiative, ${und} dangereux en transition et sur coups de pied arrêtés.`);
  } else {
    L.push(`• Rapport de force : équilibré, l'initiative se lira dans les 10-15 premières minutes.`);
    L.push(`• Style : duel ouvert, la première équipe à presser haut prendra l'ascendant.`);
  }
  L.push(`• Enjeu : ${isFirstGroupMatch ? "premier match de groupe — la différence de buts peut compter plus tard." : "phase de groupes, chaque point compte."}`);
  L.push("• Point clé : la possession ne suffit pas — ce sont les tirs cadrés et les corners qui signalent la vraie pression (domination stérile = piège).");
  L.push("");

  // 2. Forme récente
  L.push("2. Forme récente");
  L.push(`• ${formLine(home, recentForm.home)}`);
  L.push(`• ${formLine(away, recentForm.away)}`);
  if (h2h && h2h.totalMatches > 0) {
    L.push(`• H2H : ${home} ${h2h.team1Wins}–${h2h.draws}–${h2h.team2Wins} ${away} (${h2h.totalMatches} matchs).`);
  }
  L.push("");

  // 3. Conditions importantes
  L.push("3. Conditions importantes");
  L.push(`• Compositions : ${lineupsConfirmed ? "confirmées." : "non confirmées (marchés joueurs à attendre)."}`);
  L.push(
    `• Absents/blessés : ${
      context.knownInjuries.length > 0
        ? `${context.knownInjuries.join(", ")} (source secondaire, à confirmer).`
        : "non disponible (rien présumé)."
    }`
  );
  if (weather && weather.available) {
    L.push(`• Météo : ${weather.summary}${weather.impact ? ` — ${weather.impact}.` : "."}`);
  } else {
    L.push("• Météo : non disponible — non intégrée au signal.");
  }
  if (odds.available && odds.oneX2) {
    L.push(
      `• Cotes 1X2${odds.bookmaker ? ` (${odds.bookmaker})` : ""} : ${home} ${odds.oneX2.home} / Nul ${odds.oneX2.draw} / ${away} ${odds.oneX2.away}.`
    );
  } else {
    L.push("• Cotes : non affichées — aucune value confirmée (marchés « à surveiller », pas « à jouer »).");
  }
  L.push("");

  // 4. Marchés à surveiller
  const watchlist = buildMarketWatchlist(watchlistInputFrom(data));
  L.push(...renderMarketWatchlistCompact(watchlist));
  L.push("");

  // 5. À éviter pour l'instant
  L.push("⛔ À éviter pour l'instant");
  for (const a of watchlist.avoid) L.push(`• ${a}.`);
  L.push("");

  // 6. Mon plan
  L.push("🎯 Mon plan");
  L.push("• 0-15 min : lire qui cadre et qui obtient des corners.");
  L.push(`• ${fav} cadre vite + corners → surveiller « prochain but ${fav} ».`);
  L.push(`• ${fav} domine sans cadrer → ne rien jouer (domination stérile).`);
  L.push(`• ${und} marque tôt → WAIT, attendre la réaction sur 5-10 min.`);
  L.push("• Sans cote live exploitable → no bet.");
  L.push("");

  // 7. Score final de lecture
  const score = computeReadingScore(data);
  L.push("📊 Score final de lecture");
  L.push(`Signal pré-match : ${score.signal}`);
  L.push(`Confiance : ${score.confidence}/100`);
  L.push(`Risque : ${score.risk}`);
  L.push("Meilleurs marchés à surveiller :");
  watchlist.ranked.forEach((r, i) => L.push(`${i + 1}. ${r.name} (${r.status === "LIVE ONLY" ? "live" : r.status === "PREMATCH" ? "pré-match" : r.status === "WAIT" ? "attendre" : "à surveiller"})`));
  L.push("");
  L.push("⚠️ Analyse informative. Aucune issue garantie. Réservé aux majeurs. Jouez responsable.");

  return L.join("\n");
}

/* ============================================================================
 *  /markets — marchés à surveiller uniquement (court, classé)
 * ========================================================================= */

export function composeMarketsWatch(data: PreMatchData): string {
  const watchlist = buildMarketWatchlist(watchlistInputFrom(data));
  return renderMarketWatchlistDetailed(watchlist, data.fixture.home.name, data.fixture.away.name);
}

/* ============================================================================
 *  /brief — très court (~10 lignes)
 * ========================================================================= */

export function composeBrief(data: PreMatchData): string {
  const { fixture: f, context, weather } = data;
  const { fav, und, favKnown } = favoriteNames(context, f);
  const score = computeReadingScore(data);
  const watchlist = buildMarketWatchlist(watchlistInputFrom(data));
  const top = watchlist.ranked.slice(0, 3).map((r) => r.name);

  const L: string[] = [];
  L.push(`⚡ Brief — ${f.home.name} vs ${f.away.name}`);
  L.push(`⏱ ${formatKickoff(f.kickoffAt)}`);
  L.push(favKnown ? `Favori : ${fav} · Outsider : ${und}.` : "Rapport de force équilibré.");
  L.push(`Forme : ${context.recentFormSummary}`);
  if (weather && weather.available) L.push(`Météo : ${weather.summary}.`);
  L.push(`Signal pré-match : ${score.signal} · Confiance ${score.confidence}/100 · Risque ${score.risk}.`);
  L.push(`À surveiller : ${top.length ? top.join(" · ") : "rien de net pour l'instant"}.`);
  L.push(`Plan : observer 0-15 min, surveiller « prochain but ${fav} » si vraie pression, no bet sans cote live.`);
  L.push("⚠️ Informatif. Réservé aux majeurs. Jouez responsable.");
  return L.join("\n");
}

/* ============================================================================
 *  /context — contexte + plan live (inchangé)
 * ========================================================================= */

export function composeContextPlan(data: PreMatchData): string {
  const { fixture: f, context, group } = data;
  const L: string[] = [];
  L.push(`🧭 Contexte & plan live — ${f.home.name} vs ${f.away.name}`);
  L.push("");
  L.push("Contexte :");
  L.push(`• ${context.preMatchExpectation}`);
  L.push(`• Groupe : ${group.name ?? "à confirmer"}${group.others.length ? ` — autres : ${group.others.join(", ")}` : ""}`);
  L.push(`• Forme : ${context.recentFormSummary}`);
  if (context.keyPlayers.length > 0) L.push(`• Joueurs clés (à confirmer) : ${context.keyPlayers.join(", ")}`);
  L.push("");
  L.push("Plan live à suivre :");
  L.push("• Surveiller les 10-15 premières minutes (qui prend l'ascendant).");
  L.push(`• Si ${context.favoriteTeam ?? "une équipe"} pousse (tirs cadrés/corners) : WATCH « prochain but ».`);
  L.push(`• Si ${context.underdogTeam ?? "l'outsider"} marque tôt : WAIT, attendre la réaction.`);
  L.push("• Match fermé sans tirs cadrés : NO BET.");
  L.push("• Score déjà 2-2 : ignorer Over 1.5 / Over 2.5 / BTTS (déjà résolus).");
  L.push("");
  L.push("⚠️ Sans cotes live, aucune value confirmée. Analyse informative.");
  return L.join("\n");
}

/* ============================================================================
 *  FORMAT LONG (/analyse_full) — version détaillée premium
 * ========================================================================= */

export function composeFullPreMatchAnalysis(data: PreMatchData): string {
  const { fixture: f, recentForm, h2h, context, group, odds, weather } = data;
  const home = f.home.name;
  const away = f.away.name;
  const favName = context.favoriteTeam ?? home;
  const undName = context.underdogTeam ?? away;
  const favKnown = context.favoriteSide !== null;

  const hm = counted(recentForm.home);
  const am = counted(recentForm.away);
  const homeFor = perMatch(recentForm.home?.goalsFor ?? 0, hm);
  const homeAgainst = perMatch(recentForm.home?.goalsAgainst ?? 0, hm);
  const awayFor = perMatch(recentForm.away?.goalsFor ?? 0, am);
  const awayAgainst = perMatch(recentForm.away?.goalsAgainst ?? 0, am);

  const round = f.round ?? "";
  const isFirstGroupMatch = /group/i.test(round) && /\b1\b/.test(round);
  const dataConfidence =
    recentForm.home && recentForm.away && h2h && h2h.totalMatches > 0
      ? data.lineups.length > 0
        ? "élevé"
        : "moyen-élevé"
      : recentForm.home && recentForm.away
      ? "moyen"
      : "faible";

  const L: string[] = [];
  L.push(`🏟 Analyse complète — ${home} vs ${away}`);
  L.push("");

  // 1. Contexte du match & du groupe (sans répétition)
  L.push("1. Contexte du match & du groupe");
  L.push(`• Compétition : ${f.leagueName} ${f.season}`);
  L.push(
    `• Groupe : ${group.name ?? "à confirmer"}${
      group.others.length > 0 ? ` — autres équipes : ${group.others.join(", ")}` : ""
    }`
  );
  L.push(`• Journée : ${round || "à confirmer"}${isFirstGroupMatch ? " (premier match de groupe)" : ""}`);
  L.push(
    `• Coup d'envoi : ${formatKickoff(f.kickoffAt)}${f.venueName ? ` · ${f.venueName}${f.venueCity ? ` (${f.venueCity})` : ""}` : ""}`
  );
  L.push(`• Météo : ${weather && weather.available ? `${weather.summary}${weather.impact ? ` — ${weather.impact}` : ""}` : "non disponible (non intégrée au signal)"}`);
  L.push(
    `• Enjeu : ${isFirstGroupMatch ? "premier match de groupe — ne pas se rater, la différence de buts peut compter en fin de groupe. " : ""}${
      favKnown ? `${favName} est attendu pour prendre l'initiative; ${undName} sera dangereux si le match reste serré.` : `Match a priori équilibré : l'initiative se lira dans les 10-15 premières minutes.`
    }`
  );
  L.push("");

  // 2. Dynamique des équipes
  L.push("2. Dynamique des équipes");
  L.push(
    `• ${home} : ${formString(recentForm.home)} (${recentForm.home ? `${recentForm.home.wins}V ${recentForm.home.draws}N ${recentForm.home.losses}D` : "n/d"}) — off ${fmt(homeFor)}/match · déf ${fmt(homeAgainst)} encaissé/match · clean sheets ${cleanSheets(recentForm.home)}`
  );
  L.push(
    `• ${away} : ${formString(recentForm.away)} (${recentForm.away ? `${recentForm.away.wins}V ${recentForm.away.draws}N ${recentForm.away.losses}D` : "n/d"}) — off ${fmt(awayFor)}/match · déf ${fmt(awayAgainst)} encaissé/match · clean sheets ${cleanSheets(recentForm.away)}`
  );
  if (h2h && h2h.totalMatches > 0) {
    L.push(`• H2H : ${home} ${h2h.team1Wins} – ${h2h.draws} nuls – ${h2h.team2Wins} ${away} (sur ${h2h.totalMatches} matchs)`);
  } else {
    L.push("• H2H : Donnée non disponible ou peu significative.");
  }
  L.push(`• Niveau de confiance des données : ${dataConfidence}.`);
  L.push("");

  // 3. Lecture tactique probable (approfondie)
  L.push("3. Lecture tactique probable");
  L.push(
    `• Rythme attendu : ${favKnown ? `${favName} cherchera à imposer le tempo et à installer le jeu, ${undName} devrait plutôt défendre en bloc et frapper en transition.` : "deux équipes qui peuvent se neutraliser; le rythme dépendra de qui ose presser haut en premier."}`
  );
  L.push(`• Bloc : ${favName} probablement en bloc médian/haut avec récupération avancée; ${undName} en bloc bas + sorties rapides.`);
  L.push(`• Danger côté ${favName} : domination stérile — beaucoup de ballon mais peu de tirs cadrés. Le contrôle ne vaut rien sans occasions franches.`);
  L.push(`• Danger côté ${undName} : contres et coups de pied arrêtés${awayFor !== null && awayFor >= 1.2 ? " (profil capable de marquer malgré peu de ballon)" : ""}.`);
  L.push(`• 10-15 premières minutes : décisives pour lire l'intention (qui presse, qui cadre, qui obtient des corners).`);
  L.push(`• Qui profite de quoi : un match fermé arrange ${undName}; un match ouvert arrange ${favName} mais ouvre aussi BTTS/over.`);
  L.push("• Comment lire le live : tirs cadrés = vraie pression · corners rapprochés = poussée réelle · possession sans tir cadré = domination stérile (piège).");
  L.push("");

  // 4. Joueurs clés (prudent, à confirmer)
  L.push("4. Joueurs clés (à confirmer avec les lineups)");
  const favPos = positionsFor(data.lineups, favName);
  const undPos = positionsFor(data.lineups, undName);
  if (favPos || undPos) {
    if (favPos) {
      if (favPos.forwards.length) L.push(`• ${favName} — attaque : ${favPos.forwards.join(", ")}`);
      if (favPos.mids.length) L.push(`• ${favName} — milieu/création : ${favPos.mids.slice(0, 4).join(", ")}`);
      if (favPos.defs.length || favPos.gk.length) L.push(`• ${favName} — défense/gardien : ${[...favPos.defs.slice(0, 3), ...favPos.gk].join(", ")}`);
    }
    if (undPos) {
      if (undPos.forwards.length) L.push(`• ${undName} — dangers en transition : ${undPos.forwards.join(", ")}`);
      if (undPos.mids.length) L.push(`• ${undName} — relais/percussion : ${undPos.mids.slice(0, 3).join(", ")}`);
    }
    L.push("• Les remplaçants offensifs pourront changer le match en seconde période (à suivre dès les changements).");
  } else {
    L.push("Sans composition officielle, les joueurs clés restent à confirmer. Le plan live devra être ajusté dès l'annonce des titulaires.");
    L.push(`• ${favName} : surveiller les attaquants de pointe et ailiers (création d'occasions), le meneur/relayeurs (tempo), la charnière et le gardien (solidité).`);
    L.push(`• ${undName} : profils rapides en transition, spécialistes des coups de pied arrêtés, finisseurs capables de punir sur une seule occasion.`);
  }
  if (context.knownInjuries.length > 0) {
    L.push(`• Absents/incertains signalés (source secondaire, à confirmer) : ${context.knownInjuries.join(", ")}`);
  } else {
    L.push("• Blessures/absences : Donnée non disponible (ne rien présumer avant les lineups officielles).");
  }
  L.push("");

  // 5. Scénarios live concrets
  L.push("5. Scénarios live");
  L.push(`• Scénario 1 — ${favName} démarre fort : ≥2 tirs, 1 tir cadré ou 2 corners dans les 15 premières minutes → « prochain but ${favName} » devient à surveiller. La victoire sèche reste moins intéressante si la cote est déjà compressée.`);
  L.push(`• Scénario 2 — ${favName} domine stérilement : possession mais 0 tir cadré après 15-20 min → ne pas acheter le favori trop tôt. Attendre une vraie occasion ou une baisse de cote exploitable.`);
  L.push(`• Scénario 3 — ${undName} résiste et sort vite : 1-2 transitions dangereuses → match plus risqué pour un pari ${favName}. Surveiller plutôt BTTS/over live uniquement si le rythme s'ouvre.`);
  L.push(`• Scénario 4 — but tôt : si ${favName} marque tôt, ne pas courir après la cote (rechecker s'il pousse encore ou gère). Si ${undName} marque tôt, WAIT obligatoire : attendre la réaction de ${favName} sur 5-10 min.`);
  L.push(`• Scénario 5 — match fermé à 0-0 : peu de tirs cadrés et peu de rythme après 25-30 min → éviter over live et victoire sèche. No bet ou attendre changements/hausse de rythme.`);
  L.push("");

  // 6. Marchés à surveiller (+ cotes/value)
  L.push("6. Marchés à surveiller");
  if (odds.available && (odds.oneX2 || odds.overUnder || odds.btts)) {
    L.push(`Cotes${odds.bookmaker ? ` (${odds.bookmaker})` : ""}${odds.updatedAt ? ` · maj ${formatKickoff(odds.updatedAt)}` : ""} :`);
    if (odds.oneX2) L.push(`• 1X2 : ${home} ${odds.oneX2.home} / Nul ${odds.oneX2.draw} / ${away} ${odds.oneX2.away}`);
    if (odds.overUnder) L.push(`• Over/Under ${odds.overUnder.line} : Over ${odds.overUnder.over} / Under ${odds.overUnder.under}`);
    if (odds.btts) L.push(`• BTTS : Oui ${odds.btts.yes} / Non ${odds.btts.no}`);
    L.push("Ces cotes sont « à surveiller » (pas « à jouer ») : la décision se prend en live selon la pression réelle.");
  } else {
    L.push("• Cotes exactes non affichées : aucune value confirmée. Les marchés ci-dessous sont « à surveiller » en live, jamais « à jouer » sans cote exploitable.");
  }
  L.push(`• « Prochain but » (LIVE) : marché prioritaire, selon la pression réelle de chaque équipe.`);
  L.push(`• Double chance ${favName}/nul : seulement si ${favName} confirme sa domination par des occasions.`);
  L.push("• Over 1.5 / BTTS : à surveiller uniquement si le rythme s'ouvre (tirs cadrés des deux côtés), pas par défaut.");
  L.push("• À éviter : victoire sèche pré-match d'une sélection (trop d'aléa) et tout marché sans cote.");
  L.push("");

  // 7. Ce que je ferais
  L.push("🎯 Ce que je ferais");
  L.push("Je ne rentrerais pas forcément pré-match. Je construirais plutôt un plan live :");
  L.push(`• 0-15 min : observer si ${favName} transforme sa possession en occasions.`);
  L.push(`• Si ${favName} cadre vite + corners : surveiller « prochain but ${favName} ».`);
  L.push(`• Si ${favName} domine sans cadrer : éviter la victoire live (risque de domination stérile).`);
  L.push(`• Si ${undName} obtient des transitions dangereuses : réduire la confiance sur ${favName} et surveiller un match plus ouvert.`);
  L.push("• Sans cote live exploitable : no bet.");
  L.push("");

  // 8. Checklist live
  L.push("🔎 Checklist live");
  L.push(`À surveiller pour ${favName} : tirs cadrés · corners rapprochés · récupération haute · présence dans la surface · baisse de cote cohérente.`);
  L.push(`À surveiller pour ${undName} : transitions rapides · coups de pied arrêtés · tirs malgré faible possession · espaces derrière la défense de ${favName}.`);
  L.push(`Signaux d'alerte : ${favName} possession haute mais 0 tir cadré · ${undName} qui sort facilement · carton jaune rapide sur un défenseur · blessure/changement forcé · cote qui se compresse trop vite.`);
  L.push("");

  // 9. Risques
  L.push("9. Risques");
  if (isFirstGroupMatch) L.push("• Match d'ouverture de groupe : équipes qui se jaugent, scénario parfois fermé.");
  L.push("• Sélections nationales : moins d'automatismes, plus d'imprévisibilité qu'en club.");
  if (data.lineups.length === 0) L.push("• Compositions non confirmées : joueurs clés et plan à ajuster à l'annonce des titulaires.");
  if (!odds.available) L.push("• Cotes non disponibles : aucune value chiffrée.");
  if (!recentForm.home || !recentForm.away) L.push("• Forme récente partielle : lecture à pondérer.");
  if (!h2h || h2h.totalMatches === 0) L.push("• Historique H2H limité : peu de repères fiables.");
  L.push("");
  L.push("⚠️ Analyse informative. Aucune issue garantie. Réservé aux majeurs. Jouez de manière responsable.");

  return L.join("\n");
}

/* ============================================================================
 *  Récupération des données (réseau)
 * ========================================================================= */

export async function fetchPreMatchData(fixtureId: number): Promise<PreMatchData> {
  const af = await getFixtureById(fixtureId);
  if (!af) throw new Error("Fixture introuvable via l'API.");
  const fixture = normalizeFixture(af);

  const [homeLast, awayLast, h2hRaw, lineupsRaw, groupInfo, weather] = await Promise.all([
    getTeamLastFixtures(fixture.home.id, 5).catch(() => []),
    getTeamLastFixtures(fixture.away.id, 5).catch(() => []),
    getHeadToHead(fixture.home.id, fixture.away.id, 10).catch(() => []),
    getFixtureLineups(fixtureId).catch(() => []),
    getGroupInfo(fixture.home.name).catch(() => ({ name: null, others: [] as string[] })),
    fetchWeather().catch(() => null),
  ]);

  let odds: DisplayOdds = { available: false, bookmaker: null, updatedAt: null, oneX2: null, overUnder: null, btts: null };
  let favoriteHint: "home" | "away" | null = null;
  try {
    const rawOdds = await getOdds(fixtureId);
    if (rawOdds.length > 0) {
      const normalized = { available: true, raw: rawOdds };
      odds = extractDisplayOdds(normalized);
      favoriteHint = extractFavoriteFromOdds(normalized);
    }
  } catch {
    /* cotes indisponibles */
  }

  const recentForm = {
    home: normalizeRecentForm(fixture.home.id, homeLast),
    away: normalizeRecentForm(fixture.away.id, awayLast),
  };
  const h2h = normalizeH2H(fixture.home.id, fixture.away.id, h2hRaw);
  const lineups = normalizeLineups(lineupsRaw);
  const context = buildContextIntelligence({
    fixture,
    statistics: emptyStatsPair(),
    recentForm,
    h2h,
    lineups,
    favoriteSideHint: favoriteHint,
  });

  const group = {
    name: groupInfo.name ?? fixture.groupName ?? null,
    others: (groupInfo.others ?? []).filter((t) => !sameTeam(t, fixture.away.name)),
  };

  return { fixture, recentForm, h2h, lineups, context, group, odds, weather };
}

export async function buildPreMatchAnalysis(fixtureId: number): Promise<{ text: string; data: PreMatchData }> {
  const data = await fetchPreMatchData(fixtureId);
  return { text: composePreMatchAnalysis(data), data };
}

export async function buildFullPreMatchAnalysis(fixtureId: number): Promise<{ text: string; data: PreMatchData }> {
  const data = await fetchPreMatchData(fixtureId);
  return { text: composeFullPreMatchAnalysis(data), data };
}
