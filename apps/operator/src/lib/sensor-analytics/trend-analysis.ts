import type { SensorRecord } from "@/lib/sensors/types";

import type { HistoricalSample, TrendDirection, TrendStats, TrendStrength } from "./types";

/**
 * Pure trend-analysis functions — every function here takes
 * plain `HistoricalSample[]`/numbers in and returns plain data out, no store
 * reads. Callers (the Analytics page, AURA's `sensor-trend`/`sensor-
 * statistics` commands, the Mission Control widget) all go through these
 * same functions so the numbers agree everywhere they're shown.
 */

const DEFAULT_MOVING_AVERAGE_WINDOW = 6;
/** Rate-of-change magnitude (reading units/hour) above which a trend counts as "strong" rather than "moderate" — expressed as a fraction of the sample window's own observed range, so it scales sensibly across very different units (pH vs lux). */
const STRONG_TREND_RANGE_FRACTION = 0.15;
const MODERATE_TREND_RANGE_FRACTION = 0.04;

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

export function movingAverage(values: number[], windowSize: number = DEFAULT_MOVING_AVERAGE_WINDOW): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    return average(values.slice(start, index + 1));
  });
}

/** Reading units per hour, signed — computed from the first and last sample in the window (a simple secant slope, deliberately not a regression, so it's cheap enough to recompute per render). */
export function rateOfChangePerHour(samples: HistoricalSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const hours = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
  if (hours <= 0) return 0;
  return (last.reading - first.reading) / hours;
}

function classifyTrend(rateOfChange: number, range: number): { direction: TrendDirection; strength: TrendStrength } {
  const magnitude = Math.abs(rateOfChange);
  const safeRange = Math.max(1e-6, range);
  const fraction = magnitude / safeRange;

  if (fraction < MODERATE_TREND_RANGE_FRACTION) return { direction: "stable", strength: "weak" };
  const direction: TrendDirection = rateOfChange > 0 ? "rising" : "falling";
  const strength: TrendStrength = fraction >= STRONG_TREND_RANGE_FRACTION ? "strong" : fraction >= MODERATE_TREND_RANGE_FRACTION * 2 ? "moderate" : "weak";
  return { direction, strength };
}

/** The full Trend Analysis suite for one sensor's reading history ("Trend Analysis": Moving Average, Minimum, Maximum, Average, Standard Deviation, Rate of Change, Trend Direction, Trend Strength). */
export function computeTrendStats(samples: HistoricalSample[], movingAverageWindow: number = DEFAULT_MOVING_AVERAGE_WINDOW): TrendStats {
  const readings = samples.map((sample) => sample.reading);
  const min = readings.length ? Math.min(...readings) : 0;
  const max = readings.length ? Math.max(...readings) : 0;
  const rateOfChange = rateOfChangePerHour(samples);
  const { direction, strength } = classifyTrend(rateOfChange, max - min);

  return {
    min,
    max,
    average: average(readings),
    standardDeviation: standardDeviation(readings),
    rateOfChange,
    direction,
    strength,
    movingAverage: movingAverage(readings, movingAverageWindow),
  };
}

export interface AnomalyPoint {
  timestamp: number;
  reading: number;
  /** How many standard deviations from the local moving average this point sits. */
  zScore: number;
}

const ANOMALY_Z_SCORE_THRESHOLD = 2.5;

/** Flags samples that sit more than `ANOMALY_Z_SCORE_THRESHOLD` standard deviations from the trailing moving average — a simple, cheap anomaly detector appropriate for a simulated (not production ML) sensor feed. */
export function detectAnomalies(samples: HistoricalSample[], movingAverageWindow: number = DEFAULT_MOVING_AVERAGE_WINDOW): AnomalyPoint[] {
  if (samples.length < movingAverageWindow + 1) return [];
  const readings = samples.map((sample) => sample.reading);
  const trailingAverages = movingAverage(readings, movingAverageWindow);
  const overallStdDev = standardDeviation(readings);
  if (overallStdDev === 0) return [];

  const anomalies: AnomalyPoint[] = [];
  for (let i = movingAverageWindow; i < samples.length; i += 1) {
    const deviation = readings[i]! - trailingAverages[i]!;
    const zScore = deviation / overallStdDev;
    if (Math.abs(zScore) >= ANOMALY_Z_SCORE_THRESHOLD) {
      anomalies.push({ timestamp: samples[i]!.timestamp, reading: readings[i]!, zScore: Math.round(zScore * 100) / 100 });
    }
  }
  return anomalies;
}

