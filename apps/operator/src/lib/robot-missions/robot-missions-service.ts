import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { RobotMissionEstimate, RobotMissionRecord, RobotMissionStatus, RobotMissionType, RobotMissionWaypoint } from "@/lib/robot-missions/types";
import type { MissionSensorJustification } from "@/lib/sensor-analytics/types";

import type { RobotMissionStatus as PrismaRobotMissionStatus, RobotMissionType as PrismaRobotMissionType } from "@/lib/prisma/generated/enums";

/**
 * Server-only Robot Mission data access — mirrors
 * `missions-service.ts` field-for-field (see that file's own doc comment
 * for the full "lifecycle-boundaries-only" / "reject cross-farm relations
 * outright" reasoning, which applies here unchanged).
 */

function toPrismaMissionType(missionType: RobotMissionType): PrismaRobotMissionType {
  return missionType.replaceAll("-", "_") as PrismaRobotMissionType;
}
function toDomainMissionType(missionType: PrismaRobotMissionType): RobotMissionType {
  return missionType.replaceAll("_", "-") as RobotMissionType;
}
function toPrismaStatus(status: RobotMissionStatus): PrismaRobotMissionStatus {
  return status as PrismaRobotMissionStatus;
}
function toDomainStatus(status: PrismaRobotMissionStatus): RobotMissionStatus {
  return status as RobotMissionStatus;
}

type RobotMissionRow = {
  id: string;
  name: string;
  missionType: PrismaRobotMissionType;
  targetPlotId: string | null;
  assignedRobotId: string | null;
  status: PrismaRobotMissionStatus;
  speedMps: number;
  pathSpacingPercent: number;
  homePositionX: number | null;
  homePositionZ: number | null;
  startPositionX: number | null;
  startPositionZ: number | null;
  returnPositionX: number | null;
  returnPositionZ: number | null;
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

function toDomainMission(row: RobotMissionRow): RobotMissionRecord {
  return {
    id: row.id,
    name: row.name,
    missionType: toDomainMissionType(row.missionType),
    targetPlotId: row.targetPlotId,
    assignedRobotId: row.assignedRobotId,
    status: toDomainStatus(row.status),
    speedMps: row.speedMps,
    pathSpacingPercent: row.pathSpacingPercent,
    homePosition: row.homePositionX !== null && row.homePositionZ !== null ? [row.homePositionX, row.homePositionZ] : null,
    startPosition: row.startPositionX !== null && row.startPositionZ !== null ? [row.startPositionX, row.startPositionZ] : null,
    returnPosition: row.returnPositionX !== null && row.returnPositionZ !== null ? [row.returnPositionX, row.returnPositionZ] : null,
    waypoints: Array.isArray(row.waypoints) ? (row.waypoints as RobotMissionWaypoint[]) : [],
    estimate: (row.estimate as RobotMissionEstimate | null) ?? null,
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

async function relationsBelongToFarm(farmId: string, targetPlotId: string | null, assignedRobotId: string | null, recurringConfigId?: string | null): Promise<boolean> {
  if (targetPlotId) {
    const plot = await prisma.plot.findUnique({ where: { id: targetPlotId }, select: { farmId: true } });
    if (!plot || plot.farmId !== farmId) return false;
  }
  if (assignedRobotId) {
    const robot = await prisma.robot.findUnique({ where: { id: assignedRobotId }, select: { farmId: true } });
    if (!robot || robot.farmId !== farmId) return false;
  }
  if (recurringConfigId) {
    const config = await prisma.recurringMissionConfig.findUnique({ where: { id: recurringConfigId }, select: { farmId: true } });
    if (!config || config.farmId !== farmId) return false;
  }
  return true;
}

export async function listRobotMissions(farmId: string): Promise<RobotMissionRecord[]> {
  const rows = await prisma.robotMission.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomainMission);
}

/** `null` for "doesn't exist or belongs to a different farm" — same non-leaking pattern every other 018x service uses. */
export async function getRobotMission(farmId: string, missionId: string): Promise<RobotMissionRecord | null> {
  const row = await prisma.robotMission.findUnique({ where: { id: missionId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainMission(row);
}

export type RobotMissionSnapshotInput = Omit<RobotMissionRecord, "id">;

/** Returns `null` (never throws) if `targetPlotId`/`assignedRobotId` don't belong to `farmId` — the route answers 400. */
export async function createRobotMission(farmId: string, id: string, data: RobotMissionSnapshotInput): Promise<RobotMissionRecord | null> {
  if (!(await relationsBelongToFarm(farmId, data.targetPlotId, data.assignedRobotId, data.recurringConfigId))) return null;

  // Same "already-validated-by-zod, safe to hand to Prisma as `any`" reasoning `missions-service.ts`'s `createMission` documents.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await prisma.robotMission.create({ data: { id, farmId, ...toPrismaData(data) } as any });
  return toDomainMission(row);
}

/** Partial lifecycle-snapshot update. Returns `null` for "mission not found on this farm" OR "the new plot/robot reference doesn't belong to this farm" — same reject-the-whole-write rule `createRobotMission` uses. */
export async function updateRobotMission(
  farmId: string,
  missionId: string,
  data: Partial<RobotMissionSnapshotInput>,
): Promise<RobotMissionRecord | null> {
  const existing = await prisma.robotMission.findUnique({ where: { id: missionId } });
  if (!existing || existing.farmId !== farmId) return null;

  const nextTargetPlotId = data.targetPlotId !== undefined ? data.targetPlotId : existing.targetPlotId;
  const nextAssignedRobotId = data.assignedRobotId !== undefined ? data.assignedRobotId : existing.assignedRobotId;
  const nextRecurringConfigId = data.recurringConfigId !== undefined ? data.recurringConfigId : existing.recurringConfigId;
  if (!(await relationsBelongToFarm(farmId, nextTargetPlotId, nextAssignedRobotId, nextRecurringConfigId))) return null;

  const row = await prisma.robotMission.update({ where: { id: missionId }, data: toPrismaData(data) });
  return toDomainMission(row);
}

/** Returns `false` (not thrown) if the mission doesn't exist or belongs to a different farm. */
export async function deleteRobotMission(farmId: string, missionId: string): Promise<boolean> {
  const existing = await prisma.robotMission.findUnique({ where: { id: missionId } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.robotMission.delete({ where: { id: missionId } });
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPrismaData(data: Partial<RobotMissionSnapshotInput>): Record<string, any> {
  const out: Record<string, unknown> = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.missionType !== undefined) out.missionType = toPrismaMissionType(data.missionType);
  if (data.targetPlotId !== undefined) out.targetPlotId = data.targetPlotId;
  if (data.assignedRobotId !== undefined) out.assignedRobotId = data.assignedRobotId;
  if (data.status !== undefined) out.status = toPrismaStatus(data.status);
  if (data.speedMps !== undefined) out.speedMps = data.speedMps;
  if (data.pathSpacingPercent !== undefined) out.pathSpacingPercent = data.pathSpacingPercent;
  if (data.homePosition !== undefined) {
    out.homePositionX = data.homePosition?.[0] ?? null;
    out.homePositionZ = data.homePosition?.[1] ?? null;
  }
  if (data.startPosition !== undefined) {
    out.startPositionX = data.startPosition?.[0] ?? null;
    out.startPositionZ = data.startPosition?.[1] ?? null;
  }
  if (data.returnPosition !== undefined) {
    out.returnPositionX = data.returnPosition?.[0] ?? null;
    out.returnPositionZ = data.returnPosition?.[1] ?? null;
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
