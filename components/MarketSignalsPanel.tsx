import type { MarketSignal } from "@/types/analysis";
import { MARKET_LABELS } from "@/lib/analyzer";
import { cn } from "@/lib/utils";
import { signalLabelFr, signalToneClass } from "@/lib/ui";

export function MarketSignalsPanel({ signals }: { signals: MarketSignal[] }) {
  const real = signals.filter((s) => s.market !== "avoid");
  const notes = signals.filter((s) => s.market === "avoid");

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <div className="section-title">Marchés à surveiller</div>
        <span className="text-[11px] text-slate-500">{real.length} signal(s)</span>
      </div>

      {real.length === 0 && (
        <div className="rounded-lg border border-border bg-night-850 p-3 text-sm text-slate-400">
          Aucun marché à surveiller ne se dégage clairement pour l&apos;instant. Mieux vaut
          s&apos;abstenir qu&apos;inventer un signal.
        </div>
      )}

      <div className="space-y-3">
        {real.map((s, i) => (
          <div key={i} className="rounded-lg border border-border bg-night-850 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">{s.label}</span>
              <span className={cn("badge shrink-0", signalToneClass(s.signal))}>
                {signalLabelFr(s.signal)}
              </span>
            </div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
              {MARKET_LABELS[s.market]}
            </div>
            <p className="text-xs leading-relaxed text-slate-300">{s.reason}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">Condition d&apos;invalidation: </span>
              {s.invalidation}
            </p>
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <div className="mt-3 space-y-2">
          {notes.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-dashed border-border/70 bg-night-900 p-2.5 text-[11px] text-slate-500"
            >
              <span className="font-medium text-slate-400">{s.label}: </span>
              {s.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
