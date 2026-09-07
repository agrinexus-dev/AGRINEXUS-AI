"use client";

import { useMemo } from "react";
import { create } from "zustand";

import { useRobotStore } from "@/lib/robots/robot-store";
import { runSerialized } from "@/lib/utils/serial-queue";

import { buildNewRobotMissionRecord, generateGroundRoute } from "./robot-mission-defaults";
import {
  deriveRobotMissionPhaseFromProgress,
  robotMissionRoute,
  ROBOT_MISSION_ACTIVE_STATUSES,
  type NewRobotMissionInput,
  type RobotMissionRecord,
  type RobotMissionStatus,
} from "./types";

/**
 * The Robot Mission Store — architecture mirrors the Drone
 * Mission Store (`lib/missions/mission-store.ts`) exactly: an
 * `order` id array + a `missions` id → record map, kept as separate
 * top-level fields for the same rerender-avoidance reason documented there.
 *
 * This store reads the Robot Store via `useRobotStore.getState()` wherever
 * it needs the assigned robot's real spec (home position, max runtime,
 * current battery) — a snapshot read, never a copy: nothing here duplicates
 * robot state, and the only way a
 * mission ever changes a robot is through the Robot Store's own
 * `setRobotActiveRoute`/`updateRobotTelemetry`.
 *
 * Extended for backend persistence — mirrors
 * `mission-store.ts`'s own extension field-for-field, including the same
 * "stay synchronous, fire-and-forget at lifecycle boundaries only, never
 * persist the per-tick `updateMissionProgress` equivalent" rules. See that
 * file's own doc comment for the full reasoning.
 */
interface RobotMissionState {
  order: string[];
  missions: Record<string, RobotMissionRecord>;
  selectedMissionId: string | null;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;

  createMission: (input: NewRobotMissionInput) => RobotMissionRecord;
  deleteMission: (id: string) => void;
  duplicateMission: (id: string) => RobotMissionRecord | null;
  assignRobot: (missionId: string, robotId: string | null) => void;
  updateMissionSettings: (missionId: string, update: Partial<Pick<RobotMissionRecord, "speedMps" | "pathSpacingPercent">>) => void;
  generateRoute: (missionId: string) => boolean;
  startMission: (missionId: string) => boolean;
  pauseMission: (missionId: string) => void;
  resumeMission: (missionId: string) => void;
  cancelMission: (missionId: string) => void;
  completeMission: (missionId: string) => void;
  selectMission: (id: string | null) => void;
  updateMissionProgress: (
    id: string,
    update: Partial<Pick<RobotMissionRecord, "status" | "progressPercent" | "coverageProgressPercent" | "currentWaypointIndex" | "headingDegrees">>,
  ) => void;
  fetchRobotMissions: () => Promise<void>;
}

let idSuffix = 0;
/** Same collision-avoidance reasoning `mission-store.ts`'s `generateMissionId` documents — needed once these ids became shared, persistent Postgres primary keys. */
function generateRobotMissionRecordId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `${slug || "robot-mission"}-${idSuffix}-${random}`;
}

/**
 * The status of whichever mission this robot is currently driving — `null`
 * if it isn't actively driving or paused on one. Mirrors
 * `mission-store.ts`'s own `getActiveMissionStatusForDrone` exactly — see
 * that function's doc comment for why this is a plain `.getState()` read
 * called from `systems/robot.tsx`'s `useFrame`, deliberately not threaded
 * through `RobotRenderConfig`/`useRobotRenderConfigs` (which does not
 * recompute on status changes either).
 */
export function getActiveMissionStatusForRobot(robotId: string): RobotMissionStatus | null {
  const { order, missions } = useRobotMissionStore.getState();
  for (const id of order) {
    const mission = missions[id];
    if (
      mission &&
      mission.assignedRobotId === robotId &&
      (mission.status === "paused" || ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status))
    ) {
      return mission.status;
    }
  }
  return null;
}

