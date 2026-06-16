/**
 * Couche de service: orchestre fetch API -> normalisation -> stockage Supabase
 * -> analyse, et la lecture depuis la base pour les routes frontend.
 *
 * Architecture quota-friendly (plan Free 100/jour):
 *   - Les routes de SYNC (cron) consomment l'API et écrivent en base.
 *   - Les routes de LECTURE (matches/today, matches/[id]) lisent la BASE,
 *     sans rappeler l'API à chaque affichage de page.
 */

import {
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixturesByDate,
  getFixtureStatistics,
  getHeadToHead,
  getOdds,
  getTeamLastFixtures,
} from "./api-football";
import { analyzeMatch, type AnalyzeMatchInput } from "./analyzer";
import { generateLiveBettingAdvice } from "./live-advice";
import { buildOddsSnapshots } from "./odds-engine";
import { getServiceSupabase, TABLES } from "./supabase";
import {
  filterWorldCupFixtures,
  getWorldCupConfig,
  isWorldCupFixture,
  normalizeEvents,
  normalizeFixture,
  normalizeH2H,
  normalizeLineups,
  normalizeRecentForm,
  normalizeStatistics,
} from "./world-cup-filter";
import { mapStatusToPhase, secondsSince } from "./utils";
import type {
  MatchAnalysis,
  AnalysisHistoryEntry,
  MarketSignal,
  RiskItem,
} from "@/types/analysis";
import type {
  H2HSummary,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedOdds,
  NormalizedStatsPair,
  NormalizedTeamStats,
  RecentForm,
} from "@/types/match";
import type {
  LiveAdviceHistoryEntry,
  LiveBettingAdvice,
  StatsSnapshotPoint,
} from "@/types/live-advice";
import type { ExternalCommentaryEvent } from "@/types/commentary";

export interface MatchListItem {
  fixture: NormalizedFixture;
  homeMomentum: number | null;
  awayMomentum: number | null;
  signalLevel: string | null;
  bestSignalLabel: string | null;
  hasHighRisk: boolean;
  /** Action de l'assistant live (WAIT/WATCH/SIGNAL/AVOID/INVALIDATED). */
  adviceAction: string | null;
  adviceMainText: string | null;
  lastSyncedAt: string | null;
  freshnessSeconds: number | null;
}

export interface SyncWorldCupResult {
  ok: boolean;
  date: string;
  totalFixturesFromApi: number;
  worldCupCount: number;
  upserted: number;
  persisted: boolean;
  warnings: string[];
  matches: Array<{ fixtureId: number; label: string; status: string }>;
}

export interface SyncLiveResult {
  ok: boolean;
  fixtureId: number;
  isWorldCup: boolean;
  message: string;
  fixture: NormalizedFixture | null;
  analysis: MatchAnalysis | null;
  liveAdvice: LiveBettingAdvice | null;
  persisted: boolean;
  stored: {
    fixture: boolean;
    statsSnapshot: boolean;
    events: number;
    lineups: number;
    analysisSnapshot: boolean;
    liveAdviceSnapshot: boolean;
    oddsSnapshots: number;
  };
  apiCalls: Array<{ endpoint: string; ok: boolean; note?: string }>;
  warnings: string[];
}

export interface MatchDetailResult {
  fixture: NormalizedFixture | null;
  statistics: NormalizedStatsPair | null;
  events: NormalizedEvent[];
  lineups: NormalizedLineup[];
  analysis: MatchAnalysis | null;
  liveAdvice: LiveBettingAdvice | null;
  adviceHistory: LiveAdviceHistoryEntry[];
  commentary: ExternalCommentaryEvent[];
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  history: AnalysisHistoryEntry[];
  lastSyncedAt: string | null;
  freshnessSeconds: number | null;
}

const ODDS_UNAVAILABLE: NormalizedOdds = {
  available: false,
  message: "Cotes indisponibles sur le plan actuel.",
};

/* ========================================================================
 *  SYNC — Coupe du monde du jour
 * ===================================================================== */

