"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";

import type { Route } from "@/components/digital-twin/scene/farm-data";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";

import type { NewRecurringMissionInput, RecurringMissionConfig } from "./types";

/**
 * The Recurring Mission Store — a thin SCHEDULING layer on
 * top of the EXISTING Mission/Robot Mission Stores, not a parallel mission
 * system: `spawnRun` below calls the exact same `createMission`/
 * `assignDrone`/`generatePath`/`startMission` (or robot equivalents) every
 * manual mission already goes through. This store only remembers the
 * SCHEDULE (interval, next run time, which run — if any — is currently
 * active) and, once a second, decides whether it's time to spawn the next
 * real run or reclaim a completed vehicle.
 *
 * Deliberately a dedicated small table/store rather than bolting 4+
 * recurrence columns onto BOTH Mission and RobotMission (see
 * `schema.prisma`'s `RecurringMissionConfig` doc comment for the full
 * reasoning) — every ACTUAL run this spawns is still a completely normal
 * DroneMission/RobotMission row, indistinguishable from a manually created
 * one except for its `recurringConfigId` back-link.
 */
interface RecurringMissionState {
  order: string[];
  configs: Record<string, RecurringMissionConfig>;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;

  createRecurringMission: (input: NewRecurringMissionInput) => RecurringMissionConfig;
  setEnabled: (id: string, enabled: boolean) => void;
  updateInterval: (id: string, intervalMinutes: number) => void;
  deleteRecurringMission: (id: string) => void;
  fetchRecurringMissions: () => Promise<void>;
}

let idSuffix = 0;
function generateConfigId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `recurring-${slug || "mission"}-${idSuffix}-${random}`;
}

function persistCreate(config: RecurringMissionConfig): void {
  fetch("/api/recurring-missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }).catch(() => {
    // Best-effort — mirrors every other store's `persistCreate` in this app.
  });
}

function persistPatch(id: string, patch: Partial<Pick<RecurringMissionConfig, "enabled" | "intervalMinutes" | "nextRunAt" | "activeRunId">>): void {
  fetch(`/api/recurring-missions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

function persistDelete(id: string): void {
  fetch(`/api/recurring-missions/${id}`, { method: "DELETE" }).catch(() => {});
}

export const useRecurringMissionStore = create<RecurringMissionState>((set, get) => ({
  order: [],
  configs: {},
  hydration: "idle",
  hydrationError: null,

  createRecurringMission: (input) => {
    const id = generateConfigId(input.name);
    const config: RecurringMissionConfig = {
      id,
      name: input.name,
      vehicleKind: input.vehicleKind,
      droneMissionType: input.vehicleKind === "drone" ? (input.droneMissionType ?? null) : null,
      robotMissionType: input.vehicleKind === "robot" ? (input.robotMissionType ?? null) : null,
      targetPlotId: input.targetPlotId,
      assignedDroneId: input.vehicleKind === "drone" ? (input.assignedDroneId ?? null) : null,
      assignedRobotId: input.vehicleKind === "robot" ? (input.assignedRobotId ?? null) : null,
      intervalMinutes: input.intervalMinutes,
      enabled: true,
      // Fires on the very next scheduler tick — a newly created recurring
      // mission runs its first execution immediately rather than waiting a
      // full interval, matching "Scan Plot A every 10 minutes" reading as
      // "starting now."
      nextRunAt: Date.now(),
      activeRunId: null,
      createdAt: Date.now(),
    };

    set((state) => ({ order: [...state.order, id], configs: { ...state.configs, [id]: config } }));
    persistCreate(config);
    return config;
  },

  setEnabled: (id, enabled) => {
    let patch: Partial<Pick<RecurringMissionConfig, "enabled" | "nextRunAt">> | null = null;
    set((state) => {
      const config = state.configs[id];
      if (!config) return state;
      // Re-enabling with no active run schedules an immediate next run
      // (same "starts now" reasoning as creation); disabling never touches
      // `activeRunId` — an already-in-flight run finishes normally either
      // way, it just won't be followed by another.
      const nextRunAt = enabled && !config.activeRunId ? Date.now() : config.nextRunAt;
      patch = { enabled, nextRunAt };
      return { configs: { ...state.configs, [id]: { ...config, ...patch } } };
    });
    if (patch) persistPatch(id, patch);
  },

  updateInterval: (id, intervalMinutes) => {
    set((state) => {
      const config = state.configs[id];
      if (!config) return state;
      return { configs: { ...state.configs, [id]: { ...config, intervalMinutes } } };
    });
    persistPatch(id, { intervalMinutes });
  },

  deleteRecurringMission: (id) => {
    set((state) => {
      const configs = { ...state.configs };
      delete configs[id];
      return { order: state.order.filter((existingId) => existingId !== id), configs };
    });
    persistDelete(id);
  },

  fetchRecurringMissions: async () => {
    if (get().hydration === "loading") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/recurring-missions");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { recurringMissions: RecurringMissionConfig[] };

      // Authoritative replace: the fresh farm-scoped response's
      // ids ARE the complete next schedule set, never an addition to
      // whatever was already here (closes the
      // additive-only reconciliation risk — `if (nextConfigs[config.id])
      // continue` used to mean a schedule from a previous farm/session could
      // never be removed). Every field on `RecurringMissionConfig`
      // (`enabled`, `intervalMinutes`, `nextRunAt`, `activeRunId`) is already
      // persisted at the moment any action or the scheduler's own `tick()`
      // below changes it (see the `persistPatch` call right alongside every
      // `setState` in this file), so the fresh record is always adopted
      // wholesale for a surviving id — same simple case `plot-store.ts`
      // already established, not the mission-style per-field split (this
      // store keeps no separate, never-persisted per-tick field the way a
      // mission's live progress is).
      const nextConfigs: Record<string, RecurringMissionConfig> = {};
      const nextOrder: string[] = [];
      for (const config of body.recurringMissions) {
        nextConfigs[config.id] = config;
        nextOrder.push(config.id);
      }
      set({ configs: nextConfigs, order: nextOrder, hydration: "loaded", hydrationError: null });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load recurring missions." });
    }
  },
}));

