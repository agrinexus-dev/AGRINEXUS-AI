import type { Route } from "@/components/digital-twin/scene/farm-data";
import type { MissionSensorJustification } from "@/lib/sensor-analytics/types";

/**
 * Shared Mission Store types — architecture mirrors the Fleet
 * Store: a dedicated, typed record shape here; the store
 * itself (`mission-store.ts`) is the single source of truth every consumer
 * (the Mission Planner page, the Digital Twin's mission overlays, AURA)
 * reads from, never duplicated.
 */

export type MissionType =
  | "survey"
  | "crop-health"
  | "disease-scan"
  | "thermal-scan"
  | "ndvi"
  | "rgb-capture"
  | "irrigation-inspection"
  | "emergency-inspection"
  | "manual";

export const MISSION_TYPES: MissionType[] = [
  "survey",
  "crop-health",
  "disease-scan",
  "thermal-scan",
  "ndvi",
  "rgb-capture",
  "irrigation-inspection",
  "emergency-inspection",
  "manual",
];

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  survey: "Survey",
  "crop-health": "Crop Health",
  "disease-scan": "Disease Scan",
  "thermal-scan": "Thermal Scan",
  ndvi: "NDVI",
  "rgb-capture": "RGB Capture",
  "irrigation-inspection": "Irrigation Inspection",
  "emergency-inspection": "Emergency Inspection",
  manual: "Manual Flight",
};

/**
 * Queued → Preparing → Taking Off → Surveying → Returning → Landing →
 * Completed is the normal life cycle.
 * Paused freezes wherever the mission currently is; Cancelled is a terminal
 * abort from any in-flight state.
 */
export type MissionStatus =
  | "queued"
  | "preparing"
  | "taking-off"
  | "surveying"
  | "returning"
  | "landing"
  | "completed"
  | "paused"
  | "cancelled";

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  "taking-off": "Taking Off",
  surveying: "Surveying",
  returning: "Returning",
  landing: "Landing",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

/** Phases the Mission Simulation actively advances and during which the assigned drone is diverted from patrol onto the mission's flight path. */
export const MISSION_FLIGHT_STATUSES: MissionStatus[] = ["preparing", "taking-off", "surveying", "returning", "landing"];

/** Progress-percent thresholds that bound each flight phase — shared by the simulation ticker (advancing forward) and `resumeMission` (recomputing the correct phase for wherever progress was frozen). */
export const MISSION_PHASE_THRESHOLDS: { status: MissionStatus; upTo: number }[] = [
  { status: "preparing", upTo: 5 },
  { status: "taking-off", upTo: 15 },
  { status: "surveying", upTo: 85 },
  { status: "returning", upTo: 95 },
  { status: "landing", upTo: 100 },
];

/** Maps a 0–100 progress value to the flight phase it falls in. `progress >= 100` is the caller's cue to complete the mission instead of calling this. */
export function derivePhaseFromProgress(progressPercent: number): MissionStatus {
  const clamped = Math.max(0, Math.min(100, progressPercent));
  const match = MISSION_PHASE_THRESHOLDS.find((entry) => clamped <= entry.upTo);
  return match?.status ?? "landing";
}

export interface MissionWaypoint {
  id: string;
  label: string;
  /** Ground-plane (x, z) in the Digital Twin's existing scene coordinate system — the same one `farm-data.ts` uses. */
  position: [number, number];
}

/** Every number here is explicitly an ESTIMATE — computed from the mission's own real parameters (plot size, overlap, speed, the assigned drone's real max flight time), never a fabricated fixed value. */
export interface MissionEstimate {
  coveragePercent: number;
  durationMinutes: number;
  batteryPercent: number;
  imageCount: number;
}

export interface MissionRecord {
  id: string;
  name: string;
  missionType: MissionType;
  targetPlotId: string | null;
  assignedDroneId: string | null;
  status: MissionStatus;

  altitude: number;
  speedMps: number;
  sideOverlapPercent: number;
  frontOverlapPercent: number;

  homePosition: [number, number] | null;
  takeoffPosition: [number, number] | null;
  landingPosition: [number, number] | null;
  /** The generated flight path (home → coverage pattern → home) — empty until `generatePath` succeeds. */
  waypoints: MissionWaypoint[];
  estimate: MissionEstimate | null;

  /** 0–100, simulation-driven overall mission progress. */
  progressPercent: number;
  /** 0–100, only advances during the "surveying" phase — distinct from overall progress so the UI can show "how much of the plot has actually been covered" separately from "how far through the mission timeline". */
  coverageProgressPercent: number;
  currentWaypointIndex: number;
  /** Bearing in degrees (0 = north/+z per the scene's convention) toward the next waypoint — null when there's no path or the mission isn't in flight. */
  headingDegrees: number | null;
  /** The assigned drone's real battery % at the moment the mission started — lets the UI show "battery used so far" honestly instead of guessing. */
  batteryAtStartPercent: number | null;

  /**
   * "Why was this mission created?" ("Sensor → Mission
   * Linkage") — `null` for every manually-created mission (the default,
   * unchanged behavior); set ONLY when AURA's `create-sensor-mission`
   * action actually created this mission off a real Agricultural Reasoning
   * Engine recommendation (see `lib/sensor-analytics/mission-integration.ts`).
   * A snapshot taken at creation time, never a live reference back into the
   * Sensor Store — mirrors how `estimate` above is also a computed-once
   * snapshot, not a pointer.
   */
  sensorJustification: MissionSensorJustification | null;

  /** Non-null ONLY for a run the recurring scheduler spawned; `null` for every manually-created mission (the default, unchanged). Same "optional, omitted by default" precedent `sensorJustification` above already sets. */
  recurringConfigId: string | null;

  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface NewMissionInput {
  name: string;
  missionType: MissionType;
  targetPlotId: string | null;
  altitude?: number;
  speedMps?: number;
  sideOverlapPercent?: number;
  frontOverlapPercent?: number;
  /** Optional — omitted (defaults to `null`) for every manually-created mission. Only `action-executor.ts`'s `create-sensor-mission` handler ever passes this. */
  sensorJustification?: MissionSensorJustification | null;
  /** Optional — omitted (defaults to `null`) for every manually-created mission. Only `recurring-mission-store.ts`'s scheduler ever passes this. */
  recurringConfigId?: string | null;
}

/** Builds a `Route` (the same type Drone Alpha's patrol uses) from a mission's generated waypoints — the hand-off shape `setDroneActiveRoute` needs. `loop: true` so a drone that reaches the final waypoint (home) simply holds there rather than reversing back out — the Mission Simulation, not the route's own loop semantics, decides when the drone is actually done and hands it back to patrol. */
export function missionRoute(mission: Pick<MissionRecord, "id" | "name" | "waypoints">): Route {
  return {
    id: `${mission.id}-flight-path`,
    label: `${mission.name} Flight Path`,
    waypoints: mission.waypoints,
    loop: true,
  };
}
