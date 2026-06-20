/**
 * Formatage des messages Telegram (texte brut + emojis, pas de parse_mode pour
 * éviter tout problème d'échappement).
 */

import type { NormalizedFixture } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";
import { signalLabelFr, timingLabelFr } from "@/lib/ui";
import type { AlertLevel, AlertSource } from "./types";

function scoreLine(f: NormalizedFixture): string {
  return `${f.home.name} ${f.homeGoals ?? 0}-${f.awayGoals ?? 0} ${f.away.name}`;
}

function capActionForSecondary(action: string, source: AlertSource): string {
  if (source === "secondary" && action === "SIGNAL") return "WATCH";
  return action;
}

function nextCheckText(level: AlertLevel, action: string): string {
  if (level === "CRITICAL" || action === "SIGNAL" || action === "INVALIDATED") return "1 à 3 minutes (action chaude).";
  if (action === "WATCH") return "3 à 5 minutes.";
  return "5 minutes.";
}

export interface LiveAlertParams {
  fixture: NormalizedFixture;
  advice: LiveBettingAdvice;
  level: AlertLevel;
  source: AlertSource;
  whatHappened: string;
  /** Synthèse fusion multi-sources (optionnelle). */
  fusion?: { sources: string[]; contradictions: string[]; confidence: string };
}

export function formatLiveAlert(p: LiveAlertParams): string {
  const { fixture: f, advice, level, source } = p;
  const min = f.elapsed !== null ? `${f.elapsed}e` : "—";
  const displayAction = capActionForSecondary(advice.action, source);
  const secondaryNote = source === "secondary" ? "  (source secondaire, à confirmer)" : "";
  const sourceLabel =
    source === "secondary" ? "commentaire public + vérification API lancée" : "API-Football";

  const primary = advice.recommendedMarkets[0] ?? null;
  const icon = level === "CRITICAL" ? "🚨" : "⚡";

  const lines: string[] = [];
  lines.push(`${icon} CoteRadar Live — ${scoreLine(f)}`);
  lines.push(`⏱ ${min} · ${f.statusLong}`);
  lines.push(`Niveau : ${level}`);
  lines.push(`Source : ${sourceLabel}`);
  if (p.fusion) {
    lines.push(`Sources croisées : ${p.fusion.sources.join(", ") || "—"} (confiance: ${p.fusion.confidence})`);
    if (p.fusion.contradictions.length > 0) {
      lines.push(`⚠ Contradictions : ${p.fusion.contradictions.join(" | ")}`);
    }
  }
  lines.push("");
  lines.push(`Action : ${displayAction}${secondaryNote}`);
  lines.push("");
  lines.push("Ce qui vient de se passer :");
  lines.push(p.whatHappened);
  lines.push("");
  lines.push("Lecture du match :");
  lines.push(advice.liveReading);
  lines.push(advice.contextComparison.scenarioShift);
  lines.push("");
  lines.push("Ce que je ferais maintenant :");
  lines.push(advice.whatIWouldDoNow);
  lines.push("");
  lines.push("Marché à surveiller :");
  lines.push(
    primary
      ? `${primary.label} — ${signalLabelFr(primary.signal)}, ${timingLabelFr(primary.timing)}`
      : "Aucun marché clair pour l'instant — patience, ne rien forcer."
  );

  if (advice.resolvedMarkets.length > 0) {
    lines.push("");
    lines.push("Marchés déjà résolus (à ignorer comme opportunités) :");
    lines.push(advice.resolvedMarkets.map((r) => r.label).join(", "));
  }

  lines.push("");
  lines.push("À éviter :");
  lines.push(
    advice.avoidMarkets.length > 0
      ? advice.avoidMarkets.map((a) => `${a.market}: ${a.reason}`).join(" | ")
      : "Victoire sèche sans momentum confirmé, et value non confirmée sans cote live."
  );

  lines.push("");
  lines.push("Confirmation :");
  lines.push(
    primary?.requiredConfirmation ??
      "Pression maintenue 2-3 minutes: nouveau tir cadré, corner ou coup franc dangereux."
  );

  lines.push("");
  lines.push("Invalidation :");
  lines.push(
    primary?.invalidation ??
      "Carton rouge inverse, blessure clé, chute du rythme, ou adversaire qui reprend le contrôle."
  );

  lines.push("");
  lines.push("Risque :");
  const riskBits = advice.risks.slice(0, 2).map((r) => r.explanation);
  if (!advice.dataQuality.hasOdds) riskBits.push("Sans cotes live, aucune value confirmée.");
  if (source === "secondary") riskBits.push("Détecté via source secondaire: à confirmer par l'API.");
  lines.push(riskBits.join(" "));

  lines.push("");
  lines.push("Prochain check :");
  lines.push(nextCheckText(level, displayAction));

  return lines.join("\n");
}

export function formatStartHelp(): string {
  return [
    "🤖 CoteRadar Live — assistant football (analyse pré-match + live).",
    "",
    "Commandes :",
    "/analyse_match <id>  — analyse complète AVANT match",
    "/watch <id>          — démarre la surveillance live",
    "/stop <id>           — arrête la surveillance",
    "/analyse_live <id>   — force une analyse live immédiate",
    "/context <id>        — contexte du match + plan live",
    "/status              — état du worker (match suivi, dernier score/action/poll)",
    "/sources             — santé des capteurs (API, commentaires, marché, …)",
    "/last                — dernière analyse live complète",
    "/help                — cette aide",
    "",
    "Exemple : /analyse_match 1489378",
    "",
    "⚠️ Analyse informative. Aucune issue garantie. Paris réservés aux majeurs. Jouez responsable.",
  ].join("\n");
}
