import type { Route } from "@/components/digital-twin/scene/farm-data";
import { COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPES, type CommunicationType } from "@/lib/fleet/types";

/**
 * Shared Robot Store types — the single source of truth for
 * every ground robot in AgriNexus, mirroring `lib/fleet/types.ts` (the Drone
 * Fleet's equivalent) field-for-field wherever a ground robot has the same
 * concept. `CommunicationType` is imported (not redefined) from the Fleet
 * Store's types — the exact same set of radios applies to a ground unit, so
 * reusing it is "mirror wherever possible" rather than a parallel enum.
 */

export type RobotType = "wheeled" | "tracked" | "quadruped" | "utility";
export type RobotHealth = "nominal" | "attention" | "critical";
export type ConnectionQuality = "connected" | "weak" | "offline";
export type RobotStatus = "active" | "on-mission" | "paused" | "returning" | "charging" | "idle" | "maintenance" | "offline";

export const ROBOT_TYPES: RobotType[] = ["wheeled", "tracked", "quadruped", "utility"];
export { COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPES, type CommunicationType };

export const ROBOT_TYPE_LABELS: Record<RobotType, string> = {
  wheeled: "Wheeled Rover",
  tracked: "Tracked Rover",
  quadruped: "Quadruped",
  utility: "Utility Robot",
};

export const ROBOT_STATUS_LABELS: Record<RobotStatus, string> = {
  active: "Active",
  "on-mission": "On Mission",
  paused: "Paused",
  returning: "Returning",
  charging: "Charging",
  idle: "Idle",
  maintenance: "Maintenance",
  offline: "Offline",
};

/** Statuses in which `scene/systems/robot.tsx` actually advances the chassis along its route — every other status parks it in place (see the component's own `useFrame` gate). */
export const ROBOT_MOVING_STATUSES: RobotStatus[] = ["active", "on-mission", "returning"];

export const CONNECTION_QUALITY_LABELS: Record<ConnectionQuality, string> = {
  connected: "Connected",
  weak: "Weak Signal",
  offline: "Offline",
};

export interface RobotCapabilities {
  camera: boolean;
  lidar: boolean;
  sprayer: boolean;
  seeder: boolean;
  fertilizer: boolean;
  aiEnabled: boolean;
}

/**
 * A ground robot as it exists in the Robot Store. Split the same way
 * `DroneRecord` is: identity/spec fields set once at creation (name, model,
 * type, capacities, home position, patrol route) vs. live/simulated fields
 * (status, battery, position, health) updated via `updateRobotTelemetry` and
 * the store's dedicated action creators.
 */
export interface RobotRecord {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  robotType: RobotType;
  color: string;
  maxSpeedMps: number;
  batteryCapacityMah: number;
  maxRuntimeMinutes: number;
  communicationType: CommunicationType;
  homePosition: [number, number];
  notes: string;
  capabilities: RobotCapabilities;

  /** The robot's CURRENT active route — its own patrol loop, a "return home" shuttle, or an assigned-mission shuttle. Swapped only by `setRobotActiveRoute`, never by a telemetry tick — same rule `DroneRecord.route` follows. */
  route: Route;
  /** The robot's own patrol route, set once at creation and never overwritten. */
  homePatrolRoute: Route;
  /** Bumped only when `route` is reassigned — Scene keys a clean remount of the affected `<Robot>` instance on this, same technique `DroneRecord.routeVersion` uses. */
  routeVersion: number;

  status: RobotStatus;
  batteryPercent: number;
  speedMps: number;
  position: [number, number];
  headingDegrees: number;
  cpuPercent: number;
  temperatureC: number;
  motorHealth: RobotHealth;
  wheelHealth: RobotHealth;
  health: RobotHealth;
  signalPercent: number;
  connectionQuality: ConnectionQuality;
  currentDestinationLabel: string;

  /** Set by `assignMission`; null while the robot has no mission (patrolling, idle, etc). A lightweight, self-contained concept scoped to the Robot Store only — see `lib/robots/robot-store.ts`'s own doc comment for why this deliberately does NOT reuse `lib/missions/mission-store.ts`. */
  activeMissionId: string | null;
  currentMissionLabel: string | null;
  currentMissionTargetPlotId: string | null;

  /** Timestamp (ms) `sendRobotHome` estimates the robot will arrive home — the Robot Simulation ticker flips status to "charging" once `Date.now()` passes it. Null whenever status isn't "returning". */
  returningEtaAt: number | null;
  maintenanceDueAt: number;
  lastActivityAt: number;
  createdAt: number;
}

export type NewRobotInput = Pick<
  RobotRecord,
  | "name"
  | "model"
  | "manufacturer"
  | "robotType"
  | "color"
  | "maxSpeedMps"
  | "batteryCapacityMah"
  | "maxRuntimeMinutes"
  | "communicationType"
  | "homePosition"
  | "notes"
  | "capabilities"
>;

/** The subset of a `RobotRecord` the Digital Twin's `<Robot>` instance actually needs to render/move — mirrors `DroneRenderConfig`. Includes `status` (unlike drones) because ground robot movement gates on it directly — see `ROBOT_MOVING_STATUSES`. */
export interface RobotRenderConfig {
  id: string;
  label: string;
  route: Route;
  routeVersion: number;
  speedMps: number;
  color: string;
  status: RobotStatus;
  batteryPercent: number;
}

/** The subset of live fields the Digital Twin's telemetry poll pushes back into the store — deliberately excludes `status` (see `digital-twin-page.tsx`'s robot poll doc comment for why: unlike the drone poll, this one never overwrites status, since the Robot Store's own actions are the single source of truth for it). */
export type RobotTelemetryUpdate = Partial<
  Pick<RobotRecord, "position" | "batteryPercent" | "currentDestinationLabel" | "headingDegrees">
>;
