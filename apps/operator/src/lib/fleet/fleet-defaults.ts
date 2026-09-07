import type { Route } from "@/components/digital-twin/scene/farm-data";

import type { DroneRecord, NewDroneInput } from "./types";

const DEFAULT_ALTITUDE = 9;
const DEFAULT_SPEED_MPS = 3.2;

/**
 * A newly added drone has no mission yet, so it sits at
 * its own Home Location — a single-waypoint, non-moving route — rather
 * than automatically flying a patrol loop. This replaces the previous
 * 4-corner "patrol loop around Home Location" default: that loop was the
 * actual root cause of drones-with-no-mission visibly flying laps in the
 * Digital Twin (the movement system in `scene/systems/drone.tsx` follows
 * whatever route it's handed, unconditionally — a status label alone
 * never controlled movement). A route with exactly one waypoint means the
 * drone is already "at" its only target every frame, so nothing moves;
 * see this file's own `buildNewDroneRecord`, which pairs this with
 * `status: "idle"`.
 */
export function buildDefaultRoute(id: string, homeLocation: [number, number]): Route {
  return {
    id: `${id}-route`,
    label: `${id} Home`,
    loop: true,
    waypoints: [{ id: `${id}-wp-home`, label: "Home", position: homeLocation }],
  };
}

/** Builds a complete `DroneRecord` from the Add Drone form's input — every live/simulated field starts at a sensible, honest default (full battery, not yet dispatched) rather than a fabricated in-progress value. */
export function buildNewDroneRecord(id: string, input: NewDroneInput): DroneRecord {
  const route = buildDefaultRoute(id, input.homeLocation);

  return {
    id,
    ...input,
    route,
    homePatrolRoute: route,
    routeVersion: 0,
    activeMissionId: null,

    status: "idle",
    batteryPercent: 100,
    speedMps: DEFAULT_SPEED_MPS,
    altitude: DEFAULT_ALTITUDE,
    position: input.homeLocation,
    currentWaypointLabel: "Home",
    health: "nominal",
    signalPercent: 100,
    flightHours: 0,
    storageUsedPercent: 0,

    createdAt: Date.now(),
  };
}
