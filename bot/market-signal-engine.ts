/**
 * Moteur de signaux marché: compare deux snapshots et produit des MarketEvent.
 *
 * Règles:
 *  - mouvement de cote > 8% = HIGH
 *  - mouvement de cote > 15% = CRITICAL
 *  - suspension après action dangereuse = CRITICAL (sinon HIGH)
 *  - réouverture = MEDIUM
 */

import type { MarketEvent, MarketSnapshot } from "./scraper-types";

export function computeMarketEvents(
  prev: MarketSnapshot | null,
  curr: MarketSnapshot,
  dangerRecent = false
): MarketEvent[] {
  const events: MarketEvent[] = [];

  // Suspension / réouverture.
  if (curr.suspended && !(prev?.suspended ?? false)) {
    events.push({
      minute: curr.minute,
      market: "all",
      selection: "all",
      movement: "suspended",
      changePct: null,
      impact: dangerRecent ? "CRITICAL" : "HIGH",
      summary: dangerRecent
        ? "Marché suspendu juste après une action dangereuse."
        : "Marché suspendu (possible action en cours).",
    });
  } else if (!curr.suspended && (prev?.suspended ?? false)) {
    events.push({
      minute: curr.minute,
      market: "all",
      selection: "all",
      movement: "reopened",
      changePct: null,
      impact: "MEDIUM",
      summary: "Marché réouvert.",
    });
  }

  // Mouvements de cote par sélection.
  if (prev && !curr.suspended && !prev.suspended) {
    for (const cs of curr.selections) {
      const ps = prev.selections.find((p) => p.market === cs.market && p.selection === cs.selection);
      if (!ps || ps.odd <= 1) continue;
      const pct = (ps.odd - cs.odd) / ps.odd; // >0 = cote baisse (compression)
      const abs = Math.abs(pct);
      if (abs < 0.08) continue;
      const impact: MarketEvent["impact"] = abs >= 0.15 ? "CRITICAL" : "HIGH";
      const movement: MarketEvent["movement"] = pct > 0 ? "drop" : "rise";
      events.push({
        minute: curr.minute,
        market: cs.market,
        selection: cs.selection,
        movement,
        changePct: Math.round(pct * 1000) / 10,
        impact,
        summary:
          movement === "drop"
            ? `Cote ${cs.market}/${cs.selection} en forte baisse (${(pct * 100).toFixed(0)}%): le marché se compresse.`
            : `Cote ${cs.market}/${cs.selection} en forte hausse (${(Math.abs(pct) * 100).toFixed(0)}%): dérive.`,
      });
    }
  }

  return events;
}
