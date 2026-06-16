/**
 * Context engine: intelligence pré-match comparée au scénario live.
 *
 * Détermine un favori (forme récente + H2H + indice de cotes si dispo),
 * les joueurs clés (depuis les compositions), les blessures connues (depuis la
 * source secondaire si activée), et surtout l'écart entre l'attente pré-match
 * et la réalité du terrain (scénario cassé, conforme, etc.).
 *
 * Tout est dégradable: sans contexte synchronisé, le favori reste indéterminé.
 */

import type {
  H2HSummary,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedStatsPair,
  RecentForm,
} from "@/types/match";
import type { ContextIntelligence } from "@/types/live-advice";
import type { ExternalCommentaryEvent } from "@/types/commentary";

export interface ContextEngineInput {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  lineups: NormalizedLineup[];
  /** Indice de favori issu des cotes (prioritaire si fourni). */
  favoriteSideHint?: "home" | "away" | null;
  externalCommentaryEvents?: ExternalCommentaryEvent[];
}

function formScore(rf: RecentForm | null): number | null {
  if (!rf) return null;
  return rf.wins * 3 + rf.draws + (rf.goalsFor - rf.goalsAgainst);
}

function determineFavorite(input: ContextEngineInput): "home" | "away" | null {
  if (input.favoriteSideHint) return input.favoriteSideHint;

  const hs = formScore(input.recentForm.home);
  const as = formScore(input.recentForm.away);
  if (hs !== null && as !== null) {
    if (hs - as >= 2) return "home";
    if (as - hs >= 2) return "away";
  }

  const h2h = input.h2h;
  if (h2h && h2h.totalMatches >= 3) {
    if (h2h.team1Wins - h2h.team2Wins >= 2) return "home";
    if (h2h.team2Wins - h2h.team1Wins >= 2) return "away";
  }
  return null;
}

function extractKeyPlayers(lineups: NormalizedLineup[]): string[] {
  const players: string[] = [];
  for (const l of lineups) {
    const forwards = l.startXI
      .filter((p) => (p.pos ?? "").toUpperCase() === "F")
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 2);
    for (const name of forwards) players.push(`${name} (${l.teamName})`);
  }
  return players.slice(0, 4);
}

function recentFormSummary(input: ContextEngineInput): string {
  const { recentForm, fixture } = input;
  const parts: string[] = [];
  if (recentForm.home) {
    const f = recentForm.home;
    parts.push(`${fixture.home.name}: ${f.wins}V ${f.draws}N ${f.losses}D (${f.goalsFor}-${f.goalsAgainst})`);
  }
  if (recentForm.away) {
    const f = recentForm.away;
    parts.push(`${fixture.away.name}: ${f.wins}V ${f.draws}N ${f.losses}D (${f.goalsFor}-${f.goalsAgainst})`);
  }
  return parts.length > 0
    ? parts.join(" · ")
    : "Forme récente non synchronisée (lancer un sync « contexte »).";
}

function groupContext(fixture: NormalizedFixture): string {
  if (fixture.groupName) {
    return `Phase de groupes — ${fixture.groupName}. Chaque point compte pour la qualification.`;
  }
  const round = (fixture.round ?? "").toLowerCase();
  if (/final|semi|quarter|round of 16|huiti|quart|demi/.test(round)) {
    return "Phase à élimination directe — pas de droit à l'erreur, prudence sur la fin de match.";
  }
  return fixture.round ? `Compétition: ${fixture.round}.` : "Contexte de groupe non disponible.";
}

export function buildContextIntelligence(input: ContextEngineInput): ContextIntelligence {
  const { fixture } = input;
  const favoriteSide = determineFavorite(input);
  const favoriteTeam =
    favoriteSide === "home" ? fixture.home.name : favoriteSide === "away" ? fixture.away.name : null;
  const underdogTeam =
    favoriteSide === "home" ? fixture.away.name : favoriteSide === "away" ? fixture.home.name : null;

  const keyPlayers = extractKeyPlayers(input.lineups);
  const knownInjuries = (input.externalCommentaryEvents ?? [])
    .filter((e) => e.eventType === "injury")
    .map((e) => `${e.playerName ?? "Joueur"}${e.teamName ? ` (${e.teamName})` : ""}`)
    .slice(0, 6);

  const preMatchExpectation = favoriteTeam
    ? `${favoriteTeam} attendu favori face à ${underdogTeam}, sur la base de la forme récente${
        input.h2h && input.h2h.totalMatches > 0 ? " et de l'historique des confrontations" : ""
      }.`
    : "Pas de favori clair identifié (contexte limité ou équipes proches).";

  const hg = fixture.homeGoals ?? 0;
  const ag = fixture.awayGoals ?? 0;
  const lead = hg - ag;
  const leaderName = lead > 0 ? fixture.home.name : lead < 0 ? fixture.away.name : null;

  const currentReality =
    fixture.phase === "scheduled"
      ? "Match non démarré."
      : `${fixture.home.name} ${hg}-${ag} ${fixture.away.name} à la ${fixture.elapsed ?? 0}'.`;

  let scenarioShift: string;
  let keyDifference: string;

  if (!favoriteSide) {
    scenarioShift =
      lead === 0
        ? "Match équilibré, aucun favori clair identifié."
        : `${leaderName} mène, sans favori pré-match établi.`;
    keyDifference = "Favori indéterminé: lecture basée surtout sur la dynamique live.";
  } else {
    const favoriteTrailing =
      (favoriteSide === "home" && lead < 0) || (favoriteSide === "away" && lead > 0);
    const favoriteLeading =
      (favoriteSide === "home" && lead > 0) || (favoriteSide === "away" && lead < 0);

    if (fixture.phase === "scheduled") {
      scenarioShift = "Match non démarré: scénario pré-match encore intact.";
      keyDifference = "Attendre le coup d'envoi pour mesurer l'écart réel.";
    } else if (lead === 0) {
      scenarioShift = `${favoriteTeam} (favori) tenu en échec pour l'instant.`;
      keyDifference = `Le favori n'a pas encore fait la différence — prudence sur une victoire sèche.`;
    } else if (favoriteTrailing) {
      scenarioShift = `Scénario pré-match cassé: ${underdogTeam} (outsider) mène contre ${favoriteTeam}.`;
      keyDifference = `Ne pas se précipiter sur ${favoriteTeam} vainqueur live: il faut d'abord mesurer la réaction.`;
    } else {
      scenarioShift = `Conforme au scénario: ${favoriteTeam} (favori) mène.`;
      keyDifference = `Le favori respecte l'attente — surveiller la gestion plutôt que de courir après la cote.`;
    }
  }

  const liveVsPreMatchMismatch =
    fixture.phase === "scheduled"
      ? "Comparaison live indisponible avant le coup d'envoi."
      : favoriteSide
      ? `${scenarioShift} ${keyDifference}`
      : `${currentReality} ${keyDifference}`;

  return {
    preMatchExpectation,
    favoriteTeam,
    underdogTeam,
    favoriteSide,
    keyPlayers,
    knownInjuries,
    recentFormSummary: recentFormSummary(input),
    groupContext: groupContext(fixture),
    scenarioShift,
    liveVsPreMatchMismatch,
  };
}
