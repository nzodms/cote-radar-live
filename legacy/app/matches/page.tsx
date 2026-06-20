import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import { loadAllMatches, type MatchListItem } from "@/lib/match-service";
import { cn, isLivePhase } from "@/lib/utils";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "live" | "upcoming" | "finished" | "strong" | "medium" | "risk";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "À venir" },
  { key: "finished", label: "Terminés" },
  { key: "strong", label: "Signal fort" },
  { key: "medium", label: "Signal moyen" },
  { key: "risk", label: "Risque élevé" },
];

function applyFilter(list: MatchListItem[], filter: FilterKey): MatchListItem[] {
  switch (filter) {
    case "live":
      return list.filter((m) => isLivePhase(m.fixture.phase));
    case "upcoming":
      return list.filter((m) => m.fixture.phase === "scheduled");
    case "finished":
      return list.filter((m) => m.fixture.phase === "finished");
    case "strong":
      return list.filter((m) => m.signalLevel === "strong");
    case "medium":
      return list.filter((m) => m.signalLevel === "medium" || m.signalLevel === "strong");
    case "risk":
      return list.filter((m) => m.hasHighRisk);
    default:
      return list;
  }
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/matches?${qs}` : "/matches";
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: { filter?: string; group?: string; date?: string };
}) {
  const filter = (FILTERS.find((f) => f.key === searchParams.filter)?.key ?? "all") as FilterKey;
  const group = searchParams.group;
  const date = searchParams.date;

  const all = await loadAllMatches();

  // Options dérivées
  const groups = Array.from(
    new Set(all.map((m) => m.fixture.groupName).filter((g): g is string => Boolean(g)))
  ).sort();
  const dates = Array.from(new Set(all.map((m) => m.fixture.kickoffAt?.slice(0, 10)).filter(Boolean))).sort();

  let list = applyFilter(all, filter);
  if (group) list = list.filter((m) => m.fixture.groupName === group);
  if (date) list = list.filter((m) => m.fixture.kickoffAt?.slice(0, 10) === date);

  return (
    <div>
      {/* Filtres principaux */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildHref({ filter: f.key === "all" ? undefined : f.key, group, date })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-accent text-white"
                : "border border-border bg-night-850 text-slate-300 hover:text-slate-100"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Filtres groupes */}
      {groups.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Groupe</span>
          <Link
            href={buildHref({ filter: filter === "all" ? undefined : filter, date })}
            className={cn("pill", !group && "border-accent/40 text-accent-bright")}
          >
            Tous
          </Link>
          {groups.map((g) => (
            <Link
              key={g}
              href={buildHref({ filter: filter === "all" ? undefined : filter, group: g, date })}
              className={cn("pill", group === g && "border-accent/40 text-accent-bright")}
            >
              {g}
            </Link>
          ))}
        </div>
      )}

      {/* Filtres dates */}
      {dates.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Date</span>
          <Link
            href={buildHref({ filter: filter === "all" ? undefined : filter, group })}
            className={cn("pill", !date && "border-accent/40 text-accent-bright")}
          >
            Toutes
          </Link>
          {dates.map((d) => (
            <Link
              key={d}
              href={buildHref({ filter: filter === "all" ? undefined : filter, group, date: d })}
              className={cn("pill", date === d && "border-accent/40 text-accent-bright")}
            >
              {d}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        {all.length === 0 ? (
          <div className="card card-pad text-sm text-slate-400">
            Aucun match en base. Lancez « Sync World Cup today » depuis les réglages pour récupérer
            les matchs de Coupe du monde.
          </div>
        ) : list.length === 0 ? (
          <div className="card card-pad text-sm text-slate-400">
            Aucun match ne correspond à ce filtre.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((m) => (
              <MatchCard key={m.fixture.fixtureId} item={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
