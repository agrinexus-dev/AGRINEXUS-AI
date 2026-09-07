"use client";

import { useMemo } from "react";
import { create } from "zustand";

import type { Route } from "@/components/digital-twin/scene/farm-data";

import { buildDefaultRoute, buildNewDroneRecord } from "./fleet-defaults";
import type { DroneRecord, DroneRenderConfig, DroneStatus, DroneTelemetryUpdate, NewDroneInput } from "./types";

/**
 * The Fleet Store — the single source of truth for every
 * drone in AgriNexus. Every consumer (Digital Twin, AURA, the Drone Fleet
 * page, and later Mission Planner/Analytics/Reports) reads from
 * here; nothing keeps its own copy of drone state.
 *
 * `order` (an id array) and `drones` (an id → record map) are kept as
 * separate top-level fields deliberately, mirroring the same pattern the
 * Adaptive Workspace Engine already uses (`lib/workspace/workspace-context.tsx`):
 * `order` only changes on add/remove, so a component that only needs "which
 * drones exist" (the Digital Twin's `Scene`) can select just `order` and
 * skip re-rendering on every live-telemetry tick to `drones`.
 *
 * Extended for backend persistence, mirroring the exact
 * pattern `sensor-store.ts` established:
 *  - `fetchDrones()` loads whatever's durable in Postgres on mount
 *  (merge-by-id, never clobbering Drone Alpha's already-seeded local
 *  record or any other already-known drone).
 *  - `addDrone`/`removeDrone` are genuinely ASYNC — same "discrete, rare,
 *  user-initiated action, not a simulation tick" reasoning
 *  `sensor-store.ts`'s own doc comment gives: awaiting the real API
 *  before committing local state is what lets this store honestly avoid
 *  fabricating a successful add/remove if the API fails.
 *  - `updateDroneTelemetry`/`setDroneActiveRoute` are DELIBERATELY
 *  UNCHANGED — no persistence at all. Live telemetry/route state is not
 *  part of the Drone backend model (see schema.prisma's own doc comment)
 *  and is never written to Postgres — by design, telemetry ticks stay
 *  frontend-side and never migrate into the database.
 */
interface FleetState {
  order: string[];
  drones: Record<string, DroneRecord>;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
  /**
   * The global drone autonomous-behavior toggle
   * (default OFF: a drone with no mission stays home/idle).
   * When ON, a drone with no active mission AND not claimed by an enabled
   * recurring schedule is free to fly the perimeter patrol
   * loop again — see `lib/autonomous/autonomous-behavior.ts`, the one
   * place that actually reads this flag and reconciles drone routes/
   * status against it. Defaults to `false` here, matching a fresh farm's
   * real persisted default; the durable value now lives on
   * `Farm.droneAutonomousEnabled` (this was previously session-only
   * Zustand state that reset to OFF on every refresh, which
   * the product now requires not to happen) and is loaded into this flag by
   * `autonomous-behavior.ts`'s `fetchAutonomousState()`. Never set this
   * flag directly outside that file — use `setDroneAutonomousEnabled` so
   * the new value is also persisted.
   */
  autonomousEnabled: boolean;
  setAutonomousEnabled: (enabled: boolean) => void;
  addDrone: (input: NewDroneInput) => Promise<DroneRecord>;
  /**
   * Genuinely async and persisted (real `PATCH
   * /api/drones/:id` round-trip, backed by `updateDrone` in
   * `drones-service.ts`), mirroring `addDrone`'s own honesty and
   * `robot-store.ts`'s `updateRobot` exactly, including its route-snap
   * behavior: when `input.homeLocation` differs from the drone's current one
   * AND the drone has no `activeMissionId`, this rebuilds `homePatrolRoute`
   * and snaps the live `route`/`position` onto the new home (bumping
   * `routeVersion` so `Scene` remounts the instance there), so the Digital
   * Twin actually renders the drone at its freshly edited position. A drone
   * mid an active mission keeps flying its current route.
   */
  updateDrone: (id: string, input: NewDroneInput) => Promise<void>;
  removeDrone: (id: string) => Promise<void>;
  updateDroneTelemetry: (id: string, update: DroneTelemetryUpdate) => void;
  /**
   * Reassigns which route a drone is actively flying — the
   * ONLY way `route` ever changes after creation. Used by the Mission
   * Simulation ticker to divert a drone onto a generated flight path
   * (`missionId` set) and later hand it back to `homePatrolRoute`
   * (`missionId: null`). Bumps `routeVersion` so `Scene` can key a clean
   * remount of the affected `<Drone>` instance — see `DroneRecord.routeVersion`.
   */
  setDroneActiveRoute: (id: string, route: Route, options: { status: DroneStatus; missionId: string | null }) => void;
  fetchDrones: () => Promise<void>;
}

