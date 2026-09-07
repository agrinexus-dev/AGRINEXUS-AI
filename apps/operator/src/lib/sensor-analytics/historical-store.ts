"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useSession } from "next-auth/react";

import type { AppSessionUser } from "@/lib/auth/types";
import type { SensorRecord } from "@/lib/sensors/types";

import { BACKFILL_WINDOW_MS, generateBackfill } from "./historical-defaults";
import type { HistoricalSample } from "./types";

/**
 * The Historical Sensor Store — mirrors the `order`/`records`
 * shape every other store in this app uses, keyed by sensor id instead of
 * holding its own id list (sensors themselves are still only ever created/
 * removed by `lib/sensors/sensor-store.ts`, untouched this change). Does
 * NOT duplicate live sensor state: `samples` holds only time-series
 * snapshots (timestamp/reading/battery/signal/health) — name, type,
 * gateway, etc. are always read live from the Sensor Store by whatever
 * component needs them.
 *
 * Persisted to localStorage ("Historical Data Persistence", via
 * `zustand/middleware`'s `persist` — the exact same middleware
 * `aura-settings-store.ts` already uses, no new dependency) so recorded
 * readings survive a page refresh/navigation instead of resetting every
 * load. This is still a frontend simulation, not a real time-series
 * database: a future backend replaces this persistence layer outright, it
 * doesn't extend it.
 *
 * SECURITY FIX — the audit found this persisted under a
 * single, globally-scoped localStorage key with no farm/session boundary at
 * all: `agrinexus-historical-store`, the same key regardless of which
 * account/farm was authenticated. Since sensor ids aren't guaranteed unique
 * across farms and logging in as a different account is an SPA transition
 * here (no hard reload — see `weather-store.ts`'s identical fix), a
 * previous farm's simulated telemetry history could persist in the browser
 * indefinitely and, in principle, survive under a different farm's session.
 *
 * The fix namespaces the storage key by the authenticated user's id — the
 * same `session.user.id` identity `weather-store.ts` already established as
 * safe for this exact purpose (a client-side CACHE KEY, never an
 * authorization check; `getFarmForSession`'s `findFirst` lookup confirms
 * every session resolves to exactly one farm today, so one user id maps to
 * one farm's data). `activeNamespaceId`/`namespacedKey`/`namespacedStorage`
 * below implement this via a custom `persist` storage adapter — `name`
 * stays a fixed string for `persist`'s own bookkeeping, but every actual
 * `localStorage` key is `` `${name}:${activeNamespaceId}` ``, so Farm A and
 * Farm B always read/write physically different localStorage entries.
 * `useHistoricalStoreHydration` (below) additionally clears the in-memory
 * `samples` and re-points `activeNamespaceId` whenever the authenticated
 * identity changes, before rehydrating — localStorage isolation alone isn't
 * sufficient, since the already-loaded Zustand state itself must not carry
 * a previous farm's samples into a new one either.
 *
 * Old data under the original bare `agrinexus-historical-store` key (from
 * before this fix) is deliberately left untouched and never read again —
 * its true ownership can't be reliably attributed to any specific farm, so
 * it is neither migrated nor deleted, only orphaned — its true ownership
 * can't be reliably attributed to any specific farm.
 */
const STORAGE_KEY = "agrinexus-historical-store";

/**
 * Which authenticated identity's namespace the storage adapter currently
 * reads/writes — `null` until the first hydration attempt resolves one.
 * Set exclusively by `useHistoricalStoreHydration` below; used ONLY to pick
 * a client-local cache namespace, never to authorize anything server-side.
 */
let activeNamespaceId: string | null = null;
/**
 * `true` once `activeNamespaceId` has been resolved at least once (whether
 * to a real user id or genuinely to `null`/"anonymous"). `use-historical-
 * sensor-simulation.ts`'s ticker calls `ensureBackfilled`/`recordSample`
 * SYNCHRONOUSLY on mount — and React runs child effects before parent
 * effects, so the ticker (mounted by a page component) actually fires
 * before `useHistoricalStoreHydration`'s own effect (mounted by the
 * enclosing shell) even resolves its session status, let alone finishes
 * resetting/rehydrating — without this guard, that very first tick's writes
 * would land in the "anonymous" bucket instead of the real farm's
 * namespace, on every single page load; discovered via live testing.
 * Recording/backfilling simply no-ops until this flips true (the very next
 * ~10s tick catches up; see `RECORD_INTERVAL_MS`), rather than writing into
 * the wrong namespace.
 */
