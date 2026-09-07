import "server-only";

import { prisma } from "@/lib/prisma/client";

import type { MissionType } from "@/lib/missions/types";
import type {
  DroneMissionType as PrismaDroneMissionType,
  RecurringVehicleKind as PrismaVehicleKind,
  RobotMissionType as PrismaRobotMissionType,
} from "@/lib/prisma/generated/enums";
import type { RobotMissionType } from "@/lib/robot-missions/types";

import type { RecurringMissionConfig, RecurringVehicleKind } from "./types";

/**
 * Server-only Recurring Mission Config data access —
 * mirrors `findings-service.ts`/`missions-service.ts`'s exact shape. Every
 * function takes `farmId` explicitly; every caller derives it from the
 * authenticated session, never from client input.
 */

function toPrismaMissionType(missionType: MissionType): PrismaDroneMissionType {
  return missionType.replaceAll("-", "_") as PrismaDroneMissionType;
}
function toDomainMissionType(missionType: PrismaDroneMissionType): MissionType {
  return missionType.replaceAll("_", "-") as MissionType;
}
function toPrismaRobotMissionType(missionType: RobotMissionType): PrismaRobotMissionType {
  return missionType.replaceAll("-", "_") as PrismaRobotMissionType;
}
function toDomainRobotMissionType(missionType: PrismaRobotMissionType): RobotMissionType {
  return missionType.replaceAll("_", "-") as RobotMissionType;
}

type ConfigRow = {
  id: string;
  name: string;
  vehicleKind: PrismaVehicleKind;
  droneMissionType: PrismaDroneMissionType | null;
  robotMissionType: PrismaRobotMissionType | null;
  targetPlotId: string | null;
  assignedDroneId: string | null;
  assignedRobotId: string | null;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: Date | null;
  activeRunId: string | null;
  createdAt: Date;
};

function toDomain(row: ConfigRow): RecurringMissionConfig {
  return {
    id: row.id,
    name: row.name,
    vehicleKind: row.vehicleKind as RecurringVehicleKind,
    droneMissionType: row.droneMissionType ? toDomainMissionType(row.droneMissionType) : null,
    robotMissionType: row.robotMissionType ? toDomainRobotMissionType(row.robotMissionType) : null,
    targetPlotId: row.targetPlotId,
    assignedDroneId: row.assignedDroneId,
    assignedRobotId: row.assignedRobotId,
    intervalMinutes: row.intervalMinutes,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt ? row.nextRunAt.getTime() : null,
    activeRunId: row.activeRunId,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listRecurringMissions(farmId: string): Promise<RecurringMissionConfig[]> {
  const rows = await prisma.recurringMissionConfig.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomain);
}

export interface CreateRecurringMissionInput {
  id: string;
  name: string;
  vehicleKind: RecurringVehicleKind;
  droneMissionType: MissionType | null;
  robotMissionType: RobotMissionType | null;
  targetPlotId: string | null;
  assignedDroneId: string | null;
  assignedRobotId: string | null;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: number | null;
}

/** Validates every relation belongs to the SAME farm (Part 7's anti-cross-farm rule, applied here too) before creating — returns `null` (never throws) on any mismatch. */
async function relationsBelongToFarm(farmId: string, targetPlotId: string | null, assignedDroneId: string | null, assignedRobotId: string | null): Promise<boolean> {
  if (targetPlotId) {
    const plot = await prisma.plot.findUnique({ where: { id: targetPlotId }, select: { farmId: true } });
    if (!plot || plot.farmId !== farmId) return false;
  }
  if (assignedDroneId) {
    const drone = await prisma.drone.findUnique({ where: { id: assignedDroneId }, select: { farmId: true } });
    if (!drone || drone.farmId !== farmId) return false;
  }
  if (assignedRobotId) {
    const robot = await prisma.robot.findUnique({ where: { id: assignedRobotId }, select: { farmId: true } });
    if (!robot || robot.farmId !== farmId) return false;
  }
  return true;
}

export async function createRecurringMission(farmId: string, input: CreateRecurringMissionInput): Promise<RecurringMissionConfig | null> {
  if (!(await relationsBelongToFarm(farmId, input.targetPlotId, input.assignedDroneId, input.assignedRobotId))) return null;

  const row = await prisma.recurringMissionConfig.create({
    data: {
      id: input.id,
      farmId,
      name: input.name,
      vehicleKind: input.vehicleKind,
      droneMissionType: input.droneMissionType ? toPrismaMissionType(input.droneMissionType) : null,
      robotMissionType: input.robotMissionType ? toPrismaRobotMissionType(input.robotMissionType) : null,
      targetPlotId: input.targetPlotId,
      assignedDroneId: input.assignedDroneId,
      assignedRobotId: input.assignedRobotId,
      intervalMinutes: input.intervalMinutes,
      enabled: input.enabled,
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : null,
    },
  });
  return toDomain(row);
}

export interface UpdateRecurringMissionInput {
  enabled?: boolean;
  intervalMinutes?: number;
  nextRunAt?: number | null;
  activeRunId?: string | null;
}

/** Partial update — the scheduler's own lifecycle writes (spawning a run, recording completion) only ever touch `enabled`/`intervalMinutes`/`nextRunAt`/`activeRunId`; every identity/target field is set once at creation and never changes. Returns `null` for "not found on this farm." */
export async function updateRecurringMission(farmId: string, id: string, data: UpdateRecurringMissionInput): Promise<RecurringMissionConfig | null> {
  const existing = await prisma.recurringMissionConfig.findUnique({ where: { id } });
  if (!existing || existing.farmId !== farmId) return null;

  const row = await prisma.recurringMissionConfig.update({
    where: { id },
    data: {
      enabled: data.enabled,
      intervalMinutes: data.intervalMinutes,
      nextRunAt: data.nextRunAt !== undefined ? (data.nextRunAt ? new Date(data.nextRunAt) : null) : undefined,
      activeRunId: data.activeRunId,
    },
  });
  return toDomain(row);
}

/** Returns `false` (not thrown) if the config doesn't exist or belongs to a different farm. Deleting a schedule never deletes its past runs (`onDelete: SetNull` on `recurringConfigId`) — mission history stays real history. */
export async function deleteRecurringMission(farmId: string, id: string): Promise<boolean> {
  const existing = await prisma.recurringMissionConfig.findUnique({ where: { id } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.recurringMissionConfig.delete({ where: { id } });
  return true;
}
