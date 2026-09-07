"use client";

import { useMemo } from "react";
import { create } from "zustand";

import type { Route } from "@/components/digital-twin/scene/farm-data";

import { buildHomeShuttleRoute, buildMissionShuttleRoute, buildNewRobotRecord, distanceBetween } from "./robot-defaults";
import type { NewRobotInput, RobotRecord, RobotRenderConfig, RobotStatus, RobotTelemetryUpdate } from "./types";

/**
 * The Robot Store — the single source of truth for every
 * ground robot in AgriNexus, mirroring `lib/fleet/fleet-store.ts`'s
 * `order`/`records` split so any consumer that only needs "which robots
 * exist" (the Digital Twin's `Scene`) can skip re-rendering on every live
 * telemetry tick, exactly like the Fleet Store already does for drones.
 *
 * Ground robots deliberately do NOT reuse `lib/missions/mission-store.ts`
 * (explicitly DO-NOT-MODIFY this change). "Assign Mission" here is a
 * lightweight, self-contained concept — a label, an optional target plot,
 * and a two-point shuttle route — not the full flight-path/waypoint/
 * altitude planning system the drone planner has. A fuller Ground Robot
 * Mission Planner is a candidate for future work.
 *
 * Extended for backend persistence, mirroring
 * `fleet-store.ts`'s own extension exactly: `fetchRobots()` loads whatever's
 * durable in Postgres on mount (merge-by-id, never clobbering Robot Bravo's
 * already-seeded local record); `addRobot` is genuinely ASYNC (same
 * "discrete, rare, user-initiated action" reasoning). `removeRobot` is now
 * ALSO genuinely async and persisted (Ground Robots
 * previously had no delete action at all, unlike Drone's real `removeDrone`
 * button; fixed by adding the same real `DELETE /api/robots/:id` round-trip
 * `removeDrone` already does, not a second architecture). Live
 * telemetry actions (`updateRobotTelemetry`/`setRobotActiveRoute`/
 * `pauseRobot`/`resumeRobot`/`sendRobotHome`/`markArrivedHome`/
 * `setMaintenanceMode`/`assignMission`) are DELIBERATELY UNCHANGED — no
 * persistence, same "telemetry stays frontend-side" rule `fleet-store.ts`
 * documents.
 */
interface RobotState {
  order: string[];
  robots: Record<string, RobotRecord>;
  selectedRobotId: string | null;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
  /** Mirrors `FleetState.autonomousEnabled` exactly (see that field's own doc comment): the global ground-robot autonomous-behavior toggle, default OFF, reconciled by `lib/autonomous/autonomous-behavior.ts`. Persisted on `Farm.robotAutonomousEnabled` — no longer session-only. */
  autonomousEnabled: boolean;
  setAutonomousEnabled: (enabled: boolean) => void;

