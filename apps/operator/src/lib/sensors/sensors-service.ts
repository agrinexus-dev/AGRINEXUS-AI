import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { CommunicationType, NewSensorInput, SensorHealth, SensorRecord, SensorStatus, SensorTelemetryUpdate, SensorType } from "@/lib/sensors/types";

import type {
  CommunicationType as PrismaCommunicationType,
  SensorHealth as PrismaSensorHealth,
  SensorStatus as PrismaSensorStatus,
  SensorType as PrismaSensorType,
} from "@/lib/prisma/generated/enums";

/**
 * Server-only Sensor data access — the ONLY module
 * that touches `prisma.sensor`. Mirrors `alerts-service.ts`'s exact shape
 * every function takes `farmId` explicitly, every caller
 * derives it from the authenticated session, never from client input.
 *
 * Enum conversion follows the same `@map(...)` pattern `alerts-service.ts`
 * already established — Prisma's generated enum members use underscores
 * (valid JS identifiers), the frontend's own types use the real hyphenated
 * strings (`sensor-analytics/types.ts`/`sensors/types.ts`); `@map` makes
 * them the same value at the SQL level.
 */

function toPrismaSensorType(sensorType: SensorType): PrismaSensorType {
  return sensorType.replaceAll("-", "_") as PrismaSensorType;
}

function toDomainSensorType(sensorType: PrismaSensorType): SensorType {
  return sensorType.replaceAll("_", "-") as SensorType;
}

type SensorRow = {
  id: string;
  name: string;
  sensorType: PrismaSensorType;
  serialNumber: string;
  positionX: number;
  positionZ: number;
  assignedPlotId: string | null;
  communicationType: PrismaCommunicationType;
  batteryCapacityMah: number;
  samplingIntervalSeconds: number;
  gateway: string;
  firmwareVersion: string;
  installedAt: Date;
  notes: string;
  batteryPowered: boolean;
  gatewayConnected: boolean;
  status: PrismaSensorStatus;
  health: PrismaSensorHealth;
  batteryPercent: number;
  signalPercent: number;
  currentReading: number;
  previousReading: number;
  readingHistory: unknown;
  lastReadingAt: Date;
  lastUpdatedAt: Date;
  createdAt: Date;
};

function toDomainSensor(row: SensorRow): SensorRecord {
  return {
    id: row.id,
    name: row.name,
    sensorType: toDomainSensorType(row.sensorType),
    serialNumber: row.serialNumber,
    position: [row.positionX, row.positionZ],
    assignedPlotId: row.assignedPlotId,
    communicationType: row.communicationType as CommunicationType,
    batteryCapacityMah: row.batteryCapacityMah,
    samplingIntervalSeconds: row.samplingIntervalSeconds,
    gateway: row.gateway,
    firmwareVersion: row.firmwareVersion,
    installedAt: row.installedAt.getTime(),
    notes: row.notes,
    batteryPowered: row.batteryPowered,
    gatewayConnected: row.gatewayConnected,
    status: row.status as SensorStatus,
    health: row.health as SensorHealth,
    batteryPercent: row.batteryPercent,
    signalPercent: row.signalPercent,
    currentReading: row.currentReading,
    previousReading: row.previousReading,
    // Stored as JSON — `Array.isArray` guard rather than a blind cast, so a
    // malformed/legacy row degrades to an empty sparkline instead of
    // throwing.
    readingHistory: Array.isArray(row.readingHistory) ? (row.readingHistory as number[]) : [],
    lastReadingAt: row.lastReadingAt.getTime(),
    lastUpdatedAt: row.lastUpdatedAt.getTime(),
    createdAt: row.createdAt.getTime(),
  };
}

export async function listSensors(farmId: string): Promise<SensorRecord[]> {
  const rows = await prisma.sensor.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDomainSensor);
}

