import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import type { Route } from "@/components/digital-twin/scene/farm-data";

import type { NewRobotInput, RobotRecord } from "./types";

const DEFAULT_SPEED_MPS = 2.2;

/**
 * A single-waypoint loop parked at `homePosition` — see
 * `RobotRecord.returningEtaAt`'s doc comment for why "arrive and stop" is
 * handled by the Robot Simulation ticker rather than route geometry (same
 * gap/fix `lib/missions/mission-defaults.ts` documents for drones). Also
 * now the default route for a newly added robot with no
 * mission (see `buildNewRobotRecord` below) — a robot with nowhere to be
 * sits here rather than automatically patrolling a generated loop, which
 * was this app's actual root cause of vehicles-with-no-mission visibly
 * wandering.
 */
export function buildHomeShuttleRoute(id: string, homePosition: [number, number]): Route {
  return {
    id: `${id}-home-shuttle`,
    label: "Returning Home",
    loop: true,
    waypoints: [{ id: `${id}-home`, label: "Home Position", position: homePosition }],
  };
}

/** A two-point shuttle between home and a mission's target plot — the lightweight stand-in for a full flight-path/boustrophedon plan (out of scope this change; see the Robot Store's own doc comment). */
export function buildMissionShuttleRoute(id: string, homePosition: [number, number], targetPlotId: string | null): Route {
  const plot = targetPlotId ? farmPlots.find((candidate) => candidate.id === targetPlotId) : undefined;
  if (!plot) return buildHomeShuttleRoute(id, homePosition);

  return {
    id: `${id}-mission-shuttle`,
    label: `Mission Shuttle — ${plot.label}`,
    loop: true,
    waypoints: [
      { id: `${id}-mission-home`, label: "Home Position", position: homePosition },
      { id: `${id}-mission-target`, label: plot.label, position: plot.center },
    ],
  };
}

/** Distance in scene units — used to estimate "send home" travel time from real speed rather than a fabricated duration. */
export function distanceBetween(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

const DEFAULT_MAINTENANCE_HORIZON_MS = 1000 * 60 * 60 * 24 * 21; // 21 days out, same "not due yet" honesty as a fresh drone's full battery.

/** Builds a complete `RobotRecord` from the Add Robot form's input — every live/simulated field starts at a sensible, honest default (full battery, nominal health, not yet dispatched), mirroring `buildNewDroneRecord`. */
export function buildNewRobotRecord(id: string, input: NewRobotInput): RobotRecord {
  const route = buildHomeShuttleRoute(id, input.homePosition);
  const now = Date.now();

  return {
    id,
    ...input,
    route,
    homePatrolRoute: route,
    routeVersion: 0,

    // "idle" (not "active"): a freshly added robot has
    // no mission, so it stays parked at Home Position rather than
    // automatically patrolling. `ROBOT_MOVING_STATUSES` (lib/robots/
    // types.ts) — the Digital Twin's `<Robot>` movement gate — only
    // advances a robot whose status is "active"/"on-mission"/"returning";
    // "idle" is grouped with paused/charging/maintenance/offline as a
    // genuinely parked state, which is exactly what this robot is until a
    // mission (one-time or recurring) actually dispatches it.
    status: "idle",
    batteryPercent: 100,
    speedMps: DEFAULT_SPEED_MPS,
    position: input.homePosition,
    headingDegrees: 0,
    cpuPercent: 12,
    temperatureC: 28,
    motorHealth: "nominal",
    wheelHealth: "nominal",
    health: "nominal",
    signalPercent: 100,
    connectionQuality: "connected",
    currentDestinationLabel: "Home",

    activeMissionId: null,
    currentMissionLabel: null,
    currentMissionTargetPlotId: null,

    returningEtaAt: null,
    maintenanceDueAt: now + DEFAULT_MAINTENANCE_HORIZON_MS,
    lastActivityAt: now,

    createdAt: now,
  };
}
