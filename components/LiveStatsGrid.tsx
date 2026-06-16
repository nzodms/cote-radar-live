import type { NormalizedStatsPair, NormalizedTeamStats } from "@/types/match";

interface Row {
  key: keyof NormalizedTeamStats;
  label: string;
  isPercent?: boolean;
}

const ROWS: Row[] = [
  { key: "ballPossession", label: "Possession", isPercent: true },
  { key: "totalShots", label: "Tirs totaux" },
  { key: "shotsOnGoal", label: "Tirs cadrés" },
  { key: "shotsOffGoal", label: "Tirs non cadrés" },
  { key: "blockedShots", label: "Tirs contrés" },
  { key: "shotsInsideBox", label: "Tirs dans la surface" },
  { key: "shotsOutsideBox", label: "Tirs hors surface" },
  { key: "cornerKicks", label: "Corners" },
  { key: "offsides", label: "Hors-jeu" },
  { key: "fouls", label: "Fautes" },
  { key: "yellowCards", label: "Cartons jaunes" },
  { key: "redCards", label: "Cartons rouges" },
  { key: "goalkeeperSaves", label: "Arrêts gardien" },
  { key: "totalPasses", label: "Passes totales" },
  { key: "passesAccurate", label: "Passes réussies" },
  { key: "passesPercent", label: "% passes réussies", isPercent: true },
];

function fmt(v: number | null, isPercent?: boolean): string {
  if (v === null) return "—";
  return isPercent ? `${Math.round(v)}%` : `${v}`;
}

function StatRow({ row, home, away }: { row: Row; home: NormalizedTeamStats; away: NormalizedTeamStats }) {
  const h = home[row.key];
  const a = away[row.key];
  const both = h !== null && a !== null;
  const sum = both ? (h as number) + (a as number) : 0;
  const homePct = both && sum > 0 ? Math.round(((h as number) / sum) * 100) : 50;
  const hHigher = both && (h as number) > (a as number);
  const aHigher = both && (a as number) > (h as number);

  return (
    <div className="py-2">
      <div className="mb-1 grid grid-cols-3 items-center text-sm">
        <span className={`text-left font-mono ${hHigher ? "text-accent-bright" : "text-slate-300"}`}>
          {fmt(h, row.isPercent)}
        </span>
        <span className="text-center text-[11px] uppercase tracking-wide text-slate-500">
          {row.label}
        </span>
        <span className={`text-right font-mono ${aHigher ? "text-emerald-300" : "text-slate-300"}`}>
          {fmt(a, row.isPercent)}
        </span>
      </div>
      <div className="stat-bar-track flex">
        <div className="h-full bg-accent/70" style={{ width: `${both ? homePct : 50}%` }} />
        <div className="h-full bg-emerald-500/50" style={{ width: `${both ? 100 - homePct : 50}%` }} />
      </div>
    </div>
  );
}

export function LiveStatsGrid({ stats }: { stats: NormalizedStatsPair | null }) {
  if (!stats || !stats.hasData) {
    return (
      <div className="card card-pad text-sm text-slate-400">
        Aucune statistique live disponible pour l&apos;instant. Lancez un sync live, ou attendez que
        l&apos;API fournisse des données.
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="mb-2 section-title">Statistiques live</div>
      <div className="divide-y divide-border/60">
        {ROWS.map((row) => (
          <StatRow key={row.key} row={row} home={stats.home} away={stats.away} />
        ))}
      </div>
    </div>
  );
}
