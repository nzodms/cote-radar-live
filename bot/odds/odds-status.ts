/**
 * Vue d'état des cotes pour /status et /sources (et garde-fou PLAYABLE).
 * PUR (testable sans réseau).
 */

import type { OddsApiSettings } from "../config";
import { oddForKey, type NormalizedOddsBoard } from "./odds-normalizer";

export interface OddsMarketsSummary {
  oneX2: string | null;
  overUnder: string | null;
  btts: string | null;
  nextGoal: string | null;
}

export interface OddsStatusView {
  provider: string | null;
  enabled: boolean;
  apiKeyConfigured: boolean;
  lastFetchAt: number | null;
  oddsAvailable: boolean;
  liveOddsAvailable: boolean;
  bookmaker: string | null;
  markets: OddsMarketsSummary;
}

function agoLabel(ms: number | null): string {
  if (!ms || ms <= 0) return "jamais";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `il y a ${s}s`;
  return `il y a ${Math.round(s / 60)}min`;
}

/** true si le board fournit des cotes live exploitables (gate du PLAYABLE). */
export function isLiveOddsExploitable(board: NormalizedOddsBoard | null): boolean {
  return Boolean(board && board.available && board.lines.length > 0 && !board.suspended);
}

/** Résume les derniers marchés récupérés (1X2 / Over-Under / BTTS / Next Goal). */
export function summarizeMarkets(board: NormalizedOddsBoard | null): OddsMarketsSummary {
  if (!board || !board.available) return { oneX2: null, overUnder: null, btts: null, nextGoal: null };
  const o = (k: Parameters<typeof oddForKey>[1]) => oddForKey(board, k);
  const h = o("1x2_home"), d = o("1x2_draw"), a = o("1x2_away");
  const ov = o("over_2_5"), un = o("under_2_5");
  const by = o("btts_yes"), bn = o("btts_no");
  const ngh = o("next_goal_home"), nga = o("next_goal_away");
  return {
    oneX2: h !== null || d !== null || a !== null ? `Domicile ${h ?? "—"} / Nul ${d ?? "—"} / Ext ${a ?? "—"}` : null,
    overUnder: ov !== null || un !== null ? `Over 2.5 ${ov ?? "—"} / Under 2.5 ${un ?? "—"}` : null,
    btts: by !== null || bn !== null ? `Oui ${by ?? "—"} / Non ${bn ?? "—"}` : null,
    nextGoal: ngh !== null || nga !== null ? `Domicile ${ngh ?? "—"} / Ext ${nga ?? "—"}` : null,
  };
}

export function buildOddsStatus(
  cfg: OddsApiSettings,
  board: NormalizedOddsBoard | null,
  lastFetchAt: number | null
): OddsStatusView {
  return {
    provider: cfg.provider,
    enabled: cfg.enabled,
    apiKeyConfigured: cfg.apiKeyConfigured,
    lastFetchAt,
    oddsAvailable: Boolean(board?.available),
    liveOddsAvailable: isLiveOddsExploitable(board),
    bookmaker: board?.bookmaker ?? null,
    markets: summarizeMarkets(board),
  };
}

/** Bloc texte "💰 Cotes" partagé par /status et /sources. */
export function renderOddsStatusLines(v: OddsStatusView): string[] {
  const L: string[] = [];
  L.push("💰 Cotes");
  L.push(`• Provider : ${v.provider ?? "—"}`);
  L.push(`• Activé : ${v.enabled ? "true" : "false"}${v.enabled && !v.apiKeyConfigured ? " (clé manquante)" : ""}`);
  L.push(`• Dernier fetch : ${agoLabel(v.lastFetchAt)}`);
  L.push(`• Odds available : ${v.oddsAvailable ? "true" : "false"}`);
  L.push(`• Live odds available : ${v.liveOddsAvailable ? "true" : "false"}`);
  if (v.liveOddsAvailable) {
    L.push(`• Derniers marchés${v.bookmaker ? ` (${v.bookmaker})` : ""} :`);
    if (v.markets.oneX2) L.push(`   1X2 : ${v.markets.oneX2}`);
    if (v.markets.overUnder) L.push(`   Over/Under : ${v.markets.overUnder}`);
    if (v.markets.btts) L.push(`   BTTS : ${v.markets.btts}`);
    if (v.markets.nextGoal) L.push(`   Prochain but : ${v.markets.nextGoal}`);
    if (!v.markets.oneX2 && !v.markets.overUnder && !v.markets.btts && !v.markets.nextGoal) {
      L.push("   (aucun marché standard reconnu)");
    }
  } else {
    L.push("• Aucune cote live exploitable — PLAYABLE désactivé.");
  }
  return L;
}
