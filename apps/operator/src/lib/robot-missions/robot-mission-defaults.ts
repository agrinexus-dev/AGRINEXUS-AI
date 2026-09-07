import { farmPlots } from "@/components/digital-twin/scene/farm-data";

import type { NewRobotMissionInput, RobotMissionEstimate, RobotMissionRecord, RobotMissionWaypoint } from "./types";

const DEFAULT_SPEED_MPS = 1.8;
const DEFAULT_PATH_SPACING_PERCENT = 65;

/** Builds a fresh, unassigned, ungenerated mission — every live/simulated field starts at its honest "not started yet" default, same convention `buildNewMissionRecord` uses. */
export function buildNewRobotMissionRecord(id: string, input: NewRobotMissionInput): RobotMissionRecord {
  return {
    id,
    name: input.name,
    missionType: input.missionType,
    targetPlotId: input.targetPlotId,
    assignedRobotId: null,
    status: "queued",

    speedMps: input.speedMps ?? DEFAULT_SPEED_MPS,
    pathSpacingPercent: input.pathSpacingPercent ?? DEFAULT_PATH_SPACING_PERCENT,

    homePosition: null,
    startPosition: null,
    returnPosition: null,
    waypoints: [],
    estimate: null,

    progressPercent: 0,
    coverageProgressPercent: 0,
    currentWaypointIndex: 0,
    headingDegrees: null,
    batteryAtStartPercent: null,
    sensorJustification: input.sensorJustification ?? null,
    recurringConfigId: input.recurringConfigId ?? null,

    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };
}

// A plausible ground implement width (meters) for one pass at this mission's
// row spacing — used only to translate "path spacing %" into a row count.
// Not a real sensor/implement spec (none exists for the simulated fleet
// yet), but every number derived from it is computed from the mission's REAL
// parameters (plot size, spacing, speed, the assigned robot's real max
// runtime), never a fabricated fixed total.
const ASSUMED_IMPLEMENT_WIDTH_M = 3;
// Fixed overhead the "preparing" and "returning" phases cost, on top of the
// actual driving/working time — matches the phase thresholds in `types.ts`.
const PHASE_OVERHEAD_SECONDS = 30;

export interface GeneratedGroundRoute {
  waypoints: RobotMissionWaypoint[];
  homePosition: [number, number];
  startPosition: [number, number];
  returnPosition: [number, number];
  estimate: RobotMissionEstimate;
}

/**
 * Boustrophedon ("lawnmower") coverage pattern over the mission's target
 * plot, bracketed by the assigned robot's home position at both ends —
 * reuses the exact same ground-plane (x, z) coordinate system every other
 * Digital Twin route already uses (`farm-data.ts`), the same technique
 * `generateFlightPath` already established for drones. Returns null if the
 * mission has no target plot.
 */
export function generateGroundRoute(
  mission: Pick<RobotMissionRecord, "id" | "targetPlotId" | "speedMps" | "pathSpacingPercent">,
  homePosition: [number, number],
  assignedRobotMaxRuntimeMinutes: number,
): GeneratedGroundRoute | null {
  const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
  if (!plot) return null;

  const [cx, cz] = plot.center;
  const [width, depth] = plot.size;
  const margin = 1.5;
  const halfWidth = width / 2 - margin;
  const halfDepth = depth / 2 - margin;

  const rowSpacing = Math.max(1, ASSUMED_IMPLEMENT_WIDTH_M * (1 - mission.pathSpacingPercent / 100));
  const rowCount = Math.max(2, Math.round((halfDepth * 2) / rowSpacing) + 1);

  const legWaypoints: RobotMissionWaypoint[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const z = rowCount === 1 ? cz : cz - halfDepth + (row / (rowCount - 1)) * (halfDepth * 2);
    const goingRight = row % 2 === 0;
    const x1 = goingRight ? cx - halfWidth : cx + halfWidth;
    const x2 = goingRight ? cx + halfWidth : cx - halfWidth;
    legWaypoints.push({ id: `${mission.id}-wp-${row}-a`, label: `Row ${row + 1} Start`, position: [x1, z] });
    legWaypoints.push({ id: `${mission.id}-wp-${row}-b`, label: `Row ${row + 1} End`, position: [x2, z] });
  }

  const waypoints: RobotMissionWaypoint[] = [
    { id: `${mission.id}-wp-start`, label: "Start", position: homePosition },
    ...legWaypoints,
    { id: `${mission.id}-wp-return`, label: "Return Home", position: homePosition },
  ];

  let distanceMeters = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const [x1, z1] = waypoints[i - 1]!.position;
    const [x2, z2] = waypoints[i]!.position;
    distanceMeters += Math.hypot(x2 - x1, z2 - z1);
  }

  const driveSeconds = distanceMeters / mission.speedMps;
  const durationMinutes = Math.round(((driveSeconds + PHASE_OVERHEAD_SECONDS) / 60) * 10) / 10;
  const batteryPercent = Math.min(95, Math.max(5, Math.round((durationMinutes / assignedRobotMaxRuntimeMinutes) * 100)));
  // The lawnmower pattern is constructed to sweep the whole inset plot
  // rectangle, so full generated coverage is 100% by construction — this
  // isn't a guess, it's what the row spacing above was built to guarantee.
  const coveragePercent = 100;

  return {
    waypoints,
    homePosition,
    startPosition: homePosition,
    returnPosition: homePosition,
    estimate: { coveragePercent, distanceMeters: Math.round(distanceMeters * 10) / 10, durationMinutes, batteryPercent },
  };
}

