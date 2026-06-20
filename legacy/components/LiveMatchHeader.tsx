import type { NormalizedFixture } from "@/types/match";
import { TeamLogo } from "./TeamLogo";
import { DataFreshnessBadge } from "./DataFreshnessBadge";
import { cn, formatKickoff, isLivePhase } from "@/lib/utils";
import { phaseLabelFr, phaseToneClass } from "@/lib/ui";

interface Props {
  fixture: NormalizedFixture;
  lastSyncedAt?: string | null;
  freshnessSeconds?: number | null;
}

export function LiveMatchHeader({ fixture, lastSyncedAt, freshnessSeconds }: Props) {
  const live = isLivePhase(fixture.phase);
  const scoreKnown = fixture.homeGoals !== null && fixture.awayGoals !== null;

  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("badge", phaseToneClass(fixture.phase))}>
            {live && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-live" />}
            {phaseLabelFr(fixture.phase)}
            {live && fixture.elapsed !== null ? ` · ${fixture.elapsed}'` : ""}
          </span>
          <span className="pill">{fixture.leagueName}</span>
          {fixture.groupName && <span className="pill">{fixture.groupName}</span>}
          {fixture.round && !fixture.groupName && <span className="pill">{fixture.round}</span>}
        </div>
        <DataFreshnessBadge iso={lastSyncedAt} seconds={freshnessSeconds} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <TeamLogo name={fixture.home.name} logo={fixture.home.logo} size={44} />
          <span className="text-base font-semibold text-slate-100">{fixture.home.name}</span>
        </div>

        <div className="text-center">
          {scoreKnown ? (
            <div className="font-mono text-3xl font-bold text-slate-100">
              {fixture.homeGoals}
              <span className="px-2 text-slate-600">:</span>
              {fixture.awayGoals}
            </div>
          ) : (
            <div className="text-sm text-slate-400">{formatKickoff(fixture.kickoffAt)}</div>
          )}
          <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
            {fixture.statusLong}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:flex-row-reverse sm:text-right">
          <TeamLogo name={fixture.away.name} logo={fixture.away.logo} size={44} />
          <span className="text-base font-semibold text-slate-100">{fixture.away.name}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>Coup d&apos;envoi: {formatKickoff(fixture.kickoffAt)}</span>
        {fixture.venueName && (
          <span>
            Stade: {fixture.venueName}
            {fixture.venueCity ? ` (${fixture.venueCity})` : ""}
          </span>
        )}
        <span>Fixture #{fixture.fixtureId}</span>
      </div>
    </div>
  );
}
