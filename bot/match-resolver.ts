/**
 * Résolution d'un match depuis du texte naturel.
 *  - "1489378" -> fixtureId direct
 *  - "france senegal" / "France - Sénégal" / "france vs senegal" -> match
 *  - "demain" / "aujourd'hui" / "YYYY-MM-DD" -> liste de matchs d'une date
 *  - ambigu -> alternatives à confirmer
 */

import { getFixtureById } from "@/lib/api-football";
import { normalizeFixture } from "@/lib/world-cup-filter";
import { todayDateUTC } from "@/lib/utils";
import type { NormalizedFixture } from "@/types/match";
import { apiTeamMentionedIn, normalizeText } from "./team-normalizer";
import { addDaysUTC, filterByDate, getWorldCupFixturesCached } from "./schedule-service";

export type MatchStatus = "not_started" | "live" | "finished";
export type ResolveKind = "fixtureId" | "match" | "date" | "ambiguous" | "not_found";

export interface ResolvedMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  date: string;
  status: MatchStatus;
  leagueName: string;
  round: string;
  venue: string | null;
  confidence: "low" | "medium" | "high";
  alternatives: ResolvedMatch[];
}

export interface ResolveResult {
  ok: boolean;
  kind: ResolveKind;
  match: ResolvedMatch | null;
  alternatives: ResolvedMatch[];
  date?: string;
  reason: string;
}

export interface ResolverDeps {
  fixtures: () => Promise<NormalizedFixture[]>;
  fixtureById: (id: number) => Promise<NormalizedFixture | null>;
  today: string;
}

function defaultDeps(): ResolverDeps {
  return {
    fixtures: () => getWorldCupFixturesCached(),
    fixtureById: async (id) => {
      const af = await getFixtureById(id);
      return af ? normalizeFixture(af) : null;
    },
    today: todayDateUTC(),
  };
}

function mapStatus(f: NormalizedFixture): MatchStatus {
  if (f.phase === "finished") return "finished";
  if (f.phase === "live" || f.phase === "halftime") return "live";
  return "not_started";
}

export function toResolved(f: NormalizedFixture, confidence: ResolvedMatch["confidence"]): ResolvedMatch {
  return {
    fixtureId: f.fixtureId,
    homeTeam: f.home.name,
    awayTeam: f.away.name,
    date: f.kickoffAt,
    status: mapStatus(f),
    leagueName: f.leagueName,
    round: f.round ?? f.groupName ?? "",
    venue: f.venueName,
    confidence,
    alternatives: [],
  };
}

/** Trie: à venir/live d'abord, puis par date croissante. */
function sortForDisplay(list: ResolvedMatch[]): ResolvedMatch[] {
  const rank = (s: MatchStatus) => (s === "finished" ? 2 : s === "live" ? 0 : 1);
  return [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.date.localeCompare(b.date));
}

function detectDate(input: string, today: string): string | null {
  const n = normalizeText(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  if (/(^| )(aujourd hui|auj|ajd|today)( |$)/.test(n)) return today;
  if (/(^| )(demain|tomorrow)( |$)/.test(n)) return addDaysUTC(today, 1);
  if (/(^| )(apres demain|after tomorrow|surlendemain)( |$)/.test(n)) return addDaysUTC(today, 2);
  return null;
}

export async function resolveMatchFromText(
  input: string,
  partial?: Partial<ResolverDeps>
): Promise<ResolveResult> {
  const deps = { ...defaultDeps(), ...partial };
  const trimmed = (input ?? "").trim();
  if (!trimmed) {
    return { ok: false, kind: "not_found", match: null, alternatives: [], reason: "entrée vide" };
  }

  // 1) fixtureId numérique
  if (/^\d+$/.test(trimmed)) {
    const f = await deps.fixtureById(Number.parseInt(trimmed, 10));
    if (f) return { ok: true, kind: "fixtureId", match: toResolved(f, "high"), alternatives: [], reason: "fixtureId direct" };
    return { ok: false, kind: "not_found", match: null, alternatives: [], reason: "fixtureId introuvable" };
  }

  // 2) date (aujourd'hui / demain / YYYY-MM-DD)
  const date = detectDate(trimmed, deps.today);
  if (date) {
    const all = await deps.fixtures();
    const list = sortForDisplay(filterByDate(all, date).map((f) => toResolved(f, "high")));
    return {
      ok: list.length > 0,
      kind: "date",
      match: null,
      alternatives: list,
      date,
      reason: list.length > 0 ? `${list.length} match(s) le ${date}` : `aucun match le ${date}`,
    };
  }

  // 3) noms d'équipes
  const all = await deps.fixtures();
  const both = all.filter(
    (f) => apiTeamMentionedIn(trimmed, f.home.name) && apiTeamMentionedIn(trimmed, f.away.name)
  );
  if (both.length === 1) {
    return { ok: true, kind: "match", match: toResolved(both[0], "high"), alternatives: [], reason: "match unique" };
  }
  if (both.length > 1) {
    const alts = sortForDisplay(both.map((f) => toResolved(f, "medium")));
    return { ok: true, kind: "ambiguous", match: null, alternatives: alts, reason: "plusieurs matchs correspondent" };
  }

  // 4) une seule équipe mentionnée -> propositions
  const single = all.filter(
    (f) => apiTeamMentionedIn(trimmed, f.home.name) || apiTeamMentionedIn(trimmed, f.away.name)
  );
  if (single.length === 1) {
    return { ok: true, kind: "match", match: toResolved(single[0], "medium"), alternatives: [], reason: "une équipe -> match unique" };
  }
  if (single.length > 1) {
    const alts = sortForDisplay(single.map((f) => toResolved(f, "low"))).slice(0, 8);
    return { ok: true, kind: "ambiguous", match: null, alternatives: alts, reason: "équipe présente dans plusieurs matchs" };
  }

  return { ok: false, kind: "not_found", match: null, alternatives: [], reason: "aucun match Coupe du monde correspondant" };
}