/**
 * Hands a diverted robot back to its home/idle position — shared by
 * `cancelMission` and `completeMission`, mirrors `restoreDroneIfFlyingMission`.
 * No-op if the robot isn't actually the one running this mission (e.g.
 * already reassigned/sent home). `robot.homePatrolRoute` is
 * now itself the stationary single-waypoint home route (see
 * `robot-defaults.ts`), so this only needed its STATUS fixed from "active"
 * to "idle" — the route it hands back was already correct.
 */
function restoreRobotIfOnMission(robotId: string | null, missionId: string): void {
  if (!robotId) return;
  const robot = useRobotStore.getState().robots[robotId];
  if (!robot || robot.activeMissionId !== missionId) return;
  useRobotStore.getState().setRobotActiveRoute(robotId, robot.homePatrolRoute, {
    status: "idle",
    missionId: null,
    missionLabel: null,
    missionTargetPlotId: null,
  });
}

/**
 * Fire-and-forget lifecycle persistence — mirrors `mission-store.ts`'s own
 * `persistCreate`/`persistPatch`/`persistDelete`. Each call is routed
 * through `runSerialized`, keyed by mission id, so a
 * rapid create → assign → route → start sequence for the SAME mission (the
 * exact shape of an AURA "propose then confirm" dispatch) can no longer
 * reach the backend out of order — see that helper's own doc comment for
 * the confirmed race this closes. Still genuinely fire-and-forget from every
 * caller's perspective below (none of them await this) and still swallows
 * its own failure exactly as before — only the ORDERING changed.
 */
