import { COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPES, type CommunicationType } from "@/lib/fleet/types";

/**
 * Shared Sensor Store types — mirrors `lib/fleet/types.ts` /
 * `lib/robots/types.ts` field-for-field wherever the concept overlaps.
 * `CommunicationType` is imported (not redefined) from the Fleet Store's
 * types — the exact same set of radios applies to a sensor node, same DRY
 * reuse `lib/robots/types.ts` already established.
 *
 * Deliberately a SEPARATE concept from the pre-existing static `sensors`
 * array in `scene/intelligence/intelligence-data.ts` — that
 * array feeds the older, still-untouched heatmap-style
 * `sensor-network-overlay.tsx` and the `sensorNetwork` intelligence LAYER
 * toggle. This module is the new, real, addable/removable sensor ENTITY
 * store; both coexist (see `LayerVisibility`'s `sensor*` keys, prefixed to
 * avoid colliding with the existing `sensorNetwork` key).
 */

export type SensorType =
  | "soil-moisture"
  | "soil-temperature"
  | "air-temperature"
  | "humidity"
  | "ph"
  | "ec"
  | "nitrogen"
  | "phosphorus"
  | "potassium"
  | "rain-gauge"
  | "wind-speed"
  | "wind-direction"
  | "solar-radiation"
  | "light-intensity"
  | "leaf-wetness"
  | "water-tank-level"
  | "flow-meter"
  | "weather-station";

export const SENSOR_TYPES: SensorType[] = [
  "soil-moisture",
  "soil-temperature",
  "air-temperature",
  "humidity",
  "ph",
  "ec",
  "nitrogen",
  "phosphorus",
  "potassium",
  "rain-gauge",
  "wind-speed",
  "wind-direction",
  "solar-radiation",
  "light-intensity",
  "leaf-wetness",
  "water-tank-level",
  "flow-meter",
  "weather-station",
];

export const SENSOR_TYPE_LABELS: Record<SensorType, string> = {
  "soil-moisture": "Soil Moisture",
  "soil-temperature": "Soil Temperature",
  "air-temperature": "Air Temperature",
  humidity: "Humidity",
  ph: "pH",
  ec: "Electrical Conductivity",
  nitrogen: "Nitrogen",
  phosphorus: "Phosphorus",
  potassium: "Potassium",
  "rain-gauge": "Rain Gauge",
  "wind-speed": "Wind Speed",
  "wind-direction": "Wind Direction",
  "solar-radiation": "Solar Radiation",
  "light-intensity": "Light Intensity",
  "leaf-wetness": "Leaf Wetness",
  "water-tank-level": "Water Tank Level",
  "flow-meter": "Flow Meter",
  "weather-station": "Weather Station",
};

/** Plausible simulated range/unit/drift-step per sensor type — used only to keep simulated readings realistic ("no random jumps"), not real sensor specs. */
export interface SensorTypeMeta {
  unit: string;
  min: number;
  max: number;
  default: number;
  /** Max change per simulation tick, in the reading's own units — bounds the gradual random walk. */
  driftStep: number;
  decimals: number;
}

