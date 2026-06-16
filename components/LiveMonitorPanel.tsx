"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { actionLabelFr, actionToneClass } from "@/lib/ui";

interface WatchStatus {
  ok: boolean;
  monitorEnabled: boolean;
  active: boolean;
  session: {
    mode: string | null;
    lastPolledAt: string | null;
    apiCallsUsed: number;
    lastError: string | null;
  } | null;
  nextPollInSeconds: number | null;
  usedToday: number;
  dailyQuota: number;
  remainingQuota: number;
  lastAdviceAction: string | null;
  lastAlertAt: string | null;
  lastAlertText: string | null;
}

export function LiveMonitorPanel({ fixtureId }: { fixtureId: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<WatchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const didInit = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cron/watch-fixture/${fixtureId}`, { cache: "no-store" });
      const json = (await res.json()) as WatchStatus;
      setStatus(json);
      setCountdown(json.nextPollInSeconds);
    } catch {
      /* silencieux */
    }
  }, [fixtureId]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    load();
  }, [load]);

  // Décompte local + recharge auto du statut quand il atteint 0.
  useEffect(() => {
    if (!status?.active) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return c;
        if (c <= 1) {
          load();
          return status.nextPollInSeconds;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, load]);

  const act = async (action: "start" | "stop" | "tick") => {
    setBusy(true);
    setNote(action === "tick" ? "Exécution d'un tick…" : null);
    try {
      const res = await fetch(`/api/cron/watch-fixture/${fixtureId}?action=${action}`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (action === "tick") {
        const r = json?.results?.[0];
        setNote(
          r
            ? `Tick OK — action ${r.action ?? "?"}, ${r.apiCallsUsed} appel(s) API, ${
                r.alertSent ? "alerte envoyée" : r.alertReason ?? "pas d'alerte"
              }.`
            : json?.message ?? "Tick exécuté (aucune session due)."
        );
      } else {
        setNote(json?.message ?? "OK.");
      }
      await load();
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  };

  const s = status;

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <div className="section-title">Surveillance live</div>
        <span
          className={cn(
            "badge",
            s?.active
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "bg-slate-600/30 text-slate-300 border border-slate-600/40"
          )}
        >
          {s?.active ? "Active" : "Inactive"}
        </span>
      </div>

      {s && !s.monitorEnabled && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
          Le monitor est désactivé (ENABLE_LIVE_MONITOR=false). Les ticks ne s&apos;exécuteront pas.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Stat label="Prochain poll" value={s?.active && countdown !== null ? `${countdown}s` : "—"} />
        <Stat label="Calls restants" value={s ? `${s.remainingQuota}/${s.dailyQuota}` : "—"} />
        <Stat label="Mode" value={s?.session?.mode ?? "—"} />
        <Stat
          label="Dernier poll"
          value={s?.session?.lastPolledAt ? new Date(s.session.lastPolledAt).toLocaleTimeString("fr-FR") : "—"}
        />
        <Stat label="Appels (session)" value={s?.session ? String(s.session.apiCallsUsed) : "—"} />
        <div className="rounded-lg border border-border bg-night-850 p-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Dernière analyse</div>
          {s?.lastAdviceAction ? (
            <span className={cn("badge mt-0.5", actionToneClass(s.lastAdviceAction))}>
              {actionLabelFr(s.lastAdviceAction)}
            </span>
          ) : (
            <div className="mt-0.5 text-slate-400">—</div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-night-850 p-2.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Dernière alerte WhatsApp</div>
        {s?.lastAlertText ? (
          <div className="mt-1 text-[11px] text-slate-300">
            <span className="text-slate-500">
              {s.lastAlertAt ? new Date(s.lastAlertAt).toLocaleTimeString("fr-FR") : ""} ·{" "}
            </span>
            {s.lastAlertText.split("\n")[0]}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-slate-500">Aucune alerte envoyée.</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!s?.active ? (
          <button
            type="button"
            onClick={() => act("start")}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-deep disabled:opacity-60"
          >
            Démarrer surveillance live
          </button>
        ) : (
          <button
            type="button"
            onClick={() => act("stop")}
            disabled={busy}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
          >
            Arrêter surveillance live
          </button>
        )}
        <button
          type="button"
          onClick={() => act("tick")}
          disabled={busy}
          className="rounded-lg border border-border bg-night-850 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-night-800 disabled:opacity-60"
          title="Exécute une seule itération de surveillance (mode test)"
        >
          Run one monitor tick
        </button>
      </div>

      {note && <p className="mt-2 text-[11px] text-slate-400">{note}</p>}
      {s?.session?.lastError && (
        <p className="mt-1 text-[11px] text-amber-300/90">Dernière info: {s.session.lastError}</p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Surveillance continue par « ticks » courts (pas de boucle infinie). En prod, appeler{" "}
        <code className="text-slate-400">/api/cron/live-monitor</code> via un cron toutes les ~3 min.
        Quota géré: poll fixture/stats ~3 min, events ~6 min, lineups une fois, mode économie sous 15
        appels restants. Alertes WhatsApp uniquement sur changement notable (anti-spam 3 min).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-night-850 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-slate-200">{value}</div>
    </div>
  );
}