export async function syncWorldCupMatches(date: string): Promise<SyncWorldCupResult> {
  const warnings: string[] = [];
  const config = getWorldCupConfig();

  const allFixtures = await getFixturesByDate(date);
  const worldCup = filterWorldCupFixtures(allFixtures, config);

  const supabase = getServiceSupabase();
  let upserted = 0;
  let persisted = false;

  if (supabase) {
    persisted = true;
    for (const af of worldCup) {
      const f = normalizeFixture(af);
      const { error } = await supabase.from(TABLES.matches).upsert(
        {
          fixture_id: f.fixtureId,
          league_id: f.leagueId,
          league_name: f.leagueName,
          season: f.season,
          round: f.round,
          group_name: f.groupName,
          home_team_id: f.home.id,
          home_team_name: f.home.name,
          home_team_logo: f.home.logo,
          away_team_id: f.away.id,
          away_team_name: f.away.name,
          away_team_logo: f.away.logo,
          kickoff_at: f.kickoffAt,
          status_short: f.statusShort,
          status_long: f.statusLong,
          elapsed: f.elapsed,
          home_goals: f.homeGoals,
          away_goals: f.awayGoals,
          venue_name: f.venueName,
          venue_city: f.venueCity,
          raw_fixture: af as any,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "fixture_id" }
      );
      if (error) {
        warnings.push(`Upsert fixture ${f.fixtureId} échoué: ${error.message}`);
      } else {
        upserted += 1;
      }
    }
  } else {
    warnings.push("Supabase non configuré: matchs non persistés.");
  }

  return {
    ok: true,
    date,
    totalFixturesFromApi: allFixtures.length,
    worldCupCount: worldCup.length,
    upserted,
    persisted,
    warnings,
    matches: worldCup.map((af) => {
      const f = normalizeFixture(af);
      return {
        fixtureId: f.fixtureId,
        label: `${f.home.name} vs ${f.away.name}`,
        status: f.statusLong,
      };
    }),
  };
}

/* ========================================================================
 *  SYNC — Match live (fixture + stats + events + lineups + analyse)
 * ===================================================================== */

