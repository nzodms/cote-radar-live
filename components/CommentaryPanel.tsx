import type { ExternalCommentaryEvent } from "@/types/commentary";
import { cn } from "@/lib/utils";

function impactTone(impact: ExternalCommentaryEvent["normalizedImpact"]): string {
  switch (impact) {
    case "high":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    default:
      return "bg-slate-500/15 text-slate-400 border border-slate-500/30";
  }
}

export function CommentaryPanel({ events }: { events: ExternalCommentaryEvent[] }) {
  const sorted = [...events]
    .filter((e) => e.minute !== null)
    .sort((a, b) => (b.minute as number) - (a.minute as number));

  return (
    <div className="card card-pad">
      <div className="mb-2 flex items-center justify-between">
        <div className="section-title">Commentaires live enrichis</div>
        <span className="badge border border-border bg-night-850 text-slate-400">Source secondaire</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Aucun commentaire enrichi. La source secondaire est optionnelle et désactivée par défaut
          (<code className="text-slate-400">ENABLE_PUBLIC_COMMENTARY_INGESTION=false</code>). Elle ne
          sert qu&apos;à confirmer une pression récente, jamais à déclencher un signal fort.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.slice(0, 12).map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="w-8 shrink-0 text-right font-mono text-slate-500">
                {e.minute !== null ? `${e.minute}'` : "—"}
              </span>
              <span className={cn("badge shrink-0", impactTone(e.normalizedImpact))}>{e.eventType}</span>
              <span className="min-w-0 text-slate-400">
                {e.teamName ? <span className="text-slate-300">{e.teamName} · </span> : null}
                {e.rawTitle || e.rawDescription || "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
