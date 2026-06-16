import type { NormalizedEvent } from "@/types/match";

function eventTone(type: string | null, detail: string | null): { dot: string; label: string } {
  const t = (type ?? "").toLowerCase();
  const d = (detail ?? "").toLowerCase();
  if (t === "goal") {
    if (d.includes("missed")) return { dot: "bg-slate-500", label: "Penalty manqué" };
    if (d.includes("own")) return { dot: "bg-orange-400", label: "But contre son camp" };
    if (d.includes("penalty")) return { dot: "bg-emerald-400", label: "But (penalty)" };
    return { dot: "bg-emerald-400", label: "But" };
  }
  if (t === "card") {
    if (d.includes("red")) return { dot: "bg-red-500", label: "Carton rouge" };
    return { dot: "bg-amber-400", label: "Carton jaune" };
  }
  if (t === "subst") return { dot: "bg-accent", label: "Changement" };
  if (t === "var") return { dot: "bg-purple-400", label: "VAR" };
  return { dot: "bg-slate-500", label: type ?? "Événement" };
}

export function EventsTimeline({ events }: { events: NormalizedEvent[] }) {
  const sorted = [...events].sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0));

  return (
    <div className="card card-pad">
      <div className="mb-3 section-title">Événements</div>
      {sorted.length === 0 ? (
        <div className="text-sm text-slate-400">Aucun événement enregistré pour l&apos;instant.</div>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((e, i) => {
            const tone = eventTone(e.type, e.detail);
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-8 shrink-0 text-right font-mono text-xs text-slate-500">
                  {e.elapsed !== null ? `${e.elapsed}'` : "—"}
                  {e.extra ? `+${e.extra}` : ""}
                </span>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                <div className="min-w-0">
                  <div className="text-sm text-slate-200">
                    <span className="font-medium">{tone.label}</span>
                    {e.detail && e.detail !== tone.label && (
                      <span className="text-slate-500"> · {e.detail}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {e.playerName ?? "—"}
                    {e.assistName ? ` (passe: ${e.assistName})` : ""}
                    {e.teamName ? ` — ${e.teamName}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