export async function syncLiveFixture(
  fixtureId: number,
  options: { context?: boolean } = {}
): Promise<SyncLiveResult> {
  const apiCalls: SyncLiveResult["apiCalls"] = [];
  const warnings: string[] = [];
  const supabase = getServiceSupabase();
  const persisted = Boolean(supabase);
  if (!supabase) warnings.push("Supabase non configuré: données non persistées.");

  // 1) Fixture (obligatoire)
  const af = await getFixtureById(fixtureId);
  apiCalls.push({ endpoint: "/fixtures?id=", ok: Boolean(af) });

  if (!af) {
    return {
      ok: false,
      fixtureId,
      isWorldCup: false,
      message: "Fixture introuvable via l'API.",
      fixture: null,
      analysis: null,
      liveAdvice: null,
      persisted,
      stored: {
        fixture: false,
        statsSnapshot: false,
        events: 0,
        lineups: 0,
        analysisSnapshot: false,
        liveAdviceSnapshot: false,
        oddsSnapshots: 0,
      },
      apiCalls,
      warnings,
    };
  }

  // Filtrage STRICT Coupe du monde.
  const isWc = isWorldCupFixture(af);
  if (!isWc) {
    return {
      ok: false,
      fixtureId,
      isWorldCup: false,
      message: `Match hors Coupe du monde (league ${af.league.id} - ${af.league.name}). Ignoré.`,
      fixture: normalizeFixture(af),
      analysis: null,
      liveAdvice: null,
      persisted,
      stored: {
        fixture: false,
        statsSnapshot: false,
        events: 0,
        lineups: 0,
        analysisSnapshot: false,
        liveAdviceSnapshot: false,
        oddsSnapshots: 0,
      },
      apiCalls,
      warnings,
    };
  }

  const fixture = normalizeFixture(af);

  // 2) Statistiques
  const rawStats = await getFixtureStatistics(fixtureId);
  apiCalls.push({ endpoint: "/fixtures/statistics", ok: true });
  const statistics = normalizeStatistics(rawStats, fixture.home.id, fixture.away.id);

  // 3) Événements
  const rawEvents = await getFixtureEvents(fixtureId);
  apiCalls.push({ endpoint: "/fixtures/events", ok: true });
  const events = normalizeEvents(rawEvents);

  // 4) Compositions — seulement si absentes en base OU contexte forcé (économie quota).
  let lineups: NormalizedLineup[] = [];
  let lineupsFetched = false;
  const needLineups = options.context || !(await hasStoredLineups(fixtureId));
  if (needLineups) {
    const rawLineups = await getFixtureLineups(fixtureId);
    apiCalls.push({ endpoint: "/fixtures/lineups", ok: true });
    lineups = normalizeLineups(rawLineups);
    lineupsFetched = true;
  } else {
    lineups = await loadStoredLineups(fixtureId);
  }

  // 5) Contexte (forme récente + h2h) — coûteux: seulement si demandé.
  let recentForm: { home: RecentForm | null; away: RecentForm | null } = { home: null, away: null };
  let h2h: H2HSummary | null = null;
  if (options.context) {
    try {
      const [homeLast, awayLast, h2hRaw] = await Promise.all([
        getTeamLastFixtures(fixture.home.id, 5),
        getTeamLastFixtures(fixture.away.id, 5),
        getHeadToHead(fixture.home.id, fixture.away.id, 10),
      ]);
      apiCalls.push({ endpoint: "/fixtures?team=&last=5 (home)", ok: true });
      apiCalls.push({ endpoint: "/fixtures?team=&last=5 (away)", ok: true });
      apiCalls.push({ endpoint: "/fixtures/headtohead", ok: true });
      recentForm = {
        home: normalizeRecentForm(fixture.home.id, homeLast),
        away: normalizeRecentForm(fixture.away.id, awayLast),
      };
      h2h = normalizeH2H(fixture.home.id, fixture.away.id, h2hRaw);
    } catch (err) {
      warnings.push(`Contexte (forme/h2h) indisponible: ${(err as Error).message}`);
    }
  } else {
    // Réutilise le contexte déjà stocké si présent.
    const stored = await loadStoredContext(fixtureId);
    recentForm = stored.recentForm;
    h2h = stored.h2h;
  }

  // 6) Odds — tentative douce (souvent indisponible en Free), ne casse jamais.
  let odds: NormalizedOdds = ODDS_UNAVAILABLE;
  if (options.context) {
    try {
      const rawOdds = await getOdds(fixtureId);
      apiCalls.push({ endpoint: "/odds", ok: true });
      odds = rawOdds.length
        ? { available: true, raw: rawOdds }
        : { available: false, message: "Cotes indisponibles sur le plan actuel." };
    } catch (err) {
      apiCalls.push({ endpoint: "/odds", ok: false, note: "indisponible" });
      odds = { available: false, message: "Cotes indisponibles sur le plan actuel." };
      warnings.push("Cotes non récupérées (normal en plan Free).");
    }
  }

  // 7) Contexte temporel: snapshots précédents (fenêtres 5/10 min) + commentaires.
  const previousSnapshots = await loadStatsSnapshotPoints(fixtureId, 12);
  const commentary = await loadCommentaryEvents(fixtureId);

  // 8) Analyse maison + Conseil live actionnable.
  const freshnessSeconds = 0; // on vient de récupérer les données
  const analysisInput: AnalyzeMatchInput = {
    fixture,
    statistics,
    events,
    lineups,
    recentForm,
    h2h,
    odds,
    freshnessSeconds,
  };
  const analysis = analyzeMatch(analysisInput);
  const liveAdvice = generateLiveBettingAdvice({
    fixture,
    statistics,
    events,
    lineups,
    recentForm,
    h2h,
    odds,
    previousSnapshots,
    externalCommentaryEvents: commentary,
    freshnessSeconds,
  });

  // 9) Persistance
  const stored = {
    fixture: false,
    statsSnapshot: false,
    events: 0,
    lineups: 0,
    analysisSnapshot: false,
    liveAdviceSnapshot: false,
    oddsSnapshots: 0,
  };

  if (supabase) {
    const nowIso = new Date().toISOString();

    // 8.a fixture upsert
    {
      const { error } = await supabase.from(TABLES.matches).upsert(
        {
          fixture_id: fixture.fixtureId,
          league_id: fixture.leagueId,
          league_name: fixture.leagueName,
          season: fixture.season,
          round: fixture.round,
          group_name: fixture.groupName,
          home_team_id: fixture.home.id,
          home_team_name: fixture.home.name,
          home_team_logo: fixture.home.logo,
          away_team_id: fixture.away.id,
          away_team_name: fixture.away.name,
          away_team_logo: fixture.away.logo,
          kickoff_at: fixture.kickoffAt,
          status_short: fixture.statusShort,
          status_long: fixture.statusLong,
          elapsed: fixture.elapsed,
          home_goals: fixture.homeGoals,
          away_goals: fixture.awayGoals,
          venue_name: fixture.venueName,
          venue_city: fixture.venueCity,
          raw_fixture: af as any,
          last_synced_at: nowIso,
        },
        { onConflict: "fixture_id" }
      );
      if (error) warnings.push(`Upsert fixture échoué: ${error.message}`);
      else stored.fixture = true;
    }

    // 8.b stats snapshot (historisé)
    if (statistics.hasData) {
      const { error } = await supabase.from(TABLES.statsSnapshots).insert({
        fixture_id: fixtureId,
        elapsed: fixture.elapsed,
        home_stats: statistics.home as any,
        away_stats: statistics.away as any,
        raw_statistics: rawStats as any,
      });
      if (error) warnings.push(`Insert stats échoué: ${error.message}`);
      else stored.statsSnapshot = true;
    }

    // 8.c events (replace)
    if (events.length > 0) {
      await supabase.from(TABLES.events).delete().eq("fixture_id", fixtureId);
      const rows = events.map((e, i) => ({
        fixture_id: fixtureId,
        event_time: e.elapsed,
        team_id: e.teamId,
        team_name: e.teamName,
        player_name: e.playerName,
        assist_name: e.assistName,
        type: e.type,
        detail: e.detail,
        comments: e.comments,
        raw_event: (rawEvents[i] ?? e) as any,
      }));
      const { error } = await supabase.from(TABLES.events).insert(rows);
      if (error) warnings.push(`Insert events échoué: ${error.message}`);
      else stored.events = rows.length;
    }

    // 8.d lineups (replace) seulement si re-récupérées
    if (lineupsFetched && lineups.length > 0) {
      await supabase.from(TABLES.lineups).delete().eq("fixture_id", fixtureId);
      const rows = lineups.map((l) => ({
        fixture_id: fixtureId,
        team_id: l.teamId,
        team_name: l.teamName,
        formation: l.formation,
        coach_name: l.coachName,
        raw_lineup: l as any,
      }));
      const { error } = await supabase.from(TABLES.lineups).insert(rows);
      if (error) warnings.push(`Insert lineups échoué: ${error.message}`);
      else stored.lineups = rows.length;
    }

    // 8.e analysis snapshot (avec contexte dans raw_analysis)
    {
      const bestSignal = analysis.marketSignals.find((s) => s.market !== "avoid");
      const { error } = await supabase.from(TABLES.analysisSnapshots).insert({
        fixture_id: fixtureId,
        home_momentum: analysis.homeMomentum,
        away_momentum: analysis.awayMomentum,
        signal_level: analysis.signalLevel,
        confidence_level: analysis.confidenceLevel,
        market_signals: analysis.marketSignals as any,
        risks: analysis.risks as any,
        verdict: analysis.verdict,
        raw_analysis: {
          analysis,
          bestSignalLabel: bestSignal?.label ?? null,
          context: { recentForm, h2h, oddsAvailable: odds.available },
        } as any,
      });
      if (error) warnings.push(`Insert analyse échoué: ${error.message}`);
      else stored.analysisSnapshot = true;
    }

    // 9.f conseil live (assistant)
    {
      const { error } = await supabase.from(TABLES.liveAdviceSnapshots).insert({
        fixture_id: fixtureId,
        minute: fixture.elapsed,
        score_home: fixture.homeGoals,
        score_away: fixture.awayGoals,
        action: liveAdvice.action,
        main_advice: liveAdvice.mainAdvice,
        confidence: liveAdvice.confidence,
        urgency: liveAdvice.urgency,
        recommended_markets: liveAdvice.recommendedMarkets as any,
        avoid_markets: liveAdvice.avoidMarkets as any,
        risks: liveAdvice.risks as any,
        invalidation_conditions: liveAdvice.recommendedMarkets.map((m) => m.invalidation) as any,
        data_quality: liveAdvice.dataQuality as any,
        raw_advice: liveAdvice as any,
      });
      if (error) warnings.push(`Insert conseil live échoué: ${error.message}`);
      else stored.liveAdviceSnapshot = true;
    }

    // 9.g snapshots de cotes (préparation value / affiliation)
    if (odds.available) {
      const oddsRows = buildOddsSnapshots(fixtureId, odds).map((o) => ({
        fixture_id: o.fixtureId,
        source: o.source,
        bookmaker: o.bookmaker,
        market: o.market,
        selection: o.selection,
        odd: o.odd,
        implied_probability: o.impliedProbability,
        raw_odds: o as any,
      }));
      if (oddsRows.length > 0) {
        const { error } = await supabase.from(TABLES.oddsSnapshots).insert(oddsRows);
        if (error) warnings.push(`Insert cotes échoué: ${error.message}`);
        else stored.oddsSnapshots = oddsRows.length;
      }
    }
  }

  return {
    ok: true,
    fixtureId,
    isWorldCup: true,
    message: `Sync OK: ${fixture.home.name} ${fixture.homeGoals ?? 0}-${fixture.awayGoals ?? 0} ${
      fixture.away.name
    } (${fixture.statusLong}).`,
    fixture,
    analysis,
    liveAdvice,
    persisted,
    stored,
    apiCalls,
    warnings,
  };
}

