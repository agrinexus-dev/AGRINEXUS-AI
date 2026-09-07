"use client";

import { useMemo } from "react";
import { create } from "zustand";

import type { FarmPlotDefinition } from "@/components/digital-twin/scene/farm-data";

/**
 * The Plot Store (tenant-isolation hardened).
 *
 * SECURITY FIX — a client farm-isolation audit
 * live-confirmed that this store previously seeded itself from the static
 * `farmPlots` array (`scene/farm-data.ts`) — `farm_demo`'s real, persisted
 * Plot A–D — regardless of which farm was actually authenticated, and that
 * `fetchPlots()`/`hydrateFromServer()` only ever ADDED ids on top of that
 * seed (`if (next[plot.id]) continue`), never removing one the current
 * farm's own `/api/plots` response didn't return. A farmer on a completely
 * different farm (e.g. the isolation-test farm) therefore always had
 * `farm_demo`'s 4 plots in this store, which `collect-context.ts` reads
 * directly into `AuraContext.plots` — a confirmed, live-reproduced leak.
 *
 * `farmPlots` itself is UNCHANGED and still directly imported by the ~20
 * existing files that render/reference plot GEOMETRY (Digital Twin scene,
 * mission overlays, both Mission Planners, Analytics/Alerts/Settings pages,
 * the Add Sensor dialog's plot picker, etc.) — that static array remains
 * exactly what it always was: read-only Digital Twin visual/layout data,
 * with zero mutation path. This store no longer reads it at all: static
 * Digital Twin geometry must never again double as authenticated,
 * farm-owned Plot Store membership.
 *
 * The store now starts EMPTY and is hydrated exclusively from farm-scoped
 * sources — either `/api/plots` (`fetchPlots`) or a Server Component's own
 * `listPlots(farm.id)` call passed down as a prop (`hydrateFromServer`,
 * `digital-twin-page.tsx`'s `initialPlots`) — and each hydration REPLACES
 * the plot set wholesale rather than merging into whatever was there before,
 * mirroring the authoritative-reconciliation pattern already established in
 * `fleet-store.ts`/`robot-store.ts`/`sensor-store.ts`. Plots have no
 * local-only runtime/telemetry fields (unlike Sensor), so there is nothing
 * to preserve per-id on reconciliation — the fresh record is always adopted
 * wholesale, and an id absent from the fresh response is dropped, full stop.
 *
 * No polling, no sync interval (unlike Sensor) — Plot data has no
 * simulation drift and no live-updating fields today, so a one-time fetch
 * is all Part 12 ("do not introduce unnecessary polling") allows for or
 * needs. This store still has no `selectedPlotId`-style field (unchanged by
 * this fix) — the one component-local plot selection in the app
 * (`plot-analytics-card.tsx`) already defensively falls back to a plot that
 * still exists, so there is no stale-selection state here to clear.
 */
interface PlotState {
  plots: Record<string, FarmPlotDefinition>;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
  fetchPlots: () => Promise<void>;
  /** Hydrates the store from server-fetched data with zero network round-trip — see `digital-twin-page.tsx`'s `initialPlots` prop, sourced from a Server Component's own farm-scoped `listPlots(farm.id)` call ("prefer server-loaded... over unnecessary client-side fetching"). Authoritative replace, same as `fetchPlots` — this is just as much a fresh, farm-scoped source as the HTTP endpoint is, so it gets the exact same reconciliation guarantee. */
  hydrateFromServer: (plots: FarmPlotDefinition[]) => void;
}

/**
 * Builds the plot map fully from a fresh, farm-scoped response:
 * the response's own id set IS the next authoritative plot membership. A
 * plot not present in `plots` is dropped, never carried forward from
 * whatever the store held before — this is what actually closes the
 * confirmed leak (removing the client-side seed alone is not
 * sufficient without this, since the old `mergeById` would have just as
 * happily let ANY stale id linger indefinitely).
 */
function buildPlotMap(plots: FarmPlotDefinition[]): Record<string, FarmPlotDefinition> {
  return Object.fromEntries(plots.map((plot) => [plot.id, plot]));
}

export const usePlotStore = create<PlotState>((set, get) => ({
  // Starts empty. Never seeded from `farmPlots` or any other
  // static/demo source; the authenticated farm's own API defines every plot
  // that will ever appear here.
  plots: {},
  hydration: "idle",
  hydrationError: null,

  fetchPlots: async () => {
    if (get().hydration === "loading" || get().hydration === "loaded") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/plots");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { plots: FarmPlotDefinition[] };
      // Authoritative replace: the fresh response's ids ARE the
      // next plot set, not an addition to whatever was already here. An
      // empty response correctly empties the store (the current farm has
      // zero plots), and a farm switch can never leave a foreign plot behind.
      set({ plots: buildPlotMap(body.plots), hydration: "loaded", hydrationError: null });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load plots." });
    }
  },

  hydrateFromServer: (plots) => {
    // Same authoritative replace as `fetchPlots`; this data is
    // just as fresh and farm-scoped, sourced from a Server Component's own
    // `listPlots(farm.id)` call, never from `farmPlots`.
    set({ plots: buildPlotMap(plots), hydration: "loaded", hydrationError: null });
  },
}));

export function usePlots(): FarmPlotDefinition[] {
  const plots = usePlotStore((state) => state.plots);
  return useMemo(() => Object.values(plots), [plots]);
}

export function usePlot(id: string | null): FarmPlotDefinition | null {
  return usePlotStore((state) => (id ? (state.plots[id] ?? null) : null));
}

/** Plain, non-reactive lookup for callers outside a React render (bridge functions, AURA action handlers) — mirrors `mission-integration.ts`'s own `.getState()` snapshot-read convention. */
export function getPlotById(id: string): FarmPlotDefinition | null {
  return usePlotStore.getState().plots[id] ?? null;
}
