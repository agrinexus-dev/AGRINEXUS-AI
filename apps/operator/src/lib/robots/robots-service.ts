import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { CommunicationType, NewRobotInput, RobotCapabilities, RobotType } from "@/lib/robots/types";

import type { RobotType as PrismaRobotType } from "@/lib/prisma/generated/enums";

/**
 * Server-only Robot data access — mirrors
 * `drones-service.ts` exactly. IDENTITY/CONFIGURATION ONLY — same reasoning
 * as `drones-service.ts`'s own doc comment (no live telemetry persisted).
 * `RobotIdentity` is exactly `NewRobotInput` plus `id`. `RobotType` has no
 * hyphenated members, so (unlike Drone's `droneType`/`cameraType`) no
 * `@map` string conversion is needed here.
 */

export type RobotIdentity = { id: string } & NewRobotInput;

type RobotRow = {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  robotType: PrismaRobotType;
  color: string;
  maxSpeedMps: number;
  batteryCapacityMah: number;
  maxRuntimeMinutes: number;
  communicationType: CommunicationType;
  homePositionX: number;
  homePositionZ: number;
  notes: string;
  capabilities: unknown;
};

const DEFAULT_CAPABILITIES: RobotCapabilities = {
  camera: false,
  lidar: false,
  sprayer: false,
  seeder: false,
  fertilizer: false,
  aiEnabled: false,
};

function isRobotCapabilities(value: unknown): value is RobotCapabilities {
  return (
    typeof value === "object" &&
    value !== null &&
    "camera" in value &&
    "lidar" in value &&
    "sprayer" in value &&
    "seeder" in value &&
    "fertilizer" in value &&
    "aiEnabled" in value
  );
}

function toDomainRobot(row: RobotRow): RobotIdentity {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    manufacturer: row.manufacturer,
    robotType: row.robotType as RobotType,
    color: row.color,
    maxSpeedMps: row.maxSpeedMps,
    batteryCapacityMah: row.batteryCapacityMah,
    maxRuntimeMinutes: row.maxRuntimeMinutes,
    communicationType: row.communicationType,
    homePosition: [row.homePositionX, row.homePositionZ],
    notes: row.notes,
    // Malformed/legacy row degrades to all-false rather than throwing — same
    // defensive-JSON-read convention `sensors-service.ts` uses for
    // `readingHistory`.
    capabilities: isRobotCapabilities(row.capabilities) ? row.capabilities : DEFAULT_CAPABILITIES,
  };
}

export async function listRobots(farmId: string): Promise<RobotIdentity[]> {
  const rows = await prisma.robot.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomainRobot);
}

/** `null` (not thrown) for "doesn't exist or belongs to a different farm" — same non-leaking pattern every other 018x service uses. */
export async function getRobot(farmId: string, robotId: string): Promise<RobotIdentity | null> {
  const row = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainRobot(row);
}

export async function createRobot(farmId: string, id: string, input: NewRobotInput): Promise<RobotIdentity> {
  const row = await prisma.robot.create({
    data: {
      id,
      farmId,
      name: input.name,
      model: input.model,
      manufacturer: input.manufacturer,
      robotType: input.robotType as PrismaRobotType,
      color: input.color,
      maxSpeedMps: input.maxSpeedMps,
      batteryCapacityMah: input.batteryCapacityMah,
      maxRuntimeMinutes: input.maxRuntimeMinutes,
      communicationType: input.communicationType,
      homePositionX: input.homePosition[0],
      homePositionZ: input.homePosition[1],
      notes: input.notes,
      // `RobotCapabilities` is a closed interface (no index signature), so a
      // structural cast is needed to satisfy Prisma's `InputJsonValue` —
      // the actual runtime value is unchanged, still exactly the 6-boolean
      // object the zod schema validated in the API route.
      capabilities: input.capabilities as unknown as Record<string, boolean>,
    },
  });
  return toDomainRobot(row);
}

/**
 * Updates a robot's IDENTITY/CONFIGURATION fields
 * (everything `createRobot` accepts, including home position). No new
 * column was needed for this — every field the Edit Robot form exposes
 * already has one (`homePositionX`/`homePositionZ` included), so this is
 * the same shape `createRobot` already writes, just against an existing
 * row. Farm-scoped like every other 018x mutation: returns `null` (never
 * throws) for "doesn't exist or belongs to a different farm" — the route
 * answers 404, same non-leaking pattern `deleteRobot` uses.
 */
export async function updateRobot(farmId: string, robotId: string, input: NewRobotInput): Promise<RobotIdentity | null> {
  const existing = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!existing || existing.farmId !== farmId) return null;

  const row = await prisma.robot.update({
    where: { id: robotId },
    data: {
      name: input.name,
      model: input.model,
      manufacturer: input.manufacturer,
      robotType: input.robotType as PrismaRobotType,
      color: input.color,
      maxSpeedMps: input.maxSpeedMps,
      batteryCapacityMah: input.batteryCapacityMah,
      maxRuntimeMinutes: input.maxRuntimeMinutes,
      communicationType: input.communicationType,
      homePositionX: input.homePosition[0],
      homePositionZ: input.homePosition[1],
      notes: input.notes,
      capabilities: input.capabilities as unknown as Record<string, boolean>,
    },
  });
  return toDomainRobot(row);
}

/**
 * Mirrors `drones-service.ts`'s `deleteDrone` exactly:
 * farm-scoped existence check, then a real delete. Every FK that references
 * `Robot` (`RobotMission.assignedRobotId`, `RecurringMissionConfig.
 * assignedRobotId`) is `onDelete: SetNull` (confirmed in schema.prisma), so
 * this is safe without a manual cascade — deleting a robot un-assigns it
 * from any mission/recurring schedule that referenced it (their own rows,
 * and any CropFinding history, are untouched) rather than blocking or
 * cascading. Returns `false` (never throws) for "doesn't exist or belongs
 * to a different farm" — the route answers 404, same non-leaking pattern
 * every other 018x service uses.
 */
export async function deleteRobot(farmId: string, robotId: string): Promise<boolean> {
  const existing = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.robot.delete({ where: { id: robotId } });
  return true;
}