export function useRecurringMissionOrder(): string[] {
  return useRecurringMissionStore((state) => state.order);
}

export function useRecurringMissions(): RecurringMissionConfig[] {
  const order = useRecurringMissionOrder();
  const configs = useRecurringMissionStore((state) => state.configs);
  return useMemo(() => order.map((id) => configs[id]).filter((config): config is RecurringMissionConfig => Boolean(config)), [order, configs]);
}

/** Every recurring config targeting this drone/robot mission id as its currently-active run, if any — 0 or 1 in practice (a vehicle backs at most one schedule), used by the Mission Inspectors to show "this run was spawned by a recurring schedule." */
export function useRecurringMissionForRun(missionId: string | null): RecurringMissionConfig | null {
  const all = useRecurringMissions();
  return useMemo(() => (missionId ? (all.find((config) => config.activeRunId === missionId) ?? null) : null), [all, missionId]);
}

/**
 * `true` if this vehicle currently belongs to an ENABLED
 * recurring schedule, whether it's mid-run or resting at its charging
 * station between runs. A plain `.getState()` snapshot read (no
 * subscription), meant for `lib/autonomous/autonomous-behavior.ts`'s
 * reconciliation sweep: "Do not allow autonomous movement to interfere
 * with recurring missions" means a recurring-claimed vehicle must never be
 * handed to autonomous patrol, even while it's just resting between runs.
 * A DISABLED config makes no claim — deleting/pausing a schedule frees its
 * vehicle for autonomous behavior again, same as if it were never
 * assigned.
 */
export function isVehicleClaimedByEnabledRecurring(vehicleKind: "drone" | "robot", vehicleId: string): boolean {
  const { order, configs } = useRecurringMissionStore.getState();
  return order.some((id) => {
    const config = configs[id];
    if (!config || !config.enabled) return false;
    return vehicleKind === "drone" ? config.assignedDroneId === vehicleId : config.assignedRobotId === vehicleId;
  });
}

// ============================================================================
// The scheduler — the ONLY place that actually spawns/reclaims a run.
// ============================================================================

const TICK_MS = 1000;

/** Builds a stationary single-waypoint Route at `position` — "rest at the charging station" is just this handed to `setDroneActiveRoute`/`setRobotActiveRoute` with `status: "charging"`, reusing the exact Route/Waypoint shape every idle vehicle's home route already uses (see `fleet-defaults.ts`/`robot-defaults.ts`), never a new position system. */
function chargingRoute(vehicleId: string, position: [number, number]): Route {
  return {
    id: `${vehicleId}-charging-route`,
    label: "Charging Station",
    waypoints: [{ id: `${vehicleId}-charging-wp`, label: "Charging Station", position }],
    loop: true,
  };
}

/**
 * Part 11 — a recurring-managed vehicle rests at its charging station
 * between runs, with `status: "charging"` specifically (distinct from the
 * plain `"idle"` an ordinary one-off mission's drone/robot returns to via
 * `restoreDroneIfFlyingMission`/`restoreRobotIfOnMission`)
 * — both are equally stationary, "charging" just keeps this vehicle
 * visually identifiable as "on a recurring schedule, waiting for its next
 * run" rather than merely idle.
 */
function restVehicleAtChargingStation(config: RecurringMissionConfig): void {
  if (config.vehicleKind === "drone" && config.assignedDroneId) {
    const drone = useFleetStore.getState().drones[config.assignedDroneId];
    if (!drone) return;
    useFleetStore.getState().setDroneActiveRoute(drone.id, chargingRoute(drone.id, drone.homeLocation), { status: "charging", missionId: null });
  } else if (config.vehicleKind === "robot" && config.assignedRobotId) {
    const robot = useRobotStore.getState().robots[config.assignedRobotId];
    if (!robot) return;
    useRobotStore.getState().setRobotActiveRoute(robot.id, chargingRoute(robot.id, robot.homePosition), {
      status: "charging",
      missionId: null,
      missionLabel: null,
      missionTargetPlotId: null,
    });
  }
}

