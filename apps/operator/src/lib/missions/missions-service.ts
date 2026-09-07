import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { MissionEstimate, MissionRecord, MissionStatus, MissionType, MissionWaypoint } from "@/lib/missions/types";
import type { MissionSensorJustification } from "@/lib/sensor-analytics/types";

import type { DroneMissionStatus as PrismaMissionStatus, DroneMissionType as PrismaMissionType } from "@/lib/prisma/generated/enums";

/**
 * Server-only Drone Mission data access — mirrors
 * `sensors-service.ts`/`plots-service.ts`'s exact shape. Every function
 * takes `farmId` explicitly, every caller derives it from the authenticated
 * session, never from client input.
 *
 * Persists at LIFECYCLE BOUNDARIES ONLY — see schema.prisma's top-of-file
 * note. `syncMission` (used by every mutating route) is the single write
 * path: it takes a full snapshot of the Mission Store's record (as
 * constructed by `buildNewMissionRecord`/the store's own reducers) and
 * upserts it, validating `targetPlotId`/`assignedDroneId` belong to the
 * SAME farm on every write — the anti-cross-farm-assignment
 * requirement. Returns `null` (never throws) when that
 * validation fails, so the calling route can answer a clean 400 rather than
 * silently reassigning to a different plot/drone or leaking whether the
 * referenced id exists on another farm.
 */

function toPrismaMissionType(missionType: MissionType): PrismaMissionType {
  return missionType.replaceAll("-", "_") as PrismaMissionType;
}
function toDomainMissionType(missionType: PrismaMissionType): MissionType {
  return missionType.replaceAll("_", "-") as MissionType;
}
function toPrismaStatus(status: MissionStatus): PrismaMissionStatus {
  return status.replaceAll("-", "_") as PrismaMissionStatus;
}
function toDomainStatus(status: PrismaMissionStatus): MissionStatus {
  return status.replaceAll("_", "-") as MissionStatus;
}

type MissionRow = {
  id: string;
  name: string;
  missionType: PrismaMissionType;
  targetPlotId: string | null;
  assignedDroneId: string | null;
  status: PrismaMissionStatus;
  altitude: number;
  speedMps: number;
  sideOverlapPercent: number;
  frontOverlapPercent: number;
  homePositionX: number | null;
  homePositionZ: number | null;
  takeoffPositionX: number | null;
  takeoffPositionZ: number | null;
  landingPositionX: number | null;
  landingPositionZ: number | null;
  waypoints: unknown;
  estimate: unknown;
  progressPercent: number;
  coverageProgressPercent: number;
  currentWaypointIndex: number;
  headingDegrees: number | null;
  batteryAtStartPercent: number | null;
  sensorJustification: unknown;
  recurringConfigId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

function toDomainMission(row: MissionRow): MissionRecord {
  return {
    id: row.id,
    name: row.name,
    missionType: toDomainMissionType(row.missionType),
    targetPlotId: row.targetPlotId,
    assignedDroneId: row.assignedDroneId,
    status: toDomainStatus(row.status),
    altitude: row.altitude,
    speedMps: row.speedMps,
    sideOverlapPercent: row.sideOverlapPercent,
    frontOverlapPercent: row.frontOverlapPercent,
    homePosition: row.homePositionX !== null && row.homePositionZ !== null ? [row.homePositionX, row.homePositionZ] : null,
    takeoffPosition: row.takeoffPositionX !== null && row.takeoffPositionZ !== null ? [row.takeoffPositionX, row.takeoffPositionZ] : null,
    landingPosition: row.landingPositionX !== null && row.landingPositionZ !== null ? [row.landingPositionX, row.landingPositionZ] : null,
    waypoints: Array.isArray(row.waypoints) ? (row.waypoints as MissionWaypoint[]) : [],
    estimate: (row.estimate as MissionEstimate | null) ?? null,
    progressPercent: row.progressPercent,
    coverageProgressPercent: row.coverageProgressPercent,
    currentWaypointIndex: row.currentWaypointIndex,
    headingDegrees: row.headingDegrees,
    batteryAtStartPercent: row.batteryAtStartPercent,
    sensorJustification: (row.sensorJustification as MissionSensorJustification | null) ?? null,
    recurringConfigId: row.recurringConfigId,
    createdAt: row.createdAt.getTime(),
    startedAt: row.startedAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null,
  };
}

/** Rejects a cross-farm plot/drone/recurring-config reference outright (Part 7) rather than silently dropping it — the caller treats `false` as "reject the whole write." */
async function relationsBelongToFarm(farmId: string, targetPlotId: string | null, assignedDroneId: string | null, recurringConfigId?: string | null): Promise<boolean> {
  if (targetPlotId) {
    const plot = await prisma.plot.findUnique({ where: { id: targetPlotId }, select: { farmId: true } });
    if (!plot || plot.farmId !== farmId) return false;
  }
  if (assignedDroneId) {
    const drone = await prisma.drone.findUnique({ where: { id: assignedDroneId }, select: { farmId: true } });
    if (!drone || drone.farmId !== farmId) return false;
  }
  if (recurringConfigId) {
    const config = await prisma.recurringMissionConfig.findUnique({ where: { id: recurringConfigId }, select: { farmId: true } });
    if (!config || config.farmId !== farmId) return false;
  }
  return true;
}

export async function listMissions(farmId: string): Promise<MissionRecord[]> {
  const rows = await prisma.droneMission.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomainMission);
}