function persistCreate(record: RobotMissionRecord): void {
  void runSerialized(record.id, () =>
    fetch("/api/robot-missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {}),
  );
}

function persistPatch(id: string, patch: Partial<Omit<RobotMissionRecord, "id">>): void {
  void runSerialized(id, () =>
    fetch(`/api/robot-missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {}),
  );
}

function persistDelete(id: string): void {
  void runSerialized(id, () => fetch(`/api/robot-missions/${id}`, { method: "DELETE" }).catch(() => {}));
}

export const useRobotMissionStore = create<RobotMissionState>((set, get) => ({
  order: [],
  missions: {},
  selectedMissionId: null,
  hydration: "idle",
  hydrationError: null,

  createMission: (input) => {
    const id = generateRobotMissionRecordId(input.name);
    const record = buildNewRobotMissionRecord(id, input);

    set((state) => ({
      order: [...state.order, id],
      missions: { ...state.missions, [id]: record },
      selectedMissionId: id,
    }));
    persistCreate(record);

    return record;
  },

  deleteMission: (id) => {
    const mission = get().missions[id];
    if (!mission) return;
    restoreRobotIfOnMission(mission.assignedRobotId, id);

    set((state) => {
      const missions = { ...state.missions };
      delete missions[id];
      return {
        order: state.order.filter((existingId) => existingId !== id),
        missions,
        selectedMissionId: state.selectedMissionId === id ? null : state.selectedMissionId,
      };
    });
    persistDelete(id);
  },

  duplicateMission: (id) => {
    const source = get().missions[id];
    if (!source) return null;

    const newId = generateRobotMissionRecordId(source.name);
    const copy: RobotMissionRecord = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
      status: "queued",
      waypoints: [],
      estimate: null,
      homePosition: null,
      startPosition: null,
      returnPosition: null,
      progressPercent: 0,
      coverageProgressPercent: 0,
      currentWaypointIndex: 0,
      headingDegrees: null,
      batteryAtStartPercent: null,
      // A manual "Duplicate" is its own independent mission, not another
      // scheduled run — never inherit the source's recurring link.
      recurringConfigId: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };

    set((state) => ({
      order: [...state.order, newId],
      missions: { ...state.missions, [newId]: copy },
      selectedMissionId: newId,
    }));
    persistCreate(copy);

    return copy;
  },

  assignRobot: (missionId, robotId) => {
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission) return state;
      return {
        missions: {
          ...state.missions,
          [missionId]: {
            ...mission,
            assignedRobotId: robotId,
            // A previously generated route was built around the OLD robot's
            // home position — clearing it forces "Generate Route" to run
            // again rather than leaving a stale, honesty-violating estimate.
            waypoints: [],
            estimate: null,
            homePosition: null,
            startPosition: null,
            returnPosition: null,
          },
        },
      };
    });
    persistPatch(missionId, { assignedRobotId: robotId, waypoints: [], estimate: null, homePosition: null, startPosition: null, returnPosition: null });
  },

  updateMissionSettings: (missionId, update) => {
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission) return state;
      return {
        missions: {
          ...state.missions,
          [missionId]: {
            ...mission,
            ...update,
            // These parameters feed directly into route generation — changing
            // either invalidates a previously generated estimate rather than
            // silently leaving a stale one on screen.
            waypoints: [],
            estimate: null,
            homePosition: null,
            startPosition: null,
            returnPosition: null,
          },
        },
      };
    });
    persistPatch(missionId, { ...update, waypoints: [], estimate: null, homePosition: null, startPosition: null, returnPosition: null });
  },

  generateRoute: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission || !mission.assignedRobotId) return false;
    const robot = useRobotStore.getState().robots[mission.assignedRobotId];
    if (!robot) return false;

    const generated = generateGroundRoute(mission, robot.homePosition, robot.maxRuntimeMinutes);
    if (!generated) return false;

    set((state) => ({
      missions: {
        ...state.missions,
        [missionId]: {
          ...mission,
          waypoints: generated.waypoints,
          estimate: generated.estimate,
          homePosition: generated.homePosition,
          startPosition: generated.startPosition,
          returnPosition: generated.returnPosition,
        },
      },
    }));
    persistPatch(missionId, {
      waypoints: generated.waypoints,
      estimate: generated.estimate,
      homePosition: generated.homePosition,
      startPosition: generated.startPosition,
      returnPosition: generated.returnPosition,
    });
    return true;
  },

  startMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission || !mission.assignedRobotId || mission.waypoints.length === 0) return false;
    if (mission.status !== "queued") return false;
    const robot = useRobotStore.getState().robots[mission.assignedRobotId];
    if (!robot) return false;

    const startedAt = Date.now();
    set((state) => ({
      missions: {
        ...state.missions,
        [missionId]: {
          ...mission,
          status: "preparing",
          progressPercent: 0,
          coverageProgressPercent: 0,
          currentWaypointIndex: 0,
          headingDegrees: null,
          batteryAtStartPercent: robot.batteryPercent,
          startedAt,
          completedAt: null,
        },
      },
    }));
    persistPatch(missionId, {
      status: "preparing",
      progressPercent: 0,
      coverageProgressPercent: 0,
      currentWaypointIndex: 0,
      headingDegrees: null,
      batteryAtStartPercent: robot.batteryPercent,
      startedAt,
      completedAt: null,
    });
    return true;
  },

  pauseMission: (missionId) => {
    let snapshot: RobotMissionRecord | null = null;
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission) return state;
      snapshot = { ...mission, status: "paused" };
      return { missions: { ...state.missions, [missionId]: snapshot } };
    });
    if (snapshot) {
      const { status, progressPercent, coverageProgressPercent, currentWaypointIndex, headingDegrees } = snapshot as RobotMissionRecord;
      persistPatch(missionId, { status, progressPercent, coverageProgressPercent, currentWaypointIndex, headingDegrees });
    }
  },

  resumeMission: (missionId) => {
    let nextStatus: RobotMissionStatus | null = null;
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission || mission.status !== "paused") return state;
      nextStatus = deriveRobotMissionPhaseFromProgress(mission.progressPercent);
      return { missions: { ...state.missions, [missionId]: { ...mission, status: nextStatus } } };
    });
    if (nextStatus) persistPatch(missionId, { status: nextStatus });
  },

  cancelMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission) return;
    restoreRobotIfOnMission(mission.assignedRobotId, missionId);

    set((state) => {
      const current = state.missions[missionId];
      if (!current) return state;
      return { missions: { ...state.missions, [missionId]: { ...current, status: "cancelled" as RobotMissionStatus } } };
    });
    persistPatch(missionId, { status: "cancelled" });
  },

  completeMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission) return;
    restoreRobotIfOnMission(mission.assignedRobotId, missionId);

    const completedAt = Date.now();
    set((state) => {
      const current = state.missions[missionId];
      if (!current) return state;
      return {
        missions: {
          ...state.missions,
          [missionId]: {
            ...current,
            status: "completed",
            progressPercent: 100,
            coverageProgressPercent: 100,
            completedAt,
          },
        },
      };
    });
    persistPatch(missionId, { status: "completed", progressPercent: 100, coverageProgressPercent: 100, completedAt });
  },

  selectMission: (id) => set({ selectedMissionId: id }),

  // The second-by-second simulation tick's own action — DELIBERATELY
  // UNPERSISTED, mirrors `mission-store.ts`'s own `updateMissionProgress`.
  updateMissionProgress: (id, update) => {
    set((state) => {
      const mission = state.missions[id];
      if (!mission) return state;
      return { missions: { ...state.missions, [id]: { ...mission, ...update } } };
    });
  },

  fetchRobotMissions: async () => {
    if (get().hydration === "loading") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/robot-missions");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { robotMissions: RobotMissionRecord[] };

      set((state) => {
        // Authoritative replace: mirrors `mission-store.ts`'s
        // identical fix exactly — see that file's own doc comment for the
        // full reasoning. The fresh farm-scoped response's ids ARE the
        // complete next robot-mission set; an id absent from it is dropped,
        // never carried forward. For a surviving id, the same 5
        // `updateMissionProgress`-owned, never-persisted fields (`status`,
        // `progressPercent`, `coverageProgressPercent`,
        // `currentWaypointIndex`, `headingDegrees`) are preserved from the
        // existing client record so a currently-driving mission's live
        // progress is never snapped backward on a re-fetch.
        const nextMissions: Record<string, RobotMissionRecord> = {};
        const nextOrder: string[] = [];
        for (const mission of body.robotMissions) {
          const existing = state.missions[mission.id];
          nextMissions[mission.id] = existing
            ? {
                ...mission,
                status: existing.status,
                progressPercent: existing.progressPercent,
                coverageProgressPercent: existing.coverageProgressPercent,
                currentWaypointIndex: existing.currentWaypointIndex,
                headingDegrees: existing.headingDegrees,
              }
            : mission;
          nextOrder.push(mission.id);
        }
        const selectedMissionId = state.selectedMissionId && nextMissions[state.selectedMissionId] ? state.selectedMissionId : null;
        return { missions: nextMissions, order: nextOrder, selectedMissionId, hydration: "loaded", hydrationError: null };
      });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load robot missions." });
    }
  },
}));

export function useRobotMissionOrder(): string[] {
  return useRobotMissionStore((state) => state.order);
}

/** All robot mission records — for the Robot Mission Library, Robot Mission Inspector, AURA's context, and the Digital Twin's robot mission overlays (not render-sensitive). Mirrors `useMissions`. */
export function useRobotMissions(): RobotMissionRecord[] {
  const order = useRobotMissionOrder();
  const missions = useRobotMissionStore((state) => state.missions);
  return useMemo(() => order.map((id) => missions[id]).filter((mission): mission is RobotMissionRecord => Boolean(mission)), [order, missions]);
}

export function useSelectedRobotMission(): RobotMissionRecord | null {
  return useRobotMissionStore((state) => (state.selectedMissionId ? (state.missions[state.selectedMissionId] ?? null) : null));
}

/** Read-only hydration status for the Robot Mission Planner page's loading/error UI (mirrors `useMissionHydration`). */
export function useRobotMissionHydration(): { status: RobotMissionState["hydration"]; error: string | null } {
  const status = useRobotMissionStore((state) => state.hydration);
  const error = useRobotMissionStore((state) => state.hydrationError);
  return { status, error };
}

export { robotMissionRoute };
