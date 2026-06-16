/**
 * Alerte live COMPACTE (8-15 lignes, <= 1200 caractères), orientée décision.
 * PUR. Construit à partir de la décision live, de l'événement et de la mémoire.
 *
 * Format :
 *   🚨 Match — minute
 *   Événement
 *   Action
 *   Lecture (liée au score/minute/contexte)
 *   À éviter
 *   À surveiller seulement si…
 *   Décision (mini "betting final check")
 *   Prochain check
 */

import type { NormalizedFixture } from "@/types/match";
import type { LiveBettingDecision, DecisionAction } from "./live-betting-decision-engine";
import type { MatchMemory } from "./match-memory";
import type { OddsSnapshotComparison } from "./odds/odds-snapshot";

const MAX_LEN = 1200;

export interface CompactAlertEvent {
  label: string;
  isGoal?: boolean;
  isRedCard?: boolean;
  minute?: number | null;
}

export interface CompactAlertInput {
  match: NormalizedFixture;
  event: CompactAlertEvent | null;
  liveDecision: LiveBettingDecision;
  matchMemory?: MatchMemory | null;
  oddsSnapshot?: OddsSnapshotComparison | null;
}

function actionLabel(a: DecisionAction): string {
  return a === "NO_BET" ? "NO BET" : a;
}

function nextCheckText(d: LiveBettingDecision): string {
  const phase = d.gameState.phase;
  if (phase === "stoppage_time" || phase === "final_minutes") return "Temps additionnel / fin du match.";
  if (phase === "halftime") return "Reprise de la 2e période.";
  const m = Math.round(d.nextCheckSeconds / 60);
  return m >= 1 ? `${m} min.` : `${d.nextCheckSeconds}s.`;
}

function avoidLines(d: LiveBettingDecision): string[] {
  const out: string[] = [];
  for (const m of d.invalidatedMarkets) out.push(`• ${m.marketName} : ${m.reason}`);
  for (const m of d.avoidMarkets.slice(0, 3)) out.push(`• ${m.marketName} : ${m.reason}`);
  const resolved = d.alreadyResolvedMarkets.map((m) => m.marketName);
  if (resolved.length) out.push(`• ${resolved.join(" / ")} : déjà validés`);
  return out.slice(0, 4);
}

function watchLines(d: LiveBettingDecision): string[] {
  const ms = d.recommendedMarkets;
  if (ms.length === 0) return ["Rien d'exploitable maintenant — no bet."];
  return ms.slice(0, 3).map((m) => {
    const cond = m.conditions.length ? ` si ${m.conditions.join(" + ")}` : "";
    const odd = m.currentOdds ? ` (cote ${m.currentOdds})` : "";
    const tag = m.status === "playable" ? "🎯 " : "";
    return `• ${tag}${m.marketName}${odd}${cond}`;
  });
}

function decisionLine(d: LiveBettingDecision): string {
  switch (d.action) {
    case "PLAYABLE":
      return "Jouable sous conditions, seulement si la cote suit.";
    case "WATCH":
      return "Surveiller, ne rien jouer tant que la condition n'est pas remplie.";
    case "AVOID":
      return "Éviter : piège (domination stérile / cote écrasée).";
    case "INVALIDATED":
      return "Ancien signal mort. Tout recalculer, no bet pour l'instant.";
    case "WAIT":
      return "Attendre, ne pas anticiper.";
    case "NO_BET":
    default:
      return d.bestMarket.market === "avoid_chasing_goal"
        ? "No bet. Ne pas courir après le but, signal trop tardif."
        : "No bet. Le signal n'est pas exploitable.";
  }
}

export function formatCompactLiveAlert(input: CompactAlertInput): string {
  const { match: f, event, liveDecision: d } = input;
  const min = f.elapsed !== null ? `${f.elapsed}e` : `${d.gameState.minute}e`;
  const score = `${f.homeGoals ?? d.gameState.scoreHome}-${f.awayGoals ?? d.gameState.scoreAway}`;
  const icon = event?.isGoal || event?.isRedCard || d.action === "INVALIDATED" ? "🚨" : "⚡";

  const L: string[] = [];
  L.push(`${icon} ${f.home.name} ${score} ${f.away.name} — ${min}`);
  if (event?.label) L.push(event.label);
  L.push("");
  L.push(`Action : ${actionLabel(d.action)}`);
  L.push("");
  L.push("Lecture :");
  L.push(reading(d, event, f));

  const avoid = avoidLines(d);
  if (avoid.length) {
    L.push("");
    L.push("À éviter :");
    L.push(...avoid);
  }

  L.push("");
  L.push("À surveiller seulement :");
  L.push(...watchLines(d));

  L.push("");
  L.push(`Décision : ${actionLabel(d.action)}`);
  L.push(decisionLine(d));

  L.push("");
  L.push(`Prochain check : ${nextCheckText(d)}`);

  let out = L.join("\n");
  if (out.length > MAX_LEN) out = `${out.slice(0, MAX_LEN - 1).trimEnd()}…`;
  return out;
}

/** Lecture (séparée pour éviter une closure capturant un helper inexistant). */
function reading(d: LiveBettingDecision, event: CompactAlertEvent | null, f: NormalizedFixture): string {
  const s: string[] = [];
  if (d.action === "INVALIDATED") s.push("Carton rouge : la situation change, les anciens signaux sont morts.");
  else if (d.gameState.decided && event?.isGoal) s.push("À cette minute, le but confirme surtout la fin du scénario.");
  else if (d.gameState.decided) s.push("Match quasiment plié.");
  else if (d.action === "WAIT") s.push("Trop tôt pour décider, j'attends la réaction sur 5-10 minutes.");
  else if (d.action === "AVOID") s.push("Beaucoup de ballon mais peu d'occasions : domination stérile.");
  else if (d.bestMarket.side) s.push(`Pression réelle de ${d.bestMarket.side === "home" ? f.home.name : f.away.name}.`);

  const dead = d.alreadyResolvedMarkets.map((m) => m.marketName);
  if (dead.length) s.push(`Marchés principaux déjà passés : ${dead.join(", ")}.`);
  if (!d.oddsAvailable) s.push("Sans cote live exploitable, il ne faut pas forcer.");
  if (s.length === 0) s.push(d.summary);
  return s.join(" ");
}