/* ========================================================================
 *  LECTURE depuis la base
 * ===================================================================== */

export async function loadTodayMatches(date: string): Promise<MatchListItem[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;

  const { data: matches, error } = await supabase
    .from(TABLES.matches)
    .select("*")
    .gte("kickoff_at", start)
    .lte("kickoff_at", end)
    .order("kickoff_at", { ascending: true });

  if (error || !matches) return [];
  return Promise.all(matches.map((row) => toListItem(row)));
}

export async function loadLiveMatches(): Promise<MatchListItem[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const { data: matches, error } = await supabase
    .from(TABLES.matches)
    .select("*")
    .in("status_short", ["1H", "2H", "ET", "P", "BT", "HT", "LIVE", "INT"])
    .order("kickoff_at", { ascending: true });

  if (error || !matches) return [];
  return Promise.all(matches.map((row) => toListItem(row)));
}

export async function loadAllMatches(limit = 200): Promise<MatchListItem[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const { data: matches, error } = await supabase
    .from(TABLES.matches)
    .select("*")
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error || !matches) return [];
  return Promise.all(matches.map((row) => toListItem(row)));
}

export async function loadMatchDetail(fixtureId: number): Promise<MatchDetailResult> {
  const empty: MatchDetailResult = {
    fixture: null,
    statistics: null,
    events: [],
    lineups: [],
    analysis: null,
    liveAdvice: null,
    adviceHistory: [],
    commentary: [],
    recentForm: { home: null, away: null },
    h2h: null,
    history: [],
    lastSyncedAt: null,
    freshnessSeconds: null,
  };

  const supabase = getServiceSupabase();
  if (!supabase) return empty;

  const { data: matchRow } = await supabase
    .from(TABLES.matches)
    .select("*")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (!matchRow) return empty;

  const fixture = rowToFixture(matchRow);

  // dernière stats snapshot
  const { data: statsRow } = await supabase
    .from(TABLES.statsSnapshots)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let statistics: NormalizedStatsPair | null = null;
  let freshnessSeconds: number | null = secondsSince(matchRow.last_synced_at);
  if (statsRow) {
    statistics = {
      home: statsRow.home_stats as NormalizedTeamStats,
      away: statsRow.away_stats as NormalizedTeamStats,
      hasData: true,
    };
    freshnessSeconds = secondsSince(statsRow.collected_at);
  }

  // events
  const { data: eventRows } = await supabase
    .from(TABLES.events)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("event_time", { ascending: true });
  const events: NormalizedEvent[] = (eventRows ?? []).map((e: any) => ({
    elapsed: e.event_time,
    extra: null,
    teamId: e.team_id,
    teamName: e.team_name,
    playerName: e.player_name,
    assistName: e.assist_name,
    type: e.type,
    detail: e.detail,
    comments: e.comments,
  }));

  // lineups
  const lineups = await loadStoredLineups(fixtureId);

  // dernière analyse + contexte
  const latestAnalysis = await loadLatestAnalysisRow(fixtureId);
  const analysis: MatchAnalysis | null = latestAnalysis
    ? ((latestAnalysis.raw_analysis as any)?.analysis ?? reconstructAnalysis(latestAnalysis))
    : null;
  const context = (latestAnalysis?.raw_analysis as any)?.context ?? {};
  const recentForm = context.recentForm ?? { home: null, away: null };
  const h2h = context.h2h ?? null;

  // historique des analyses
  const { data: historyRows } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(50);
  const history: AnalysisHistoryEntry[] = (historyRows ?? []).map((r: any) => ({
    id: r.id,
    fixtureId: r.fixture_id,
    collectedAt: r.collected_at,
    homeMomentum: r.home_momentum,
    awayMomentum: r.away_momentum,
    signalLevel: r.signal_level,
    confidenceLevel: r.confidence_level,
    verdict: r.verdict,
    marketSignals: r.market_signals ?? [],
    risks: r.risks ?? [],
  }));

  // conseil live (dernier) + historique conseils + commentaires
  const liveAdvice = await loadLatestLiveAdvice(fixtureId);
  const adviceHistory = await loadFixtureAdviceHistory(fixtureId, matchRow);
  const commentary = await loadCommentaryEvents(fixtureId);

  return {
    fixture,
    statistics,
    events,
    lineups,
    analysis,
    liveAdvice,
    adviceHistory,
    commentary,
    recentForm,
    h2h,
    history,
    lastSyncedAt: matchRow.last_synced_at ?? null,
    freshnessSeconds,
  };
}

