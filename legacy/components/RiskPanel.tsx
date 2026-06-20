import type { RiskItem } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { severityLabelFr, severityToneClass } from "@/lib/ui";

export function RiskPanel({ risks }: { risks: RiskItem[] }) {
  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <div className="section-title">Risques identifiés</div>
        <span className="text-[11px] text-slate-500">{risks.length}</span>
      </div>

      {risks.length === 0 ? (
        <div className="text-sm text-slate-400">
          Aucun facteur de risque majeur détecté dans les données actuelles.
        </div>
      ) : (
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li key={i} className="rounded-lg border border-border bg-night-850 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-100">{r.label}</span>
                <span className={cn("badge shrink-0", severityToneClass(r.severity))}>
                  {severityLabelFr(r.severity)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{r.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
