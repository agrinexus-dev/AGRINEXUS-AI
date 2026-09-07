"use client";

import { useMemo } from "react";
import { create } from "zustand";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import { runSerialized } from "@/lib/utils/serial-queue";

import { buildNewMissionRecord, generateFlightPath } from "./mission-defaults";
import {
  derivePhaseFromProgress,
  missionRoute,
  MISSION_FLIGHT_STATUSES,
  type MissionRecord,
  type MissionStatus,
  type NewMissionInput,
} from "./types";

/**
 * The Mission Store — architecture mirrors the Fleet Store
 * exactly: an `order` id array + a `missions` id → record map,
 * kept as separate top-level fields so a component that only needs "which
 * missions exist" can select just `order` and skip rerendering on every
 * simulation tick to `missions` (same rationale as
 * `lib/fleet/fleet-store.ts`'s own doc comment).
 *
 * This store reads the Fleet Store via `useFleetStore.getState()` wherever
 * it needs the assigned drone's real spec (home location, max flight time,
 * current battery) — a snapshot read, never a copy: nothing here duplicates
 * drone state, and the only way a mission ever changes a drone is through
 * the Fleet Store's own `setDroneActiveRoute`/`updateDroneTelemetry`.
 *
 * Extended for backend persistence, at LIFECYCLE BOUNDARIES
 * ONLY — every action below stays SYNCHRONOUS (unlike Sensor/Drone/Robot's
 * `addX`/`removeX`, which are awaited): Part 8's own instruction is explicit
 * ("do not wait for a backend round trip before every visual state
 * transition if doing so would make the planner feel slow"), so every
 * mutating action here applies its local update FIRST (exactly as before —
 * zero behavior change to the Mission Planner/AURA, which both call these
 * synchronously and read the return value immediately), then fires a
 * best-effort background PATCH/POST/DELETE — same fire-and-forget
 * convention `alert-store.ts`'s `openAlert`/`resolveAlert` established in
 * `fetchMissions()` hydrates whatever's durable in Postgres on
 * mount (merge-by-id, never clobbering an in-session mission). The
 * second-by-second simulation tick (`use-mission-simulation.ts`) is
 * UNCHANGED — it still only calls `updateMissionProgress`, which is NOT
 * persisted (see that action below) — per Step 9's explicit "do not write
 * to Postgres every simulation tick."
 */
interface MissionState {
  order: string[];
  missions: Record<string, MissionRecord>;
  selectedMissionId: string | null;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;

  createMission: (input: NewMissionInput) => MissionRecord;
  deleteMission: (id: string) => void;
  duplicateMission: (id: string) => MissionRecord | null;
  assignDrone: (missionId: string, droneId: string | null) => void;
  updateMissionSettings: (
    missionId: string,
    update: Partial<Pick<MissionRecord, "altitude" | "speedMps" | "sideOverlapPercent" | "frontOverlapPercent">>,
  ) => void;
  generatePath: (missionId: string) => boolean;
  startMission: (missionId: string) => boolean;
  pauseMission: (missionId: string) => void;
  resumeMission: (missionId: string) => void;
  cancelMission: (missionId: string) => void;
  completeMission: (missionId: string) => void;
  selectMission: (id: string | null) => void;
  updateMissionProgress: (
    id: string,
    update: Partial<Pick<MissionRecord, "status" | "progressPercent" | "coverageProgressPercent" | "currentWaypointIndex" | "headingDegrees">>,
  ) => void;
  fetchMissions: () => Promise<void>;
}

let idSuffix = 0;
/**
 * The trailing random component is there because before backend
 * persistence existed, `idSuffix` alone (reset to 0 on every fresh page
 * load) was sufficient, since nothing was ever shared across sessions. Now
 * that missions persist to a shared Postgres table, two different browser
 * sessions creating their FIRST "Plot A Survey" would otherwise generate the
 * identical id "plot-a-survey-1" — discovered via real testing (a second
 * session's `POST /api/missions` returned 500 on a primary-key collision).
 * The random suffix makes a collision practically impossible while keeping
 * the id human-readable, without touching `idSuffix`'s own pre-existing
 * per-session-readable-counter behavior.
 */
function generateMissionId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `${slug || "mission"}-${idSuffix}-${random}`;
}

/**
 * The status of whichever mission this drone is currently flying — `null`
 * if it isn't actively flying or paused on one. A plain
 * `.getState()` snapshot read (no subscription), meant to be called from
 * `systems/drone.tsx`'s `useFrame` once per frame: cheap (the mission list
 * is small), and deliberately NOT threaded through `DroneRenderConfig`,
 * which `useFleetDroneRenderConfigs` intentionally does NOT recompute on
 * status changes (see that function's own doc comment on why — avoiding a
 * re-render on every live telemetry tick). This is what lets the Digital
 * Twin's visual flight react to a mission being paused/resumed, and fly at
 * the same accelerated speed `use-mission-simulation.ts`'s progress clock
 * assumes, without touching that render-config memoization at all.
 */
