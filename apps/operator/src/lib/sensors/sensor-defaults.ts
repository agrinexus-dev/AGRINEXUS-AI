import { SENSOR_TYPE_META, type NewSensorInput, type SensorRecord } from "./types";

const DEFAULT_FIRMWARE_VERSION = "1.2.0";

/** Builds a complete `SensorRecord` from the Add Sensor form's input — every live/simulated field starts at a sensible, honest default (full battery, nominal health, the type's own baseline reading), mirroring `buildNewDroneRecord`/`buildNewRobotRecord`. */
export function buildNewSensorRecord(id: string, input: NewSensorInput): SensorRecord {
  const meta = SENSOR_TYPE_META[input.sensorType];
  const now = Date.now();

  return {
    id,
    ...input,
    firmwareVersion: DEFAULT_FIRMWARE_VERSION,
    installedAt: now,

    status: "online",
    health: "nominal",
    batteryPercent: 100,
    signalPercent: 96,
    currentReading: meta.default,
    previousReading: meta.default,
    readingHistory: [meta.default],
    lastReadingAt: now,
    lastUpdatedAt: now,

    createdAt: now,
  };
}
