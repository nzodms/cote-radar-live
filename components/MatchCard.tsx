import Link from "next/link";
import type { MatchListItem } from "@/lib/match-service";
import { TeamLogo } from "./TeamLogo";
import { DataFreshnessBadge } from "./DataFreshnessBadge";
import { cn, formatKickoff, isLivePhase } from "@/lib/utils";
import { actionLabelFr, actionToneClass, phaseLabelFr, phaseToneClass, signalToneClass } from "@/lib/ui";

function MomentumMini({ home, away }: { home: number | null; away: number | null }) {
  if (home === null || away === null) {
    return <span className="text-xs text-slate-500">Momentum: —</span>;
  }
  const total = Math.max(1, home + away);
  const homePct = Math.round((home / total) * 100);
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
        <span>Momentum {home}</span>
        <span>{away}</span>
      </div>
      <div className="stat-bar-track flex">
        <div className="h-full bg-accent" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-emerald-500/70" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

export function MatchCard({ item }: { item: MatchListItem }) {
  const { fixture } = item;
  const live = isLivePhase(fixture.phase);
  const scoreKnown = fixture.homeGoals !== null && fixture.awayGoals !== null;

  return (
    <div className="card card-pad flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("badge", phaseToneClass(fixture.phase))}>
            {live && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-live" />}
            {phaseLabelFr(fixture.phase)}
            {live && fixture.elapsed !== null ? ` ${fixture.elapsed}'` : ""}
          </span>
          {fixture.groupName && <span className="pill">{fixture.groupName}</span>}
          {!fixture.groupName && fixture.round && (
            <span className="pill truncate max-w-[140px]">{fixture.round}</span>
          )}
        </div>
        <DataFreshnessBadge iso={item.lastSyncedAt} label="" />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TeamLogo name={fixture.home.name} logo={fixture.home.logo} />
          <span className="truncate text-sm font-medium text-slate-100">{fixture.home.name}</span>
        </div>
        <div className="px-2 text-center">
          {scoreKnown ? (
            <span className="font-mono text-lg font-semibold text-slate-100">
              {fixture.homeGoals}
              <span className="px-1 text-slate-500">:</span>
              {fixture.awayGoals}
            </span>
          ) : (
            <span className="text-xs text-slate-500">{formatKickoff(fixture.kickoffAt)}</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="truncate text-right text-sm font-medium text-slate-100">
            {fixture.away.name}
          </span>
          <TeamLogo name={fixture.away.name} logo={fixture.away.logo} />
        </div>
      </div>

      <MomentumMini home={item.homeMomentum} away={item.awayMomentum} />

      {item.adviceAction && (
        <div className="flex items-center gap-2">
          <span className={cn("badge shrink-0", actionToneClass(item.adviceAction))}>
            {actionLabelFr(item.adviceAction)}
          </span>
          {item.adviceMainText && (
            <span className="truncate text-[11px] text-slate-500">{item.adviceMainText}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {item.signalLevel && item.signalLevel !== "none" ? (
            <span className={cn("badge", signalToneClass(item.signalLevel as never))}>
              {item.bestSignalLabel ?? "Signal"}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Aucun signal fort</span>
          )}
        </div>
        <Link
          href={`/matches/${fixture.fixtureId}`}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          Analyser
        </Link>
      </div>

      {fixture.venueName && (
        <div className="text-[11px] text-slate-500">
          {fixture.venueName}
          {fixture.venueCity ? ` · ${fixture.venueCity}` : ""}
        </div>
      )}
    </div>
  );
}
