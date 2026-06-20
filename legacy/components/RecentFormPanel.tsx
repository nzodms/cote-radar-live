import type { H2HSummary, RecentForm, RecentFormResult } from "@/types/match";

function outcomeTone(outcome: RecentFormResult["outcome"]): string {
  switch (outcome) {
    case "W":
      return "bg-emerald-500/20 text-emerald-300";
    case "L":
      return "bg-red-500/20 text-red-300";
    case "D":
      return "bg-slate-500/20 text-slate-300";
    default:
      return "bg-night-700 text-slate-500";
  }
}

function FormRow({ name, form }: { name: string; form: RecentForm | null }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-100">{name}</span>
        {form && (
          <span className="text-[11px] text-slate-500">
            {form.wins}V {form.draws}N {form.losses}D · {form.goalsFor}-{form.goalsAgainst}
          </span>
        )}
      </div>
      {form && form.results.length > 0 ? (
        <div className="flex gap-1">
          {form.results.slice(0, 5).map((r, i) => (
            <span
              key={i}
              className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold ${outcomeTone(
                r.outcome
              )}`}
              title={`${r.isHome ? "Dom." : "Ext."} vs ${r.opponentName} (${r.goalsFor ?? "?"}-${
                r.goalsAgainst ?? "?"
              })`}
            >
              {r.outcome}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500">Forme non synchronisée (sync « contexte »).</div>
      )}
    </div>
  );
}

interface Props {
  homeName: string;
  awayName: string;
  home: RecentForm | null;
  away: RecentForm | null;
  h2h: H2HSummary | null;
}

export function RecentFormPanel({ homeName, awayName, home, away, h2h }: Props) {
  return (
    <div className="card card-pad">
      <div className="mb-3 section-title">Forme récente &amp; confrontations</div>

      <div className="space-y-4">
        <FormRow name={homeName} form={home} />
        <FormRow name={awayName} form={away} />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          Face-à-face (H2H)
        </div>
        {h2h && h2h.totalMatches > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-accent-bright">
              {homeName}: {h2h.team1Wins}
            </span>
            <span className="text-slate-400">Nuls: {h2h.draws}</span>
            <span className="text-emerald-300">
              {awayName}: {h2h.team2Wins}
            </span>
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            H2H non disponible ou non synchronisé (sync « contexte »).
          </div>
        )}
      </div>
    </div>
  );
}