let idSuffix = 0;
/** The trailing random component (mirrors `generateMissionId`'s own doc comment) is there because drone ids are shared, persistent Postgres primary keys: two different sessions both adding their first "Drone Echo" would otherwise generate the identical id "drone-echo-1" (discovered via real testing: a second session's `POST /api/drones` returned 500 on a primary-key collision). */
function generateDroneId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `${slug || "drone"}-${idSuffix}-${random}`;
}

export const useFleetStore = create<FleetState>((set, get) => {
  return {
    // No hardcoded starter drone. This store previously always began with a
    // "Drone Alpha" seed regardless of which farm (or whether anyone) was
    // authenticated; combined with `fetchDrones()`'s old additive-only
    // merge, that seed — and any drone from a PREVIOUSLY authenticated
    // farm in this same browser tab — could survive into a different
    // farm's session and leak into that farm's AURA context. The correct
    // empty starting state is "no authenticated farm → no farm devices";
    // `fetchDrones()` below is now the ONLY source of truth for what
    // populates this store, for every farm, including `farm_demo` (whose
    // real "Drone Alpha" already exists as its own persisted Postgres row
    // and loads in normally on first fetch — no client-side duplicate of
    // it is needed anymore).
    order: [],
    drones: {},
    hydration: "idle",
    hydrationError: null,
    autonomousEnabled: false,

    setAutonomousEnabled: (enabled) => set({ autonomousEnabled: enabled }),

    addDrone: async (input) => {
      const id = generateDroneId(input.name);

      const response = await fetch("/api/drones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...input }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to create drone (${response.status}).`);
      }

      const record = buildNewDroneRecord(id, input);
      set((state) => ({
        order: [...state.order, id],
        drones: { ...state.drones, [id]: record },
      }));

      return record;
    },

    updateDrone: async (id, input) => {
      const existing = get().drones[id];
      if (!existing) return;

      const response = await fetch(`/api/drones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to update drone (${response.status}).`);
      }

      set((state) => {
        const current = state.drones[id];
        if (!current) return state;

        const homeChanged = input.homeLocation[0] !== current.homeLocation[0] || input.homeLocation[1] !== current.homeLocation[1];
        const homePatrolRoute = homeChanged ? buildDefaultRoute(id, input.homeLocation) : current.homePatrolRoute;
        // Only snap the LIVE route/position onto the new home when the drone
        // isn't mid an active mission — see this action's own doc comment.
        const shouldSnap = homeChanged && current.activeMissionId === null;

        return {
          drones: {
            ...state.drones,
            [id]: {
              ...current,
              ...input,
              homePatrolRoute,
              route: shouldSnap ? homePatrolRoute : current.route,
              routeVersion: shouldSnap ? current.routeVersion + 1 : current.routeVersion,
              position: shouldSnap ? input.homeLocation : current.position,
            },
          },
        };
      });
    },

    removeDrone: async (id) => {
      if (!(id in get().drones)) return;

      const response = await fetch(`/api/drones/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to delete drone (${response.status}).`);
      }

      set((state) => {
        const drones = { ...state.drones };
        delete drones[id];
        return { order: state.order.filter((existingId) => existingId !== id), drones };
      });
    },

    updateDroneTelemetry: (id, update) => {
      set((state) => {
        const existing = state.drones[id];
        if (!existing) return state;
        return { drones: { ...state.drones, [id]: { ...existing, ...update } } };
      });
    },

    setDroneActiveRoute: (id, route, { status, missionId }) => {
      set((state) => {
        const existing = state.drones[id];
        if (!existing) return state;
        return {
          drones: {
            ...state.drones,
            [id]: { ...existing, route, routeVersion: existing.routeVersion + 1, status, activeMissionId: missionId },
          },
        };
      });
    },

    fetchDrones: async () => {
      if (get().hydration === "loading") return;
      set({ hydration: "loading", hydrationError: null });

      try {
        const response = await fetch("/api/drones");
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${response.status}).`);
        }
        const body = (await response.json()) as { drones: ({ id: string } & NewDroneInput)[] };
        const identities = body.drones;

        set((state) => {
          // This farm's own `/api/drones` response is now the
          // COMPLETE, AUTHORITATIVE set of drones for this session: the
          // reconciled state below contains ONLY ids present in
          // `identities`. An id that used to be in `state.drones` but is
          // NOT in this response — because it belongs to a different farm
          // that a previous session in this tab authenticated as, or
          // because it was deleted — is dropped here, never carried
          // forward. This is the actual fix for the cross-farm
          // leak: an additive merge (`{...state.drones,...fresh }`) could
          // never remove a stale/foreign entry; only a full rebuild from
          // the fresh list can. Already-known ids still keep their
          // live/telemetry fields untouched (an earlier
          // fix, preserved below) — this only changes WHICH ids survive
          // into the next state, never how an id's own fields are merged.
          const nextDrones: Record<string, DroneRecord> = {};
          const nextOrder: string[] = [];
          for (const identity of identities) {
            const existing = state.drones[identity.id];
            if (existing) {
              // If the home location changed, the patrol route is rebuilt
              // and the drone snapped onto it.
              const homeChanged =
                identity.homeLocation[0] !== existing.homeLocation[0] || identity.homeLocation[1] !== existing.homeLocation[1];
              const homePatrolRoute = homeChanged ? buildDefaultRoute(identity.id, identity.homeLocation) : existing.homePatrolRoute;
              nextDrones[identity.id] = {
                ...existing,
                ...identity,
                homePatrolRoute,
                route: homeChanged ? homePatrolRoute : existing.route,
                routeVersion: homeChanged ? existing.routeVersion + 1 : existing.routeVersion,
                position: homeChanged ? identity.homeLocation : existing.position,
              };
            } else {
              nextDrones[identity.id] = buildNewDroneRecord(identity.id, identity);
            }
            nextOrder.push(identity.id);
          }
          return { drones: nextDrones, order: nextOrder, hydration: "loaded", hydrationError: null };
        });
      } catch (error) {
        set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load drones." });
      }
    },
  };
});

/** The stable id list — safe for components that must not rerender on telemetry ticks (only changes on add/remove). */
export function useFleetOrder(): string[] {
  return useFleetStore((state) => state.order);
}

/**
 * A cheap, stable string that changes if and only if some drone's
 * `routeVersion` (or the id list) changes — i.e. on a mission divert/restore,
 * never on an ordinary telemetry tick. Zustand compares
 * selector output with `Object.is`, which for primitive strings is
 * value-equality, so returning a freshly-joined-but-equal string here still
 * skips a rerender. Exists so `useFleetDroneRenderConfigs` below can pick up
 * a route swap without going back to subscribing to the volatile `drones`
 * map wholesale (which would defeat's original goal).
 */
export function useFleetRouteVersions(): string {
  return useFleetStore((state) => state.order.map((id) => `${id}:${state.drones[id]?.routeVersion ?? 0}`).join("|"));
}

/**
 * The Digital Twin's per-drone render config (id/label/route/altitude/
 * speed/starting battery) — the immutable-after-creation subset of each
 * record, EXCEPT `route`/`routeVersion`, which the Mission
 * Simulation may reassign (see `setDroneActiveRoute`). Recomputed only when
 * the id list changes OR some drone's routeVersion changes — not on live
 * telemetry — by reading the current snapshot via `getState()` rather than
 * subscribing to the volatile `drones` map.
 */
export function useFleetDroneRenderConfigs(): DroneRenderConfig[] {
  const order = useFleetOrder();
  const routeVersions = useFleetRouteVersions();

  return useMemo(
    () =>
      order.map((id): DroneRenderConfig => {
        const drone = useFleetStore.getState().drones[id];
        return {
          id,
          label: drone?.name ?? id,
          route: drone?.route ?? { id: `${id}-route`, label: "Route", waypoints: [], loop: true },
          routeVersion: drone?.routeVersion ?? 0,
          altitude: drone?.altitude ?? 0,
          speedMps: drone?.speedMps ?? 0,
          batteryPercent: drone?.batteryPercent ?? 0,
        };
      }),
    // `routeVersions` isn't read inside the callback (it reads `route` via
    // `getState()`, not through this variable) — it's included purely as a
    // recompute trigger, so the mission-route-swap case above actually picks
    // up the new route instead of only recomputing on add/remove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, routeVersions],
  );
}

/** All drone records, live telemetry included — for the Drone Fleet page, AURA's context, and anything else that needs the full picture (not render-sensitive). */
export function useFleetDrones(): DroneRecord[] {
  const order = useFleetOrder();
  const drones = useFleetStore((state) => state.drones);
  return useMemo(() => order.map((id) => drones[id]).filter((drone): drone is DroneRecord => Boolean(drone)), [order, drones]);
}

/** Read-only hydration status for the Drone Fleet page's loading/error UI (mirrors `useSensorHydration`). */
export function useFleetHydration(): { status: FleetState["hydration"]; error: string | null } {
  const status = useFleetStore((state) => state.hydration);
  const error = useFleetStore((state) => state.hydrationError);
  return { status, error };
}

/** The global drone autonomous-behavior toggle — see `FleetState.autonomousEnabled`'s own doc comment. */
export function useDroneAutonomousEnabled(): boolean {
  return useFleetStore((state) => state.autonomousEnabled);
}