/** `null` (not thrown) for "doesn't exist or belongs to a different farm" — same non-leaking pattern `alerts-service.ts`'s `resolveAlert` already uses. */
export async function getSensor(farmId: string, sensorId: string): Promise<SensorRecord | null> {
  const row = await prisma.sensor.findUnique({ where: { id: sensorId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainSensor(row);
}

/** Rejects a cross-farm plot reference outright rather than silently dropping it — same "reject the whole write" pattern `missions-service.ts`'s `relationsBelongToFarm` established for `targetPlotId`/`assignedDroneId`. */
async function assignedPlotBelongsToFarm(farmId: string, assignedPlotId: string | null): Promise<boolean> {
  if (!assignedPlotId) return true;
  const plot = await prisma.plot.findUnique({ where: { id: assignedPlotId }, select: { farmId: true } });
  return plot !== null && plot.farmId === farmId;
}

/** Returns `null` (never throws) if `input.assignedPlotId` doesn't belong to `farmId` — the route answers 400, same convention `createMission` uses for its own cross-farm relation check. */
export async function createSensor(farmId: string, id: string, input: NewSensorInput): Promise<SensorRecord | null> {
  if (!(await assignedPlotBelongsToFarm(farmId, input.assignedPlotId))) return null;

  const now = new Date();
  const meta = SENSOR_DEFAULT_READING[input.sensorType];

  const row = await prisma.sensor.create({
    data: {
      id,
      farmId,
      name: input.name,
      sensorType: toPrismaSensorType(input.sensorType),
      serialNumber: input.serialNumber,
      positionX: input.position[0],
      positionZ: input.position[1],
      assignedPlotId: input.assignedPlotId,
      communicationType: input.communicationType,
      batteryCapacityMah: input.batteryCapacityMah,
      samplingIntervalSeconds: input.samplingIntervalSeconds,
      gateway: input.gateway,
      firmwareVersion: "1.2.0",
      installedAt: now,
      notes: input.notes,
      batteryPowered: input.batteryPowered,
      gatewayConnected: input.gatewayConnected,
      status: "online",
      health: "nominal",
      batteryPercent: 100,
      signalPercent: 96,
      currentReading: meta,
      previousReading: meta,
      readingHistory: [meta],
      lastReadingAt: now,
      lastUpdatedAt: now,
    },
  });
  return toDomainSensor(row);
}

/** Returns `false` (not thrown) if the sensor doesn't exist or belongs to a different farm. Deleting a Sensor sets any Alert.sensorId that referenced it to NULL (schema's `onDelete: SetNull`) — the alert record itself, and its `sensorName`, survive; see schema.prisma's own doc comment. */
export async function deleteSensor(farmId: string, sensorId: string): Promise<boolean> {
  const existing = await prisma.sensor.findUnique({ where: { id: sensorId } });
  if (!existing || existing.farmId !== farmId) return false;
  await prisma.sensor.delete({ where: { id: sensorId } });
  return true;
}

/**
 * Persists a telemetry snapshot for one sensor — used by the slow background
 * sync (see `use-sensor-simulation.ts`'s doc comment for why this is NOT
 * called every 2s tick) AND by the `PATCH /api/sensors/:id` route.
 *
 * Returns `false` (never throws) instead of updating anything when the
 * sensor doesn't exist or belongs to a different farm — same non-leaking,
 * non-throwing shape `deleteSensor` above already uses, and for the exact
 * same reason: the caller decides what a "no-op" means for ITS context. The
 * background sync loop ignores the return value entirely (a lost telemetry
 * sync isn't worth surfacing to a fire-and-forget background loop) — but
 * the API route does NOT ignore it: an earlier version of this route
 * returned 200 `{ok:true}` for a cross-farm PATCH simply because this
 * function didn't throw, even though the write was correctly skipped
 * internally — a real bug caught during security testing
 * (verified: the underlying row was never actually written; the response
 * was merely dishonest about it, not an actual cross-farm data leak). The
 * route now checks this return value and answers 404 when it's `false`.
 */
export async function syncSensorTelemetry(farmId: string, sensorId: string, update: SensorTelemetryUpdate): Promise<boolean> {
  const existing = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { farmId: true } });
  if (!existing || existing.farmId !== farmId) return false;

  await prisma.sensor.update({
    where: { id: sensorId },
    data: {
      ...(update.batteryPercent !== undefined ? { batteryPercent: update.batteryPercent } : {}),
      ...(update.signalPercent !== undefined ? { signalPercent: update.signalPercent } : {}),
      ...(update.currentReading !== undefined ? { currentReading: update.currentReading } : {}),
      ...(update.previousReading !== undefined ? { previousReading: update.previousReading } : {}),
      ...(update.readingHistory !== undefined ? { readingHistory: update.readingHistory } : {}),
      ...(update.status !== undefined ? { status: update.status } : {}),
      ...(update.health !== undefined ? { health: update.health } : {}),
      ...(update.lastReadingAt !== undefined ? { lastReadingAt: new Date(update.lastReadingAt) } : {}),
      lastUpdatedAt: new Date(),
    },
  });
  return true;
}

// Mirrors `SENSOR_TYPE_META[type].default` (sensors/types.ts) — duplicated
// as a small constant table here (not imported) specifically because that
// file's full `SENSOR_TYPE_META` also carries min/max/driftStep, which are
// pure simulation-tuning concerns with no server-side purpose; importing it
// just for `.default` would pull client-simulation constants into the
// server bundle for no benefit. Kept in sync by construction: both list the
// same 18 `SensorType` keys, and `tsc` fails loudly if one drifts from the
// `SensorType` union.
const SENSOR_DEFAULT_READING: Record<SensorType, number> = {
  "soil-moisture": 40,
  "soil-temperature": 18,
  "air-temperature": 22,
  humidity: 55,
  ph: 6.5,
  ec: 1.8,
  nitrogen: 40,
  phosphorus: 25,
  potassium: 150,
  "rain-gauge": 0,
  "wind-speed": 3,
  "wind-direction": 180,
  "solar-radiation": 450,
  "light-intensity": 40000,
  "leaf-wetness": 20,
  "water-tank-level": 70,
  "flow-meter": 12,
  "weather-station": 22,
};
