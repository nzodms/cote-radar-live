/**
 * Moteur de risques: identifie les facteurs qui doivent rendre l'analyse
 * plus prudente (domination stérile, risque de contre, score serré tardif,
 * données partielles, cotes indisponibles, fin de match, VAR, etc.).
 */

import type { MatchDataBundle } from "@/types/match";
import type { MomentumResult, RiskItem } from "@/types/analysis";
import { isLivePhase } from "./utils";

function num(v: number | null | undefined): number {
  return v ?? 0;
}

export function assessRisks(bundle: MatchDataBundle, momentum: MomentumResult): RiskItem[] {
  const { fixture, statistics, events, odds } = bundle;
  const risks: RiskItem[] = [];
  const live = isLivePhase(fixture.phase);
  const elapsed = fixture.elapsed ?? 0;

  // --- Domination stérile ---
  if (momentum.flags.homeSterileDomination) {
    risks.push({
      type: "sterile_domination",
      label: "Domination stérile (home)",
      severity: "medium",
      explanation: `${fixture.home.name} a le ballon et/ou tire, mais ne cadre quasiment pas. La domination ne se transforme pas en occasions franches.`,
    });
  }
  if (momentum.flags.awaySterileDomination) {
    risks.push({
      type: "sterile_domination",
      label: "Domination stérile (away)",
      severity: "medium",
      explanation: `${fixture.away.name} domine sans cadrer suffisamment. Le contrôle ne crée pas de danger réel.`,
    });
  }

  // --- Risque de contre ---
  if (momentum.flags.counterAttackRiskAgainstHome) {
    risks.push({
      type: "counter_attack",
      label: "Risque de contre contre " + fixture.home.name,
      severity: "medium",
      explanation: `${fixture.away.name}, bien que dominé, garde des corners/transitions exploitables en contre.`,
    });
  }
  if (momentum.flags.counterAttackRiskAgainstAway) {
    risks.push({
      type: "counter_attack",
      label: "Risque de contre contre " + fixture.away.name,
      severity: "medium",
      explanation: `${fixture.home.name}, bien que dominé, conserve des transitions dangereuses.`,
    });
  }

  // --- Score serré en fin de match ---
  if (momentum.flags.tightLatePhase) {
    risks.push({
      type: "tight_late_game",
      label: "Score serré après la 75e",
      severity: "high",
      explanation:
        "Fin de match disputée et indécise: forte volatilité (but tardif, temps additionnel, gestion).",
    });
  }

  // --- Fin de match / temps additionnel ---
  if (live && elapsed >= 85) {
    risks.push({
      type: "late_game",
      label: "Dernières minutes",
      severity: "medium",
      explanation:
        "Phase finale: les minutes restantes sont limitées, l'incertitude sur les marchés non résolus augmente.",
    });
  }

  // --- Déséquilibre numérique (carton rouge) ---
  const homeRed = num(statistics.home.redCards);
  const awayRed = num(statistics.away.redCards);
  if (homeRed > 0 || awayRed > 0) {
    risks.push({
      type: "red_card",
      label: "Supériorité / infériorité numérique",
      severity: "medium",
      explanation: `Carton(s) rouge(s) en jeu (home: ${homeRed}, away: ${awayRed}). Le scénario du match peut changer brutalement.`,
    });
  }

  // --- Données partielles ---
  if (live && !statistics.hasData) {
    risks.push({
      type: "missing_data",
      label: "Données insuffisantes",
      severity: "high",
      explanation:
        "Aucune statistique live exploitable: toute lecture de momentum/marché est peu fiable.",
    });
  } else if (live && statistics.hasData) {
    const partial =
      statistics.home.shotsOnGoal === null ||
      statistics.away.shotsOnGoal === null ||
      statistics.home.ballPossession === null;
    if (partial) {
      risks.push({
        type: "partial_data",
        label: "Données partielles",
        severity: "low",
        explanation:
          "Certaines statistiques clés sont absentes (tirs cadrés ou possession). Confiance réduite.",
      });
    }
  }

  // --- Cotes indisponibles ---
  if (!odds.available) {
    risks.push({
      type: "no_odds",
      label: "Cotes indisponibles",
      severity: "low",
      explanation:
        odds.message ?? "Les cotes ne sont pas disponibles sur le plan actuel: pas de mesure de value chiffrée.",
    });
  }

  // --- VAR en cours ---
  const hasRecentVar = events.some(
    (e) => (e.type ?? "").toLowerCase() === "var" && (e.elapsed ?? 0) >= elapsed - 5
  );
  if (hasRecentVar) {
    risks.push({
      type: "var",
      label: "VAR récente",
      severity: "medium",
      explanation: "Une décision VAR récente peut modifier le score ou la dynamique du match.",
    });
  }

  return risks;
}
