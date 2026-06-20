import type { NormalizedLineup, NormalizedLineupPlayer } from "@/types/match";

function PlayerRow({ p }: { p: NormalizedLineupPlayer }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="w-6 shrink-0 text-right font-mono text-slate-500">{p.number ?? "—"}</span>
      <span className="truncate text-slate-200">{p.name ?? "—"}</span>
      {p.pos && <span className="ml-auto text-[10px] text-slate-500">{p.pos}</span>}
    </li>
  );
}

function TeamLineup({ lineup }: { lineup: NormalizedLineup }) {
  return (
    <div className="rounded-lg border border-border bg-night-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">{lineup.teamName}</span>
        {lineup.formation && <span className="pill">{lineup.formation}</span>}
      </div>
      {lineup.coachName && (
        <div className="mb-2 text-[11px] text-slate-500">Coach: {lineup.coachName}</div>
      )}

      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Titulaires</div>
      <ul className="space-y-1">
        {lineup.startXI.length > 0 ? (
          lineup.startXI.map((p, i) => <PlayerRow key={i} p={p} />)
        ) : (
          <li className="text-xs text-slate-500">—</li>
        )}
      </ul>

      {lineup.substitutes.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-[10px] uppercase tracking-wide text-slate-500">
            Remplaçants
          </div>
          <ul className="space-y-1">
            {lineup.substitutes.map((p, i) => (
              <PlayerRow key={i} p={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function LineupsPanel({ lineups }: { lineups: NormalizedLineup[] }) {
  return (
    <div className="card card-pad">
      <div className="mb-3 section-title">Compositions</div>
      {lineups.length === 0 ? (
        <div className="text-sm text-slate-400">
          Compositions indisponibles (souvent publiées ~1h avant le coup d&apos;envoi).
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lineups.map((l, i) => (
            <TeamLineup key={i} lineup={l} />
          ))}
        </div>
      )}
    </div>
  );
}
