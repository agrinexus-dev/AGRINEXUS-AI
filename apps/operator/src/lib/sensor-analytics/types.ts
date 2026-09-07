import type { CropIssueType } from "@/lib/findings/types";
import type { SensorHealth } from "@/lib/sensors/types";

/**
 * Shared Sensor Analytics types. The Historical Store below is
 * a SEPARATE store from `lib/sensors/sensor-store.ts` (explicitly
 * DO-NOT-MODIFY — it references sensors by id and stores only time-series
 * snapshots, never a copy of a sensor's identity/spec fields (name, type,
 * gateway, etc. are always looked up live from the Sensor Store).
 */

export interface HistoricalSample {
  timestamp: number;
  reading: number;
  batteryPercent: number;
  signalPercent: number;
  health: SensorHealth;
}

export type TimeRangeId = "1h" | "24h" | "7d" | "30d" | "custom";

export const TIME_RANGE_LABELS: Record<TimeRangeId, string> = {
  "1h": "Last Hour",
  "24h": "24 Hours",
  "7d": "7 Days",
  "30d": "30 Days",
  custom: "Custom",
};

export const TIME_RANGE_MS: Record<Exclude<TimeRangeId, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export type TrendDirection = "rising" | "falling" | "stable";
export type TrendStrength = "weak" | "moderate" | "strong";

export interface TrendStats {
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
  /** Reading units per hour, signed. */
  rateOfChange: number;
  direction: TrendDirection;
  strength: TrendStrength;
  /** The moving-average series, same length/order as the input window (early points use a shorter window). */
  movingAverage: number[];
}

export type AlertType = "low-soil-moisture" | "low-battery" | "poor-signal" | "abnormal-temperature" | "sensor-offline" | "crop-finding";

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  "low-soil-moisture": "Low Soil Moisture",
  "low-battery": "Low Battery",
  "poor-signal": "Poor Signal",
  "abnormal-temperature": "Abnormal Temperature",
  "sensor-offline": "Sensor Offline",
  // The generic marker `AlertType` value for every
  // CropFinding-linked alert; the finding's own `issueType` (via
  // `findingIssueType` below) is the detailed classification.
  "crop-finding": "Crop Finding",
};

export type AlertSeverity = "warning" | "critical";

export interface SensorAlertRecord {
  id: string;
  /**
   * Non-null for every LOCALLY-simulated alert (the live sensor that
   * triggered it always has a real id at creation time). Nullable only for
   * alerts loaded from the backend whose sensor was later deleted (Prompt
   * 018C — the database relation is `onDelete: SetNull`, so the alert
   * record and `sensorName` survive the sensor's removal, but the FK
   * itself is cleared). `sensorName` is what stays reliably available in
   * that case — see this field's own note. For a `crop-finding` alert,
   * this is never populated — `findingPlotLabel` is the equivalent field.
   */
  sensorId: string | null;
  /** Always populated for a sensor alert, even once `sensorId` is null. Empty string for a `crop-finding` alert (see `findingPlotLabel` instead) — kept as `string`, not `string | null`, to avoid a breaking type change for every existing sensor-alert caller. */
  sensorName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  /** Real sensor reading for every sensor alert. `null` for a `crop-finding` alert — there is no honest numeric reading to put here (extends the existing required-value alert shape rather than fabricating one). */
  value: number | null;
  createdAt: number;
  /** Set once the underlying condition clears — an alert record is never deleted, only resolved, so history stays honest. */
  resolvedAt: number | null;

  /**
   * CropFinding → Alert integration. Non-null ONLY for a
   * `crop-finding` alert; `null` for every ordinary sensor alert (unchanged
   * default). `CropFinding` remains the sole source of truth for the
   * finding itself — this is a reference, never a duplicated copy of its
   * fields, except for the small denormalized display fields below (same
   * "keep the identifying label around" precedent `sensorName` already
   * sets for a deleted sensor).
   */
  findingId: string | null;
  findingPlotId: string | null;
  findingPlotLabel: string | null;
  findingIssueType: CropIssueType | null;
  findingPosition: [number, number] | null;
}

/**
 * Per-metric threshold configuration ("Thresholds"). Only the
 * metrics explicitly named in the prompt get configurable thresholds
 * (Soil Moisture, Humidity, Temperature, Battery, Signal) — every sensor of
 * a matching type is evaluated against the SAME threshold set, mirroring how
 * the prompt's own examples are metric-scoped, not per-sensor-instance.
 */
export type ThresholdMetric = "soil-moisture" | "humidity" | "temperature" | "battery" | "signal";

export interface ThresholdConfig {
  min: number;
  max: number;
  target: number;
}

export const THRESHOLD_METRIC_LABELS: Record<ThresholdMetric, string> = {
  "soil-moisture": "Soil Moisture",
  humidity: "Humidity",
  temperature: "Temperature",
  battery: "Battery",
  signal: "Signal",
};

/**
 * A snapshot shape the Mission Planners consume ("Mission
 * Integration") — computed once, on demand, from the live Sensor Store.
 * `getPlotSensorAnalyticsSnapshot` (`mission-integration.ts`) is the only
 * place that builds one.
 */
export interface PlotSensorAnalyticsSnapshot {
  plotId: string;
  averageSoilMoisture: number | null;
  averageTemperature: number | null;
  criticalSensorCount: number;
  lastUpdatedAt: number;
}

/**
 * The "why was this mission created?" record ("Sensor → Mission
 * Linkage") — embedded, at creation time, into a `MissionRecord`/
 * `RobotMissionRecord`'s optional `sensorJustification` field ONLY when a
 * mission was actually created by the Agricultural Reasoning Engine (see
 * `reasoning-engine.ts`) off real sensor data, never retrofitted onto a
 * manually-created mission. A snapshot, not a live reference — mirrors how
 * `MissionEstimate` is already a computed-once snapshot embedded on the
 * record, not a pointer back into another store.
 */
export interface MissionSensorJustification {
  plotId: string;
  plotLabel: string;
  /** Which reasoning conclusion actually triggered this mission — always "irrigate" or "inspect" (a "monitor"/"unavailable" recommendation never creates a mission). */
  action: "irrigate" | "inspect";
  reason: string;
  confidence: "high" | "moderate" | "low";
  sourceSensorIds: string[];
  sourceSensorNames: string[];
  createdAt: number;
}
