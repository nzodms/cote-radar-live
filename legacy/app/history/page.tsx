import Link from "next/link";
import {
  loadLiveAdviceHistory,
  loadSignalHistory,
  type LiveAdviceHistoryRow,
  type SignalHistoryRow,
} from "@/lib/match-service";
import { cn, formatKickoff } from "@/lib/utils";
import {
  actionLabelFr,
  actionToneClass,
  confidenceLabelFr,
  signalLabelFr,
  signalToneClass,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

function signalStatusBadge(status: SignalHistoryRow["status"]): { cls: string; label: string } {
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

function adviceStatusBadge(status: LiveAdviceHistoryRow["status"]): { cls: string; label: string } {
  switch (status) {
    case "validated":
      return { cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30", label: "Validé" };
    case "invalidated":
      return { cls: "bg-red-500/15 text-red-300 border border-red-500/30", label: "Invalidé" };
    case "pending":
      return { cls: "bg-accent/15 text-accent-bright border border-accent/30", label: "En attente" };
    default:
      return { cls: "bg-slate-500/15 text-slate-300 border border-slate-500/30", label: "Non concluant" };
  }
}

export default async function HistoryPage() {
  const [advice, signals] = await Promise.all([loadLiveAdviceHistory(150), loadSignalHistory(150)]);

  return (
    <div className="space-y-8">
      {/* Conseils live (assistant) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Historique des conseils live</h2>
          <span className="text-[11px] text-slate-500">{advice.length} conseil(s)</span>
        </div>

        {advice.length === 0 ? (
          <div className="card card-pad text-sm text-slate-400">
            Aucun conseil live enregistré. Chaque sync live d&apos;un match crée un snapshot de
            conseil.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Match</th>
                  <th className="px-4 py-3 font-medium">Min.</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Marché conseillé</th>
                  <th className="px-4 py-3 font-medium">Confiance</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {advice.map((r) => {
                  const sb = adviceStatusBadge(r.status);
                  const market = r.recommendedMarkets[0]?.label ?? "—";
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-night-850">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        {formatKickoff(r.collectedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/matches/${r.fixtureId}`} className="text-slate-200 hover:text-accent-bright">
                          {r.matchLabel}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {r.minute ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                        {r.scoreHome ?? "—"}-{r.scoreAway ?? "—"}
                        {r.finalScore ? ` (fin ${r.finalScore})` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("badge", actionToneClass(r.action))}>{actionLabelFr(r.action)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{market}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {r.confidence ? confidenceLabelFr(r.confidence as never) : "—"}
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
        <p className="mt-2 text-[11px] text-slate-500">
          Objectif: mesurer plus tard si le bot avait raison d&apos;attendre, si les signaux forts
          étaient pertinents et quels marchés sont les plus fiables. Statut évalué à la fin du match
          (marchés simples uniquement en V1).
        </p>
      </section>

      {/* Signaux du moteur d'analyse */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Historique des signaux (moteur)</h2>
          <span className="text-[11px] text-slate-500">{signals.length} snapshot(s)</span>
        </div>

        {signals.length === 0 ? (
          <div className="card card-pad text-sm text-slate-400">
            Aucun signal enregistré pour l&apos;instant.
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
                {signals.map((r) => {
                  const sb = signalStatusBadge(r.status);
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-night-850">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        {formatKickoff(r.collectedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/matches/${r.fixtureId}`} className="text-slate-200 hover:text-accent-bright">
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
                        {r.confidenceLevel ? confidenceLabelFr(r.confidenceLevel as never) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.hasHighRisk ? <span className="text-red-300">Élevé</span> : <span className="text-slate-500">—</span>}
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
      </section>
    </div>
  );
}