  addRobot: (input: NewRobotInput) => Promise<RobotRecord>;
  /**
   * Genuinely async and persisted (real `PATCH
   * /api/robots/:id` round-trip, backed by `updateRobot` in
   * `robots-service.ts`), mirroring `addRobot`'s own honesty: throws on
   * failure rather than optimistically applying the edit. When
   * `input.homePosition` differs from the robot's current one AND the robot
   * has no `activeMissionId`, this ALSO rebuilds `homePatrolRoute` and snaps
   * the live `route`/`position` onto the new home (bumping `routeVersion` so
   * `Scene` remounts the instance there) — the same route-rebuild mechanism
   * `sendRobotHome` already uses, applied here so the Digital Twin actually
   * renders the robot at its freshly edited position instead of only
   * updating a stored value nothing re-reads until the next home/patrol
   * cycle. A robot mid an active mission has its stored home position
   * updated but keeps flying its current route — never yanked off a mission
   * by an unrelated identity edit, same priority rule
   * `lib/autonomous/autonomous-behavior.ts`'s top-of-file note documents.
   */
  updateRobot: (id: string, input: NewRobotInput) => Promise<void>;
  /** Genuinely async and persisted; see the implementation's own doc comment. */
  removeRobot: (id: string) => Promise<void>;
  updateRobotTelemetry: (id: string, update: RobotTelemetryUpdate) => void;
  /**
   * The ONLY way `route` ever changes after creation — mirrors
   * `setDroneActiveRoute`, bumping `routeVersion` so `Scene` can key a clean
   * remount. `missionId`/`missionLabel`/`missionTargetPlotId` are optional
   * (an additive extension over the original shape): omitted entirely,
   * they leave the robot's existing mission linkage untouched (used by
   * `resumeRobot` below, which only changes route/status); passed
   * (including explicit `null` to clear them), they update the linkage —
   * used by the Robot Mission Store's `startMission`/`cancelMission`/
   * `completeMission` so a real Robot Mission Planner mission can occupy the
   * same `activeMissionId`/`currentMissionLabel`/`currentMissionTargetPlotId`
   * fields the lightweight `assignMission` action below already populates,
   * rather than inventing a second "current mission" concept.
   */
  setRobotActiveRoute: (
    id: string,
    route: Route,
    options: { status: RobotStatus; missionId?: string | null; missionLabel?: string | null; missionTargetPlotId?: string | null },
  ) => void;
  pauseRobot: (id: string) => void;
  resumeRobot: (id: string) => void;
  sendRobotHome: (id: string) => void;
  /** Called by the Robot Simulation ticker once `Date.now()` passes `returningEtaAt` — not meant to be invoked directly by UI/AURA. */
  markArrivedHome: (id: string) => void;
  setMaintenanceMode: (id: string, enabled: boolean) => void;
  assignMission: (id: string, input: { label: string; targetPlotId: string | null }) => void;
  selectRobot: (id: string | null) => void;
  fetchRobots: () => Promise<void>;
}

let missionIdSuffix = 0;
function generateRobotMissionId(): string {
  missionIdSuffix += 1;
  return `robot-mission-${missionIdSuffix}`;
}

let idSuffix = 0;
/** Same collision-avoidance reasoning `fleet-store.ts`'s `generateDroneId` documents — needed once these ids became shared, persistent Postgres primary keys. */
function generateRobotId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `${slug || "robot"}-${idSuffix}-${random}`;
}