export async function loadLatestAnalysis(fixtureId: number): Promise<MatchAnalysis | null> {
  const latest = await loadLatestAnalysisRow(fixtureId);
  if (!latest) return null;
  return (latest.raw_analysis as any)?.analysis ?? reconstructAnalysis(latest);
}

export async function loadAnalysisHistory(limit = 100): Promise<AnalysisHistoryEntry[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    fixtureId: r.fixture_id,
    collectedAt: r.collected_at,
    homeMomentum: r.home_momentum,
    awayMomentum: r.away_momentum,
    signalLevel: r.signal_level,
    confidenceLevel: r.confidence_level,
    verdict: r.verdict,
    marketSignals: r.market_signals ?? [],
    risks: r.risks ?? [],
  }));
}

export async function countAllMatches(): Promise<number> {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { count } = await supabase
    .from(TABLES.matches)
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function countGeneratedSignals(): Promise<number> {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { count } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*", { count: "exact", head: true })
    .in("signal_level", ["weak", "medium", "strong"]);
  return count ?? 0;
}

export async function loadRecentAlerts(limit = 8): Promise<AnalysisHistoryEntry[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*")
    .in("signal_level", ["medium", "strong"])
    .order("collected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    fixtureId: r.fixture_id,
    collectedAt: r.collected_at,
    homeMomentum: r.home_momentum,
    awayMomentum: r.away_momentum,
    signalLevel: r.signal_level,
    confidenceLevel: r.confidence_level,
    verdict: r.verdict,
    marketSignals: r.market_signals ?? [],
    risks: r.risks ?? [],
  }));
}

