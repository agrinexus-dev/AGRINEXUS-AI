import { farmPlots } from "@/components/digital-twin/scene/farm-data";

import type { MissionEstimate, MissionRecord, MissionWaypoint, NewMissionInput } from "./types";

const DEFAULT_ALTITUDE = 12;
const DEFAULT_SPEED_MPS = 4;
const DEFAULT_SIDE_OVERLAP_PERCENT = 70;
const DEFAULT_FRONT_OVERLAP_PERCENT = 75;

/** Builds a fresh, unassigned, ungenerated mission — every live/simulated field starts at its honest "not started yet" default, same convention `buildNewDroneRecord` uses. */
export function buildNewMissionRecord(id: string, input: NewMissionInput): MissionRecord {
  return {
    id,
    name: input.name,
    missionType: input.missionType,
    targetPlotId: input.targetPlotId,
    assignedDroneId: null,
    status: "queued",

    altitude: input.altitude ?? DEFAULT_ALTITUDE,
    speedMps: input.speedMps ?? DEFAULT_SPEED_MPS,
    sideOverlapPercent: input.sideOverlapPercent ?? DEFAULT_SIDE_OVERLAP_PERCENT,
    frontOverlapPercent: input.frontOverlapPercent ?? DEFAULT_FRONT_OVERLAP_PERCENT,

    homePosition: null,
    takeoffPosition: null,
    landingPosition: null,
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

// A plausible ground footprint width (meters) for one camera pass at this
// mission's altitude range — used only to translate "side overlap %" into a
// row spacing and "how many shots" into an image-count estimate. Not a real
// sensor spec (none exists for the simulated fleet yet), but every number
// derived from it is computed from the mission's REAL parameters (plot size,
// overlap, speed, the assigned drone's real max flight time), never a
// fabricated fixed total.
const ASSUMED_FOOTPRINT_WIDTH_M = 12;
const ASSUMED_SHOT_SPACING_M = 6;
const MIN_SHOT_SPACING_M = 1.5;
// Fixed overhead the "preparing → taking off" and "landing" phases cost,
// on top of the actual flight-line time — matches the phase thresholds in
// `types.ts` (the first 15% and last 5% of a mission's progress bar).
const PHASE_OVERHEAD_SECONDS = 40;

export interface GeneratedFlightPath {
  waypoints: MissionWaypoint[];
  homePosition: [number, number];
  takeoffPosition: [number, number];
  landingPosition: [number, number];
  estimate: MissionEstimate;
}

/**
 * Boustrophedon ("lawnmower") coverage pattern over the mission's target
 * plot, bracketed by the assigned drone's home position at both ends —
 * reuses the exact same ground-plane (x, z) coordinate system every other
 * Digital Twin route already uses (`farm-data.ts`), so the result is a
 * normal `Route`-shaped waypoint list with no new coordinate space
 * introduced. Returns null if the mission has no target plot.
 */
export function generateFlightPath(
  mission: Pick<MissionRecord, "id" | "targetPlotId" | "speedMps" | "sideOverlapPercent" | "frontOverlapPercent">,
  homeLocation: [number, number],
  assignedDroneMaxFlightTimeMinutes: number,
): GeneratedFlightPath | null {
  const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
  if (!plot) return null;

  const [cx, cz] = plot.center;
  const [width, depth] = plot.size;
  const margin = 1.5;
  const halfWidth = width / 2 - margin;
  const halfDepth = depth / 2 - margin;

  const rowSpacing = Math.max(1.5, ASSUMED_FOOTPRINT_WIDTH_M * (1 - mission.sideOverlapPercent / 100));
  const rowCount = Math.max(2, Math.round((halfDepth * 2) / rowSpacing) + 1);

  const legWaypoints: MissionWaypoint[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const z = rowCount === 1 ? cz : cz - halfDepth + (row / (rowCount - 1)) * (halfDepth * 2);
    const goingRight = row % 2 === 0;
    const x1 = goingRight ? cx - halfWidth : cx + halfWidth;
    const x2 = goingRight ? cx + halfWidth : cx - halfWidth;
    legWaypoints.push({ id: `${mission.id}-wp-${row}-a`, label: `Pass ${row + 1} Start`, position: [x1, z] });
    legWaypoints.push({ id: `${mission.id}-wp-${row}-b`, label: `Pass ${row + 1} End`, position: [x2, z] });
  }

  const waypoints: MissionWaypoint[] = [
    { id: `${mission.id}-wp-takeoff`, label: "Takeoff", position: homeLocation },
    ...legWaypoints,
    { id: `${mission.id}-wp-landing`, label: "Return Home", position: homeLocation },
  ];

  let pathLengthMeters = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const [x1, z1] = waypoints[i - 1]!.position;
    const [x2, z2] = waypoints[i]!.position;
    pathLengthMeters += Math.hypot(x2 - x1, z2 - z1);
  }

  const flightSeconds = pathLengthMeters / mission.speedMps;
  const durationMinutes = Math.round(((flightSeconds + PHASE_OVERHEAD_SECONDS) / 60) * 10) / 10;
  const batteryPercent = Math.min(95, Math.max(5, Math.round((durationMinutes / assignedDroneMaxFlightTimeMinutes) * 100)));
  // Front overlap governs along-track shot spacing: more overlap → closer-
  // together shots → more images for the same flight line.
  const shotSpacing = Math.max(MIN_SHOT_SPACING_M, ASSUMED_SHOT_SPACING_M * (1 - mission.frontOverlapPercent / 100));
  const imageCount = Math.max(1, Math.round(pathLengthMeters / shotSpacing));
  // The lawnmower pattern is constructed to sweep the whole inset plot
  // rectangle, so full generated coverage is 100% by construction — this
  // isn't a guess, it's what the row spacing above was built to guarantee.
  const coveragePercent = 100;

  return {
    waypoints,
    homePosition: homeLocation,
    takeoffPosition: homeLocation,
    landingPosition: homeLocation,
    estimate: { coveragePercent, durationMinutes, batteryPercent, imageCount },
  };
}

export interface RouteDistances {
  /** Cumulative distance (meters) traveled by the time each waypoint is reached — same length as the input waypoint list, `cumulativeDistances[0] === 0`. */
  cumulativeDistances: number[];
  /** Total real path length (meters) — 0 for an empty or single-waypoint route. */
  totalDistance: number;
}

/**
 * Real, segment-aware distances along a waypoint list — the
 * single source of truth `use-mission-simulation.ts`'s progress/completion
 * tick derives "how far along the route has the drone actually traveled"
 * from, instead of assuming every leg takes an equal share of the
 * estimated duration. That assumption (progress% × waypoint count) is what
 * previously let a mission finish long before the drone had flown the
 * generated path: a long takeoff-to-plot leg and short in-plot survey legs
 * don't take equal time, so a uniform per-waypoint split doesn't track
 * real position. Never derived from `MissionEstimate.durationMinutes` —
 * that figure includes fixed phase overhead unrelated to path length and
 * stays exactly what it always was, an ETA estimate shown before a mission
 * starts, not a driver of actual progress.
 */
export function computeRouteDistances(waypoints: readonly Pick<MissionWaypoint, "position">[]): RouteDistances {
  const cumulativeDistances: number[] = waypoints.length > 0 ? [0] : [];
  for (let i = 1; i < waypoints.length; i += 1) {
    const [x1, z1] = waypoints[i - 1]!.position;
    const [x2, z2] = waypoints[i]!.position;
    cumulativeDistances.push(cumulativeDistances[i - 1]! + Math.hypot(x2 - x1, z2 - z1));
  }
  return { cumulativeDistances, totalDistance: cumulativeDistances[cumulativeDistances.length - 1] ?? 0 };
}

/** The waypoint index a given traveled distance currently falls within — the largest index whose cumulative distance has already been reached. Correctly handles unequal (and zero-length) segments, unlike a linear `progress% × waypointCount` guess. */
export function waypointIndexForDistance(cumulativeDistances: readonly number[], traveledDistance: number): number {
  let index = 0;
  for (let i = 0; i < cumulativeDistances.length; i += 1) {
    if (cumulativeDistances[i]! <= traveledDistance) index = i;
    else break;
  }
  return index;
}

/**
 * The drone's exact ground-plane position at a
 * given traveled distance, linearly interpolated between the two waypoints
 * that distance falls between. `use-mission-simulation.ts` already computes
 * `currentWaypointIndex` from the SAME `cumulativeDistances`/
 * `traveledDistance` via `waypointIndexForDistance` above; this reuses that
 * exact pair rather than recomputing anything, and is the one addition that
 * makes real proximity-based issue detection possible without touching the
 * existing progress/completion logic at all.
 */
export function interpolatePositionAtDistance(
  waypoints: readonly Pick<MissionWaypoint, "position">[],
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