export const useRobotStore = create<RobotState>((set, get) => {
  return {
    // Mirrors
    // `fleet-store.ts`'s own fix exactly: no hardcoded starter robot. This
    // store previously always began with a "Robot Bravo" seed regardless of
    // which farm (or whether anyone) was authenticated; combined with the
    // old additive-only `fetchRobots()` merge, that seed — and any robot
    // from a PREVIOUSLY authenticated farm in this same browser tab —
    // could survive into a different farm's session and leak into that
    // farm's AURA context (the finding). `fetchRobots()` below is
    // now the ONLY source of truth for what populates this store, for
    // every farm, including `farm_demo` (whose real "Robot Bravo" already
    // exists as its own persisted Postgres row and loads in normally on
    // first fetch).
    order: [],
    robots: {},
    selectedRobotId: null,
    hydration: "idle",
    hydrationError: null,
    autonomousEnabled: false,

    setAutonomousEnabled: (enabled) => set({ autonomousEnabled: enabled }),

    addRobot: async (input) => {
      const id = generateRobotId(input.name);

      const response = await fetch("/api/robots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...input }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to create robot (${response.status}).`);
      }

      const record = buildNewRobotRecord(id, input);
      set((state) => ({
        order: [...state.order, id],
        robots: { ...state.robots, [id]: record },
      }));

      return record;
    },

    updateRobot: async (id, input) => {
      const existing = get().robots[id];
      if (!existing) return;

      const response = await fetch(`/api/robots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to update robot (${response.status}).`);
      }

      set((state) => {
        const current = state.robots[id];
        if (!current) return state;

        const homeChanged = input.homePosition[0] !== current.homePosition[0] || input.homePosition[1] !== current.homePosition[1];
        const homePatrolRoute = homeChanged ? buildHomeShuttleRoute(id, input.homePosition) : current.homePatrolRoute;
        // Only snap the LIVE route/position onto the new home when the robot
        // isn't mid an active mission — see this action's own doc comment.
        const shouldSnap = homeChanged && current.activeMissionId === null;

        return {
          robots: {
            ...state.robots,
            [id]: {
              ...current,
              ...input,
              homePatrolRoute,
              route: shouldSnap ? homePatrolRoute : current.route,
              routeVersion: shouldSnap ? current.routeVersion + 1 : current.routeVersion,
              position: shouldSnap ? input.homePosition : current.position,
              lastActivityAt: Date.now(),
            },
          },
        };
      });
    },

    // Genuinely ASYNC and PERSISTED now, mirroring
    // `fleet-store.ts`'s `removeDrone` exactly: a real `DELETE
    // /api/robots/:id` call (backed by `deleteRobot` in `robots-service.ts`,
    // added this change) before the local record is dropped, so a deletion
    // survives a refresh instead of only ever removing the in-memory copy.
    // Throws on a non-404 failure (same as `removeDrone`) — the caller
    // decides how to surface that, never silently reports success.
    removeRobot: async (id) => {
      if (!(id in get().robots)) return;

      const response = await fetch(`/api/robots/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to delete robot (${response.status}).`);
      }

      set((state) => {
        const robots = { ...state.robots };
        delete robots[id];
        return {
          order: state.order.filter((existingId) => existingId !== id),
          robots,
          selectedRobotId: state.selectedRobotId === id ? null : state.selectedRobotId,
        };
      });
    },

    updateRobotTelemetry: (id, update) => {
      set((state) => {
        const existing = state.robots[id];
        if (!existing) return state;
        return { robots: { ...state.robots, [id]: { ...existing, ...update, lastActivityAt: Date.now() } } };
      });
    },

    setRobotActiveRoute: (id, route, options) => {
      set((state) => {
        const existing = state.robots[id];
        if (!existing) return state;
        return {
          robots: {
            ...state.robots,
            [id]: {
              ...existing,
              route,
              routeVersion: existing.routeVersion + 1,
              status: options.status,
              activeMissionId: options.missionId !== undefined ? options.missionId : existing.activeMissionId,
              currentMissionLabel: options.missionLabel !== undefined ? options.missionLabel : existing.currentMissionLabel,
              currentMissionTargetPlotId:
                options.missionTargetPlotId !== undefined ? options.missionTargetPlotId : existing.currentMissionTargetPlotId,
              lastActivityAt: Date.now(),
            },
          },
        };
      });
    },

    pauseRobot: (id) => {
      const robot = get().robots[id];
      if (!robot) return;
      if (!["active", "on-mission", "returning"].includes(robot.status)) return;
      set((state) => ({ robots: { ...state.robots, [id]: { ...robot, status: "paused", lastActivityAt: Date.now() } } }));
    },

    resumeRobot: (id) => {
      const robot = get().robots[id];
      if (!robot) return;
      const nextStatus: RobotStatus = robot.activeMissionId ? "on-mission" : "active";

      if (robot.status === "paused") {
        set((state) => ({ robots: { ...state.robots, [id]: { ...robot, status: nextStatus, lastActivityAt: Date.now() } } }));
        return;
      }
      if (robot.status === "charging" || robot.status === "idle") {
        const route = robot.activeMissionId
          ? buildMissionShuttleRoute(id, robot.homePosition, robot.currentMissionTargetPlotId)
          : robot.homePatrolRoute;
        get().setRobotActiveRoute(id, route, { status: nextStatus });
      }
    },

    sendRobotHome: (id) => {
      const robot = get().robots[id];
      if (!robot) return;
      const travelSeconds = Math.max(3, distanceBetween(robot.position, robot.homePosition) / Math.max(0.1, robot.maxSpeedMps));
      const route = buildHomeShuttleRoute(id, robot.homePosition);

      set((state) => {
        const existing = state.robots[id];
        if (!existing) return state;
        return {
          robots: {
            ...state.robots,
            [id]: {
              ...existing,
              route,
              routeVersion: existing.routeVersion + 1,
              status: "returning",
              returningEtaAt: Date.now() + travelSeconds * 1000,
              activeMissionId: null,
              currentMissionLabel: null,
              currentMissionTargetPlotId: null,
              lastActivityAt: Date.now(),
            },
          },
        };
      });
    },

    markArrivedHome: (id) => {
      set((state) => {
        const existing = state.robots[id];
        if (!existing || existing.status !== "returning") return state;
        return { robots: { ...state.robots, [id]: { ...existing, status: "charging", returningEtaAt: null } } };
      });
    },

    setMaintenanceMode: (id, enabled) => {
      set((state) => {
        const existing = state.robots[id];
        if (!existing) return state;
        return {
          robots: {
            ...state.robots,
            [id]: { ...existing, status: enabled ? "maintenance" : "idle", lastActivityAt: Date.now() },
          },
        };
      });
    },

    assignMission: (id, { label, targetPlotId }) => {
      const robot = get().robots[id];
      if (!robot) return;
      const missionId = generateRobotMissionId();
      const route = buildMissionShuttleRoute(id, robot.homePosition, targetPlotId);

      set((state) => {
        const existing = state.robots[id];
        if (!existing) return state;
        return {
          robots: {
            ...state.robots,
            [id]: {
              ...existing,
              route,
              routeVersion: existing.routeVersion + 1,
              status: "on-mission",
              activeMissionId: missionId,
              currentMissionLabel: label,
              currentMissionTargetPlotId: targetPlotId,
              lastActivityAt: Date.now(),
            },
          },
        };
      });
    },

    selectRobot: (id) => set({ selectedRobotId: id }),

    fetchRobots: async () => {
      if (get().hydration === "loading") return;
      set({ hydration: "loading", hydrationError: null });

      try {
        const response = await fetch("/api/robots");
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${response.status}).`);
        }
        const body = (await response.json()) as { robots: ({ id: string } & NewRobotInput)[] };

        set((state) => {
          // Mirrors `fleet-store.ts`'s `fetchDrones` fix exactly:
          // this farm's own `/api/robots` response is now the COMPLETE,
          // AUTHORITATIVE set of robots for this session. The reconciled
          // state below contains ONLY ids present in `body.robots` — an id
          // that used to be in `state.robots` but is NOT in this response
          // (a different farm's robot from a previous session in this same
          // tab, or a deleted robot) is dropped, never carried forward. An
          // additive merge could never remove a stale/foreign entry; only a
          // full rebuild from the fresh list can — this is the actual fix
          // for the cross-farm leak. Already-known ids still keep
          // their live/telemetry fields untouched (an earlier fix,
          // preserved below) — this only changes WHICH ids
          // survive into the next state, never how an id's own fields are
          // merged.
          const nextRobots: Record<string, RobotRecord> = {};
          const nextOrder: string[] = [];
          for (const identity of body.robots) {
            const existing = state.robots[identity.id];
            if (existing) {
              // If the persisted home position changed, the patrol route is
              // rebuilt and the robot snapped onto it.
              const homeChanged =
                identity.homePosition[0] !== existing.homePosition[0] || identity.homePosition[1] !== existing.homePosition[1];
              const homePatrolRoute = homeChanged ? buildHomeShuttleRoute(identity.id, identity.homePosition) : existing.homePatrolRoute;
              nextRobots[identity.id] = {
                ...existing,
                ...identity,
                homePatrolRoute,
                route: homeChanged ? homePatrolRoute : existing.route,
                routeVersion: homeChanged ? existing.routeVersion + 1 : existing.routeVersion,
                position: homeChanged ? identity.homePosition : existing.position,
              };
            } else {
              nextRobots[identity.id] = buildNewRobotRecord(identity.id, identity);
            }
            nextOrder.push(identity.id);
          }
          // A previously-selected robot that didn't survive reconciliation
          // (e.g. it belonged to a different farm's now-superseded local
          // state) must not leave a dangling `selectedRobotId` — mirrors
          // `removeRobot`'s own clearing behavior above.
          const selectedRobotId = state.selectedRobotId && nextRobots[state.selectedRobotId] ? state.selectedRobotId : null;
          return { robots: nextRobots, order: nextOrder, selectedRobotId, hydration: "loaded", hydrationError: null };
        });
      } catch (error) {
        set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load robots." });
      }
    },
  };
});

/** The stable id list — safe for components that must not rerender on telemetry ticks (only changes on add/remove). Mirrors `useFleetOrder`. */
export function useRobotOrder(): string[] {
  return useRobotStore((state) => state.order);
}

/** Mirrors `useFleetRouteVersions` — a cheap, stable string that changes only when some robot's `routeVersion` (or the id list) changes, never on an ordinary telemetry tick. */
export function useRobotRouteVersions(): string {
  return useRobotStore((state) => state.order.map((id) => `${id}:${state.robots[id]?.routeVersion ?? 0}`).join("|"));
}

/**
 * The Digital Twin's per-robot render config — mirrors
 * `useFleetDroneRenderConfigs`. Recomputed only when the id list changes or
 * some robot's routeVersion changes, by reading the current snapshot via
 * `getState()` rather than subscribing to the volatile `robots` map.
 */
export function useRobotRenderConfigs(): RobotRenderConfig[] {
  const order = useRobotOrder();
  const routeVersions = useRobotRouteVersions();

  return useMemo(
    () =>
      order.map((id): RobotRenderConfig => {
        const robot = useRobotStore.getState().robots[id];
        return {
          id,
          label: robot?.name ?? id,
          route: robot?.route ?? { id: `${id}-route`, label: "Route", waypoints: [], loop: true },
          routeVersion: robot?.routeVersion ?? 0,
          speedMps: robot?.speedMps ?? 0,
          color: robot?.color ?? "#f6ad55",
          status: robot?.status ?? "idle",
          batteryPercent: robot?.batteryPercent ?? 0,
        };
      }),
    // `routeVersions` isn't read inside the callback — it's a recompute
    // trigger only, same documented pattern `useFleetDroneRenderConfigs` uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, routeVersions],
  );
}

/** All robot records, live telemetry included — for the Ground Robots page, Mission Control widgets, and AURA's context (not render-sensitive). Mirrors `useFleetDrones`. */
export function useRobots(): RobotRecord[] {
  const order = useRobotOrder();
  const robots = useRobotStore((state) => state.robots);
  return useMemo(() => order.map((id) => robots[id]).filter((robot): robot is RobotRecord => Boolean(robot)), [order, robots]);
}

export function useSelectedRobot(): RobotRecord | null {
  return useRobotStore((state) => (state.selectedRobotId ? (state.robots[state.selectedRobotId] ?? null) : null));
}

/** Read-only hydration status for the Ground Robots page's loading/error UI (mirrors `useFleetHydration`). */
export function useRobotHydration(): { status: RobotState["hydration"]; error: string | null } {
  const status = useRobotStore((state) => state.hydration);
  const error = useRobotStore((state) => state.hydrationError);
  return { status, error };
}

/** The global robot autonomous-behavior toggle — see `RobotState.autonomousEnabled`'s own doc comment. */
export function useRobotAutonomousEnabled(): boolean {
  return useRobotStore((state) => state.autonomousEnabled);
}
