import type { Route } from "@/components/digital-twin/scene/farm-data";

/**
 * Shared Fleet Store types — the single source of truth for
 * every drone in AgriNexus. Every consumer (Digital Twin, AURA, the Drone
 * Fleet page, and eventually Mission Planner/Analytics/Reports) reads a
 * `DroneRecord` from here rather than holding its own copy.
 */

export type DroneType = "quadcopter" | "hexacopter" | "octocopter" | "fixed-wing" | "vtol";
export type CameraType = "rgb" | "thermal" | "multispectral" | "rgb-thermal" | "none";
export type CommunicationType = "wifi" | "radio" | "cellular" | "satellite";
export type DroneStatus = "patrolling" | "idle" | "returning" | "charging" | "maintenance" | "offline" | "on-mission";
export type DroneHealth = "nominal" | "attention" | "critical";

export const DRONE_TYPES: DroneType[] = ["quadcopter", "hexacopter", "octocopter", "fixed-wing", "vtol"];
export const CAMERA_TYPES: CameraType[] = ["rgb", "thermal", "multispectral", "rgb-thermal", "none"];
export const COMMUNICATION_TYPES: CommunicationType[] = ["wifi", "radio", "cellular", "satellite"];

export const DRONE_TYPE_LABELS: Record<DroneType, string> = {
  quadcopter: "Quadcopter",
  hexacopter: "Hexacopter",
  octocopter: "Octocopter",
  "fixed-wing": "Fixed-Wing",
  vtol: "VTOL",
};

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  rgb: "RGB",
  thermal: "Thermal",
  multispectral: "Multispectral",
  "rgb-thermal": "RGB + Thermal",
  none: "None",
};

export const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  wifi: "Wi-Fi",
  radio: "Radio",
  cellular: "Cellular",
  satellite: "Satellite",
};

export const DRONE_STATUS_LABELS: Record<DroneStatus, string> = {
  patrolling: "Patrolling",
  idle: "Idle",
  returning: "Returning",
  charging: "Charging",
  maintenance: "Maintenance",
  offline: "Offline",
  "on-mission": "On Mission",
};

/**
 * A drone as it exists in the Fleet Store. Split conceptually into two
 * groups (not two types, so nothing is duplicated):
 *  - identity/spec fields, set once at creation (name, model, serial,
 *  type, camera, battery capacity, flight time, comms, firmware, home
 *  location, color, notes, route) — these drive the Digital Twin's
 *  rendering and never change after `addDrone`.
 *  - live/simulated fields (status, batteryPercent, position,
 *  currentWaypointLabel, health, signalPercent, flightHours,
 *  storageUsedPercent) — mirrors of whatever the live 3D unit (or, later,
 *  a real drone's telemetry) is doing right now,
 *  updated via `updateDroneTelemetry` and read by everything else.
 */
export interface DroneRecord {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  droneType: DroneType;
  cameraType: CameraType;
  batteryCapacityMah: number;
  maxFlightTimeMinutes: number;
  communicationType: CommunicationType;
  firmwareVersion: string;
  homeLocation: [number, number];
  color: string;
  notes: string;
  /** The drone's CURRENT active route — its own patrol loop, or a mission's generated flight path while `activeMissionId` is set. Swapped only by `setDroneActiveRoute`, never by a telemetry tick. */
  route: Route;
  /** The drone's own patrol route, set once at creation and never overwritten — `setDroneActiveRoute` restores this into `route` once a mission completes/cancels. */
  homePatrolRoute: Route;
  /** Bumped only when `route` is reassigned (mission start/end) — never on a telemetry tick. Scene uses this to key a clean remount of the affected `<Drone>` instance so its internal waypoint cursor restarts at index 0 on the new route, with no changes to drone.tsx itself. */
  routeVersion: number;
  /** The mission currently occupying this drone's route, if any — null while patrolling. */
  activeMissionId: string | null;

  status: DroneStatus;
  batteryPercent: number;
  speedMps: number;
  altitude: number;
  position: [number, number];
  currentWaypointLabel: string;
  health: DroneHealth;
  signalPercent: number;
  flightHours: number;
  storageUsedPercent: number;

  createdAt: number;
}

export type NewDroneInput = Pick<
  DroneRecord,
  | "name"
  | "model"
  | "serialNumber"
  | "droneType"
  | "cameraType"
  | "batteryCapacityMah"
  | "maxFlightTimeMinutes"
  | "communicationType"
  | "firmwareVersion"
  | "homeLocation"
  | "color"
  | "notes"
>;

/** The subset of a `DroneRecord` the Digital Twin's `<Drone>` instance actually needs to render/move — immutable after creation (see the split above), so selecting these is safe for components that must NOT rerender on every telemetry tick. */
export interface DroneRenderConfig {
  id: string;
  label: string;
  route: Route;
  /** See `DroneRecord.routeVersion` — carried through so `Scene` can key its `<Drone>` remount on route changes. */
  routeVersion: number;
  altitude: number;
  speedMps: number;
  batteryPercent: number;
}

/** The subset of live fields the poll loop in `digital-twin-page.tsx` pushes back into the store — deliberately excludes the immutable spec fields above. */
export type DroneTelemetryUpdate = Partial<
  Pick<DroneRecord, "position" | "batteryPercent" | "status" | "currentWaypointLabel">
>;