export interface SignalHistoryRow {
  id: string;
  fixtureId: number;
  collectedAt: string;
  matchLabel: string;
  signalLevel: string | null;
  confidenceLevel: string | null;
  marketLabel: string | null;
  market: string | null;
  hasHighRisk: boolean;
  finalScore: string | null;
  status: "pending" | "won" | "lost" | "inconclusive";
}

/**
 * Évalue le statut d'un signal SI le match est terminé.
 * Markets non évaluables simplement (prochain but, draw no bet) => inconclusive.
 */
function evaluateOutcome(
  market: string | null,
  match: { home_goals: number | null; away_goals: number | null } | undefined,
  finished: boolean
): SignalHistoryRow["status"] {
  if (!market) return "inconclusive";
  if (!match || !finished || match.home_goals === null || match.away_goals === null) {
    return "pending";
  }
  const h = match.home_goals;
  const a = match.away_goals;
  const total = h + a;
  switch (market) {
    case "over_1_5":
      return total >= 2 ? "won" : "lost";
    case "over_2_5":
      return total >= 3 ? "won" : "lost";
    case "btts":
      return h >= 1 && a >= 1 ? "won" : "lost";
    case "home_win_live":
      return h > a ? "won" : "lost";
    case "away_win_live":
      return a > h ? "won" : "lost";
    default:
      return "inconclusive";
  }
}

export async function loadSignalHistory(limit = 100): Promise<SignalHistoryRow[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const { data: snaps } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (!snaps || snaps.length === 0) return [];

  const ids = Array.from(new Set(snaps.map((s: any) => s.fixture_id)));
  const { data: matchRows } = await supabase
    .from(TABLES.matches)
    .select("fixture_id,home_team_name,away_team_name,home_goals,away_goals,status_short")
    .in("fixture_id", ids);
  const matchMap = new Map<number, any>();
  for (const r of matchRows ?? []) matchMap.set(r.fixture_id, r);

  return snaps.map((s: any) => {
    const m = matchMap.get(s.fixture_id);
    const signals = (s.market_signals ?? []) as MarketSignal[];
    const best = signals.find((x) => x.market !== "avoid") ?? null;
    const risks = (s.risks ?? []) as RiskItem[];
    const finished = m ? mapStatusToPhase(m.status_short) === "finished" : false;
    const finalScore =
      m && m.home_goals !== null && m.away_goals !== null
        ? `${m.home_goals}-${m.away_goals}`
        : null;
    return {
      id: s.id,
      fixtureId: s.fixture_id,
      collectedAt: s.collected_at,
      matchLabel: m ? `${m.home_team_name} vs ${m.away_team_name}` : `Match #${s.fixture_id}`,
      signalLevel: s.signal_level,
      confidenceLevel: s.confidence_level,
      marketLabel: best?.label ?? null,
      market: best?.market ?? null,
      hasHighRisk: Array.isArray(risks) && risks.some((r) => r?.severity === "high"),
      finalScore,
      status: evaluateOutcome(best?.market ?? null, m, finished),
    };
  });
}

