import type { MomentumBreakdownItem } from "@/types/analysis";

interface Props {
  home: number;
  away: number;
  homeName: string;
  awayName: string;
  breakdown?: MomentumBreakdownItem[];
}

export function MomentumPanel({ home, away, homeName, awayName, breakdown }: Props) {
  const total = Math.max(1, home + away);
  const homePct = Math.round((home / total) * 100);
  const diff = home - away;
  const leader =
    diff > 10 ? homeName : diff < -10 ? awayName : "Équilibré";

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <div className="section-title">Score momentum</div>
        <div className="text-xs text-slate-400">
          Tendance: <span className="text-slate-200">{leader}</span>
        </div>
      </div>

      <div className="mb-1 flex items-end justify-between">
        <div className="text-left">
          <div className="font-mono text-2xl font-bold text-accent-bright">{home}</div>
          <div className="max-w-[120px] truncate text-[11px] text-slate-400">{homeName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-emerald-300">{away}</div>
          <div className="max-w-[120px] truncate text-[11px] text-slate-400">{awayName}</div>
        </div>
      </div>

      <div className="stat-bar-track flex h-3">
        <div className="h-full bg-accent" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-emerald-500/70" style={{ width: `${100 - homePct}%` }} />
      </div>
      <div className="mt-1 text-center text-[11px] text-slate-500">
        Différentiel: {diff > 0 ? "+" : ""}
        {diff} en faveur de {diff >= 0 ? homeName : awayName}
      </div>

      {breakdown && breakdown.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
            Détail du calcul
          </div>
          <ul className="space-y-1">
            {breakdown.map((b, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{b.label}</span>
                <span className="font-mono text-slate-300">
                  {b.homeDelta !== 0 && (
                    <span className="text-accent-bright">
                      {b.homeDelta > 0 ? "+" : ""}
                      {b.homeDelta}
                    </span>
                  )}
                  {b.homeDelta !== 0 && b.awayDelta !== 0 && <span className="text-slate-600"> / </span>}
                  {b.awayDelta !== 0 && (
                    <span className="text-emerald-300">
                      {b.awayDelta > 0 ? "+" : ""}
                      {b.awayDelta}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