export interface ExtremeReading {
  sensorId: string;
  sensorName: string;
  value: number;
  timestamp: number;
}

/** Highest/lowest reading across a set of sensors' current histories — used by the Sensor Intelligence panel's "Highest Reading"/"Lowest Reading". Compares raw values directly, so it's only meaningful across sensors of the SAME type (callers filter by type first). */
export function findExtremeReadings(entries: { sensor: SensorRecord; samples: HistoricalSample[] }[]): { highest: ExtremeReading | null; lowest: ExtremeReading | null } {
  let highest: ExtremeReading | null = null;
  let lowest: ExtremeReading | null = null;

  for (const { sensor, samples } of entries) {
    for (const sample of samples) {
      if (!highest || sample.reading > highest.value) {
        highest = { sensorId: sensor.id, sensorName: sensor.name, value: sample.reading, timestamp: sample.timestamp };
      }
      if (!lowest || sample.reading < lowest.value) {
        lowest = { sensorId: sensor.id, sensorName: sensor.name, value: sample.reading, timestamp: sample.timestamp };
      }
    }
  }

  return { highest, lowest };
}

export interface FastestChangingResult {
  sensorId: string;
  sensorName: string;
  rateOfChange: number;
}

/** The sensor whose reading is moving fastest right now ("Fastest Changing Sensor") — ranks by absolute rate of change, not raw magnitude, so a slow-moving-but-large-range sensor doesn't drown out a fast-moving small-range one relative to ITS OWN typical scale isn't attempted here (units differ too much to normalize meaningfully across sensor types); this ranks within whatever entries the caller passes in. */
export function findFastestChangingSensor(entries: { sensor: SensorRecord; samples: HistoricalSample[] }[]): FastestChangingResult | null {
  let fastest: FastestChangingResult | null = null;
  for (const { sensor, samples } of entries) {
    const rate = rateOfChangePerHour(samples);
    if (!fastest || Math.abs(rate) > Math.abs(fastest.rateOfChange)) {
      fastest = { sensorId: sensor.id, sensorName: sensor.name, rateOfChange: rate };
    }
  }
  return fastest;
}

/**
 * A single 0–100 "Sensor Health Score" — a transparent,
 * deterministic composite (not a black-box ML score): battery/signal
 * contribute proportionally, the store's own `health` field applies a
 * penalty, and each detected anomaly in the current window subtracts a
 * small fixed amount. Every input is a real, already-computed value — never
 * a fabricated component.
 */
export function computeSensorHealthScore(sensor: SensorRecord, anomalyCount: number): number {
  const healthPenalty = sensor.health === "critical" ? 40 : sensor.health === "attention" ? 15 : 0;
  const statusPenalty = sensor.status === "offline" ? 50 : sensor.status === "critical" ? 30 : sensor.status === "warning" ? 10 : 0;
  const anomalyPenalty = Math.min(20, anomalyCount * 5);
  const base = sensor.batteryPercent * 0.5 + sensor.signalPercent * 0.5;
  return Math.round(Math.max(0, Math.min(100, base - healthPenalty - statusPenalty - anomalyPenalty)));
}

/** Battery Degradation ("Sensor Intelligence") — percent lost across the current history window, so a fresh sensor with no history yet honestly reads 0 rather than a guess. */
export function computeBatteryDegradation(samples: HistoricalSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0]!.batteryPercent;
  const last = samples[samples.length - 1]!.batteryPercent;
  return Math.round((first - last) * 10) / 10;
}

/** Signal Stability — inverse of signal's standard deviation, expressed 0–100 (100 = perfectly steady). */
export function computeSignalStability(samples: HistoricalSample[]): number {
  if (samples.length < 2) return 100;
  const stdDev = standardDeviation(samples.map((sample) => sample.signalPercent));
  return Math.round(Math.max(0, 100 - stdDev * 8));
}