/* ========================================================================
 *  Helpers internes
 * ===================================================================== */

async function toListItem(row: any): Promise<MatchListItem> {
  const latest = await loadLatestAnalysisRow(row.fixture_id);
  const risks = (latest?.risks as RiskItem[] | undefined) ?? [];
  const advice = await loadLatestLiveAdviceRow(row.fixture_id);
  return {
    fixture: rowToFixture(row),
    homeMomentum: latest?.home_momentum ?? null,
    awayMomentum: latest?.away_momentum ?? null,
    signalLevel: latest?.signal_level ?? null,
    bestSignalLabel: (latest?.raw_analysis as any)?.bestSignalLabel ?? null,
    hasHighRisk: Array.isArray(risks) && risks.some((r) => r?.severity === "high"),
    adviceAction: advice?.action ?? null,
    adviceMainText: advice?.main_advice ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    freshnessSeconds: secondsSince(row.last_synced_at),
  };
}

/* ----- Loaders V2 (snapshots fenêtres, conseils live, commentaires) ----- */

/** Charge les derniers points de stats (avec minute) pour l'analyse par fenêtres. */
async function loadStatsSnapshotPoints(fixtureId: number, limit = 12): Promise<StatsSnapshotPoint[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.statsSnapshots)
    .select("collected_at,elapsed,home_stats,away_stats")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    collectedAt: r.collected_at,
    elapsed: r.elapsed ?? null,
    home: r.home_stats as NormalizedTeamStats,
    away: r.away_stats as NormalizedTeamStats,
  }));
}

/** Charge les événements de commentaires (source secondaire) récents. */
async function loadCommentaryEvents(fixtureId: number): Promise<ExternalCommentaryEvent[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.externalCommentary)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as any[];
  return rows.map((r: any) => ({
    minute: r.event_minute ?? null,
    timeLabel: r.event_time_label ?? null,
    teamName: r.team_name ?? null,
    playerName: r.player_name ?? null,
    eventType: (r.event_type ?? "unknown") as ExternalCommentaryEvent["eventType"],
    rawTitle: r.raw_title ?? "",
    rawDescription: r.raw_description ?? "",
    normalizedImpact: (r.normalized_impact ?? "low") as ExternalCommentaryEvent["normalizedImpact"],
  }));
}

async function loadLatestLiveAdviceRow(fixtureId: number): Promise<any | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from(TABLES.liveAdviceSnapshots)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function loadLatestLiveAdvice(fixtureId: number): Promise<LiveBettingAdvice | null> {
  const row = await loadLatestLiveAdviceRow(fixtureId);
  if (!row) return null;
  return (row.raw_advice as LiveBettingAdvice) ?? null;
}

/** Évalue le statut d'un conseil (validé/invalidé/inconclusif) si le match est fini. */
function evaluateAdviceStatus(
  action: string | null,
  markets: { market: string }[],
  match: { home_goals: number | null; away_goals: number | null } | undefined,
  finished: boolean
): LiveAdviceHistoryEntry["status"] {
  if (action === "INVALIDATED") return "invalidated";
  if (!match || !finished || match.home_goals === null || match.away_goals === null) return "pending";
  if (action === "WAIT" || action === "AVOID") return "inconclusive";

  const primary = markets[0]?.market ?? null;
  if (!primary) return "inconclusive";
  const h = match.home_goals;
  const a = match.away_goals;
  const total = h + a;
  switch (primary) {
    case "over_1_5":
      return total >= 2 ? "validated" : "invalidated";
    case "over_2_5":
      return total >= 3 ? "validated" : "invalidated";
    case "btts":
      return h >= 1 && a >= 1 ? "validated" : "invalidated";
    case "home_win_live":
    case "double_chance_home_draw":
      return h >= a ? "validated" : "invalidated";
    case "away_win_live":
    case "double_chance_away_draw":
      return a >= h ? "validated" : "invalidated";
    default:
      return "inconclusive";
  }
}

function mapAdviceRow(r: any, match?: any): LiveAdviceHistoryEntry {
  const markets = (r.recommended_markets ?? []) as Array<{ market: string }>;
  const finished = match ? mapStatusToPhase(match.status_short) === "finished" : false;
  return {
    id: r.id,
    fixtureId: r.fixture_id,
    collectedAt: r.collected_at,
    minute: r.minute ?? null,
    scoreHome: r.score_home ?? null,
    scoreAway: r.score_away ?? null,
    action: (r.action ?? "WAIT") as LiveAdviceHistoryEntry["action"],
    mainAdvice: r.main_advice ?? "",
    confidence: r.confidence ?? null,
    urgency: r.urgency ?? null,
    recommendedMarkets: r.recommended_markets ?? [],
    avoidMarkets: r.avoid_markets ?? [],
    risks: r.risks ?? [],
    status: evaluateAdviceStatus(r.action ?? null, markets, match, finished),
  };
}

