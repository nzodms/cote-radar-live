import type { AdviceDebug } from "@/types/live-advice";
import { formatKickoff } from "@/lib/utils";

export function AnalysisDebugPanel({ debug }: { debug: AdviceDebug }) {
  const rows: Array<[string, string]> = [
    ["fixture trouvé", debug.fixtureFound ? "oui" : "non"],
    ["fixture_id", String(debug.fixtureId)],
    ["score", `${debug.scoreHome ?? "–"}-${debug.scoreAway ?? "–"}`],
    ["minute", debug.minute !== null ? `${debug.minute}'` : "–"],
    ["status_short", debug.statusShort ?? "–"],
    ["status_long", debug.statusLong ?? "–"],
    ["latest statistics", debug.hasStatistics ? "oui" : "non"],
    ["events count", String(debug.eventsCount)],
    ["lineups count", String(debug.lineupsCount)],
    ["previous snapshots count", String(debug.previousSnapshotsCount)],
    ["live advice trouvé", debug.liveAdviceFound ? "oui" : "non"],
    ["dernière analyse créée à", debug.lastAdviceAt ? formatKickoff(debug.lastAdviceAt) : "–"],
    ["action", debug.action ?? "–"],
  ];

  return (
    <details className="card card-pad">
      <summary className="cursor-pointer select-none section-title">
        Données utilisées par l&apos;analyse (debug)
      </summary>
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between border-b border-border/40 py-1 text-xs"
          >
            <span className="text-slate-500">{k}</span>
            <span className="font-mono text-slate-300">{v}</span>
          </div>
        ))}
      </div>
      {debug.reason && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-300">Raison (si WAIT / AVOID / none) : </span>
          {debug.reason}
        </p>
      )}
    </details>
  );
}
