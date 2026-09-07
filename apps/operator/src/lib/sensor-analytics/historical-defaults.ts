import { SENSOR_TYPE_META, type SensorRecord } from "@/lib/sensors/types";

import type { HistoricalSample } from "./types";

/**
 * How far back — and at what resolution — a newly-tracked sensor's history
 * is backfilled ("Historical data should be generated from the
 * live simulation"). Backfill only covers what real time hasn't produced yet
 * — every sample going FORWARD from "now" comes from
 * `use-historical-sensor-simulation.ts` recording the Sensor Store's actual
 * live-simulated values, never a second independent generator. The backfill
 * walk below reuses the exact same bounded-random-walk technique
 * `use-sensor-simulation.ts` uses for live drift, just running backward in
 * time instead of forward on an interval — so backfilled history and live
 * history look like the same underlying process, not two different ones.
 */
export const BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const BACKFILL_INTERVAL_MS = 15 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateBackfill(sensor: Pick<SensorRecord, "sensorType" | "currentReading" | "batteryPercent" | "signalPercent" | "health" | "batteryPowered">): HistoricalSample[] {
  const meta = SENSOR_TYPE_META[sensor.sensorType];
  const sampleCount = Math.floor(BACKFILL_WINDOW_MS / BACKFILL_INTERVAL_MS);
  const now = Date.now();

  // Walk backward from the sensor's CURRENT live reading/battery/signal so
  // the most recent backfilled point sits right where live recording will
  // pick up — no visible seam where backfill ends and live data begins.
  let reading = sensor.currentReading;
  let battery = sensor.batteryPowered ? Math.min(100, sensor.batteryPercent + sampleCount * 0.01) : sensor.batteryPercent;
  let signal = sensor.signalPercent;

  const samples: HistoricalSample[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const timestamp = now - i * BACKFILL_INTERVAL_MS;
    samples.push({ timestamp, reading: Math.round(reading * 10 ** meta.decimals) / 10 ** meta.decimals, batteryPercent: Math.round(battery * 10) / 10, signalPercent: Math.round(signal), health: sensor.health });

    // Step backward: undo a bounded random delta (same drift-step magnitude
    // the live ticker uses), and slowly "recharge" battery going backward
    // (i.e. battery was lower further in the past, if battery-powered).
    reading = clamp(reading + (Math.random() * 2 - 1) * meta.driftStep, meta.min, meta.max);
    signal = clamp(signal + (Math.random() * 2 - 1) * 1.5, 20, 100);
    if (sensor.batteryPowered) battery = clamp(battery + 0.01, 0, 100);
  }

  return samples.reverse();
}