/** `null` for "doesn't exist or belongs to a different farm" — same non-leaking pattern every other 018x service uses. */
export async function getMission(farmId: string, missionId: string): Promise<MissionRecord | null> {
  const row = await prisma.droneMission.findUnique({ where: { id: missionId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainMission(row);
}

/** Full-snapshot data every write (create or update) needs — mirrors `MissionRecord` minus `id` (supplied separately). */
export type MissionSnapshotInput = Omit<MissionRecord, "id">;

/** Returns `null` (never throws) if `targetPlotId`/`assignedDroneId` don't belong to `farmId` — the route answers 400. */
export async function createMission(farmId: string, id: string, data: MissionSnapshotInput): Promise<MissionRecord | null> {
  if (!(await relationsBelongToFarm(farmId, data.targetPlotId, data.assignedDroneId, data.recurringConfigId))) return null;

  // `toPrismaData` returns a partial-shaped `Record<string, any>` built from
  // a full `MissionSnapshotInput` (every field always present on create) —
  // safe to hand to Prisma as `any` here; the zod schema in the API route
  // already validated the actual shape before this ever runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await prisma.droneMission.create({ data: { id, farmId, ...toPrismaData(data) } as any });
  return toDomainMission(row);
}

/** Partial lifecycle-snapshot update — used by every mutating action (assign/settings/generate/start/pause/resume/cancel/complete/duplicate). Returns `null` for "mission not found on this farm" OR "the new plot/drone reference doesn't belong to this farm" — same non-leaking, reject-the-whole-write rule `createMission` uses. */
export async function updateMission(farmId: string, missionId: string, data: Partial<MissionSnapshotInput>): Promise<MissionRecord | null> {
  const existing = await prisma.droneMission.findUnique({ where: { id: missionId } });
  if (!existing || existing.farmId !== farmId) return null;

  const nextTargetPlotId = data.targetPlotId !== undefined ? data.targetPlotId : existing.targetPlotId;
  const nextAssignedDroneId = data.assignedDroneId !== undefined ? data.assignedDroneId : existing.assignedDroneId;
  const nextRecurringConfigId = data.recurringConfigId !== undefined ? data.recurringConfigId : existing.recurringConfigId;
  if (!(await relationsBelongToFarm(farmId, nextTargetPlotId, nextAssignedDroneId, nextRecurringConfigId))) return null;

  const row = await prisma.droneMission.update({ where: { id: missionId }, data: toPrismaData(data) });
  return toDomainMission(row);
}

/** Returns `false` (not thrown) if the mission doesn't exist or belongs to a different farm. */
export async function deleteMission(farmId: string, missionId: string): Promise<boolean> {
  const existing = await prisma.droneMission.findUnique({ where: { id: missionId } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.droneMission.delete({ where: { id: missionId } });
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPrismaData(data: Partial<MissionSnapshotInput>): Record<string, any> {
  const out: Record<string, unknown> = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.missionType !== undefined) out.missionType = toPrismaMissionType(data.missionType);
  if (data.targetPlotId !== undefined) out.targetPlotId = data.targetPlotId;
  if (data.assignedDroneId !== undefined) out.assignedDroneId = data.assignedDroneId;
  if (data.status !== undefined) out.status = toPrismaStatus(data.status);
  if (data.altitude !== undefined) out.altitude = data.altitude;
  if (data.speedMps !== undefined) out.speedMps = data.speedMps;
  if (data.sideOverlapPercent !== undefined) out.sideOverlapPercent = data.sideOverlapPercent;
  if (data.frontOverlapPercent !== undefined) out.frontOverlapPercent = data.frontOverlapPercent;
  if (data.homePosition !== undefined) {
    out.homePositionX = data.homePosition?.[0] ?? null;
    out.homePositionZ = data.homePosition?.[1] ?? null;
  }
  if (data.takeoffPosition !== undefined) {
    out.takeoffPositionX = data.takeoffPosition?.[0] ?? null;
    out.takeoffPositionZ = data.takeoffPosition?.[1] ?? null;
  }
  if (data.landingPosition !== undefined) {
    out.landingPositionX = data.landingPosition?.[0] ?? null;
    out.landingPositionZ = data.landingPosition?.[1] ?? null;
  }
  if (data.waypoints !== undefined) out.waypoints = data.waypoints;
  if (data.estimate !== undefined) out.estimate = data.estimate;
  if (data.progressPercent !== undefined) out.progressPercent = data.progressPercent;
  if (data.coverageProgressPercent !== undefined) out.coverageProgressPercent = data.coverageProgressPercent;
  if (data.currentWaypointIndex !== undefined) out.currentWaypointIndex = data.currentWaypointIndex;
  if (data.headingDegrees !== undefined) out.headingDegrees = data.headingDegrees;
  if (data.batteryAtStartPercent !== undefined) out.batteryAtStartPercent = data.batteryAtStartPercent;
  if (data.sensorJustification !== undefined) out.sensorJustification = data.sensorJustification;
  if (data.recurringConfigId !== undefined) out.recurringConfigId = data.recurringConfigId;
  if (data.startedAt !== undefined) out.startedAt = data.startedAt !== null ? new Date(data.startedAt) : null;
  if (data.completedAt !== undefined) out.completedAt = data.completedAt !== null ? new Date(data.completedAt) : null;
  return out;
}
