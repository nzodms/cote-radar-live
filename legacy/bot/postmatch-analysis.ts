/**
 * Résumé post-match COMPACT. Affiché quand un match suivi passe en FT, ou via
 * /postmatch. PUR pour la composition (mémoire optionnelle).
 */

import type { NormalizedFixture } from "@/types/match";
import type { MatchMemory } from "./match-memory";
import { goalsSinceWatch } from "./match-memory";

/** Résumé "depuis le début du watch" (/match_story). */
export function composeMatchStory(
  fixture: NormalizedFixture,
  memory: MatchMemory | null,
  nowReading: string | null = null
): string {
  const home = fixture.home.name;
  const away = fixture.away.name;
  const hg = fixture.homeGoals ?? 0;
  const ag = fixture.awayGoals ?? 0;
  const L: string[] = [];
  L.push(`📖 Récit du match — ${home} vs ${away}`);
  L.push(`Score actuel : ${hg}-${ag}${fixture.elapsed !== null ? ` · ${fixture.elapsed}e` : ""}`);
  L.push("");
  if (!memory) {
    L.push("Aucune mémoire de surveillance (lance /watch pour suivre le match en continu).");
    return L.join("\n");
  }
  const start = memory.startScore ? `${memory.startScore.home}-${memory.startScore.away}` : "?";
  L.push(`• Score au lancement du watch : ${start}`);
  L.push(`• Buts depuis le watch : ${goalsSinceWatch(memory, hg, ag)}`);
  if (memory.lastGoal) L.push(`• Dernier but : ${memory.lastGoal.team ?? "?"} à la ${memory.lastGoal.minute ?? "?"}e`);
  const pressures = memory.pressureWindows.filter((p) => p.side).slice(-3);
  if (pressures.length) {
    L.push(`• Meilleures séquences : ${pressures.map((p) => `${p.side === "home" ? home : away} (~${p.minute ?? "?"}e)`).join(", ")}`);
  }
  L.push(`• Marchés surveillés : ${memory.watchMarkets.length ? memory.watchMarkets.slice(0, 5).join(", ") : "aucun pour l'instant"}`);
  if (memory.invalidatedMarkets.length) L.push(`• Marchés invalidés : ${memory.invalidatedMarkets.slice(0, 4).join(", ")}`);
  if (memory.resolvedMarkets.length) L.push(`• Marchés déjà passés : ${memory.resolvedMarkets.slice(0, 4).join(", ")}`);
  L.push(`• Alertes envoyées : ${memory.alertTimeline.length}`);
  L.push("");
  L.push(`Lecture actuelle : ${nowReading ?? memory.currentNarrative}`);
  L.push("");
  L.push("⚠️ Analyse informative. Réservé aux majeurs. Jouez responsable.");
  return L.join("\n");
}

export function composePostMatchSummary(
  fixture: NormalizedFixture,
  memory: MatchMemory | null,
  favoriteSide: "home" | "away" | null = null
): string {
  const home = fixture.home.name;
  const away = fixture.away.name;
  const hg = fixture.homeGoals ?? 0;
  const ag = fixture.awayGoals ?? 0;
  const diff = hg - ag;
  const winner = diff > 0 ? home : diff < 0 ? away : null;

  const L: string[] = [];
  L.push(`🏁 ${home} ${hg}-${ag} ${away} — terminé`);
  L.push("");
  L.push("Lecture :");
  if (winner === null) {
    L.push("Match nul au terme du temps réglementaire. Les marchés live principaux sont désormais terminés.");
  } else if (favoriteSide && ((favoriteSide === "home" && diff > 0) || (favoriteSide === "away" && diff < 0))) {
    L.push(`${winner} a validé son statut de favori. Les marchés live principaux sont désormais terminés.`);
  } else if (favoriteSide) {
    L.push(`Surprise : ${winner} s'impose. Les marchés live principaux sont désormais terminés.`);
  } else {
    L.push(`${winner} s'impose. Les marchés live principaux sont désormais terminés.`);
  }

  L.push("");
  L.push("Ce que le bot retient :");
  if (memory) {
    const goals = goalsSinceWatch(memory, hg, ag);
    const start = memory.startScore ? `${memory.startScore.home}-${memory.startScore.away}` : "?";
    L.push(`• Score au lancement du watch : ${start} · buts depuis : ${goals}`);
    L.push(`• Alertes envoyées : ${memory.alertTimeline.length}`);
    if (memory.watchMarkets.length) L.push(`• Marchés surveillés : ${memory.watchMarkets.slice(0, 4).join(", ")}`);
    if (memory.resolvedMarkets.length) L.push(`• Marchés passés : ${memory.resolvedMarkets.slice(0, 4).join(", ")}`);
    if (memory.invalidatedMarkets.length) L.push(`• Marchés invalidés : ${memory.invalidatedMarkets.slice(0, 4).join(", ")}`);
    if (memory.lastImportantAction) L.push(`• Dernière action notable : ${memory.lastImportantAction}`);
  } else {
    L.push("• Pas de mémoire de surveillance pour ce match (non suivi en live).");
    L.push(`• Score final : ${hg}-${ag}.`);
  }

  L.push("");
  L.push("➡️ Passe au prochain match : /next, /next_analysis ou /watch_next.");
  L.push("⚠️ Analyse informative. Réservé aux majeurs. Jouez responsable.");
  return L.join("\n");
}
