import type { Route } from "@/components/digital-twin/scene/farm-data";
import type { MissionSensorJustification } from "@/lib/sensor-analytics/types";

/**
 * Shared Robot Mission Store types — architecture mirrors the
 * Drone Mission Store (`lib/missions/types.ts`) field-for-field
 * wherever the concept overlaps. A dedicated, typed record shape here; the
 * store itself (`robot-mission-store.ts`) is the single source of truth
 * every consumer (the Robot Mission Planner page, the Digital Twin's robot
 * mission overlays, AURA) reads from, never duplicated. This is a
 * deliberately SEPARATE store from `lib/missions/mission-store.ts` — ground
 * robot missions have no altitude/flight concepts, and drone Missions are
 * explicitly DO-NOT-MODIFY this change.
 */

export type RobotMissionType =
  | "crop-inspection"
  | "weed-detection"
  | "targeted-spraying"
  | "precision-fertilization"
  | "soil-sampling"
  | "seed-planting"
  | "ground-imaging"
  | "autonomous-patrol"
  | "manual-drive";

export const ROBOT_MISSION_TYPES: RobotMissionType[] = [
  "crop-inspection",
  "weed-detection",
  "targeted-spraying",
  "precision-fertilization",
  "soil-sampling",
  "seed-planting",
  "ground-imaging",
  "autonomous-patrol",
  "manual-drive",
];

export const ROBOT_MISSION_TYPE_LABELS: Record<RobotMissionType, string> = {
  "crop-inspection": "Crop Inspection",
  "weed-detection": "Weed Detection",
  "targeted-spraying": "Targeted Spraying",
  "precision-fertilization": "Precision Fertilization",
  "soil-sampling": "Soil Sampling",
  "seed-planting": "Seed Planting",
  "ground-imaging": "Ground Imaging",
  "autonomous-patrol": "Autonomous Patrol",
  "manual-drive": "Manual Drive",
};

/**
 * Queued → Preparing → Driving → Working → Returning → Completed is the
 * normal life cycle — one fewer phase
 * than the drone equivalent (no "Taking Off"/"Landing": a ground robot
 * doesn't need a distinct launch/landing phase, just "start driving" and
 * "arrive home"). Paused freezes wherever the mission currently is;
 * Cancelled is a terminal abort from any in-progress state.
 */
export type RobotMissionStatus = "queued" | "preparing" | "driving" | "working" | "returning" | "completed" | "paused" | "cancelled";

export const ROBOT_MISSION_STATUS_LABELS: Record<RobotMissionStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  driving: "Driving",
  working: "Working",
  returning: "Returning",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

/** Phases the Robot Mission Simulation actively advances and during which the assigned robot is diverted from patrol onto the mission's ground route. */
export const ROBOT_MISSION_ACTIVE_STATUSES: RobotMissionStatus[] = ["preparing", "driving", "working", "returning"];

/** Progress-percent thresholds that bound each phase — shared by the simulation ticker (advancing forward) and `resumeMission` (recomputing the correct phase for wherever progress was frozen). Mirrors `MISSION_PHASE_THRESHOLDS`. */
export const ROBOT_MISSION_PHASE_THRESHOLDS: { status: RobotMissionStatus; upTo: number }[] = [
  { status: "preparing", upTo: 5 },
  { status: "driving", upTo: 20 },
  { status: "working", upTo: 85 },
  { status: "returning", upTo: 100 },
];

/** Maps a 0–100 progress value to the phase it falls in. `progress >= 100` is the caller's cue to complete the mission instead of calling this. */
export function deriveRobotMissionPhaseFromProgress(progressPercent: number): RobotMissionStatus {
  const clamped = Math.max(0, Math.min(100, progressPercent));
  const match = ROBOT_MISSION_PHASE_THRESHOLDS.find((entry) => clamped <= entry.upTo);
  return match?.status ?? "returning";
}

export interface RobotMissionWaypoint {
  id: string;
  label: string;
  /** Ground-plane (x, z) in the Digital Twin's existing scene coordinate system — the same one `farm-data.ts` uses. */
  position: [number, number];
}

/** Every number here is explicitly an ESTIMATE — computed from the mission's own real parameters (plot size, spacing, speed, the assigned robot's real max runtime), never a fabricated fixed value. Distance replaces the drone Mission's image count — ground missions don't have a camera shot-spacing concept. */
export interface RobotMissionEstimate {
  coveragePercent: number;
  distanceMeters: number;
  durationMinutes: number;
  batteryPercent: number;
}

export interface RobotMissionRecord {
  id: string;
  name: string;
  missionType: RobotMissionType;
  targetPlotId: string | null;
  assignedRobotId: string | null;
  status: RobotMissionStatus;

  speedMps: number;
  /** Row spacing for coverage-style missions (weed detection, spraying, imaging, etc.) — the ground equivalent of a drone mission's `sideOverlapPercent`. */
  pathSpacingPercent: number;

  homePosition: [number, number] | null;
  startPosition: [number, number] | null;
  returnPosition: [number, number] | null;
  /** The generated ground route (home → coverage pattern → home) — empty until `generateRoute` succeeds. */
  waypoints: RobotMissionWaypoint[];
  estimate: RobotMissionEstimate | null;

  /** 0–100, simulation-driven overall mission progress. */
  progressPercent: number;
  /** 0–100, only advances during the "working" phase — mirrors `coverageProgressPercent` on the drone Mission. */
  coverageProgressPercent: number;
  currentWaypointIndex: number;
  /** Bearing in degrees (0 = north/+z per the scene's convention) toward the next waypoint — null when there's no route or the mission isn't in progress. */
  headingDegrees: number | null;
  /** The assigned robot's real battery % at the moment the mission started. */
  batteryAtStartPercent: number | null;

  /** "Why was this mission created?" ("Sensor → Mission Linkage") — mirrors `MissionRecord.sensorJustification` exactly; `null` for every manually-created mission. */
  sensorJustification: MissionSensorJustification | null;

  /** Mirrors `MissionRecord.recurringConfigId` exactly. */
  recurringConfigId: string | null;

  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface NewRobotMissionInput {
  name: string;
  missionType: RobotMissionType;
  targetPlotId: string | null;
  speedMps?: number;
  pathSpacingPercent?: number;
  /** Optional — omitted (defaults to `null`) for every manually-created mission. Only `action-executor.ts`'s `create-sensor-mission` handler ever passes this. */
  sensorJustification?: MissionSensorJustification | null;
  /** Optional — omitted (defaults to `null`) for every manually-created mission. Only `recurring-mission-store.ts`'s scheduler ever passes this. */
  recurringConfigId?: string | null;
}

/** Builds a `Route` (the same type Robot Bravo's patrol uses) from a mission's generated waypoints — the hand-off shape `setRobotActiveRoute` needs. `loop: true` so a robot that reaches the final waypoint (home) simply holds there rather than reversing back out — the Robot Mission Simulation, not the route's own loop semantics, decides when the robot is actually done and hands it back to patrol. Mirrors `missionRoute`. */
export function robotMissionRoute(mission: Pick<RobotMissionRecord, "id" | "name" | "waypoints">): Route {
  return {
    id: `${mission.id}-ground-route`,
    label: `${mission.name} Ground Route`,
    waypoints: mission.waypoints,
    loop: true,
  };
}
