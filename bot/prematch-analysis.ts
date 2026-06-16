/**
 * Analyse complète AVANT match (/analyse_match).
 *
 * composePreMatchAnalysis() est PUR (testable sans réseau): il prend des données
 * normalisées et produit une analyse structurée et détaillée (sections 1-9).
 * fetchPreMatchData() récupère et normalise depuis l'API.
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
import { extractFavoriteFromOdds } from "@/lib/odds-engine";
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

export interface PreMatchData {
  fixture: NormalizedFixture;
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  lineups: NormalizedLineup[];
  context: ContextIntelligence;
  oddsAvailable: boolean;
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

function countedMatches(rf: RecentForm | null): number {
  if (!rf) return 0;
  return rf.wins + rf.draws + rf.losses;
}
function cleanSheets(rf: RecentForm | null): number {
  if (!rf) return 0;
  return rf.results.filter((r) => r.outcome !== "?" && (r.goalsAgainst ?? 1) === 0).length;
}
function avg(n: number, d: number): string {
  if (d <= 0) return "—";
  return (n / d).toFixed(2);
}
function formString(rf: RecentForm | null): string {
  if (!rf || rf.results.length === 0) return "non disponible";
  return rf.results
    .slice(0, 5)
    .map((r) => r.outcome)
    .join(" ");
}

export function composePreMatchAnalysis(data: PreMatchData): string {
  const { fixture: f, recentForm, h2h, context } = data;
  const home = f.home.name;
  const away = f.away.name;
  const fav = context.favoriteTeam;
  const und = context.underdogTeam;

  const hm = countedMatches(recentForm.home);
  const am = countedMatches(recentForm.away);
  const homeForGoals = recentForm.home ? avg(recentForm.home.goalsFor, hm) : "—";
  const homeAgainstGoals = recentForm.home ? avg(recentForm.home.goalsAgainst, hm) : "—";
  const awayForGoals = recentForm.away ? avg(recentForm.away.goalsFor, am) : "—";
  const awayAgainstGoals = recentForm.away ? avg(recentForm.away.goalsAgainst, am) : "—";

  const L: string[] = [];
  L.push(`🏟 Analyse complète — ${home} vs ${away}`);
  L.push("");

  // 1. Contexte
  L.push("1. Contexte du match");
  L.push(`• Compétition : ${f.leagueName} ${f.season}`);
  L.push(`• Tour / groupe : ${f.groupName ?? f.round ?? "non précisé"}`);
  L.push(`• Coup d'envoi : ${formatKickoff(f.kickoffAt)}${f.venueName ? ` · ${f.venueName}${f.venueCity ? ` (${f.venueCity})` : ""}` : ""}`);
  L.push(`• ${context.groupContext}`);
  L.push(
    "• Enjeu : match de sélection, souvent l'objectif premier est de ne pas se faire piéger tôt. Le match peut devenir intéressant en live si une équipe prend l'ascendant sur les 10 premières minutes."
  );
  L.push("");

  // 2. Dynamique des équipes
  L.push("2. Dynamique des équipes");
  L.push(`• Forme ${home} : ${formString(recentForm.home)} (${recentForm.home ? `${recentForm.home.wins}V ${recentForm.home.draws}N ${recentForm.home.losses}D` : "n/d"})`);
  L.push(`   — offensive : ${homeForGoals} but/match · défensive : ${homeAgainstGoals} encaissé/match · clean sheets : ${cleanSheets(recentForm.home)}`);
  L.push(`• Forme ${away} : ${formString(recentForm.away)} (${recentForm.away ? `${recentForm.away.wins}V ${recentForm.away.draws}N ${recentForm.away.losses}D` : "n/d"})`);
  L.push(`   — offensive : ${awayForGoals} but/match · défensive : ${awayAgainstGoals} encaissé/match · clean sheets : ${cleanSheets(recentForm.away)}`);
  if (h2h && h2h.totalMatches > 0) {
    L.push(`• H2H : ${home} ${h2h.team1Wins} – ${h2h.draws} nuls – ${h2h.team2Wins} ${away} (sur ${h2h.totalMatches} matchs)`);
  } else {
    L.push("• H2H : non disponible ou peu significatif.");
  }
  L.push("");

  // 3. Lecture tactique probable
  L.push("3. Lecture tactique probable");
  if (fav) {
    L.push(`• ${fav} devrait avoir davantage le ballon et chercher à installer le jeu.`);
    L.push(`• ${und} peut être dangereux s'il accepte de subir et joue vite en transition.`);
    L.push(`• Point de vigilance : si ${fav} monopolise le ballon mais ne cadre pas, c'est une domination stérile possible — il faudra éviter la victoire live trop tôt.`);
    L.push(`• Bascule clé : si ${fav} combine possession + tirs cadrés + corners, le marché « prochain but ${fav} » devient plus intéressant que la victoire sèche.`);
  } else {
    L.push("• Pas de favori net : match a priori équilibré, la lecture se fera surtout en live.");
    L.push("• Zones à surveiller : qui parvient à cadrer et à enchaîner les corners sur les 15 premières minutes.");
  }
  L.push("");

  // 4. Joueurs clés
  L.push("4. Joueurs clés");
  if (context.keyPlayers.length > 0) {
    for (const p of context.keyPlayers) L.push(`• ${p}`);
  } else {
    L.push("• Compositions non confirmées : joueurs clés à confirmer à l'annonce des lineups.");
  }
  if (context.knownInjuries.length > 0) {
    L.push(`• Absents/incertains signalés : ${context.knownInjuries.join(", ")}`);
  }
  L.push("");

  // 5. Scénarios probables
  L.push("5. Scénarios probables");
  L.push(`• Scénario A — ${fav ?? "le favori"} domine tôt : surveiller tirs cadrés et corners; si pression réelle, « prochain but » plus intéressant que victoire sèche.`);
  L.push(`• Scénario B — ${und ?? "l'outsider"} marque ou résiste : scénario pré-match cassé, ne pas se précipiter sur le favori; attendre 5-10 min sa réaction.`);
  L.push("• Scénario C — match fermé : peu de tirs cadrés, rythme faible → NO BET, surtout sur les overs.");
  L.push("• Scénario D — match ouvert : tirs des deux côtés → surveiller Over 1.5 / BTTS tant qu'ils ne sont pas déjà résolus.");
  L.push("");

  // 6. Marchés à surveiller AVANT match
  L.push("6. Marchés à surveiller AVANT match");
  const combinedAtt =
    recentForm.home && recentForm.away
      ? recentForm.home.goalsFor / Math.max(1, hm) + recentForm.away.goalsFor / Math.max(1, am)
      : null;
  if (combinedAtt !== null && combinedAtt >= 2.4) {
    L.push("• Over 1.5 / BTTS : plausible vu les moyennes offensives récentes (à confirmer par le rythme live).");
  } else if (combinedAtt !== null && combinedAtt <= 1.5) {
    L.push("• Prudence sur les overs : profils plutôt prudents/peu prolifiques récemment.");
  } else {
    L.push("• Overs / BTTS : à arbitrer en live selon le rythme des 15 premières minutes.");
  }
  L.push("• Double chance favori/nul : seulement si le favori confirme sa domination en jeu.");
  L.push("• « Prochain but » : marché LIVE uniquement, pas pré-match.");
  L.push("• À éviter : victoire sèche pré-match d'une sélection (trop d'aléa), et tout marché sans cote exploitable.");
  L.push("");

  // 7. Ce que je ferais avant match
  L.push("7. Ce que je ferais avant match");
  L.push(
    `Je privilégierais le live plutôt qu'un pari pré-match : un match de sélection est imprévisible. ${
      data.oddsAvailable
        ? "Les cotes sont disponibles : un marché ne m'intéresse que si la cote reste au-dessus de la probabilité estimée."
        : "Sans cotes live ni pré-match exploitables, aucune value confirmée : je n'entrerais pas pré-match."
    } J'attendrais 10-15 minutes pour lire le rythme avant toute décision.`
  );
  L.push("");

  // 8. Risques
  L.push("8. Risques");
  L.push("• Match de sélection : forte imprévisibilité.");
  if (!recentForm.home || !recentForm.away) L.push("• Forme récente partielle ou peu fiable.");
  if (data.lineups.length === 0) L.push("• Compositions non confirmées au moment de l'analyse.");
  if (!data.oddsAvailable) L.push("• Cotes non disponibles : aucune value chiffrée.");
  L.push("• Historique H2H parfois trop faible pour conclure.");
  L.push("");

  // 9. Plan live à suivre
  L.push("9. Plan live à suivre");
  L.push("• Surveiller les 10 premières minutes (qui prend l'ascendant).");
  L.push(`• Si ${fav ?? "une équipe"} pousse avec tirs cadrés/corners : WATCH « prochain but ».`);
  L.push(`• Si ${und ?? "l'outsider"} marque tôt : WAIT, attendre la réaction du favori.`);
  L.push("• Si match fermé sans tirs cadrés : NO BET.");
  L.push("• Indicateurs : tirs cadrés, corners, possession dangereuse, réaction après but, cartons, blessures, changements offensifs, domination stérile.");
  L.push("• Si score déjà 2-2 : ignorer Over 1.5 / Over 2.5 / BTTS (déjà résolus).");
  L.push("");
  L.push("⚠️ Analyse informative. Aucune issue garantie. Réservé aux majeurs. Jouez responsable.");

  return L.join("\n");
}

export function composeContextPlan(data: PreMatchData): string {
  const { fixture: f, context } = data;
  const L: string[] = [];
  L.push(`🧭 Contexte & plan live — ${f.home.name} vs ${f.away.name}`);
  L.push("");
  L.push("Contexte :");
  L.push(`• ${context.preMatchExpectation}`);
  L.push(`• ${context.groupContext}`);
  L.push(`• Forme : ${context.recentFormSummary}`);
  if (context.keyPlayers.length > 0) L.push(`• Joueurs clés : ${context.keyPlayers.join(", ")}`);
  L.push("");
  L.push("Plan live à suivre :");
  L.push("• Surveiller les 10 premières minutes (qui prend l'ascendant).");
  L.push(`• Si ${context.favoriteTeam ?? "une équipe"} pousse (tirs cadrés/corners) : WATCH « prochain but ».`);
  L.push(`• Si ${context.underdogTeam ?? "l'outsider"} marque tôt : WAIT, attendre la réaction.`);
  L.push("• Match fermé sans tirs cadrés : NO BET.");
  L.push("• Score déjà 2-2 : ignorer Over 1.5 / Over 2.5 / BTTS (déjà résolus).");
  L.push("");
  L.push("⚠️ Sans cotes live, aucune value confirmée. Analyse informative.");
  return L.join("\n");
}

export async function fetchPreMatchData(fixtureId: number): Promise<PreMatchData> {
  const af = await getFixtureById(fixtureId);
  if (!af) throw new Error("Fixture introuvable via l'API.");
  const fixture = normalizeFixture(af);

  const [homeLast, awayLast, h2hRaw, lineupsRaw] = await Promise.all([
    getTeamLastFixtures(fixture.home.id, 5).catch(() => []),
    getTeamLastFixtures(fixture.away.id, 5).catch(() => []),
    getHeadToHead(fixture.home.id, fixture.away.id, 10).catch(() => []),
    getFixtureLineups(fixtureId).catch(() => []),
  ]);

  let oddsAvailable = false;
  let favoriteHint: "home" | "away" | null = null;
  try {
    const rawOdds = await getOdds(fixtureId);
    if (rawOdds.length > 0) {
      oddsAvailable = true;
      favoriteHint = extractFavoriteFromOdds({ available: true, raw: rawOdds });
    }
  } catch {
    oddsAvailable = false;
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

  return { fixture, recentForm, h2h, lineups, context, oddsAvailable };
}

export async function buildPreMatchAnalysis(fixtureId: number): Promise<{ text: string; data: PreMatchData }> {
  const data = await fetchPreMatchData(fixtureId);
  return { text: composePreMatchAnalysis(data), data };
}