export function getActiveMissionStatusForDrone(droneId: string): MissionStatus | null {
  const { order, missions } = useMissionStore.getState();
  for (const id of order) {
    const mission = missions[id];
    if (mission && mission.assignedDroneId === droneId && (mission.status === "paused" || MISSION_FLIGHT_STATUSES.includes(mission.status))) {
      return mission.status;
    }
  }
  return null;
}

/**
 * Hands a diverted drone back to its home/idle position — shared by
 * `cancelMission` and `completeMission` so "give the drone back" lives in
 * exactly one place. No-op if the drone isn't actually the one flying this
 * mission (e.g. already reassigned). `drone.homePatrolRoute`
 * is now itself the stationary single-waypoint home route (see
 * `fleet-defaults.ts`), so this only needed its STATUS fixed from
 * "patrolling" to "idle" — the route it hands back was already correct.
 */
function restoreDroneIfFlyingMission(droneId: string | null, missionId: string): void {
  if (!droneId) return;
  const drone = useFleetStore.getState().drones[droneId];
  if (!drone || drone.activeMissionId !== missionId) return;
  useFleetStore.getState().setDroneActiveRoute(droneId, drone.homePatrolRoute, { status: "idle", missionId: null });
}

/**
 * Fire-and-forget lifecycle persistence — logged nowhere, never thrown; a
 * failed persist must never break the (synchronous) in-memory action it
 * backs. See this file's own doc comment on the lifecycle-boundary-only
 * persistence rule. Routed through `runSerialized`,
 * keyed by mission id, mirroring `robot-mission-store.ts`'s identical fix —
 * see that file's own doc comment and `serial-queue.ts` for the confirmed
 * out-of-order-persistence race this closes. Only the ordering changed;
 * still fire-and-forget from every caller below.
 */
function persistCreate(record: MissionRecord): void {
  void runSerialized(record.id, () =>
    fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {}),
  );
}

function persistPatch(id: string, patch: Partial<Omit<MissionRecord, "id">>): void {
  void runSerialized(id, () =>
    fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {}),
  );
}

function persistDelete(id: string): void {
  void runSerialized(id, () => fetch(`/api/missions/${id}`, { method: "DELETE" }).catch(() => {}));
}