async function loadFixtureAdviceHistory(
  fixtureId: number,
  matchRow: any,
  limit = 50
): Promise<LiveAdviceHistoryEntry[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.liveAdviceSnapshots)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => mapAdviceRow(r, matchRow));
}

export interface LiveAdviceHistoryRow extends LiveAdviceHistoryEntry {
  matchLabel: string;
  finalScore: string | null;
}

/** Historique global des conseils live (page /history). */
export async function loadLiveAdviceHistory(limit = 150): Promise<LiveAdviceHistoryRow[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLES.liveAdviceSnapshots)
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.map((r) => r.fixture_id)));
  const { data: matchRows } = await supabase
    .from(TABLES.matches)
    .select("fixture_id,home_team_name,away_team_name,home_goals,away_goals,status_short")
    .in("fixture_id", ids);
  const matchMap = new Map<number, any>();
  for (const m of matchRows ?? []) matchMap.set(m.fixture_id, m);

  return rows.map((r) => {
    const m = matchMap.get(r.fixture_id);
    const entry = mapAdviceRow(r, m);
    return {
      ...entry,
      matchLabel: m ? `${m.home_team_name} vs ${m.away_team_name}` : `Match #${r.fixture_id}`,
      finalScore:
        m && m.home_goals !== null && m.away_goals !== null ? `${m.home_goals}-${m.away_goals}` : null,
    };
  });
}

async function loadLatestAnalysisRow(fixtureId: number): Promise<any | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from(TABLES.analysisSnapshots)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function hasStoredLineups(fixtureId: number): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) return false;
  const { count } = await supabase
    .from(TABLES.lineups)
    .select("*", { count: "exact", head: true })
    .eq("fixture_id", fixtureId);
  return (count ?? 0) > 0;
}

async function loadStoredLineups(fixtureId: number): Promise<NormalizedLineup[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from(TABLES.lineups).select("*").eq("fixture_id", fixtureId);
  return (data ?? []).map((row: any) => {
    const raw = row.raw_lineup as NormalizedLineup | undefined;
    if (raw && Array.isArray(raw.startXI)) return raw;
    return {
      teamId: row.team_id,
      teamName: row.team_name,
      formation: row.formation,
      coachName: row.coach_name,
      startXI: [],
      substitutes: [],
    };
  });
}

async function loadStoredContext(
  fixtureId: number
): Promise<{ recentForm: { home: RecentForm | null; away: RecentForm | null }; h2h: H2HSummary | null }> {
  const latest = await loadLatestAnalysisRow(fixtureId);
  const context = (latest?.raw_analysis as any)?.context ?? {};
  return {
    recentForm: context.recentForm ?? { home: null, away: null },
    h2h: context.h2h ?? null,
  };
}

function rowToFixture(row: any): NormalizedFixture {
  return {
    fixtureId: row.fixture_id,
    leagueId: row.league_id,
    leagueName: row.league_name,
    season: row.season,
    round: row.round,
    groupName: row.group_name,
    home: { id: row.home_team_id, name: row.home_team_name, logo: row.home_team_logo },
    away: { id: row.away_team_id, name: row.away_team_name, logo: row.away_team_logo },
    kickoffAt: row.kickoff_at,
    statusShort: row.status_short,
    statusLong: row.status_long,
    phase: mapStatusToPhase(row.status_short),
    elapsed: row.elapsed,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    venueName: row.venue_name,
    venueCity: row.venue_city,
  };
}

/** Reconstruit une analyse minimale depuis les colonnes si raw_analysis manque. */
function reconstructAnalysis(row: any): MatchAnalysis {
  return {
    summary: row.verdict ?? "",
    homeMomentum: row.home_momentum ?? 0,
    awayMomentum: row.away_momentum ?? 0,
    signalLevel: (row.signal_level as any) ?? "none",
    confidenceLevel: (row.confidence_level as any) ?? "low",
    marketSignals: row.market_signals ?? [],
    risks: row.risks ?? [],
    verdict: row.verdict ?? "",
    dataQuality: {
      hasStats: false,
      hasEvents: false,
      hasLineups: false,
      hasOdds: false,
      freshnessSeconds: null,
    },
  };
}