export interface RouteDistances {
  /** Cumulative distance (meters) traveled by the time each waypoint is reached — same length as the input waypoint list, `cumulativeDistances[0] === 0`. */
  cumulativeDistances: number[];
  /** Total real path length (meters) — 0 for an empty or single-waypoint route. */
  totalDistance: number;
}

/**
 * Real, segment-aware distances along a waypoint list — mirrors
 * `mission-defaults.ts`'s `computeRouteDistances` exactly, for the same
 * reason: the robot mission progress/completion tick must derive "how far
 * along the route" from real distances between the actual generated
 * waypoints, not an assumed equal split of the estimated duration across
 * waypoint count. Never derived from `RobotMissionEstimate.durationMinutes`
 * — that stays exactly what it always was, an ETA shown before a mission
 * starts.
 */
export function computeRouteDistances(waypoints: readonly Pick<RobotMissionWaypoint, "position">[]): RouteDistances {
  const cumulativeDistances: number[] = waypoints.length > 0 ? [0] : [];
  for (let i = 1; i < waypoints.length; i += 1) {
    const [x1, z1] = waypoints[i - 1]!.position;
    const [x2, z2] = waypoints[i]!.position;
    cumulativeDistances.push(cumulativeDistances[i - 1]! + Math.hypot(x2 - x1, z2 - z1));
  }
  return { cumulativeDistances, totalDistance: cumulativeDistances[cumulativeDistances.length - 1] ?? 0 };
}

/** The waypoint index a given traveled distance currently falls within — mirrors `mission-defaults.ts`'s own `waypointIndexForDistance`. */
export function waypointIndexForDistance(cumulativeDistances: readonly number[], traveledDistance: number): number {
  let index = 0;
  for (let i = 0; i < cumulativeDistances.length; i += 1) {
    if (cumulativeDistances[i]! <= traveledDistance) index = i;
    else break;
  }
  return index;
}

/** Mirrors `mission-defaults.ts`'s own `interpolatePositionAtDistance` exactly, for the robot's ground route. */
export function interpolatePositionAtDistance(
  waypoints: readonly Pick<RobotMissionWaypoint, "position">[],
  cumulativeDistances: readonly number[],
  traveledDistance: number,
): [number, number] {
  if (waypoints.length === 0) return [0, 0];
  const index = waypointIndexForDistance(cumulativeDistances, traveledDistance);
  const from = waypoints[index]!;
  const to = waypoints[Math.min(waypoints.length - 1, index + 1)]!;
  const segmentStart = cumulativeDistances[index] ?? 0;
  const segmentEnd = cumulativeDistances[Math.min(cumulativeDistances.length - 1, index + 1)] ?? segmentStart;
  const segmentLength = segmentEnd - segmentStart;
  const t = segmentLength > 0 ? Math.min(1, Math.max(0, (traveledDistance - segmentStart) / segmentLength)) : 0;

  const [x1, z1] = from.position;
  const [x2, z2] = to.position;
  return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t];
}
