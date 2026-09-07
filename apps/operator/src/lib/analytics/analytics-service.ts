import "server-only";

import { prisma } from "@/lib/prisma/client";
import { MISSION_FLIGHT_STATUSES } from "@/lib/missions/types";
import { ROBOT_MISSION_ACTIVE_STATUSES } from "@/lib/robot-missions/types";

/**
 * Server-only Analytics data access — mirrors
 * `alerts-service.ts`/`sensors-service.ts`/`missions-service.ts`'s exact
 * shape: the ONLY module that runs cross-table aggregate queries for
 * Analytics/Reports. Every function takes `farmId` explicitly, every caller
 * derives it from the authenticated session, never from client input.
 *
 * Uses Prisma `count`/`groupBy` throughout instead of loading full tables
 * into the Node process — Part 19's "prefer aggregate SQL over loading
 * entire mission/sensor tables" requirement. Every count in
 * `FarmAnalyticsSnapshot` is a REAL, currently-persisted number — no field
 * here is derived from client-only simulation state (that stays exactly
 * where the Analytics page's live sensor-health/recommendation/trend
 * sections already compute it: the Zustand stores + reasoning engine — see
 * `analytics-page.tsx`'s own doc comment for why those parts are NOT moved
 * here).
 */

export interface DroneMissionStatusCounts {
  queued: number;
  preparing: number;
  "taking-off": number;
  surveying: number;
  returning: number;
  landing: number;
  completed: number;
  paused: number;
  cancelled: number;
}

export interface RobotMissionStatusCounts {
  queued: number;
  preparing: number;
  driving: number;
  working: number;
  returning: number;
  completed: number;
  paused: number;
  cancelled: number;
}

export interface FarmAnalyticsSnapshot {
  generatedAt: number;
  plots: { total: number };
  sensors: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    critical: number;
    maintenance: number;
  };
  alerts: {
    active: number;
    resolved: number;
    activeCritical: number;
    activeWarning: number;
  };
  drones: { total: number };
  robots: { total: number };
  droneMissions: { total: number; active: number; byStatus: DroneMissionStatusCounts };
  robotMissions: { total: number; active: number; byStatus: RobotMissionStatusCounts };
  /** `completed / (completed + cancelled)` across BOTH mission types combined — `null` when neither type has any finished mission yet (never fabricated as 0%). */
  missionCompletionRate: number | null;
}

const DRONE_MISSION_STATUSES: (keyof DroneMissionStatusCounts)[] = [
  "queued",
  "preparing",
  "taking-off",
  "surveying",
  "returning",
  "landing",
  "completed",
  "paused",
  "cancelled",
];

const ROBOT_MISSION_STATUSES: (keyof RobotMissionStatusCounts)[] = [
  "queued",
  "preparing",
  "driving",
  "working",
  "returning",
  "completed",
  "paused",
  "cancelled",
];

function zeroCounts<T extends string>(statuses: readonly T[]): Record<T, number> {
  return Object.fromEntries(statuses.map((status) => [status, 0])) as Record<T, number>;
}

export async function getFarmAnalyticsSnapshot(farmId: string): Promise<FarmAnalyticsSnapshot> {
  const [plotCount, sensorsByStatus, activeAlertCount, resolvedAlertCount, activeAlertsBySeverity, droneCount, robotCount, droneMissionsByStatus, robotMissionsByStatus] =
    await Promise.all([
      prisma.plot.count({ where: { farmId } }),
      prisma.sensor.groupBy({ by: ["status"], where: { farmId }, _count: { _all: true } }),
      prisma.alert.count({ where: { farmId, resolvedAt: null } }),
      prisma.alert.count({ where: { farmId, resolvedAt: { not: null } } }),
      prisma.alert.groupBy({ by: ["severity"], where: { farmId, resolvedAt: null }, _count: { _all: true } }),
      prisma.drone.count({ where: { farmId } }),
      prisma.robot.count({ where: { farmId } }),
      prisma.droneMission.groupBy({ by: ["status"], where: { farmId }, _count: { _all: true } }),
      prisma.robotMission.groupBy({ by: ["status"], where: { farmId }, _count: { _all: true } }),
    ]);

  const sensorCounts = { total: 0, online: 0, offline: 0, warning: 0, critical: 0, maintenance: 0 };
  for (const row of sensorsByStatus) {
    sensorCounts.total += row._count._all;
    sensorCounts[row.status] += row._count._all;
  }

  const activeCritical = activeAlertsBySeverity.find((row) => row.severity === "critical")?._count._all ?? 0;
  const activeWarning = activeAlertsBySeverity.find((row) => row.severity === "warning")?._count._all ?? 0;

  const droneMissionCounts = zeroCounts(DRONE_MISSION_STATUSES);
  let droneMissionTotal = 0;
  for (const row of droneMissionsByStatus) {
    const status = row.status.replaceAll("_", "-") as keyof DroneMissionStatusCounts;
    droneMissionCounts[status] += row._count._all;
    droneMissionTotal += row._count._all;
  }
  const droneMissionActive = MISSION_FLIGHT_STATUSES.reduce((sum, status) => sum + droneMissionCounts[status], 0);

  const robotMissionCounts = zeroCounts(ROBOT_MISSION_STATUSES);
  let robotMissionTotal = 0;
  for (const row of robotMissionsByStatus) {
    const status = row.status as keyof RobotMissionStatusCounts;
    robotMissionCounts[status] += row._count._all;
    robotMissionTotal += row._count._all;
  }
  const robotMissionActive = ROBOT_MISSION_ACTIVE_STATUSES.reduce((sum, status) => sum + robotMissionCounts[status], 0);

  const completed = droneMissionCounts.completed + robotMissionCounts.completed;
  const cancelled = droneMissionCounts.cancelled + robotMissionCounts.cancelled;
  const finished = completed + cancelled;

  return {
    generatedAt: Date.now(),
    plots: { total: plotCount },
    sensors: sensorCounts,
    alerts: { active: activeAlertCount, resolved: resolvedAlertCount, activeCritical, activeWarning },
    drones: { total: droneCount },
    robots: { total: robotCount },
    droneMissions: { total: droneMissionTotal, active: droneMissionActive, byStatus: droneMissionCounts },
    robotMissions: { total: robotMissionTotal, active: robotMissionActive, byStatus: robotMissionCounts },
    missionCompletionRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
  };
}
