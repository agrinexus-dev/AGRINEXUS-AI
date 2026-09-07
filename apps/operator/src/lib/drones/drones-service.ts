import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { CameraType, CommunicationType, DroneType, NewDroneInput } from "@/lib/fleet/types";

import type { CameraType as PrismaCameraType, DroneType as PrismaDroneType } from "@/lib/prisma/generated/enums";

/**
 * Server-only Drone data access — mirrors
 * `sensors-service.ts`'s exact shape: every function takes `farmId`
 * explicitly, every caller derives it from the authenticated session, never
 * from client input.
 *
 * IDENTITY/CONFIGURATION ONLY — see schema.prisma's top-of-file note for why
 * live telemetry (status/battery/position/health/...) is deliberately NOT
 * persisted here. `DroneIdentity` is exactly `NewDroneInput` plus `id` —
 * the same subset the Add Drone form already collects, since that's also
 * exactly what the database row now stores.
 */

export type DroneIdentity = { id: string } & NewDroneInput;

function toPrismaEnum<T extends string>(value: T): string {
  return value.replaceAll("-", "_");
}
function fromPrismaEnum<T extends string>(value: string): T {
  return value.replaceAll("_", "-") as T;
}

type DroneRow = {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  droneType: PrismaDroneType;
  cameraType: PrismaCameraType;
  batteryCapacityMah: number;
  maxFlightTimeMinutes: number;
  communicationType: CommunicationType;
  firmwareVersion: string;
  homeLocationX: number;
  homeLocationZ: number;
  color: string;
  notes: string;
};

function toDomainDrone(row: DroneRow): DroneIdentity {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    serialNumber: row.serialNumber,
    droneType: fromPrismaEnum<DroneType>(row.droneType),
    cameraType: fromPrismaEnum<CameraType>(row.cameraType),
    batteryCapacityMah: row.batteryCapacityMah,
    maxFlightTimeMinutes: row.maxFlightTimeMinutes,
    communicationType: row.communicationType,
    firmwareVersion: row.firmwareVersion,
    homeLocation: [row.homeLocationX, row.homeLocationZ],
    color: row.color,
    notes: row.notes,
  };
}

export async function listDrones(farmId: string): Promise<DroneIdentity[]> {
  const rows = await prisma.drone.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomainDrone);
}

/** `null` (not thrown) for "doesn't exist or belongs to a different farm" — same non-leaking pattern every other 018x service uses. */
export async function getDrone(farmId: string, droneId: string): Promise<DroneIdentity | null> {
  const row = await prisma.drone.findUnique({ where: { id: droneId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainDrone(row);
}

export async function createDrone(farmId: string, id: string, input: NewDroneInput): Promise<DroneIdentity> {
  const row = await prisma.drone.create({
    data: {
      id,
      farmId,
      name: input.name,
      model: input.model,
      serialNumber: input.serialNumber,
      droneType: toPrismaEnum(input.droneType) as PrismaDroneType,
      cameraType: toPrismaEnum(input.cameraType) as PrismaCameraType,
      batteryCapacityMah: input.batteryCapacityMah,
      maxFlightTimeMinutes: input.maxFlightTimeMinutes,
      communicationType: input.communicationType,
      firmwareVersion: input.firmwareVersion,
      homeLocationX: input.homeLocation[0],
      homeLocationZ: input.homeLocation[1],
      color: input.color,
      notes: input.notes,
    },
  });
  return toDomainDrone(row);
}

/**
 * Updates a drone's IDENTITY/CONFIGURATION fields
 * (everything `createDrone` accepts, including home location). No new
 * column was needed — every field the Edit Drone form exposes already has
 * one (`homeLocationX`/`homeLocationZ` included). Farm-scoped like every
 * other 018x mutation: returns `null` (never throws) for "doesn't exist or
 * belongs to a different farm", same non-leaking pattern `deleteDrone` uses.
 */
export async function updateDrone(farmId: string, droneId: string, input: NewDroneInput): Promise<DroneIdentity | null> {
  const existing = await prisma.drone.findUnique({ where: { id: droneId } });
  if (!existing || existing.farmId !== farmId) return null;

  const row = await prisma.drone.update({
    where: { id: droneId },
    data: {
      name: input.name,
      model: input.model,
      serialNumber: input.serialNumber,
      droneType: toPrismaEnum(input.droneType) as PrismaDroneType,
      cameraType: toPrismaEnum(input.cameraType) as PrismaCameraType,
      batteryCapacityMah: input.batteryCapacityMah,
      maxFlightTimeMinutes: input.maxFlightTimeMinutes,
      communicationType: input.communicationType,
      firmwareVersion: input.firmwareVersion,
      homeLocationX: input.homeLocation[0],
      homeLocationZ: input.homeLocation[1],
      color: input.color,
      notes: input.notes,
    },
  });
  return toDomainDrone(row);
}

/** Returns `false` (not thrown) if the drone doesn't exist or belongs to a different farm. Any DroneMission that referenced this drone has its `assignedDroneId` set to NULL (schema's `onDelete: SetNull`) — the mission record survives; see schema.prisma's own doc comment. */
export async function deleteDrone(farmId: string, droneId: string): Promise<boolean> {
  const existing = await prisma.drone.findUnique({ where: { id: droneId } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.drone.delete({ where: { id: droneId } });
  return true;
}
