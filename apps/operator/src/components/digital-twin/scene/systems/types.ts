import type * as THREE from "three";

/**
 * The shared imperative surface both Drone Alpha and Robot Bravo expose.
 * Deliberately small and generic ("future hardware compatibility" — a real
 * telemetry-backed unit could implement the same shape):
 *  - `getObject`: the live Object3D, for Camera Follow to track and for the
 *  Mini-map to read a position from — nothing duplicates this transform.
 *  - `getStatus`: a throttle-friendly snapshot for the Details Panel to poll
 *  at low frequency. Movement itself never touches React state.
 */
export interface AutonomousUnitStatus {
  batteryPercent: number;
  /** Optional since not every future unit type may expose a speed reading; both Drone Alpha and Robot Bravo populate it today. */
  speedMps?: number;
  status: string;
  /** "Current Waypoint" (drone) or "Current Destination" (robot). */
  currentLabel: string;
}

export interface AutonomousUnitHandle {
  getObject: () => THREE.Object3D | null;
  getStatus: () => AutonomousUnitStatus;
}
