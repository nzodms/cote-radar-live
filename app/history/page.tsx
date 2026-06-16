import Link from "next/link";
import { loadSignalHistory, type SignalHistoryRow } from "@/lib/match-service";
import { cn, formatKickoff } from "@/lib/utils";
import { confidenceLabelFr, signalLabelFr, signalToneClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

function statusBadge(status: SignalHistoryRow["status"]): { cls: string; label: string } {
  switch (status) {
    case "won":
      return { cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30", label: "Gagné" };
    case "lost":
      return { cls: "bg-red-500/15 text-red-300 border border-red-500/30", label: "Perdu" };
    case "pending":
      return { cls: "bg-accent/15 text-accent-bright border border-accent/30", label: "En attente" };
    default:
      return { cls: "bg-slate-500/15 text-slate-300 border border-slate-500/30", label: "Non concluant" };
  }
}

export default async function HistoryPage() {
  const rows = await loadSignalHistory(150);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Historique des analyses &amp; signaux</h2>
        <span className="text-[11px] text-slate-500">{rows.length} snapshot(s)</span>
      </div>

      {rows.length === 0 ? (
        <div className="card card-pad text-sm text-slate-400">
          Aucun historique pour l&apos;instant. Les snapshots d&apos;analyse sont créés à chaque sync
          live d&apos;un match.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Match</th>
                <th className="px-4 py-3 font-medium">Marché surveillé</th>
                <th className="px-4 py-3 font-medium">Signal</th>
                <th className="px-4 py-3 font-medium">Confiance</th>
                <th className="px-4 py-3 font-medium">Risque</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sb = statusBadge(r.status);
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-night-850">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                      {formatKickoff(r.collectedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/matches/${r.fixtureId}`}
                        className="text-slate-200 hover:text-accent-bright"
                      >
                        {r.matchLabel}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{r.marketLabel ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("badge", signalToneClass((r.signalLevel as never) ?? "none"))}>
                        {signalLabelFr((r.signalLevel as never) ?? "none")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r.confidenceLevel
                        ? confidenceLabelFr(r.confidenceLevel as never)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.hasHighRisk ? (
                        <span className="text-red-300">Élevé</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                      {r.finalScore ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("badge", sb.cls)}>{sb.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Le statut « gagné/perdu » n&apos;est évalué que pour les marchés simples (overs, BTTS,
        vainqueur) une fois le match terminé. Les marchés « prochain but » restent non concluants en
        V1. Le ROI théorique pourra être ajouté plus tard.
      </p>
    </div>
  );
}