let identityResolved = false;

function namespacedKey(id: string | null): string {
  return `${STORAGE_KEY}:${id ?? "anonymous"}`;
}

/**
 * A minimal `Storage`-shaped adapter that redirects every read/write to the
 * CURRENT `activeNamespaceId`'s own key rather than the literal `name`
 * `persist` was configured with — the standard zustand `persist` pattern
 * for a runtime-selectable storage namespace. Never throws: a
 * quota/privacy-mode/unavailable-storage failure is swallowed exactly the
 * same way the plain `localStorage` calls this replaces would have thrown
 * uncaught before, mirroring every other best-effort persistence path in
 * this app.
 */
const namespacedStorage: StateStorage = {
  getItem: (_name) => {
    try {
      return localStorage.getItem(namespacedKey(activeNamespaceId));
    } catch {
      return null;
    }
  },
  setItem: (_name, value) => {
    try {
      localStorage.setItem(namespacedKey(activeNamespaceId), value);
    } catch {
      // Best-effort — a write failure here must never crash the app.
    }
  },
  removeItem: (_name) => {
    try {
      localStorage.removeItem(namespacedKey(activeNamespaceId));
    } catch {
      // Best-effort — see `setItem`'s own comment.
    }
  },
};

interface HistoricalState {
  samples: Record<string, HistoricalSample[]>;
  /** Configurable history retention window ("Support configurable history length") — defaults to the full 30-day backfill range. */
  windowMs: number;

  /** Backfills a sensor's history exactly once (no-op if it already has samples) — called lazily the first time any consumer needs a sensor's history, not eagerly for every sensor up front. Once localStorage has persisted real samples for a sensor, this permanently no-ops for it (see `MAX_SAMPLES_PER_SENSOR` below) — the synthetic backfill never overwrites accumulated real history. */
  ensureBackfilled: (sensor: SensorRecord) => void;
  recordSample: (sensorId: string, sample: HistoricalSample) => void;
  setWindowMs: (windowMs: number) => void;
  /** Drops history for sensor ids that no longer exist in the Sensor Store — called periodically by the recording ticker rather than hooking into `removeSensor` directly (which would require modifying that store). */
  pruneRemoved: (existingSensorIds: string[]) => void;
}

/**
 * Hard cap on samples retained per sensor, independent of `windowMs`
 * ("Avoid unlimited storage growth... keep a sensible maximum
 * history size") — bounds localStorage growth even across a very
 * long-running session recording every 10s (`use-historical-sensor-
 * simulation.ts`), which the time-window filter alone doesn't cap. Sized
 * comfortably above the 30-day/15-minute-resolution backfill's own ~2,880
 * points so normal backfilled history is never truncated by this cap alone.
 */
const MAX_SAMPLES_PER_SENSOR = 4000;

function capSamples(samples: HistoricalSample[]): HistoricalSample[] {
  return samples.length > MAX_SAMPLES_PER_SENSOR ? samples.slice(samples.length - MAX_SAMPLES_PER_SENSOR) : samples;
}