/** Spawns exactly one real, distinct mission run via the EXISTING create→assign→generate→start pipeline (Part 9's "Run 1 → mission ID A, Run 2 → mission ID B" — every call here is a brand new mission id, nothing is ever overwritten). Returns the new mission's id, or `null` if any step failed (e.g. the vehicle can't reach the target plot) — the caller retries on a later tick rather than leaving the schedule permanently stuck. */
function spawnRun(config: RecurringMissionConfig): string | null {
  if (config.vehicleKind === "drone") {
    if (!config.assignedDroneId || !config.droneMissionType) return null;
    const missionStore = useMissionStore.getState();
    const mission = missionStore.createMission({ name: config.name, missionType: config.droneMissionType, targetPlotId: config.targetPlotId, recurringConfigId: config.id });
    missionStore.assignDrone(mission.id, config.assignedDroneId);
    if (!useMissionStore.getState().generatePath(mission.id)) {
      useMissionStore.getState().deleteMission(mission.id);
      return null;
    }
    if (!useMissionStore.getState().startMission(mission.id)) {
      useMissionStore.getState().deleteMission(mission.id);
      return null;
    }
    return mission.id;
  }

  if (!config.assignedRobotId || !config.robotMissionType) return null;
  const robotMissionStore = useRobotMissionStore.getState();
  const mission = robotMissionStore.createMission({ name: config.name, missionType: config.robotMissionType, targetPlotId: config.targetPlotId, recurringConfigId: config.id });
  robotMissionStore.assignRobot(mission.id, config.assignedRobotId);
  if (!useRobotMissionStore.getState().generateRoute(mission.id)) {
    useRobotMissionStore.getState().deleteMission(mission.id);
    return null;
  }
  if (!useRobotMissionStore.getState().startMission(mission.id)) {
    useRobotMissionStore.getState().deleteMission(mission.id);
    return null;
  }
  return mission.id;
}

/** `true` once the run this config is tracking has left the "in flight" set — completed OR cancelled OR (edge case) no longer exists — any of which frees the schedule for its next run. */
function runHasEnded(config: RecurringMissionConfig): boolean {
  const status =
    config.vehicleKind === "drone"
      ? useMissionStore.getState().missions[config.activeRunId ?? ""]?.status
      : useRobotMissionStore.getState().missions[config.activeRunId ?? ""]?.status;
  return status === undefined || status === "completed" || status === "cancelled";
}

/** `true` if the assigned vehicle is already mid-mission for a DIFFERENT reason (manually assigned elsewhere) — the scheduler waits rather than double-booking it (Part 12). */
function vehicleIsBusy(config: RecurringMissionConfig): boolean {
  if (config.vehicleKind === "drone") {
    const drone = config.assignedDroneId ? useFleetStore.getState().drones[config.assignedDroneId] : null;
    return Boolean(drone?.activeMissionId);
  }
  const robot = config.assignedRobotId ? useRobotStore.getState().robots[config.assignedRobotId] : null;
  return Boolean(robot?.activeMissionId);
}

const RETRY_DELAY_MS = 30_000;

/**
 * Advances every enabled recurring schedule once a second — mirrors
 * `useMissionSimulation`/`useRobotMissionSimulation`'s exact "runs only
 * while a page that needs it is mounted" lifecycle. This is the ONLY place
 * `activeRunId`/`nextRunAt` ever change after creation (Part 12's overlap
 * guard lives entirely in this one function: a config with a non-null
 * `activeRunId` never reaches the spawn branch below, no matter how many
 * ticks fire while that run is active).
 */
export function useRecurringMissionScheduler(): void {
  useEffect(() => {
    function tick() {
      const { order, configs } = useRecurringMissionStore.getState();
      const now = Date.now();

      for (const id of order) {
        const config = configs[id];
        if (!config) continue;

        if (config.activeRunId) {
          if (!runHasEnded(config)) continue; // still flying — nothing to do this tick
          restVehicleAtChargingStation(config);
          const nextRunAt = config.enabled ? now + config.intervalMinutes * 60_000 : null;
          useRecurringMissionStore.setState((state) => ({ configs: { ...state.configs, [id]: { ...state.configs[id]!, activeRunId: null, nextRunAt } } }));
          persistPatch(id, { activeRunId: null, nextRunAt });
          continue;
        }

        if (!config.enabled || config.nextRunAt === null || config.nextRunAt > now) continue;
        if (vehicleIsBusy(config)) continue; // try again next tick

        const spawnedId = spawnRun(config);
        if (spawnedId) {
          useRecurringMissionStore.setState((state) => ({ configs: { ...state.configs, [id]: { ...state.configs[id]!, activeRunId: spawnedId, nextRunAt: null } } }));
          persistPatch(id, { activeRunId: spawnedId, nextRunAt: null });
        } else {
          const retryAt = now + RETRY_DELAY_MS;
          useRecurringMissionStore.setState((state) => ({ configs: { ...state.configs, [id]: { ...state.configs[id]!, nextRunAt: retryAt } } }));
          persistPatch(id, { nextRunAt: retryAt });
        }
      }
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