export const useMissionStore = create<MissionState>((set, get) => ({
  order: [],
  missions: {},
  selectedMissionId: null,
  hydration: "idle",
  hydrationError: null,

  createMission: (input) => {
    const id = generateMissionId(input.name);
    const record = buildNewMissionRecord(id, input);

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
    restoreDroneIfFlyingMission(mission.assignedDroneId, id);

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

    const newId = generateMissionId(source.name);
    const copy: MissionRecord = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
      status: "queued",
      waypoints: [],
      estimate: null,
      homePosition: null,
      takeoffPosition: null,
      landingPosition: null,
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

  assignDrone: (missionId, droneId) => {
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission) return state;
      return {
        missions: {
          ...state.missions,
          [missionId]: {
            ...mission,
            assignedDroneId: droneId,
            // A previously generated path was built around the OLD drone's
            // home position — clearing it forces "Generate Path" to run
            // again rather than leaving a stale, honesty-violating estimate.
            waypoints: [],
            estimate: null,
            homePosition: null,
            takeoffPosition: null,
            landingPosition: null,
          },
        },
      };
    });
    persistPatch(missionId, { assignedDroneId: droneId, waypoints: [], estimate: null, homePosition: null, takeoffPosition: null, landingPosition: null });
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
            // These parameters feed directly into path generation — changing
            // any of them invalidates a previously generated estimate rather
            // than silently leaving a stale one on screen.
            waypoints: [],
            estimate: null,
            homePosition: null,
            takeoffPosition: null,
            landingPosition: null,
          },
        },
      };
    });
    persistPatch(missionId, { ...update, waypoints: [], estimate: null, homePosition: null, takeoffPosition: null, landingPosition: null });
  },

  generatePath: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission || !mission.assignedDroneId) return false;
    const drone = useFleetStore.getState().drones[mission.assignedDroneId];
    if (!drone) return false;

    const generated = generateFlightPath(mission, drone.homeLocation, drone.maxFlightTimeMinutes);
    if (!generated) return false;

    set((state) => ({
      missions: {
        ...state.missions,
        [missionId]: {
          ...mission,
          waypoints: generated.waypoints,
          estimate: generated.estimate,
          homePosition: generated.homePosition,
          takeoffPosition: generated.takeoffPosition,
          landingPosition: generated.landingPosition,
        },
      },
    }));
    persistPatch(missionId, {
      waypoints: generated.waypoints,
      estimate: generated.estimate,
      homePosition: generated.homePosition,
      takeoffPosition: generated.takeoffPosition,
      landingPosition: generated.landingPosition,
    });
    return true;
  },

  startMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission || !mission.assignedDroneId || mission.waypoints.length === 0) return false;
    if (mission.status !== "queued") return false;
    const drone = useFleetStore.getState().drones[mission.assignedDroneId];
    if (!drone) return false;

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
          batteryAtStartPercent: drone.batteryPercent,
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
      batteryAtStartPercent: drone.batteryPercent,
      startedAt,
      completedAt: null,
    });
    return true;
  },

  pauseMission: (missionId) => {
    let snapshot: MissionRecord | null = null;
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission) return state;
      snapshot = { ...mission, status: "paused" };
      return { missions: { ...state.missions, [missionId]: snapshot } };
    });
    if (snapshot) {
      const { status, progressPercent, coverageProgressPercent, currentWaypointIndex, headingDegrees } = snapshot as MissionRecord;
      persistPatch(missionId, { status, progressPercent, coverageProgressPercent, currentWaypointIndex, headingDegrees });
    }
  },

  resumeMission: (missionId) => {
    let nextStatus: MissionStatus | null = null;
    set((state) => {
      const mission = state.missions[missionId];
      if (!mission || mission.status !== "paused") return state;
      nextStatus = derivePhaseFromProgress(mission.progressPercent);
      return { missions: { ...state.missions, [missionId]: { ...mission, status: nextStatus } } };
    });
    if (nextStatus) persistPatch(missionId, { status: nextStatus });
  },

  cancelMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission) return;
    restoreDroneIfFlyingMission(mission.assignedDroneId, missionId);

    set((state) => {
      const current = state.missions[missionId];
      if (!current) return state;
      return { missions: { ...state.missions, [missionId]: { ...current, status: "cancelled" as MissionStatus } } };
    });
    persistPatch(missionId, { status: "cancelled" });
  },

  completeMission: (missionId) => {
    const mission = get().missions[missionId];
    if (!mission) return;
    restoreDroneIfFlyingMission(mission.assignedDroneId, missionId);

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
  // UNPERSISTED, per this file's own doc comment.
  updateMissionProgress: (id, update) => {
    set((state) => {
      const mission = state.missions[id];
      if (!mission) return state;
      return { missions: { ...state.missions, [id]: { ...mission, ...update } } };
    });
  },

  fetchMissions: async () => {
    if (get().hydration === "loading") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/missions");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { missions: MissionRecord[] };

      set((state) => {
        // Authoritative replace: the fresh farm-scoped
        // response's ids ARE the complete next mission set — an id absent
        // from it is dropped, never carried forward regardless of what the
        // store held before (closes additive-only
        // reconciliation risk — `if (nextMissions[mission.id]) continue`
        // used to mean a mission from a previous farm/session could never
        // be removed). For a surviving id, the fresh record's PERSISTED
        // fields are adopted, but the 5 fields `updateMissionProgress`
        // updates every simulation tick WITHOUT ever persisting them
        // (`status`, `progressPercent`, `coverageProgressPercent`,
        // `currentWaypointIndex`, `headingDegrees` — see that action's own
        // doc comment) are preserved from the existing client record
        // instead, so a currently-flying mission's live progress is never
        // snapped backward to its last lifecycle-boundary snapshot merely
        // because another page remounted and re-fetched.
        const nextMissions: Record<string, MissionRecord> = {};
        const nextOrder: string[] = [];
        for (const mission of body.missions) {
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
        // A previously-selected mission that didn't survive reconciliation
        // must not stay selected (mirrors `robot-store.ts`'s
        // `selectedRobotId` cleanup).
        const selectedMissionId = state.selectedMissionId && nextMissions[state.selectedMissionId] ? state.selectedMissionId : null;
        return { missions: nextMissions, order: nextOrder, selectedMissionId, hydration: "loaded", hydrationError: null };
      });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load missions." });
    }
  },
}));

export function useMissionOrder(): string[] {
  return useMissionStore((state) => state.order);
}

/** All mission records — for the Mission Library, Mission Inspector, AURA's context, and the Digital Twin's mission overlays (not render-sensitive, so no split selector needed the way the Fleet Store's drones/order is). */
export function useMissions(): MissionRecord[] {
  const order = useMissionOrder();
  const missions = useMissionStore((state) => state.missions);
  return useMemo(() => order.map((id) => missions[id]).filter((mission): mission is MissionRecord => Boolean(mission)), [order, missions]);
}

export function useSelectedMission(): MissionRecord | null {
  return useMissionStore((state) => (state.selectedMissionId ? (state.missions[state.selectedMissionId] ?? null) : null));
}

/** Read-only hydration status for the Mission Planner page's loading/error UI (mirrors `useSensorHydration`). */
export function useMissionHydration(): { status: MissionState["hydration"]; error: string | null } {
  const status = useMissionStore((state) => state.hydration);
  const error = useMissionStore((state) => state.hydrationError);
  return { status, error };
}

export { missionRoute };