export const SENSOR_TYPE_META: Record<SensorType, SensorTypeMeta> = {
  "soil-moisture": { unit: "%", min: 15, max: 65, default: 40, driftStep: 0.4, decimals: 1 },
  "soil-temperature": { unit: "°C", min: 8, max: 32, default: 18, driftStep: 0.2, decimals: 1 },
  "air-temperature": { unit: "°C", min: 2, max: 38, default: 22, driftStep: 0.3, decimals: 1 },
  humidity: { unit: "%", min: 25, max: 95, default: 55, driftStep: 0.5, decimals: 0 },
  ph: { unit: "pH", min: 5, max: 8, default: 6.5, driftStep: 0.03, decimals: 2 },
  ec: { unit: "mS/cm", min: 0.3, max: 4, default: 1.8, driftStep: 0.04, decimals: 2 },
  nitrogen: { unit: "ppm", min: 5, max: 90, default: 40, driftStep: 1, decimals: 0 },
  phosphorus: { unit: "ppm", min: 3, max: 65, default: 25, driftStep: 0.8, decimals: 0 },
  potassium: { unit: "ppm", min: 40, max: 260, default: 150, driftStep: 2, decimals: 0 },
  "rain-gauge": { unit: "mm", min: 0, max: 30, default: 0, driftStep: 0.2, decimals: 1 },
  "wind-speed": { unit: "m/s", min: 0, max: 18, default: 3, driftStep: 0.3, decimals: 1 },
  "wind-direction": { unit: "°", min: 0, max: 360, default: 180, driftStep: 4, decimals: 0 },
  "solar-radiation": { unit: "W/m²", min: 0, max: 1100, default: 450, driftStep: 15, decimals: 0 },
  "light-intensity": { unit: "lux", min: 0, max: 110000, default: 40000, driftStep: 1500, decimals: 0 },
  "leaf-wetness": { unit: "%", min: 0, max: 100, default: 20, driftStep: 1, decimals: 0 },
  "water-tank-level": { unit: "%", min: 0, max: 100, default: 70, driftStep: 0.3, decimals: 0 },
  "flow-meter": { unit: "L/min", min: 0, max: 55, default: 12, driftStep: 0.6, decimals: 1 },
  // A single representative reading (ambient temperature) — a full
  // multi-parameter weather station display is out of scope this change;
  // documented here rather than silently faked elsewhere.
  "weather-station": { unit: "°C", min: 2, max: 38, default: 22, driftStep: 0.3, decimals: 1 },
};

export type SensorStatus = "online" | "offline" | "warning" | "critical" | "maintenance";
export type SensorHealth = "nominal" | "attention" | "critical";

export const SENSOR_STATUS_LABELS: Record<SensorStatus, string> = {
  online: "Online",
  offline: "Offline",
  warning: "Warning",
  critical: "Critical",
  maintenance: "Maintenance",
};

export { COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPES, type CommunicationType };

/**
 * A sensor node as it exists in the Sensor Store. Split the same way
 * `DroneRecord`/`RobotRecord` are: identity/spec fields set once at
 * creation vs. live/simulated fields updated via the store's own action
 * creators. Sensors are stationary (no route/movement), so — unlike drones
 * and robots — there's no `routeVersion`/remount concept here at all.
 */
export interface SensorRecord {
  id: string;
  name: string;
  sensorType: SensorType;
  serialNumber: string;
  /** Ground-plane (x, z) in the Digital Twin's existing scene coordinate system — the same one `farm-data.ts` uses. */
  position: [number, number];
  assignedPlotId: string | null;
  communicationType: CommunicationType;
  batteryCapacityMah: number;
  samplingIntervalSeconds: number;
  gateway: string;
  firmwareVersion: string;
  installedAt: number;
  notes: string;
  batteryPowered: boolean;
  gatewayConnected: boolean;

  status: SensorStatus;
  health: SensorHealth;
  batteryPercent: number;
  signalPercent: number;
  currentReading: number;
  previousReading: number;
  /** A small rolling window of recent readings (oldest first), newest = `currentReading` — feeds the Right Panel's "Historical Trend" sparkline. */
  readingHistory: number[];
  lastReadingAt: number;
  lastUpdatedAt: number;

  createdAt: number;
}

export type NewSensorInput = Pick<
  SensorRecord,
  | "name"
  | "sensorType"
  | "serialNumber"
  | "position"
  | "assignedPlotId"
  | "communicationType"
  | "batteryCapacityMah"
  | "samplingIntervalSeconds"
  | "gateway"
  | "notes"
  | "batteryPowered"
  | "gatewayConnected"
>;

/** The subset of live fields the simulation ticker updates each tick — deliberately excludes the immutable spec fields above. Mirrors `RobotTelemetryUpdate`. */
export type SensorTelemetryUpdate = Partial<
  Pick<SensorRecord, "batteryPercent" | "signalPercent" | "currentReading" | "previousReading" | "readingHistory" | "lastReadingAt" | "lastUpdatedAt" | "status" | "health">
>;

export function formatSensorReading(sensor: Pick<SensorRecord, "sensorType" | "currentReading">): string {
  const meta = SENSOR_TYPE_META[sensor.sensorType];
  return `${sensor.currentReading.toFixed(meta.decimals)} ${meta.unit}`;
}
