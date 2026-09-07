import type { MissionType } from "@/lib/missions/types";
import type { RobotMissionType } from "@/lib/robot-missions/types";

/**
 * Recurring Mission types — a SCHEDULE that repeatedly
 * spawns real, distinct DroneMission/RobotMission rows (see
 * `recurring-mission-store.ts`'s own doc comment for why this is a
 * dedicated small domain rather than bolting scheduling fields onto the
 * Mission/RobotMission types themselves). `RecurringMissionConfig` mirrors
 * `schema.prisma`'s model of the same name field-for-field, the same
 * convention every other domain in this app (`MissionRecord`,
 * `CropFinding`,...) already follows.
 */

export type RecurringVehicleKind = "drone" | "robot";

export interface RecurringMissionConfig {
  id: string;
  name: string;
  vehicleKind: RecurringVehicleKind;
  /** Exactly one of these two is set, matching `vehicleKind` — same "two nullable typed fields" convention `CropFinding`'s detection fields already establish. */
  droneMissionType: MissionType | null;
  robotMissionType: RobotMissionType | null;
  targetPlotId: string | null;
  assignedDroneId: string | null;
  assignedRobotId: string | null;

  intervalMinutes: number;
  enabled: boolean;
  /** When the scheduler should spawn the next run — `null` while a run is currently active (Part 12's overlap guard). */
  nextRunAt: number | null;
  /** The currently in-flight spawned run's id (a DroneMission.id or RobotMission.id, whichever `vehicleKind` says) — `null` when no run from this schedule is active right now. */
  activeRunId: string | null;

  createdAt: number;
}

export interface NewRecurringMissionInput {
  name: string;
  vehicleKind: RecurringVehicleKind;
  droneMissionType?: MissionType | null;
  robotMissionType?: RobotMissionType | null;
  targetPlotId: string | null;
  assignedDroneId?: string | null;
  assignedRobotId?: string | null;
  intervalMinutes: number;
}

export const MIN_RECURRING_INTERVAL_MINUTES = 1;
export const MAX_RECURRING_INTERVAL_MINUTES = 24 * 60;
