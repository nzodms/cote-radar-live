/**
 * Helpers de présentation partagés (classes de badges, libellés FR).
 * Aucune logique métier ici, uniquement de l'affichage.
 */

import type { ConfidenceLevel, MarketSignal, Severity, SignalLevel } from "@/types/analysis";
import type { MatchPhase } from "@/types/match";
import type { AdviceTiming, LiveAction, Urgency } from "@/types/live-advice";

export function signalToneClass(signal: SignalLevel | MarketSignal["signal"]): string {
  switch (signal) {
    case "strong":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "weak":
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
    default:
      return "bg-slate-700/40 text-slate-400 border border-slate-600/30";
  }
}

export function signalLabelFr(signal: SignalLevel | MarketSignal["signal"]): string {
  switch (signal) {
    case "strong":
      return "Signal fort";
    case "medium":
      return "Signal moyen";
    case "weak":
      return "Signal faible";
    case "none":
      return "Aucun signal";
    default:
      return "—";
  }
}

export function severityToneClass(severity: Severity): string {
  switch (severity) {
    case "high":
      return "bg-red-500/15 text-red-300 border border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "low":
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
    default:
      return "bg-slate-700/40 text-slate-400";
  }
}

export function severityLabelFr(severity: Severity): string {
  switch (severity) {
    case "high":
      return "Risque élevé";
    case "medium":
      return "Risque moyen";
    case "low":
      return "Risque faible";
    default:
      return "—";
  }
}

export function confidenceLabelFr(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "Confiance élevée";
    case "medium":
      return "Confiance moyenne";
    case "low":
      return "Confiance faible";
    default:
      return "—";
  }
}

export function phaseToneClass(phase: MatchPhase): string {
  switch (phase) {
    case "live":
      return "bg-red-500/15 text-red-300 border border-red-500/30";
    case "halftime":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "finished":
      return "bg-slate-600/30 text-slate-300 border border-slate-600/40";
    case "scheduled":
      return "bg-accent/15 text-accent-bright border border-accent/30";
    case "postponed":
      return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
    default:
      return "bg-slate-700/40 text-slate-400 border border-slate-600/30";
  }
}

export function phaseLabelFr(phase: MatchPhase): string {
  switch (phase) {
    case "live":
      return "Live";
    case "halftime":
      return "Mi-temps";
    case "finished":
      return "Terminé";
    case "scheduled":
      return "À venir";
    case "postponed":
      return "Reporté";
    default:
      return "—";
  }
}

/* ----- Assistant live (action / timing / urgence) ----- */

export function actionToneClass(action: LiveAction | string | null): string {
  switch (action) {
    case "SIGNAL":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40";
    case "WATCH":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/40";
    case "WAIT":
      return "bg-accent/15 text-accent-bright border border-accent/40";
    case "AVOID":
      return "bg-slate-500/15 text-slate-300 border border-slate-500/40";
    case "INVALIDATED":
      return "bg-red-500/15 text-red-300 border border-red-500/40";
    default:
      return "bg-slate-700/40 text-slate-400 border border-slate-600/30";
  }
}

export function actionLabelFr(action: LiveAction | string | null): string {
  switch (action) {
    case "SIGNAL":
      return "SIGNAL";
    case "WATCH":
      return "WATCH";
    case "WAIT":
      return "WAIT";
    case "AVOID":
      return "AVOID";
    case "INVALIDATED":
      return "INVALIDATED";
    default:
      return "—";
  }
}

export function timingLabelFr(timing: AdviceTiming): string {
  switch (timing) {
    case "now":
      return "Maintenant";
    case "wait_5_min":
      return "Attendre 5 min";
    case "watch_only":
      return "Surveiller";
    case "avoid":
      return "Éviter";
    default:
      return "—";
  }
}

export function urgencyLabelFr(urgency: Urgency): string {
  switch (urgency) {
    case "high":
      return "Urgence élevée";
    case "medium":
      return "Urgence moyenne";
    case "low":
      return "Urgence faible";
    default:
      return "Pas d'urgence";
  }
}