export const useHistoricalStore = create<HistoricalState>()(
  persist(
    (set, get) => ({
      samples: {},
      windowMs: BACKFILL_WINDOW_MS,

      ensureBackfilled: (sensor) => {
        if (!identityResolved) return; // see `identityResolved`'s own doc comment
        if (get().samples[sensor.id]?.length) return;
        const backfill = generateBackfill(sensor);
        set((state) => ({ samples: { ...state.samples, [sensor.id]: backfill } }));
      },

      recordSample: (sensorId, sample) => {
        if (!identityResolved) return; // see `identityResolved`'s own doc comment
        set((state) => {
          const existing = state.samples[sensorId] ?? [];
          const cutoff = sample.timestamp - state.windowMs;
          const next = capSamples([...existing, sample].filter((entry) => entry.timestamp >= cutoff));
          return { samples: { ...state.samples, [sensorId]: next } };
        });
      },

      setWindowMs: (windowMs) => set({ windowMs }),

      pruneRemoved: (existingSensorIds) => {
        if (!identityResolved) return; // see `identityResolved`'s own doc comment
        // REGRESSION FIX — an empty array here is ambiguous: it
        // could mean "this farm genuinely has zero sensors," but live
        // testing confirmed it far more commonly means "the Sensor Store's
        // own farm-scoped fetch hasn't resolved yet" — the ticker's very
        // first tick (fired synchronously on mount, before any fetch could
        // possibly complete) always sees an empty `order`. Treating that as
        // authoritative deleted every real sensor's history the instant a
        // farm's own page loaded, discovered live during regression testing
        // — the cross-farm case this guard might otherwise miss
        // (a genuine switch to a farm with zero sensors) is already handled
        // upstream by `useHistoricalStoreHydration`'s own identity-switch
        // reset, so this only ever skips the narrower same-farm case of a
        // farm's last remaining sensor being deleted mid-session — its
        // history simply lingers (harmlessly, still correctly scoped to
        // this same farm) until superseded by a later prune once another
        // sensor exists, rather than risking real data every page load.
        if (existingSensorIds.length === 0) return;
        set((state) => {
          const known = new Set(existingSensorIds);
          const staleIds = Object.keys(state.samples).filter((id) => !known.has(id));
          if (staleIds.length === 0) return state;
          const samples = { ...state.samples };
          for (const id of staleIds) delete samples[id];
          return { samples };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      // Redirects every actual localStorage read/write to the
      // current identity's own namespaced key (see `namespacedStorage`'s
      // own doc comment above); `name` above is only `persist`'s internal
      // bookkeeping label now, never the literal localStorage key.
      storage: createJSONStorage(() => namespacedStorage),
      // Only the recorded data itself persists — action creators are
      // re-bound fresh from the `create` closure on every load, same
      // convention every other `persist`-backed store in this codebase
      // (`aura-settings-store.ts`) already follows implicitly.
      partialize: (state) => ({ samples: state.samples, windowMs: state.windowMs }),
      // `skipHydration` — by default, `persist`
      // reads `localStorage` synchronously the moment this module is
      // evaluated on the client, i.e. before React's first client render
      // even starts. The server has no `localStorage` at all, so it always
      // starts from this store's plain in-code `samples: {}`. Whenever a
      // real browser already has samples saved from an earlier session,
      // those two initial states genuinely differ — and several components
      // (`AnalyticsWidget` chief among them) read `samples`-derived numbers
      // (via `detectAnomalies`/`computeSensorHealthScore`) directly during
      // render, not gated behind a mount check, so that difference surfaced
      // as a real SSR/client hydration mismatch (e.g. "Sensor network
      // health: 98/100" vs "96/100" — different anomaly counts). With
      // `skipHydration`, the store starts identical (plain in-code state) on
      // both server and first client render; `useHistoricalStoreHydration`
      // below then pulls in `localStorage`'s real data in a `useEffect`
      // (mounted once from `AppShell`) — after hydration has already
      // committed, so the follow-up update is an ordinary re-render, not a
      // mismatch. This is the pattern zustand's own docs recommend for
      // `persist` + SSR.
      skipHydration: true,
    },
  ),
);

/** All samples for one sensor within the current window, chronological — the read path every chart/trend function uses. Mirrors the read-selector convention every other store here follows. */
export function useSensorHistory(sensorId: string | null): HistoricalSample[] {
  return useHistoricalStore((state) => (sensorId ? (state.samples[sensorId] ?? []) : []));
}

/**
 * Rehydrates this store from `localStorage` once, after the initial client
 * mount — see the `skipHydration` doc comment above for why this can't just
 * happen synchronously at store-creation time. Mount exactly once per shell
 * (`AppShell` for Operator, `FarmerShell` for Farmer — the latter was
 * previously missing entirely) rather than per-page: a repeat call
 * for the SAME already-resolved identity is a harmless no-op.
 *
 * Also the one place `activeNamespaceId` (used by
 * `namespacedStorage` above) gets resolved and updated. Whenever the
 * authenticated identity differs from whichever one the in-memory `samples`
 * currently belong to (a same-tab farm switch — the same client-identity
 * cache-key principle `weather-store.ts` already established, though this
 * hook uses the reactive `useSession()` rather than that file's imperative
 * `getSession()` — see this function's own doc comment below for why), the
 * in-memory state is reset FIRST — localStorage key isolation alone isn't
 * sufficient, since already-loaded samples from the previous identity must
 * not remain visible under the new one either — and only then does
 * `rehydrate()` run, now pointed at the new identity's own namespaced key.
 * A component unmount (this shell being torn down by the SPA transition to
 * `/login` a farm switch goes through) cancels an in-flight rehydrate via
 * the effect's own cleanup, so a slow late resolution for the FARM BEING
 * LEFT can never mark `identityResolved` true over whatever a newer mount
 * (the farm being switched TO) has already established.
 */
export function useHistoricalStoreHydration(): void {
  // `useSession()` (the reactive hook), not the imperative
  // `getSession()`: live testing found `getSession()` can genuinely resolve
  // to "no user" for a brief moment on a fresh mount, before `next-auth`'s
  // `SessionProvider` has finished its own first client-side check — a
  // false negative `weather-store.ts`'s identical-looking `getSession()`
  // call happens to tolerate harmlessly (its actual data always comes from
  // a server-verified `/api/weather` response regardless of what the
  // client-side cache key is mislabeled as), but which would have durably
  // misfiled real farm history into a permanent "anonymous" bucket here.
  // `status` gives an explicit "still resolving" signal to wait out instead.
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return; // not yet resolved — wait for a real status before touching the namespace at all

    const userId = (session?.user as AppSessionUser | undefined)?.id ?? null;
    if (activeNamespaceId === userId) {
      identityResolved = true; // still unblock the write guard even on a same-identity no-op (e.g. a second shell mount for the same farm)
      return;
    }

    let cancelled = false;
    // `activeNamespaceId` MUST update before anything below
    // reads/writes storage, so both the existence check and the eventual
    // `rehydrate()` operate on the NEW identity's own key, never the
    // previous one.
    activeNamespaceId = userId;

    // REGRESSION FIX — the original code reset
    // `samples` to `{}` UNCONDITIONALLY here, every time, before calling
    // `rehydrate()`. That reset itself triggers `persist`'s normal
    // auto-write, which — via `namespacedStorage` — immediately overwrote
    // this identity's OWN real persisted history with an empty snapshot,
    // an instant before `rehydrate()` could ever read it back. In effect,
    // any fresh page load (a plain reload, or any hard navigation) for a
    // farm that already had real saved history destroyed it every time,
    // discovered live during regression testing — this
    // directly violated the "same-farm reload must not lose
    // history" requirement, which an insufficiently-long-waited test in
    // that milestone failed to catch.
    //
    // The reset is now CONDITIONAL: only clear in-memory state when this
    // identity's own namespace genuinely has nothing persisted yet (a
    // real farm switch to a farm never seen in this browser) — there is
    // nothing to clobber in that case. When real data already exists for
    // this identity (the overwhelmingly common case: the same farm
    // reloading, or returning to a farm visited earlier this session),
    // skip the reset entirely and let `rehydrate()` load that real data
    // as-is. Stale in-memory data from a DIFFERENT, previously-active
    // identity is still never at risk of leaking here: that data only
    // ever lived in the OLD identity's own render tree, which the SPA
    // farm-switch/unmount path already tears down before this identity's
    // own hydration even runs.
    const hasExistingData = namespacedStorage.getItem(STORAGE_KEY) !== null;
    if (!hasExistingData) {
      useHistoricalStore.setState({ samples: {}, windowMs: BACKFILL_WINDOW_MS });
    }
    void (async () => {
      await useHistoricalStore.persist.rehydrate();
      if (!cancelled) identityResolved = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session]);
}
